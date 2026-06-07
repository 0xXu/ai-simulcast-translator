import {
  DEFAULT_SESSION_LANGUAGES,
  isLanguageCode,
  type TranslationSessionLanguages,
  type AsrAudioRequest,
  type AsrEvent,
  type AsrSessionResponse,
  type AsrSessionState,
} from "@simulcast/contracts";
import type {
  AsrMessage,
  WhisperWorkerError,
  WhisperWorkerLaunchOptions,
} from "@simulcast/infrastructure";

type AsrWorkerEvent = "result" | "error" | "exit";
type AsrWorkerListener = (...args: any[]) => void;

interface StartupContext {
  readonly sessionId: string;
  readonly generation: number;
  canceled: boolean;
  failurePublished: boolean;
}

export interface AsrWorkerPort {
  start(options: WhisperWorkerLaunchOptions): Promise<void>;
  stop(): void;
  sendAudio(
    sessionId: string,
    audioData: string,
    sampleRate: number,
    channels: number,
  ): void;
  getIsReady(): boolean;
  on(event: AsrWorkerEvent, listener: AsrWorkerListener): this;
  off(event: AsrWorkerEvent, listener: AsrWorkerListener): this;
}

export interface AsrSessionControllerOptions {
  readonly worker: AsrWorkerPort;
  readonly publish: (event: AsrEvent) => void;
  readonly launch: WhisperWorkerLaunchOptions;
}

export class AsrSessionController {
  private readonly worker: AsrWorkerPort;
  private readonly publish: (event: AsrEvent) => void;
  private readonly launch: WhisperWorkerLaunchOptions;
  private activeSessionId: string | null = null;
  private state: AsrSessionState = "idle";
  private startupGeneration = 0;
  private startupPromise: Promise<AsrSessionResponse> | null = null;
  private startupContext: StartupContext | null = null;

  private readonly handleResult = (message: AsrMessage): void => {
    if (
      message.type !== "result" ||
      !this.activeSessionId ||
      message.session_id !== this.activeSessionId ||
      typeof message.sequence !== "number" ||
      typeof message.text !== "string" ||
      typeof message.confidence !== "number" ||
      typeof message.start_ms !== "number" ||
      typeof message.end_ms !== "number" ||
      typeof message.is_final !== "boolean"
    ) {
      return;
    }

    this.publish({
      type: "transcript",
      sessionId: this.activeSessionId,
      sequence: message.sequence,
      text: message.text,
      confidence: message.confidence,
      startMs: message.start_ms,
      endMs: message.end_ms,
      isFinal: message.is_final,
      ...(isLanguageCode(message.detected_language)
        ? { detectedLanguage: message.detected_language }
        : {}),
      ...(typeof message.language_probability === "number"
        ? { languageProbability: message.language_probability }
        : {}),
    });
  };

  private readonly handleError = (error: WhisperWorkerError): void => {
    const sessionId = this.activeSessionId;
    if (!sessionId) {
      return;
    }

    if (this.state === "starting") {
      return;
    }

    if (error.sessionId && error.sessionId !== sessionId) {
      return;
    }

    this.state = "error";
    this.publish({
      type: "error",
      sessionId,
      code: error.errorCode,
      message: error.message,
      recoverable: true,
    });
  };

  private readonly handleExit = (code: number | null): void => {
    const sessionId = this.activeSessionId;
    if (!sessionId) {
      return;
    }

    if (this.state === "starting" && this.startupContext) {
      this.startupContext.failurePublished = true;
    }
    this.startupGeneration += 1;
    this.activeSessionId = null;
    this.state = "idle";
    this.startupPromise = null;
    this.startupContext = null;
    this.publish({
      type: "error",
      sessionId,
      code: "WORKER_EXITED",
      message: `ASR Worker exited with code ${String(code)}`,
      recoverable: true,
    });
  };

  constructor(options: AsrSessionControllerOptions) {
    this.worker = options.worker;
    this.publish = options.publish;
    this.launch = options.launch;

    this.worker.on("result", this.handleResult);
    this.worker.on("error", this.handleError);
    this.worker.on("exit", this.handleExit);
  }

  startSession(
    sessionId: string,
    languages: TranslationSessionLanguages = DEFAULT_SESSION_LANGUAGES,
  ): Promise<AsrSessionResponse> {
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      return Promise.reject(new Error("已有 ASR 会话正在运行"));
    }
    if (this.activeSessionId === sessionId && this.state === "ready") {
      return Promise.resolve({ sessionId, state: "ready" });
    }
    if (
      this.activeSessionId === sessionId &&
      this.state === "starting" &&
      this.startupPromise
    ) {
      return this.startupPromise;
    }

    this.activeSessionId = sessionId;
    this.state = "starting";
    const generation = ++this.startupGeneration;
    const context: StartupContext = {
      sessionId,
      generation,
      canceled: false,
      failurePublished: false,
    };
    this.startupContext = context;
    this.publish({
      type: "status",
      sessionId,
      state: "starting",
      message: "正在启动本地语音识别",
      languages,
    });

    const startupPromise = this.runStartup(context, languages);
    this.startupPromise = startupPromise;
    return startupPromise;
  }

  private async runStartup(
    context: StartupContext,
    languages: TranslationSessionLanguages,
  ): Promise<AsrSessionResponse> {
    const { sessionId, generation } = context;
    try {
      await this.worker.start({
        ...this.launch,
        language: languages.sourceLanguage,
      });
      if (!this.isCurrentStartup(sessionId, generation)) {
        if (context.canceled) {
          return { sessionId, state: "idle" };
        }
        throw new Error("ASR Worker exited during startup");
      }

      this.state = "ready";
      this.publish({
        type: "status",
        sessionId,
        state: "ready",
        message: "本地语音识别已就绪",
        languages,
      });
      return { sessionId, state: "ready" };
    } catch (error) {
      if (context.canceled) {
        return { sessionId, state: "idle" };
      }
      if (context.failurePublished) {
        throw error;
      }
      if (!this.isCurrentStartup(sessionId, generation)) {
        throw error;
      }

      this.state = "error";
      this.publish({
        type: "error",
        sessionId,
        code: "WORKER_START_FAILED",
        message: error instanceof Error ? error.message : "ASR Worker 启动失败",
        recoverable: true,
      });
      this.startupPromise = null;
      this.startupContext = null;
      this.startupGeneration += 1;
      this.activeSessionId = null;
      this.worker.stop();
      this.state = "idle";
      throw error;
    } finally {
      if (this.isCurrentStartup(sessionId, generation)) {
        this.startupPromise = null;
        this.startupContext = null;
      }
    }
  }

  sendAudio(request: AsrAudioRequest): void {
    if (!this.activeSessionId) {
      throw new Error("没有正在运行的 ASR 会话");
    }
    if (request.sessionId !== this.activeSessionId) {
      throw new Error("ASR 会话不匹配");
    }
    if (this.state !== "ready" || !this.worker.getIsReady()) {
      throw new Error("ASR Worker 尚未就绪");
    }

    this.worker.sendAudio(
      request.sessionId,
      request.audioData,
      request.sampleRate,
      request.channels,
    );
  }

  stopSession(sessionId: string): AsrSessionResponse {
    if (sessionId === this.activeSessionId) {
      if (this.state === "starting" && this.startupContext) {
        this.startupContext.canceled = true;
      }
      this.startupGeneration += 1;
      this.activeSessionId = null;
      this.state = "idle";
      this.startupPromise = null;
      this.startupContext = null;
      this.worker.stop();
    }

    return { sessionId, state: "idle" };
  }

  dispose(): void {
    this.worker.off("result", this.handleResult);
    this.worker.off("error", this.handleError);
    this.worker.off("exit", this.handleExit);
    if (this.state === "starting" && this.startupContext) {
      this.startupContext.canceled = true;
    }
    this.startupGeneration += 1;
    this.activeSessionId = null;
    this.state = "idle";
    this.startupPromise = null;
    this.startupContext = null;
    this.worker.stop();
  }

  private isCurrentStartup(sessionId: string, generation: number): boolean {
    return (
      this.activeSessionId === sessionId &&
      this.startupGeneration === generation
    );
  }
}

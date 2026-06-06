import {
  spawn,
  type ChildProcess,
} from "child_process";
import { EventEmitter } from "events";
import { StringDecoder } from "string_decoder";

export interface AsrMessage {
  readonly type: string;
  readonly session_id?: string;
  readonly sequence?: number;
  readonly text?: string;
  readonly confidence?: number;
  readonly start_ms?: number;
  readonly end_ms?: number;
  readonly is_final?: boolean;
  readonly error_code?: string;
  readonly error_message?: string;
  readonly status?: string;
  readonly message?: string;
}

export interface WhisperWorkerLaunchOptions {
  readonly engine: "mock" | "faster-whisper";
  readonly modelName: string;
  readonly device: string;
  readonly computeType: string;
}

export interface WhisperWorkerSpawnOptions {
  readonly cwd: string;
  readonly stdio: readonly ["pipe", "pipe", "pipe"];
}

export type WhisperWorkerSpawnProcess = (
  command: string,
  args: readonly string[],
  options: WhisperWorkerSpawnOptions,
) => ChildProcess;

export interface WhisperWorkerAdapterOptions {
  readonly workerCwd: string;
  readonly startupTimeoutMs?: number;
  readonly spawnProcess?: WhisperWorkerSpawnProcess;
}

export class WhisperWorkerAdapter extends EventEmitter {
  private readonly options: WhisperWorkerAdapterOptions;
  private process: ChildProcess | null = null;
  private ready = false;
  private sequenceCounter = 0;
  private stdoutBuffer = "";
  private stdoutDecoder = new StringDecoder("utf8");
  private startupTimer: NodeJS.Timeout | null = null;
  private startupPromise: Promise<void> | null = null;
  private resolveStartup: (() => void) | null = null;
  private rejectStartup: ((error: Error) => void) | null = null;

  constructor(options: WhisperWorkerAdapterOptions) {
    super();
    this.options = options;
  }

  start(options: WhisperWorkerLaunchOptions): Promise<void> {
    if (this.process) {
      return this.startupPromise ?? Promise.resolve();
    }

    this.ready = false;
    this.sequenceCounter = 0;
    this.resetStdoutBuffer();

    const spawnProcess = this.options.spawnProcess ?? spawn;
    const args = [
      "run",
      "python",
      "-m",
      "asr_worker.main",
      "--engine",
      options.engine,
      "--model",
      options.modelName,
      "--device",
      options.device,
      "--compute-type",
      options.computeType,
    ];

    this.startupPromise = new Promise<void>((resolve, reject) => {
      this.resolveStartup = resolve;
      this.rejectStartup = reject;
    });

    let child: ChildProcess;
    try {
      child = spawnProcess("uv", args, {
        cwd: this.options.workerCwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      const spawnError = error instanceof Error ? error : new Error(String(error));
      this.finishStartup(spawnError);
      this.emitError(spawnError);
      return this.startupPromise;
    }

    this.process = child;

    child.stdout?.on("data", (data: Buffer) => {
      if (this.process === child) {
        this._handleStdoutChunk(data);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      console.error("ASR Worker stderr:", data.toString());
    });

    child.stdin?.on("error", (error: Error) => {
      this.handleProcessError(child, error);
    });

    child.on("error", (error: Error) => {
      this.handleProcessError(child, error);
    });

    child.on("exit", (code: number | null) => {
      if (this.process !== child) {
        return;
      }
      const wasStarting = !this.ready;
      this.clearProcess(child);
      if (wasStarting) {
        this.finishStartup(
          new Error(`ASR Worker exited before ready (code ${String(code)})`),
        );
      }
      this.emit("exit", code);
    });

    const startupTimeoutMs = this.options.startupTimeoutMs ?? 5_000;
    this.startupTimer = setTimeout(() => {
      if (this.process !== child || this.ready) {
        return;
      }
      const error = new Error("ASR Worker startup timeout");
      this.clearProcess(child);
      this.finishStartup(error);
      child.kill();
    }, startupTimeoutMs);

    return this.startupPromise;
  }

  stop(): void {
    const child = this.process;
    this.process = null;
    this.ready = false;
    this.sequenceCounter = 0;
    this.resetStdoutBuffer();

    if (this.rejectStartup) {
      this.finishStartup(new Error("ASR Worker stopped before ready"));
    } else {
      this.clearStartupTimer();
    }

    child?.kill();
  }

  sendAudio(
    sessionId: string,
    audioData: string,
    sampleRate: number = 16000,
    channels: number = 1,
  ): void {
    if (!this.process || !this.ready) {
      throw new Error("ASR Worker is not ready");
    }

    this.sequenceCounter += 1;
    const message = {
      type: "audio",
      session_id: sessionId,
      sequence: this.sequenceCounter,
      audio_data: audioData,
      sample_rate: sampleRate,
      channels,
    };

    this.process.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  getIsReady(): boolean {
    return this.ready;
  }

  private _handleStdoutChunk(data: Buffer): void {
    this.stdoutBuffer += this.stdoutDecoder.write(data);
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        this._handleMessage(line);
      }
    }
  }

  private resetStdoutBuffer(): void {
    this.stdoutBuffer = "";
    this.stdoutDecoder = new StringDecoder("utf8");
  }

  private _handleMessage(line: string): void {
    try {
      const message: AsrMessage = JSON.parse(line);

      if (message.type === "status" && message.status === "ready") {
        this.ready = true;
        this.finishStartup();
        this.emit("ready");
      } else if (message.type === "result") {
        this.emit("result", message);
      } else if (message.type === "error") {
        const error = new Error(message.error_message || "Unknown error");
        if (this.rejectStartup) {
          const child = this.process;
          if (child) {
            this.clearProcess(child);
          }
          this.finishStartup(error);
          child?.kill();
        }
        this.emitError(error);
      }
    } catch {
      this.emitError(new Error(`Failed to parse message: ${line}`));
    }
  }

  private clearProcess(child: ChildProcess): void {
    if (this.process === child) {
      this.process = null;
      this.ready = false;
      this.resetStdoutBuffer();
    }
    this.clearStartupTimer();
  }

  private handleProcessError(child: ChildProcess, error: Error): void {
    if (this.process !== child) {
      return;
    }
    this.clearProcess(child);
    this.finishStartup(error);
    child.kill();
    this.emitError(error);
  }

  private finishStartup(error?: Error): void {
    const resolve = this.resolveStartup;
    const reject = this.rejectStartup;
    this.resolveStartup = null;
    this.rejectStartup = null;
    this.clearStartupTimer();

    if (error) {
      reject?.(error);
    } else {
      resolve?.();
    }
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  private emitError(error: Error): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
    }
  }
}

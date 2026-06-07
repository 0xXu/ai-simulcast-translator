import { EventEmitter } from "node:events";
import {
  PROTOCOL_VERSION,
  type AsrAudioRequest,
  type AsrEvent,
} from "@simulcast/contracts";
import type {
  AsrMessage,
  WhisperWorkerError,
  WhisperWorkerLaunchOptions,
} from "@simulcast/infrastructure";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AsrSessionController,
  type AsrWorkerPort,
} from "./asr-session-controller";

const launch: WhisperWorkerLaunchOptions = {
  engine: "faster-whisper",
  modelName: "small",
  language: "auto",
  device: "cpu",
  computeType: "int8",
};

class FakeWorker extends EventEmitter implements AsrWorkerPort {
  ready = true;
  private rejectPendingStart: ((error: Error) => void) | null = null;
  start = vi.fn<
    (options: WhisperWorkerLaunchOptions) => Promise<void>
  >(async (_options) => undefined);
  stop = vi.fn(() => {
    const reject = this.rejectPendingStart;
    this.rejectPendingStart = null;
    reject?.(new Error("ASR Worker stopped before ready"));
  });
  sendAudio = vi.fn(
    (
      _sessionId: string,
      _audioData: string,
      _sampleRate: number,
      _channels: number,
    ) => undefined,
  );
  getIsReady = vi.fn(() => this.ready);

  deferNextStart(): {
    resolve: () => void;
    reject: (error: Error) => void;
  } {
    let resolveStart: (() => void) | undefined;
    let rejectStart: ((error: Error) => void) | undefined;
    this.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          resolveStart = () => {
            this.rejectPendingStart = null;
            resolve();
          };
          rejectStart = (error) => {
            this.rejectPendingStart = null;
            reject(error);
          };
          this.rejectPendingStart = rejectStart;
        }),
    );
    return {
      resolve: () => resolveStart?.(),
      reject: (error) => rejectStart?.(error),
    };
  }

  emitResult(message: AsrMessage): void {
    this.emit("result", message);
  }

  emitWorkerError(error: WhisperWorkerError): void {
    this.emit("error", error);
  }

  emitExit(code: number | null): void {
    const reject = this.rejectPendingStart;
    this.rejectPendingStart = null;
    reject?.(
      new Error(`ASR Worker exited before ready (code ${String(code)})`),
    );
    this.emit("exit", code);
  }
}

function validAudioRequest(
  sessionId: string,
  audioData = "YQ==",
): AsrAudioRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    timestamp: 100,
    sessionId,
    audioData,
    sampleRate: 16000,
    channels: 1,
  };
}

describe("AsrSessionController", () => {
  let worker: FakeWorker;
  let publish: ReturnType<typeof vi.fn<(event: AsrEvent) => void>>;
  let controller: AsrSessionController;

  beforeEach(() => {
    worker = new FakeWorker();
    publish = vi.fn<(event: AsrEvent) => void>();
    controller = new AsrSessionController({ worker, publish, launch });
  });

  const languages = {
    sourceLanguage: "auto" as const,
    targetLanguage: "zh" as const,
  };

  it("starts one session, publishes lifecycle states, and is idempotent once ready", async () => {
    await expect(controller.startSession("session-1", languages)).resolves.toEqual({
      sessionId: "session-1",
      state: "ready",
    });
    await expect(controller.startSession("session-1", languages)).resolves.toEqual({
      sessionId: "session-1",
      state: "ready",
    });

    expect(worker.start).toHaveBeenCalledTimes(1);
    expect(worker.start).toHaveBeenCalledWith({
      ...launch,
      language: "auto",
    });
    expect(publish).toHaveBeenNthCalledWith(1, {
      type: "status",
      sessionId: "session-1",
      state: "starting",
      message: "正在启动本地语音识别",
    });
    expect(publish).toHaveBeenNthCalledWith(2, {
      type: "status",
      sessionId: "session-1",
      state: "ready",
      message: "本地语音识别已就绪",
    });
    await expect(controller.startSession("session-2", languages)).rejects.toThrow(
      "已有 ASR 会话正在运行",
    );
  });

  it("reuses one startup promise for concurrent starts of the same session", async () => {
    const deferred = worker.deferNextStart();

    const first = controller.startSession("session-1");
    const second = controller.startSession("session-1");

    expect(second).toBe(first);
    expect(worker.start).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { sessionId: "session-1", state: "ready" },
      { sessionId: "session-1", state: "ready" },
    ]);
  });

  it("shares one failure across concurrent starts of the same session", async () => {
    const deferred = worker.deferNextStart();

    const first = controller.startSession("session-1");
    const second = controller.startSession("session-1");
    expect(second).toBe(first);

    deferred.reject(new Error("model load failed"));
    await expect(first).rejects.toThrow("model load failed");
    await expect(second).rejects.toThrow("model load failed");
    expect(worker.start).toHaveBeenCalledTimes(1);
    expect(
      publish.mock.calls.filter(([event]) => event.type === "error"),
    ).toHaveLength(1);
  });

  it("cleans up a failed start and allows retry", async () => {
    worker.start.mockRejectedValueOnce(new Error("uv missing"));

    await expect(controller.startSession("session-1")).rejects.toThrow(
      "uv missing",
    );
    expect(publish).toHaveBeenLastCalledWith({
      type: "error",
      sessionId: "session-1",
      code: "WORKER_START_FAILED",
      message: "uv missing",
      recoverable: true,
    });
    expect(worker.stop).toHaveBeenCalledTimes(1);

    await expect(controller.startSession("session-2")).resolves.toEqual({
      sessionId: "session-2",
      state: "ready",
    });
    expect(worker.start).toHaveBeenCalledTimes(2);
  });

  it("forwards audio only when the matching session and Worker are ready", async () => {
    expect(() => controller.sendAudio(validAudioRequest("session-1"))).toThrow(
      "没有正在运行的 ASR 会话",
    );

    await controller.startSession("session-1");
    controller.sendAudio(validAudioRequest("session-1", "Yg=="));
    expect(worker.sendAudio).toHaveBeenCalledWith(
      "session-1",
      "Yg==",
      16000,
      1,
    );

    expect(() =>
      controller.sendAudio(validAudioRequest("stale-session")),
    ).toThrow("ASR 会话不匹配");

    worker.ready = false;
    expect(() => controller.sendAudio(validAudioRequest("session-1"))).toThrow(
      "ASR Worker 尚未就绪",
    );
  });

  it("does not forward audio while the controller is starting", async () => {
    const deferred = worker.deferNextStart();

    const starting = controller.startSession("session-1");
    expect(() => controller.sendAudio(validAudioRequest("session-1"))).toThrow(
      "ASR Worker 尚未就绪",
    );
    deferred.resolve();
    await starting;
  });

  it("resolves idle when stop rejects a pending startup", async () => {
    worker.deferNextStart();

    const starting = controller.startSession("session-1");
    controller.stopSession("session-1");
    publish.mockClear();

    await expect(starting).resolves.toEqual({
      sessionId: "session-1",
      state: "idle",
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("resolves idle when dispose rejects a pending startup", async () => {
    worker.deferNextStart();

    const starting = controller.startSession("session-1");
    controller.dispose();
    publish.mockClear();

    await expect(starting).resolves.toEqual({
      sessionId: "session-1",
      state: "idle",
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("isolates a canceled startup rejection from a newer session", async () => {
    worker.deferNextStart();

    const firstStart = controller.startSession("session-1");
    controller.stopSession("session-1");
    const secondDeferred = worker.deferNextStart();
    const secondStart = controller.startSession("session-2");
    const stopCallsAfterRestart = worker.stop.mock.calls.length;
    publish.mockClear();

    await expect(firstStart).resolves.toEqual({
      sessionId: "session-1",
      state: "idle",
    });
    expect(worker.stop).toHaveBeenCalledTimes(stopCallsAfterRestart);
    expect(publish).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        code: "WORKER_START_FAILED",
      }),
    );

    secondDeferred.resolve();
    await expect(secondStart).resolves.toEqual({
      sessionId: "session-2",
      state: "ready",
    });
    controller.sendAudio(validAudioRequest("session-2"));
    expect(worker.sendAudio).toHaveBeenCalledWith(
      "session-2",
      "YQ==",
      16000,
      1,
    );
  });

  it("maps active Worker results and drops stale results", async () => {
    await controller.startSession("session-1");
    publish.mockClear();

    worker.emitResult({
      type: "result",
      session_id: "session-2",
      sequence: 1,
      text: "stale",
      confidence: 0.1,
      start_ms: 0,
      end_ms: 100,
      is_final: false,
    });
    expect(publish).not.toHaveBeenCalled();

    worker.emitResult({
      type: "result",
      session_id: "session-1",
      sequence: 7,
      text: "hello",
      confidence: 0.92,
      start_ms: 120,
      end_ms: 840,
      is_final: true,
      detected_language: "en",
      language_probability: 0.96,
    });
    expect(publish).toHaveBeenCalledWith({
      type: "transcript",
      sessionId: "session-1",
      sequence: 7,
      text: "hello",
      confidence: 0.92,
      startMs: 120,
      endMs: 840,
      isFinal: true,
      detectedLanguage: "en",
      languageProbability: 0.96,
    });
  });

  it("associates empty-session Worker errors with the active session and drops stale errors", async () => {
    await controller.startSession("session-1");
    publish.mockClear();

    worker.emitWorkerError({
      sessionId: "session-2",
      errorCode: "PROCESSING_ERROR",
      message: "stale",
    });
    expect(publish).not.toHaveBeenCalled();

    worker.emitWorkerError({
      sessionId: "",
      errorCode: "PROCESSING_ERROR",
      message: "bad audio",
    });
    expect(publish).toHaveBeenCalledWith({
      type: "error",
      sessionId: "session-1",
      code: "PROCESSING_ERROR",
      message: "bad audio",
      recoverable: true,
    });
  });

  it("publishes structured runtime Worker errors for the active session", async () => {
    await controller.startSession("session-1");
    publish.mockClear();

    worker.emitWorkerError({
      sessionId: "",
      errorCode: "EPIPE",
      message: "broken pipe",
    });
    expect(publish).toHaveBeenCalledWith({
      type: "error",
      sessionId: "session-1",
      code: "EPIPE",
      message: "broken pipe",
      recoverable: true,
    });
  });

  it("publishes only the start failure when Adapter error and rejection coincide", async () => {
    const deferred = worker.deferNextStart();

    const starting = controller.startSession("session-1");
    worker.emitWorkerError({
      sessionId: "",
      errorCode: "WORKER_PROCESS_ERROR",
      message: "spawn failed",
    });
    deferred.reject(new Error("spawn failed"));

    await expect(starting).rejects.toThrow("spawn failed");
    expect(
      publish.mock.calls.filter(([event]) => event.type === "error"),
    ).toEqual([
      [
        {
          type: "error",
          sessionId: "session-1",
          code: "WORKER_START_FAILED",
          message: "spawn failed",
          recoverable: true,
        },
      ],
    ]);
  });

  it("rejects and publishes one WORKER_EXITED when the Worker exits during startup", async () => {
    worker.deferNextStart();
    const starting = controller.startSession("session-1");
    publish.mockClear();

    worker.emitExit(2);

    await expect(starting).rejects.toThrow(
      "ASR Worker exited before ready (code 2)",
    );
    expect(
      publish.mock.calls.filter(([event]) => event.type === "error"),
    ).toEqual([
      [
        {
          type: "error",
          sessionId: "session-1",
          code: "WORKER_EXITED",
          message: "ASR Worker exited with code 2",
          recoverable: true,
        },
      ],
    ]);
  });

  it("clears an exited session and permits restart", async () => {
    await controller.startSession("session-1");
    publish.mockClear();

    worker.emitExit(1);
    expect(publish).toHaveBeenCalledWith({
      type: "error",
      sessionId: "session-1",
      code: "WORKER_EXITED",
      message: "ASR Worker exited with code 1",
      recoverable: true,
    });

    await expect(controller.startSession("session-2")).resolves.toEqual({
      sessionId: "session-2",
      state: "ready",
    });
  });

  it("stops only the matching active session", async () => {
    await controller.startSession("session-1");

    expect(controller.stopSession("stale-session")).toEqual({
      sessionId: "stale-session",
      state: "idle",
    });
    expect(worker.stop).not.toHaveBeenCalled();
    await expect(controller.startSession("session-2")).rejects.toThrow(
      "已有 ASR 会话正在运行",
    );

    expect(controller.stopSession("session-1")).toEqual({
      sessionId: "session-1",
      state: "idle",
    });
    expect(worker.stop).toHaveBeenCalledTimes(1);
    await expect(controller.startSession("session-2")).resolves.toEqual({
      sessionId: "session-2",
      state: "ready",
    });
  });

  it("removes listeners and stops the Worker when disposed", async () => {
    await controller.startSession("session-1");
    publish.mockClear();

    controller.dispose();
    expect(worker.stop).toHaveBeenCalledTimes(1);
    expect(worker.listenerCount("result")).toBe(0);
    expect(worker.listenerCount("error")).toBe(0);
    expect(worker.listenerCount("exit")).toBe(0);

    worker.emitResult({
      type: "result",
      session_id: "session-1",
      sequence: 1,
      text: "ignored",
    });
    expect(publish).not.toHaveBeenCalled();
  });
});

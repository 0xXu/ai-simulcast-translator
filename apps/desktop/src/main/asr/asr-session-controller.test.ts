import { EventEmitter } from "node:events";
import {
  PROTOCOL_VERSION,
  type AsrAudioRequest,
  type AsrEvent,
} from "@simulcast/contracts";
import type {
  AsrMessage,
  WhisperWorkerLaunchOptions,
} from "@simulcast/infrastructure";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AsrSessionController,
  type AsrWorkerPort,
} from "./asr-session-controller";

const launch: WhisperWorkerLaunchOptions = {
  engine: "faster-whisper",
  modelName: "small.en",
  device: "cpu",
  computeType: "int8",
};

class FakeWorker extends EventEmitter implements AsrWorkerPort {
  ready = true;
  start = vi.fn<
    (options: WhisperWorkerLaunchOptions) => Promise<void>
  >(async (_options) => undefined);
  stop = vi.fn();
  sendAudio = vi.fn(
    (
      _sessionId: string,
      _audioData: string,
      _sampleRate: number,
      _channels: number,
    ) => undefined,
  );
  getIsReady = vi.fn(() => this.ready);

  emitResult(message: AsrMessage): void {
    this.emit("result", message);
  }

  emitWorkerError(error: Error | AsrMessage): void {
    this.emit("error", error);
  }

  emitExit(code: number | null): void {
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

  it("starts one session, publishes lifecycle states, and is idempotent once ready", async () => {
    await expect(controller.startSession("session-1")).resolves.toEqual({
      sessionId: "session-1",
      state: "ready",
    });
    await expect(controller.startSession("session-1")).resolves.toEqual({
      sessionId: "session-1",
      state: "ready",
    });

    expect(worker.start).toHaveBeenCalledTimes(1);
    expect(worker.start).toHaveBeenCalledWith(launch);
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
    await expect(controller.startSession("session-2")).rejects.toThrow(
      "已有 ASR 会话正在运行",
    );
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
    let resolveStart: (() => void) | undefined;
    worker.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );

    const starting = controller.startSession("session-1");
    expect(() => controller.sendAudio(validAudioRequest("session-1"))).toThrow(
      "ASR Worker 尚未就绪",
    );
    resolveStart?.();
    await starting;
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
    });
  });

  it("associates empty-session Worker errors with the active session and drops stale errors", async () => {
    await controller.startSession("session-1");
    publish.mockClear();

    worker.emitWorkerError({
      type: "error",
      session_id: "session-2",
      error_code: "PROCESSING_ERROR",
      error_message: "stale",
    });
    expect(publish).not.toHaveBeenCalled();

    worker.emitWorkerError({
      type: "error",
      session_id: "",
      error_code: "PROCESSING_ERROR",
      error_message: "bad audio",
    });
    expect(publish).toHaveBeenCalledWith({
      type: "error",
      sessionId: "session-1",
      code: "PROCESSING_ERROR",
      message: "bad audio",
      recoverable: true,
    });
  });

  it("publishes Error objects for the active session", async () => {
    await controller.startSession("session-1");
    publish.mockClear();

    worker.emitWorkerError(new Error("broken pipe"));
    expect(publish).toHaveBeenCalledWith({
      type: "error",
      sessionId: "session-1",
      code: "WORKER_ERROR",
      message: "broken pipe",
      recoverable: true,
    });
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

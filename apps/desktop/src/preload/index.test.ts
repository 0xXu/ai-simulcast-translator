import { beforeEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import {
  PROTOCOL_VERSION,
  type AppStatus,
  type AsrEvent,
  type SubtitleSnapshotEvent,
} from "@simulcast/contracts";
import type { PreloadApi } from "./api";

const invoke = vi.fn();
const send = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();
const exposeInMainWorld = vi.fn();

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, send, on, removeListener },
}));

describe("preload API", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    send.mockReset();
    on.mockReset();
    removeListener.mockReset();
    exposeInMainWorld.mockReset();
  });

  it("sends a versioned request when querying app status", async () => {
    const status: AppStatus = {
      isRunning: true,
      version: "0.1.0",
      platform: "darwin",
      uptime: 10,
    };
    invoke.mockResolvedValue(status);

    await import("./index");

    const apiCall = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    );
    const api = apiCall?.[1] as PreloadApi;

    await expect(api.getAppStatus()).resolves.toEqual(status);
    expect(invoke).toHaveBeenCalledWith(
      "app.status",
      expect.objectContaining({
        protocolVersion: PROTOCOL_VERSION,
        timestamp: expect.any(Number),
      }),
    );
  });

  it("uses fixed channels and versioned ASR session requests", async () => {
    invoke
      .mockResolvedValueOnce({ sessionId: "session-1", state: "ready" })
      .mockResolvedValueOnce({ sessionId: "session-1", state: "idle" });
    await import("./index");
    const api = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    )?.[1] as PreloadApi;

    await api.startAsrSession("session-1");
    await api.stopAsrSession("session-1");

    expect(invoke).toHaveBeenNthCalledWith(
      1,
      "asr.session.start",
      expect.objectContaining({
        protocolVersion: PROTOCOL_VERSION,
        timestamp: expect.any(Number),
        sessionId: "session-1",
      }),
    );
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "asr.session.stop",
      expect.objectContaining({
        protocolVersion: PROTOCOL_VERSION,
        timestamp: expect.any(Number),
        sessionId: "session-1",
      }),
    );
  });

  it("encodes only an Int16Array subarray's visible bytes", async () => {
    await import("./index");
    const api = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    )?.[1] as PreloadApi;
    const samples = new Int16Array([100, 200, 300, 400]).subarray(1, 3);

    api.sendAsrAudio("session-1", samples);

    expect(send).toHaveBeenCalledWith("asr.audio", {
      protocolVersion: PROTOCOL_VERSION,
      timestamp: expect.any(Number),
      sessionId: "session-1",
      audioData: Buffer.from(
        samples.buffer,
        samples.byteOffset,
        samples.byteLength,
      ).toString("base64"),
      sampleRate: 16000,
      channels: 1,
    });
  });

  it("rejects non-Int16 views at runtime", async () => {
    await import("./index");
    const api = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    )?.[1] as PreloadApi;

    expect(() =>
      api.sendAsrAudio(
        "session-1",
        new Uint16Array([1]) as unknown as Int16Array,
      ),
    ).toThrow("audio must be an Int16Array");
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts Int16Array values created in another realm", async () => {
    await import("./index");
    const api = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    )?.[1] as PreloadApi;
    const samples = runInNewContext(
      "new Int16Array([1, -1])",
    ) as Int16Array;

    api.sendAsrAudio("session-1", samples);

    expect(send).toHaveBeenCalledWith(
      "asr.audio",
      expect.objectContaining({
        audioData: Buffer.from(
          samples.buffer,
          samples.byteOffset,
          samples.byteLength,
        ).toString("base64"),
      }),
    );
  });

  it("subscribes to ASR events and removes the exact listener", async () => {
    await import("./index");
    const api = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    )?.[1] as PreloadApi;
    const listener = vi.fn<(event: AsrEvent) => void>();
    const cleanup = api.onAsrEvent(listener);
    const ipcListener = on.mock.calls[0]![1] as (
      event: unknown,
      payload: AsrEvent,
    ) => void;
    const payload: AsrEvent = {
      type: "status",
      sessionId: "session-1",
      state: "ready",
      message: null,
    };

    ipcListener({}, payload);
    cleanup();

    expect(on).toHaveBeenCalledWith("asr.event", ipcListener);
    expect(listener).toHaveBeenCalledWith(payload);
    expect(removeListener).toHaveBeenCalledWith("asr.event", ipcListener);
  });

  it("subscribes to subtitle snapshots and removes the exact listener", async () => {
    await import("./index");
    const api = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    )?.[1] as PreloadApi;
    const listener = vi.fn<(event: SubtitleSnapshotEvent) => void>();
    const cleanup = api.onSubtitleSnapshot(listener);
    const ipcListener = on.mock.calls[0]![1] as (
      event: unknown,
      payload: SubtitleSnapshotEvent,
    ) => void;
    const payload: SubtitleSnapshotEvent = {
      type: "snapshot",
      sessionId: "session-1",
      requestId: 1,
      lastAppliedRequestId: 1,
      segments: [],
      changes: [],
    };

    ipcListener({}, payload);
    cleanup();

    expect(on).toHaveBeenCalledWith("subtitle.snapshot", ipcListener);
    expect(listener).toHaveBeenCalledWith(payload);
    expect(removeListener).toHaveBeenCalledWith(
      "subtitle.snapshot",
      ipcListener,
    );
  });
});

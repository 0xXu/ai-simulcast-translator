import { PROTOCOL_VERSION, type AsrEvent } from "@simulcast/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import {
  ASR_IPC_CHANNELS,
  createAsrCleanup,
  publishAsrEventToWindows,
  registerAsrHandlers,
  resolveAsrLaunchOptions,
  type AsrIpcMain,
  type AsrSessionControllerPort,
} from "./register-asr-handlers";

function createIpcMain(): AsrIpcMain & {
  handlers: Map<string, (event: unknown, request: unknown) => unknown>;
  listeners: Map<string, Set<(event: unknown, request: unknown) => void>>;
} {
  const handlers = new Map<
    string,
    (event: unknown, request: unknown) => unknown
  >();
  const listeners = new Map<
    string,
    Set<(event: unknown, request: unknown) => void>
  >();

  return {
    handlers,
    listeners,
    handle: vi.fn((channel, handler) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel) => {
      handlers.delete(channel);
    }),
    on: vi.fn((channel, listener) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
      return undefined as never;
    }),
    removeListener: vi.fn((channel, listener) => {
      listeners.get(channel)?.delete(listener);
      return undefined as never;
    }),
  };
}

function createController(): AsrSessionControllerPort {
  return {
    startSession: vi.fn(async (sessionId) => ({
      sessionId,
      state: "ready" as const,
    })),
    sendAudio: vi.fn(),
    stopSession: vi.fn((sessionId) => ({
      sessionId,
      state: "idle" as const,
    })),
    dispose: vi.fn(),
  };
}

describe("registerAsrHandlers", () => {
  it("registers only the fixed ASR channels", () => {
    const ipcMain = createIpcMain();

    registerAsrHandlers(createController(), ipcMain);

    expect(ipcMain.handle).toHaveBeenCalledWith(
      ASR_IPC_CHANNELS.start,
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      ASR_IPC_CHANNELS.stop,
      expect.any(Function),
    );
    expect(ipcMain.on).toHaveBeenCalledWith(
      ASR_IPC_CHANNELS.audio,
      expect.any(Function),
    );
    expect([...ipcMain.handlers.keys()]).toEqual([
      "asr.session.start",
      "asr.session.stop",
    ]);
    expect([...ipcMain.listeners.keys()]).toEqual(["asr.audio"]);
  });

  it("validates requests before calling the controller", async () => {
    const ipcMain = createIpcMain();
    const controller = createController();
    registerAsrHandlers(controller, ipcMain);

    const start = ipcMain.handlers.get(ASR_IPC_CHANNELS.start)!;
    const audio = [...ipcMain.listeners.get(ASR_IPC_CHANNELS.audio)!][0]!;

    expect(() =>
      start({}, { protocolVersion: PROTOCOL_VERSION, timestamp: 1 }),
    ).toThrow();
    expect(controller.startSession).not.toHaveBeenCalled();

    expect(() =>
      audio({}, {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: 1,
        sessionId: "session-1",
        audioData: "not base64",
        sampleRate: 16000,
        channels: 1,
      }),
    ).toThrow();
    expect(controller.sendAudio).not.toHaveBeenCalled();
  });

  it("passes validated requests to the controller", async () => {
    const ipcMain = createIpcMain();
    const controller = createController();
    registerAsrHandlers(controller, ipcMain);
    const sessionRequest = {
      protocolVersion: PROTOCOL_VERSION,
      timestamp: 1,
      sessionId: "session-1",
      languages: {
        sourceLanguage: "auto" as const,
        targetLanguage: "zh" as const,
      },
    };

    await ipcMain.handlers.get(ASR_IPC_CHANNELS.start)!({}, sessionRequest);
    await ipcMain.handlers.get(ASR_IPC_CHANNELS.stop)!({}, sessionRequest);
    [...ipcMain.listeners.get(ASR_IPC_CHANNELS.audio)!][0]!({}, {
      protocolVersion: sessionRequest.protocolVersion,
      timestamp: sessionRequest.timestamp,
      sessionId: sessionRequest.sessionId,
      audioData: "AAA=",
      sampleRate: 16000,
      channels: 1,
    });

    expect(controller.startSession).toHaveBeenCalledWith(
      "session-1",
      sessionRequest.languages,
    );
    expect(controller.stopSession).toHaveBeenCalledWith("session-1");
    expect(controller.sendAudio).toHaveBeenCalledWith({
      protocolVersion: sessionRequest.protocolVersion,
      timestamp: sessionRequest.timestamp,
      sessionId: sessionRequest.sessionId,
      audioData: "AAA=",
      sampleRate: 16000,
      channels: 1,
    });
  });

  it("unregisters only the handlers and listener it registered", () => {
    const ipcMain = createIpcMain();
    const otherListener = vi.fn();
    ipcMain.on(ASR_IPC_CHANNELS.audio, otherListener);
    const unregister = registerAsrHandlers(createController(), ipcMain);
    const registeredListener = [...ipcMain.listeners.get(
      ASR_IPC_CHANNELS.audio,
    )!].find((listener) => listener !== otherListener)!;

    unregister();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(ASR_IPC_CHANNELS.start);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(ASR_IPC_CHANNELS.stop);
    expect(ipcMain.removeListener).toHaveBeenCalledWith(
      ASR_IPC_CHANNELS.audio,
      registeredListener,
    );
    expect(ipcMain.listeners.get(ASR_IPC_CHANNELS.audio)).toEqual(
      new Set([otherListener]),
    );
  });
});

describe("ASR main lifecycle helpers", () => {
  it("resolves launch defaults and environment overrides", () => {
    expect(resolveAsrLaunchOptions({})).toEqual({
      engine: "faster-whisper",
      modelName: "small",
      language: "auto",
      device: "cpu",
      computeType: "int8",
    });
    expect(
      resolveAsrLaunchOptions({
        WHISPER_MODEL: "large-v3",
        WHISPER_DEVICE: "cuda",
        WHISPER_COMPUTE_TYPE: "float16",
      }),
    ).toEqual({
      engine: "faster-whisper",
      modelName: "large-v3",
      language: "auto",
      device: "cuda",
      computeType: "float16",
    });
  });

  it("publishes events to every non-destroyed window", () => {
    const event: AsrEvent = {
      type: "status",
      sessionId: "session-1",
      state: "ready",
      message: null,
    };
    const activeSend = vi.fn();
    const destroyedSend = vi.fn();

    publishAsrEventToWindows(
      [
        { isDestroyed: () => false, webContents: { send: activeSend } },
        { isDestroyed: () => true, webContents: { send: destroyedSend } },
      ],
      event,
    );

    expect(activeSend).toHaveBeenCalledWith(ASR_IPC_CHANNELS.event, event);
    expect(destroyedSend).not.toHaveBeenCalled();
  });

  it("disposes and unregisters exactly once", () => {
    const controller = createController();
    const unregister = vi.fn();
    const cleanup = createAsrCleanup(controller, unregister);

    cleanup();
    cleanup();

    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});

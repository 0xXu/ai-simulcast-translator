import {
  validateAsrAudioRequest,
  validateAsrSessionRequest,
  type AsrAudioRequest,
  type AsrEvent,
  type AsrSessionResponse,
  type TranslationSessionLanguages,
} from "@simulcast/contracts";
import type { WhisperWorkerLaunchOptions } from "@simulcast/infrastructure";
import { ipcMain } from "electron";

export const ASR_IPC_CHANNELS = Object.freeze({
  start: "asr.session.start",
  audio: "asr.audio",
  stop: "asr.session.stop",
  event: "asr.event",
} as const);

type InvokeHandler = (event: unknown, request: unknown) => unknown;
type AudioListener = (event: unknown, request: unknown) => void;

export interface AsrIpcMain {
  handle(channel: string, handler: InvokeHandler): void;
  removeHandler(channel: string): void;
  on(channel: string, listener: AudioListener): unknown;
  removeListener(channel: string, listener: AudioListener): unknown;
}

export interface AsrSessionControllerPort {
  startSession(
    sessionId: string,
    languages: TranslationSessionLanguages,
  ): Promise<AsrSessionResponse>;
  sendAudio(request: AsrAudioRequest): void;
  stopSession(sessionId: string): AsrSessionResponse;
  dispose(): void;
}

export interface AsrEventWindow {
  isDestroyed(): boolean;
  readonly webContents: {
    send(channel: string, event: AsrEvent): void;
  };
}

export function resolveAsrLaunchOptions(
  env: Readonly<Record<string, string | undefined>>,
): WhisperWorkerLaunchOptions {
  return {
    engine: "faster-whisper",
    modelName: env.WHISPER_MODEL ?? "small",
    language: "auto",
    device: env.WHISPER_DEVICE ?? "cpu",
    computeType: env.WHISPER_COMPUTE_TYPE ?? "int8",
  };
}

export function registerAsrHandlers(
  controller: AsrSessionControllerPort,
  target: AsrIpcMain = ipcMain,
): () => void {
  const handleStart: InvokeHandler = (_event, input) => {
    const request = validateAsrSessionRequest(input);
    return controller.startSession(request.sessionId, request.languages);
  };
  const handleStop: InvokeHandler = (_event, input) => {
    const request = validateAsrSessionRequest(input);
    return controller.stopSession(request.sessionId);
  };
  const handleAudio: AudioListener = (_event, input) => {
    const request = validateAsrAudioRequest(input);
    controller.sendAudio(request);
  };

  target.handle(ASR_IPC_CHANNELS.start, handleStart);
  target.handle(ASR_IPC_CHANNELS.stop, handleStop);
  target.on(ASR_IPC_CHANNELS.audio, handleAudio);

  let registered = true;
  return () => {
    if (!registered) {
      return;
    }
    registered = false;
    target.removeHandler(ASR_IPC_CHANNELS.start);
    target.removeHandler(ASR_IPC_CHANNELS.stop);
    target.removeListener(ASR_IPC_CHANNELS.audio, handleAudio);
  };
}

export function publishAsrEventToWindows(
  windows: readonly AsrEventWindow[],
  event: AsrEvent,
): void {
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(ASR_IPC_CHANNELS.event, event);
    }
  }
}

export function createAsrCleanup(
  controller: Pick<AsrSessionControllerPort, "dispose">,
  unregister: () => void,
): () => void {
  let cleanedUp = false;
  return () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    unregister();
    controller.dispose();
  };
}

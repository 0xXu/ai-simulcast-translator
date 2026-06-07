// apps/desktop/src/preload/index.ts

import { contextBridge, ipcRenderer } from "electron";
import type { PreloadApi } from "./api";
import {
  PROTOCOL_VERSION,
  type AppStatus,
  type AsrAudioRequest,
  type AsrEvent,
  type AsrSessionRequest,
} from "@simulcast/contracts";

const ASR_CHANNELS = Object.freeze({
  start: "asr.session.start",
  audio: "asr.audio",
  stop: "asr.session.stop",
  event: "asr.event",
} as const);

function createSessionRequest(sessionId: string): AsrSessionRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    timestamp: Date.now(),
    sessionId,
  };
}

function isInt16Array(value: unknown): value is Int16Array {
  return (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Int16Array]" &&
    (value as Int16Array).BYTES_PER_ELEMENT === Int16Array.BYTES_PER_ELEMENT
  );
}

function encodePcm16(audio: Int16Array): string {
  if (!isInt16Array(audio)) {
    throw new TypeError("audio must be an Int16Array");
  }

  return Buffer.from(
    audio.buffer,
    audio.byteOffset,
    audio.byteLength,
  ).toString("base64");
}

const runtimeInfo = Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
});

const api: PreloadApi = {
  async getAppStatus(): Promise<AppStatus> {
    return ipcRenderer.invoke("app.status", {
      protocolVersion: PROTOCOL_VERSION,
      timestamp: Date.now(),
    });
  },

  getRuntimeInfo() {
    return runtimeInfo;
  },

  startAsrSession(sessionId) {
    return ipcRenderer.invoke(
      ASR_CHANNELS.start,
      createSessionRequest(sessionId),
    );
  },

  sendAsrAudio(
    sessionId,
    audio,
    sampleRate: 16000 = 16000,
    channels: 1 = 1,
  ) {
    const request: AsrAudioRequest = {
      ...createSessionRequest(sessionId),
      audioData: encodePcm16(audio),
      sampleRate,
      channels,
    };
    ipcRenderer.send(ASR_CHANNELS.audio, request);
  },

  stopAsrSession(sessionId) {
    return ipcRenderer.invoke(
      ASR_CHANNELS.stop,
      createSessionRequest(sessionId),
    );
  },

  onAsrEvent(listener) {
    const handleEvent = (_event: unknown, event: AsrEvent): void => {
      listener(event);
    };
    ipcRenderer.on(ASR_CHANNELS.event, handleEvent);
    return () => {
      ipcRenderer.removeListener(ASR_CHANNELS.event, handleEvent);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("runtimeInfo", runtimeInfo);

import type { IpcMessage } from "./ipc";

export type AsrSessionState = "idle" | "starting" | "ready" | "error";

export interface AsrSessionRequest extends IpcMessage {
  readonly sessionId: string;
}

export interface AsrAudioRequest extends IpcMessage {
  readonly sessionId: string;
  readonly audioData: string;
  readonly sampleRate: 16000;
  readonly channels: 1;
}

export interface AsrSessionResponse {
  readonly sessionId: string;
  readonly state: AsrSessionState;
}

export interface AsrStatusEvent {
  readonly type: "status";
  readonly sessionId: string;
  readonly state: AsrSessionState;
  readonly message: string | null;
}

export interface AsrTranscriptEvent {
  readonly type: "transcript";
  readonly sessionId: string;
  readonly sequence: number;
  readonly text: string;
  readonly confidence: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly isFinal: boolean;
}

export interface AsrErrorEvent {
  readonly type: "error";
  readonly sessionId: string;
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export type AsrEvent =
  | AsrStatusEvent
  | AsrTranscriptEvent
  | AsrErrorEvent;

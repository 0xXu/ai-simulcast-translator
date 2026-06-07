import type { IpcMessage } from "./ipc";
import type {
  LanguageCode,
  TranslationSessionLanguages,
} from "./language";

export type AsrSessionState = "idle" | "starting" | "ready" | "error";

export interface AsrSessionRequest extends IpcMessage {
  readonly sessionId: string;
  readonly languages: TranslationSessionLanguages;
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
  readonly languages?: TranslationSessionLanguages;
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
  readonly detectedLanguage?: LanguageCode;
  readonly languageProbability?: number;
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

// packages/contracts/src/index.ts

export {
  PROTOCOL_VERSION,
  type ProtocolVersion,
  type IpcMessage,
  type AppStatus,
  type FrontendToBackendCommands,
  type BackendToFrontendEvents,
  type CommandName,
  type EventName,
} from "./ipc";

export {
  ProtocolVersionSchema,
  IpcMessageSchema,
  AppStatusSchema,
  validateIpcMessage,
  safeValidateIpcMessage,
} from "./schemas";

export {
  type AudioCaptureState,
  type AudioLevel,
  type AudioCaptureConfig,
  type AudioCaptureStatus,
  DEFAULT_AUDIO_CONFIG,
  createAudioLevel,
  validateAudioConfig,
} from "./audio";

export {
  type AsrSessionState,
  type AsrSessionRequest,
  type AsrAudioRequest,
  type AsrSessionResponse,
  type AsrStatusEvent,
  type AsrTranscriptEvent,
  type AsrErrorEvent,
  type AsrEvent,
} from "./asr";

export {
  AsrSessionRequestSchema,
  AsrAudioRequestSchema,
  validateAsrSessionRequest,
  validateAsrAudioRequest,
} from "./asr-schemas";

export {
  type SubtitleSegmentState,
  type SubtitleSnapshotSegment,
  type SubtitleSnapshotChange,
  type SubtitleSnapshotEvent,
} from "./subtitle";

export {
  SubtitleSnapshotSegmentSchema,
  SubtitleSnapshotChangeSchema,
  SubtitleSnapshotEventSchema,
  validateSubtitleSnapshotEvent,
} from "./subtitle-schemas";

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

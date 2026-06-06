// packages/contracts/src/schemas.ts

import { z } from "zod";
import { PROTOCOL_VERSION } from "./ipc";
import type { AppStatus, IpcMessage } from "./ipc";

/**
 * 协议版本 Schema
 */
export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);

/**
 * IPC 消息基础 Schema
 */
export const IpcMessageSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  timestamp: z.number().int().nonnegative(),
});

/**
 * AppStatus Schema
 */
export const AppStatusSchema = z.object({
  isRunning: z.boolean(),
  version: z.string(),
  platform: z.enum([
    "aix",
    "darwin",
    "freebsd",
    "linux",
    "openbsd",
    "sunos",
    "win32",
  ]),
  uptime: z.number().nonnegative(),
});

/**
 * 验证 IPC 消息
 */
export function validateIpcMessage(data: unknown): IpcMessage {
  return IpcMessageSchema.parse(data);
}

/**
 * 安全验证 IPC 消息（返回结果对象）
 */
export function safeValidateIpcMessage(data: unknown): {
  success: true;
  data: IpcMessage;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = IpcMessageSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

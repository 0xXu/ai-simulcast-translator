import { z } from "zod";
import type { AsrAudioRequest, AsrSessionRequest } from "./asr";
import { IpcMessageSchema } from "./schemas";

const SessionIdSchema = z.string().trim().min(1).max(128);
const Base64Schema = z
  .string()
  .min(1)
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  );

export const AsrSessionRequestSchema = IpcMessageSchema.extend({
  sessionId: SessionIdSchema,
}).strict();

export const AsrAudioRequestSchema = IpcMessageSchema.extend({
  sessionId: SessionIdSchema,
  audioData: Base64Schema,
  sampleRate: z.literal(16000),
  channels: z.literal(1),
}).strict();

export function validateAsrSessionRequest(
  data: unknown,
): AsrSessionRequest {
  return AsrSessionRequestSchema.parse(data);
}

export function validateAsrAudioRequest(data: unknown): AsrAudioRequest {
  return AsrAudioRequestSchema.parse(data);
}

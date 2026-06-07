import { z } from "zod";
import type { SubtitleSnapshotEvent } from "./subtitle";

const SessionIdSchema = z.string().trim().min(1).max(128);
const NonEmptyIdSchema = z.string().trim().min(1).max(256);
const TimestampMsSchema = z.number().int().nonnegative();

export const SubtitleSnapshotSegmentSchema = z
  .object({
    id: NonEmptyIdSchema,
    sequence: z.number().int().positive(),
    sourceText: z.string(),
    translatedText: z.string(),
    startMs: TimestampMsSchema,
    endMs: TimestampMsSchema,
    state: z.enum(["live", "revisable", "locked"]),
    sourceVersion: z.number().int().positive(),
    translationVersion: z.number().int().nonnegative(),
  })
  .strict()
  .refine((segment) => segment.endMs >= segment.startMs, {
    message: "segment endMs must be greater than or equal to startMs",
    path: ["endMs"],
  });

export const SubtitleSnapshotChangeSchema = z
  .object({
    segmentId: NonEmptyIdSchema,
    kind: z.enum(["inserted", "revised"]),
    sourceTextChanged: z.boolean(),
    translatedTextChanged: z.boolean(),
    reason: z.string().nullable(),
    highlightUntilMs: TimestampMsSchema,
  })
  .strict();

export const SubtitleSnapshotEventSchema = z
  .object({
    type: z.literal("snapshot"),
    sessionId: SessionIdSchema,
    requestId: z.number().int().positive(),
    lastAppliedRequestId: z.number().int().nonnegative(),
    segments: z.array(SubtitleSnapshotSegmentSchema),
    changes: z.array(SubtitleSnapshotChangeSchema),
  })
  .strict();

export function validateSubtitleSnapshotEvent(
  data: unknown,
): SubtitleSnapshotEvent {
  return SubtitleSnapshotEventSchema.parse(data);
}

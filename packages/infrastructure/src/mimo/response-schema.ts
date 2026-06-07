import { z } from "zod";
import type {
  SubtitleSnapshot,
  SubtitleSnapshotItem,
} from "@simulcast/application";

export class MimoResponseFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimoResponseFormatError";
  }
}

export const MimoSubtitleSchema = z.object({
  sourceText: z.string(),
  translatedText: z.string(),
  revised: z.boolean(),
  revisionReason: z.string().optional(),
}).strict();

export const MimoSubtitleSnapshotSchema = z.object({
  requestId: z.number().int().nonnegative(),
  subtitles: z.array(MimoSubtitleSchema),
}).strict();

export function validateMimoSubtitleSnapshot(
  data: unknown,
): SubtitleSnapshot {
  const result = MimoSubtitleSnapshotSchema.safeParse(data);
  if (!result.success) {
    throw new MimoResponseFormatError(result.error.message);
  }
  return {
    requestId: result.data.requestId,
    subtitles: result.data.subtitles.map(toSnapshotItem),
  };
}

export function parseMimoSubtitleSnapshot(content: string): SubtitleSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonMarkdownFence(content));
  } catch (error) {
    throw new MimoResponseFormatError(
      error instanceof Error ? error.message : String(error),
    );
  }

  return validateMimoSubtitleSnapshot(parsed);
}

function stripJsonMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

function toSnapshotItem(
  item: z.infer<typeof MimoSubtitleSchema>,
): SubtitleSnapshotItem {
  if (item.revisionReason === undefined) {
    return {
      sourceText: item.sourceText,
      translatedText: item.translatedText,
      revised: item.revised,
    };
  }

  return {
    sourceText: item.sourceText,
    translatedText: item.translatedText,
    revised: item.revised,
    revisionReason: item.revisionReason,
  };
}

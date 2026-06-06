// packages/domain/src/subtitle/segment.ts

/**
 * 字幕片段状态
 */
export type SegmentState = "live" | "revisable" | "locked";

/**
 * 字幕片段接口
 */
export interface SubtitleSegment {
  readonly id: string;
  readonly sequence: number;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly state: SegmentState;
  readonly sourceVersion: number;
  readonly translationVersion: number;
  readonly updatedAt: number;
  readonly revisionReason?: string;
}

/**
 * 创建新的字幕片段
 */
export function createSegment(
  id: string,
  sequence: number,
  sourceText: string,
  startMs: number,
  endMs: number,
): SubtitleSegment {
  return {
    id,
    sequence,
    sourceText,
    translatedText: "",
    startMs,
    endMs,
    state: "live",
    sourceVersion: 1,
    translationVersion: 0,
    updatedAt: Date.now(),
  };
}

/**
 * 更新字幕片段的原文
 */
export function updateSourceText(
  segment: SubtitleSegment,
  sourceText: string,
): SubtitleSegment {
  return {
    ...segment,
    sourceText,
    sourceVersion: segment.sourceVersion + 1,
    updatedAt: Date.now(),
  };
}

/**
 * 更新字幕片段的译文
 */
export function updateTranslatedText(
  segment: SubtitleSegment,
  translatedText: string,
): SubtitleSegment {
  return {
    ...segment,
    translatedText,
    translationVersion: segment.translationVersion + 1,
    updatedAt: Date.now(),
  };
}

/**
 * 更新字幕片段状态
 */
export function updateState(
  segment: SubtitleSegment,
  state: SegmentState,
): SubtitleSegment {
  return {
    ...segment,
    state,
    updatedAt: Date.now(),
  };
}

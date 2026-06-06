// packages/domain/src/subtitle/revision-window.ts

import type { SubtitleSegment } from "./segment";

/**
 * 修订窗口配置
 */
export interface RevisionWindowConfig {
  /**
   * 最近可修订的句子数量
   */
  readonly maxSentences: number;

  /**
   * 最近可修订的时间窗口（毫秒）
   */
  readonly maxTimeMs: number;
}

/**
 * 默认修订窗口配置
 */
export const DEFAULT_REVISION_WINDOW: RevisionWindowConfig = {
  maxSentences: 5,
  maxTimeMs: 20_000, // 20 秒
};

/**
 * 判断字幕片段是否应该被锁定
 * 规则：超出任一修订边界后锁定
 * - 不再属于最近 N 个可修订句子；或
 * - 距离该段结束时间超过 T 毫秒
 */
export function shouldLockSegment(
  segment: SubtitleSegment,
  allSegments: readonly SubtitleSegment[],
  config: RevisionWindowConfig = DEFAULT_REVISION_WINDOW,
  currentTimeMs: number = Date.now(),
): boolean {
  // 已经锁定的片段不需要再次判断
  if (segment.state === "locked") {
    return false;
  }

  // 按 sequence 排序，获取最新的 N 个片段
  const sortedSegments = [...allSegments].sort((a, b) => a.sequence - b.sequence);
  const recentSegments = sortedSegments.slice(-config.maxSentences);
  const isRecentSentence = recentSegments.some((s) => s.id === segment.id);

  // 如果不在最近 N 个句子中，应该锁定
  if (!isRecentSentence) {
    return true;
  }

  // 如果距离结束时间超过 T 毫秒，应该锁定
  const timeSinceEnd = currentTimeMs - segment.endMs;
  if (timeSinceEnd > config.maxTimeMs) {
    return true;
  }

  return false;
}

/**
 * 计算哪些片段应该被锁定
 */
export function calculateSegmentsToLock(
  segments: readonly SubtitleSegment[],
  config: RevisionWindowConfig = DEFAULT_REVISION_WINDOW,
  currentTimeMs: number = Date.now(),
): readonly SubtitleSegment[] {
  return segments.filter((segment) =>
    shouldLockSegment(segment, segments, config, currentTimeMs)
  );
}

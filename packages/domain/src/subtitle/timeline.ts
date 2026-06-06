// packages/domain/src/subtitle/timeline.ts

import type { SubtitleSegment, SegmentState } from "./segment";
import { createSegment, updateState } from "./segment";
import {
  shouldLockSegment,
  calculateSegmentsToLock,
  DEFAULT_REVISION_WINDOW,
  type RevisionWindowConfig,
} from "./revision-window";

/**
 * 字幕时间线类
 * 管理字幕片段的集合和生命周期
 */
export class SubtitleTimeline {
  private segments: Map<string, SubtitleSegment> = new Map();
  private sequenceCounter: number = 0;
  private revisionCounter: number = 0;
  private config: RevisionWindowConfig;

  constructor(config: RevisionWindowConfig = DEFAULT_REVISION_WINDOW) {
    this.config = config;
  }

  /**
   * 获取所有片段（按 sequence 排序）
   */
  getSegments(): readonly SubtitleSegment[] {
    return Array.from(this.segments.values()).sort(
      (a, b) => a.sequence - b.sequence
    );
  }

  /**
   * 获取指定 ID 的片段
   */
  getSegment(id: string): SubtitleSegment | undefined {
    return this.segments.get(id);
  }

  /**
   * 添加新的字幕片段
   */
  addSegment(
    id: string,
    sourceText: string,
    startMs: number,
    endMs: number,
  ): SubtitleSegment {
    this.sequenceCounter++;
    const segment = createSegment(id, this.sequenceCounter, sourceText, startMs, endMs);
    this.segments.set(id, segment);
    this.revisionCounter++;
    return segment;
  }

  /**
   * 更新片段原文
   */
  updateSourceText(id: string, sourceText: string): SubtitleSegment | undefined {
    const segment = this.segments.get(id);
    if (!segment || segment.state === "locked") {
      return undefined;
    }

    const updated = {
      ...segment,
      sourceText,
      sourceVersion: segment.sourceVersion + 1,
      updatedAt: Date.now(),
    };
    this.segments.set(id, updated);
    this.revisionCounter++;
    return updated;
  }

  /**
   * 更新片段译文
   */
  updateTranslatedText(id: string, translatedText: string): SubtitleSegment | undefined {
    const segment = this.segments.get(id);
    if (!segment || segment.state === "locked") {
      return undefined;
    }

    const updated = {
      ...segment,
      translatedText,
      translationVersion: segment.translationVersion + 1,
      updatedAt: Date.now(),
    };
    this.segments.set(id, updated);
    this.revisionCounter++;
    return updated;
  }

  /**
   * 更新片段状态
   */
  updateState(id: string, state: SegmentState): SubtitleSegment | undefined {
    const segment = this.segments.get(id);
    if (!segment || (segment.state === "locked" && state !== "locked")) {
      return undefined;
    }

    const updated = updateState(segment, state);
    this.segments.set(id, updated);
    this.revisionCounter++;
    return updated;
  }

  /**
   * 应用修订窗口规则，锁定应该锁定的片段
   */
  applyRevisionWindow(currentTimeMs: number = Date.now()): readonly SubtitleSegment[] {
    const segments = this.getSegments();
    const toLock = calculateSegmentsToLock(segments, this.config, currentTimeMs);
    const locked: SubtitleSegment[] = [];

    for (const segment of toLock) {
      const updated = this.updateState(segment.id, "locked");
      if (updated) {
        locked.push(updated);
      }
    }

    return locked;
  }

  /**
   * 获取当前修订版本号
   */
  getRevision(): number {
    return this.revisionCounter;
  }

  /**
   * 获取片段数量
   */
  getSize(): number {
    return this.segments.size;
  }

  /**
   * 清空时间线
   */
  clear(): void {
    this.segments.clear();
    this.sequenceCounter = 0;
    this.revisionCounter = 0;
  }
}

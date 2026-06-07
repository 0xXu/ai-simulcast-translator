import type {
  SegmentState,
  SubtitleSegment,
  SubtitleTimeline,
} from "@simulcast/domain";
import type { SubtitleSnapshot } from "../translation/subtitle-snapshot";

export interface SubtitleSnapshotTimelinePort {
  getSegments(): readonly SubtitleSegment[];
  addSegment(
    id: string,
    sourceText: string,
    startMs: number,
    endMs: number,
  ): SubtitleSegment;
  updateSourceText(id: string, sourceText: string): SubtitleSegment | undefined;
  updateTranslatedText(
    id: string,
    translatedText: string,
  ): SubtitleSegment | undefined;
  updateState(id: string, state: SegmentState): SubtitleSegment | undefined;
  applyRevisionWindow(currentTimeMs?: number): readonly SubtitleSegment[];
}

export interface ApplySubtitleSnapshotOptions {
  readonly sessionId: string;
  readonly snapshot: SubtitleSnapshot;
  readonly timeline: SubtitleSnapshotTimelinePort | SubtitleTimeline;
  readonly lastAppliedRequestId: number;
  readonly currentAudioTimeMs: number;
  readonly nowMs?: number;
  readonly highlightDurationMs?: number;
  readonly createSegmentId?: (requestId: number, itemIndex: number) => string;
}

export interface AppliedSubtitleChange {
  readonly segmentId: string;
  readonly kind: "inserted" | "revised";
  readonly sourceTextChanged: boolean;
  readonly translatedTextChanged: boolean;
  readonly reason: string | null;
  readonly highlightUntilMs: number;
}

export interface AppliedSubtitleSnapshot {
  readonly status: "applied";
  readonly requestId: number;
  readonly lastAppliedRequestId: number;
  readonly segments: readonly SubtitleSegment[];
  readonly lockedSegments: readonly SubtitleSegment[];
  readonly changes: readonly AppliedSubtitleChange[];
}

export interface StaleSubtitleSnapshot {
  readonly status: "stale";
  readonly requestId: number;
  readonly lastAppliedRequestId: number;
  readonly segments: readonly SubtitleSegment[];
  readonly lockedSegments: readonly SubtitleSegment[];
  readonly changes: readonly [];
}

export type ApplySubtitleSnapshotResult =
  | AppliedSubtitleSnapshot
  | StaleSubtitleSnapshot;

export function applySubtitleSnapshot(
  options: ApplySubtitleSnapshotOptions,
): ApplySubtitleSnapshotResult {
  const lockedSegments = options.timeline.applyRevisionWindow(
    options.currentAudioTimeMs,
  );
  const segmentsBefore = options.timeline.getSegments();

  if (options.snapshot.requestId <= options.lastAppliedRequestId) {
    return {
      status: "stale",
      requestId: options.snapshot.requestId,
      lastAppliedRequestId: options.lastAppliedRequestId,
      segments: segmentsBefore,
      lockedSegments,
      changes: [],
    };
  }

  const nowMs = options.nowMs ?? Date.now();
  const highlightUntilMs = nowMs + (options.highlightDurationMs ?? 700);
  const createSegmentId =
    options.createSegmentId
    ?? ((requestId, itemIndex) =>
      `${options.sessionId}-snapshot-${requestId}-${itemIndex + 1}`);

  const editableSegments = segmentsBefore
    .filter((segment) => segment.state !== "locked")
    .sort((a, b) => a.sequence - b.sequence);
  const changes: AppliedSubtitleChange[] = [];

  options.snapshot.subtitles.forEach((item, itemIndex) => {
    const existing = editableSegments[itemIndex];
    if (!existing) {
      const segment = options.timeline.addSegment(
        createSegmentId(options.snapshot.requestId, itemIndex),
        item.sourceText,
        options.currentAudioTimeMs,
        options.currentAudioTimeMs,
      );
      const translated = options.timeline.updateTranslatedText(
        segment.id,
        item.translatedText,
      ) ?? segment;
      options.timeline.updateState(translated.id, "revisable");
      changes.push({
        segmentId: translated.id,
        kind: "inserted",
        sourceTextChanged: true,
        translatedTextChanged: item.translatedText.length > 0,
        reason: item.revisionReason ?? null,
        highlightUntilMs,
      });
      return;
    }

    const sourceTextChanged = existing.sourceText !== item.sourceText;
    const translatedTextChanged =
      existing.translatedText !== item.translatedText;
    let current = existing;

    if (sourceTextChanged) {
      current = options.timeline.updateSourceText(
        current.id,
        item.sourceText,
      ) ?? current;
    }

    if (translatedTextChanged) {
      current = options.timeline.updateTranslatedText(
        current.id,
        item.translatedText,
      ) ?? current;
    }

    if (current.state === "live") {
      options.timeline.updateState(current.id, "revisable");
    }

    if (sourceTextChanged || translatedTextChanged || item.revised) {
      changes.push({
        segmentId: current.id,
        kind: "revised",
        sourceTextChanged,
        translatedTextChanged,
        reason: item.revisionReason ?? null,
        highlightUntilMs,
      });
    }
  });

  return {
    status: "applied",
    requestId: options.snapshot.requestId,
    lastAppliedRequestId: options.snapshot.requestId,
    segments: options.timeline.getSegments(),
    lockedSegments,
    changes,
  };
}

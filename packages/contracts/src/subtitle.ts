export type SubtitleSegmentState = "live" | "revisable" | "locked";

export interface SubtitleSnapshotSegment {
  readonly id: string;
  readonly sequence: number;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly state: SubtitleSegmentState;
  readonly sourceVersion: number;
  readonly translationVersion: number;
}

export interface SubtitleSnapshotChange {
  readonly segmentId: string;
  readonly kind: "inserted" | "revised";
  readonly sourceTextChanged: boolean;
  readonly translatedTextChanged: boolean;
  readonly reason: string | null;
  readonly highlightUntilMs: number;
}

export interface SubtitleSnapshotEvent {
  readonly type: "snapshot";
  readonly sessionId: string;
  readonly requestId: number;
  readonly lastAppliedRequestId: number;
  readonly segments: readonly SubtitleSnapshotSegment[];
  readonly changes: readonly SubtitleSnapshotChange[];
}

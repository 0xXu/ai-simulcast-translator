import type { AppliedSubtitleChange } from "@simulcast/application";

export type SubtitleLineState = "live" | "revisable" | "locked";

export interface SubtitleLineView {
  readonly id: string;
  readonly sequence: number;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly state: SubtitleLineState;
  readonly highlighted: boolean;
  readonly revisionReason: string | null;
}

export interface SubtitleStoreSegment {
  readonly id: string;
  readonly sequence: number;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly state: SubtitleLineState;
}

export class SubtitleStore {
  private segments: SubtitleStoreSegment[];
  private highlights: Map<string, AppliedSubtitleChange>;

  constructor(segments: readonly SubtitleStoreSegment[] = []) {
    this.segments = [...segments];
    this.highlights = new Map();
  }

  replaceSegments(segments: readonly SubtitleStoreSegment[]): void {
    this.segments = [...segments];
  }

  applyChanges(changes: readonly AppliedSubtitleChange[]): void {
    for (const change of changes) {
      this.highlights.set(change.segmentId, change);
    }
  }

  getVisibleLines(options: {
    readonly nowMs: number;
    readonly maxLines?: number;
  }): readonly SubtitleLineView[] {
    const maxLines = options.maxLines ?? 3;
    return [...this.segments]
      .sort((a, b) => a.sequence - b.sequence)
      .slice(-maxLines)
      .map((segment) => {
        const change = this.highlights.get(segment.id);
        const highlighted =
          change !== undefined && change.highlightUntilMs > options.nowMs;
        return {
          id: segment.id,
          sequence: segment.sequence,
          sourceText: segment.sourceText,
          translatedText: segment.translatedText,
          state: segment.state,
          highlighted,
          revisionReason: highlighted ? change.reason : null,
        };
      });
  }
}

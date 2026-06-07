import { describe, expect, it } from "vitest";
import type { SubtitleSegment } from "@simulcast/domain";
import {
  buildSubtitleTranslationRequest,
  selectRecentTranscriptWindows,
  selectRevisableContextSubtitles,
  type RawTranscriptWindow,
} from "./subtitle-snapshot";

describe("subtitle snapshot request building", () => {
  it("keeps only non-empty raw transcript windows inside the recent audio context", () => {
    const windows: RawTranscriptWindow[] = [
      transcript({ sequence: 1, text: "too old", startMs: 0, endMs: 1_000 }),
      transcript({ sequence: 2, text: "recent", startMs: 10_000, endMs: 12_000 }),
      transcript({ sequence: 3, text: "   ", startMs: 15_000, endMs: 16_000 }),
    ];

    expect(selectRecentTranscriptWindows(windows, 10_000, 12_000)).toEqual([
      windows[1],
    ]);
  });

  it("keeps only unlocked subtitles inside the 5 sentence or 20 second revision window", () => {
    const segments = [
      segment({ sequence: 1, state: "revisable", endMs: 1_000 }),
      segment({ sequence: 2, state: "locked", endMs: 2_000 }),
      segment({ sequence: 3, state: "revisable", endMs: 3_000 }),
      segment({ sequence: 4, state: "revisable", endMs: 4_000 }),
      segment({ sequence: 5, state: "revisable", endMs: 5_000 }),
      segment({ sequence: 6, state: "live", endMs: 6_000 }),
      segment({ sequence: 7, state: "live", endMs: 7_000 }),
    ];

    const context = selectRevisableContextSubtitles(
      segments,
      { maxSentences: 5, maxTimeMs: 20_000 },
      7_000,
    );

    expect(context.map((item) => item.sequence)).toEqual([3, 4, 5, 6, 7]);
    expect(context.every((item) => item.state !== "locked")).toBe(true);
  });

  it("builds a self-contained request with request and session identifiers", () => {
    const request = buildSubtitleTranslationRequest({
      requestId: 9,
      sessionId: "session-1",
      rawTranscriptWindows: [
        transcript({ sequence: 1, text: "The model runs locally.", endMs: 1_200 }),
      ],
      currentSubtitles: [
        segment({ sequence: 1, state: "live", endMs: 1_200 }),
      ],
    });

    expect(request).toMatchObject({
      requestId: 9,
      sessionId: "session-1",
      rawTranscriptWindows: [
        { sequence: 1, text: "The model runs locally." },
      ],
      contextSubtitles: [
        { sequence: 1, state: "live" },
      ],
    });
  });
});

function transcript(
  overrides: Partial<RawTranscriptWindow> & {
    sequence: number;
  },
): RawTranscriptWindow {
  return {
    sequence: overrides.sequence,
    text: overrides.text ?? `window ${overrides.sequence}`,
    confidence: overrides.confidence ?? 0.9,
    startMs: overrides.startMs ?? 0,
    endMs: overrides.endMs ?? 1_000,
    isFinal: overrides.isFinal ?? false,
  };
}

function segment(
  overrides: Partial<SubtitleSegment> & {
    sequence: number;
  },
): SubtitleSegment {
  const value: SubtitleSegment = {
    id: overrides.id ?? `segment-${overrides.sequence}`,
    sequence: overrides.sequence,
    sourceText: overrides.sourceText ?? `source ${overrides.sequence}`,
    translatedText: overrides.translatedText ?? `译文 ${overrides.sequence}`,
    startMs: overrides.startMs ?? 0,
    endMs: overrides.endMs ?? 1_000,
    state: overrides.state ?? "revisable",
    sourceVersion: overrides.sourceVersion ?? 1,
    translationVersion: overrides.translationVersion ?? 1,
    updatedAt: overrides.updatedAt ?? 100,
  };
  if (overrides.revisionReason === undefined) {
    return value;
  }
  return {
    ...value,
    revisionReason: overrides.revisionReason,
  };
}

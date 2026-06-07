import { describe, expect, it } from "vitest";
import { SubtitleStore } from "./subtitle-store";

describe("SubtitleStore", () => {
  it("returns the latest subtitle lines in timeline order", () => {
    const store = new SubtitleStore([
      segment(1),
      segment(2),
      segment(3),
      segment(4),
    ]);

    expect(
      store.getVisibleLines({ nowMs: 1_000, maxLines: 3 }).map((line) => line.id),
    ).toEqual(["segment-2", "segment-3", "segment-4"]);
  });

  it("marks revised lines as highlighted until the highlight deadline", () => {
    const store = new SubtitleStore([segment(1)]);
    store.applyChanges([
      {
        segmentId: "segment-1",
        kind: "revised",
        sourceTextChanged: false,
        translatedTextChanged: true,
        reason: "后文消除歧义",
        highlightUntilMs: 1_700,
      },
    ]);

    expect(store.getVisibleLines({ nowMs: 1_100 })[0]).toMatchObject({
      highlighted: true,
      revisionReason: "后文消除歧义",
    });
    expect(store.getVisibleLines({ nowMs: 1_800 })[0]).toMatchObject({
      highlighted: false,
      revisionReason: null,
    });
  });
});

function segment(sequence: number) {
  return {
    id: `segment-${sequence}`,
    sequence,
    sourceText: `source ${sequence}`,
    translatedText: `译文 ${sequence}`,
    state: "revisable" as const,
  };
}

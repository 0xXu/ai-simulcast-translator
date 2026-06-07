import { describe, expect, it } from "vitest";
import { SubtitleTimeline } from "@simulcast/domain";
import { applySubtitleSnapshot } from "./apply-subtitle-snapshot";
import type { SubtitleSnapshot } from "../translation/subtitle-snapshot";

describe("applySubtitleSnapshot", () => {
  it("applies a newer snapshot in place and returns highlight metadata", () => {
    const timeline = new SubtitleTimeline();
    const segment = timeline.addSegment("segment-1", "The model run local.", 0, 1_000);
    timeline.updateTranslatedText(segment.id, "模型运行。");

    const result = applySubtitleSnapshot({
      sessionId: "session-1",
      timeline,
      lastAppliedRequestId: 0,
      currentAudioTimeMs: 1_200,
      nowMs: 10_000,
      highlightDurationMs: 600,
      snapshot: snapshot(1, [
        {
          sourceText: "The model runs locally.",
          translatedText: "该模型在本地运行。",
          revised: true,
          revisionReason: "补全谓语和副词",
        },
      ]),
    });

    expect(result.status).toBe("applied");
    expect(result.lastAppliedRequestId).toBe(1);
    expect(timeline.getSegment("segment-1")).toMatchObject({
      sourceText: "The model runs locally.",
      translatedText: "该模型在本地运行。",
      state: "revisable",
    });
    expect(result.changes).toEqual([
      {
        segmentId: "segment-1",
        kind: "revised",
        sourceTextChanged: true,
        translatedTextChanged: true,
        reason: "补全谓语和副词",
        highlightUntilMs: 10_600,
      },
    ]);
  });

  it("drops stale snapshots before mutating the timeline", () => {
    const timeline = new SubtitleTimeline();
    const segment = timeline.addSegment("segment-1", "Hello", 0, 1_000);
    timeline.updateTranslatedText(segment.id, "你好");

    const result = applySubtitleSnapshot({
      sessionId: "session-1",
      timeline,
      lastAppliedRequestId: 3,
      currentAudioTimeMs: 1_200,
      snapshot: snapshot(2, [
        {
          sourceText: "Hello",
          translatedText: "旧响应",
          revised: true,
        },
      ]),
    });

    expect(result.status).toBe("stale");
    expect(timeline.getSegment("segment-1")?.translatedText).toBe("你好");
    expect(result.changes).toEqual([]);
  });

  it("does not modify locked subtitles while applying recent snapshot items", () => {
    const timeline = new SubtitleTimeline({ maxSentences: 1, maxTimeMs: 20_000 });
    const locked = timeline.addSegment("locked", "Old sentence", 0, 1_000);
    timeline.updateTranslatedText(locked.id, "旧句子");
    const recent = timeline.addSegment("recent", "New sentence", 1_100, 2_000);
    timeline.updateTranslatedText(recent.id, "新句子");

    const result = applySubtitleSnapshot({
      sessionId: "session-1",
      timeline,
      lastAppliedRequestId: 0,
      currentAudioTimeMs: 2_100,
      snapshot: snapshot(1, [
        {
          sourceText: "New sentence",
          translatedText: "新的句子。",
          revised: true,
        },
      ]),
    });

    expect(result.lockedSegments.map((item) => item.id)).toEqual(["locked"]);
    expect(timeline.getSegment("locked")).toMatchObject({
      state: "locked",
      translatedText: "旧句子",
    });
    expect(timeline.getSegment("recent")?.translatedText).toBe("新的句子。");
  });

  it("adds new subtitle segments when the snapshot is longer than the editable window", () => {
    const timeline = new SubtitleTimeline();

    const result = applySubtitleSnapshot({
      sessionId: "session-1",
      timeline,
      lastAppliedRequestId: 0,
      currentAudioTimeMs: 2_000,
      createSegmentId: (requestId, itemIndex) => `generated-${requestId}-${itemIndex}`,
      snapshot: snapshot(4, [
        {
          sourceText: "A new sentence.",
          translatedText: "一个新的句子。",
          revised: false,
        },
      ]),
    });

    expect(result.status).toBe("applied");
    expect(timeline.getSegments()).toHaveLength(1);
    expect(timeline.getSegment("generated-4-0")).toMatchObject({
      sourceText: "A new sentence.",
      translatedText: "一个新的句子。",
      state: "revisable",
      startMs: 2_000,
      endMs: 2_000,
    });
    expect(result.changes[0]).toMatchObject({
      segmentId: "generated-4-0",
      kind: "inserted",
    });
  });
});

function snapshot(
  requestId: number,
  subtitles: SubtitleSnapshot["subtitles"],
): SubtitleSnapshot {
  return {
    requestId,
    subtitles,
  };
}

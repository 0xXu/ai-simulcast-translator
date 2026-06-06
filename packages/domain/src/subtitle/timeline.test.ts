// packages/domain/src/subtitle/timeline.test.ts

import { describe, it, expect } from "vitest";
import { SubtitleTimeline } from "./timeline";

describe("SubtitleTimeline", () => {
  describe("addSegment", () => {
    it("adds a new segment", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      const segment = timeline.addSegment("seg-001", "Hello", now, now + 1000);

      expect(segment.id).toBe("seg-001");
      expect(segment.sequence).toBe(1);
      expect(timeline.getSize()).toBe(1);
    });

    it("increments sequence counter", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      const segment2 = timeline.addSegment("seg-002", "World", now + 1000, now + 2000);

      expect(segment2.sequence).toBe(2);
    });
  });

  describe("getSegments", () => {
    it("returns segments sorted by sequence", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-002", "World", now + 1000, now + 2000);
      timeline.addSegment("seg-001", "Hello", now, now + 1000);

      const segments = timeline.getSegments();
      expect(segments[0]!.id).toBe("seg-002");
      expect(segments[1]!.id).toBe("seg-001");
    });
  });

  describe("updateSourceText", () => {
    it("updates source text", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      const updated = timeline.updateSourceText("seg-001", "Hello World");

      expect(updated?.sourceText).toBe("Hello World");
      expect(updated?.sourceVersion).toBe(2);
    });

    it("returns undefined for non-existent segment", () => {
      const timeline = new SubtitleTimeline();
      const updated = timeline.updateSourceText("non-existent", "Hello");

      expect(updated).toBeUndefined();
    });
  });

  describe("updateTranslatedText", () => {
    it("updates translated text", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      const updated = timeline.updateTranslatedText("seg-001", "你好");

      expect(updated?.translatedText).toBe("你好");
      expect(updated?.translationVersion).toBe(1);
    });
  });

  describe("locked segments", () => {
    it("cannot return to a revisable state", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      timeline.updateState("seg-001", "locked");

      expect(timeline.updateState("seg-001", "revisable")).toBeUndefined();
      expect(timeline.getSegment("seg-001")?.state).toBe("locked");
    });

    it("cannot update source or translated text", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      timeline.updateTranslatedText("seg-001", "你好");
      timeline.updateState("seg-001", "locked");

      expect(
        timeline.updateSourceText("seg-001", "Changed"),
      ).toBeUndefined();
      expect(
        timeline.updateTranslatedText("seg-001", "已修改"),
      ).toBeUndefined();
      expect(timeline.getSegment("seg-001")).toMatchObject({
        sourceText: "Hello",
        translatedText: "你好",
        state: "locked",
      });
    });
  });

  describe("applyRevisionWindow", () => {
    it("locks segments beyond max sentences", () => {
      const timeline = new SubtitleTimeline({ maxSentences: 3, maxTimeMs: 20_000 });
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        timeline.addSegment(`seg-${i}`, `Text ${i}`, now + i * 1000, now + (i + 1) * 1000);
      }

      const locked = timeline.applyRevisionWindow(now + 5000);
      expect(locked).toHaveLength(2);
      expect(locked.every((segment) => segment.state === "locked")).toBe(true);
      expect(timeline.getSegment("seg-0")?.state).toBe("locked");
      expect(timeline.getSegment("seg-1")?.state).toBe("locked");
      expect(timeline.getRevision()).toBe(7);
    });

    it("does not lock segments within window", () => {
      const timeline = new SubtitleTimeline({ maxSentences: 5, maxTimeMs: 20_000 });
      const now = Date.now();

      for (let i = 0; i < 3; i++) {
        timeline.addSegment(`seg-${i}`, `Text ${i}`, now + i * 1000, now + (i + 1) * 1000);
      }

      const locked = timeline.applyRevisionWindow(now + 5_000);
      expect(locked.length).toBe(0);
    });
  });

  describe("getRevision", () => {
    it("increments revision on modifications", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();

      expect(timeline.getRevision()).toBe(0);

      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      expect(timeline.getRevision()).toBe(1);

      timeline.updateSourceText("seg-001", "Hello World");
      expect(timeline.getRevision()).toBe(2);
    });
  });

  describe("clear", () => {
    it("clears all segments", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      timeline.addSegment("seg-002", "World", now + 1000, now + 2000);

      timeline.clear();

      expect(timeline.getSize()).toBe(0);
      expect(timeline.getRevision()).toBe(0);
    });
  });
});

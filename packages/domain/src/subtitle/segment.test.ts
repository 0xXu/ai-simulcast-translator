// packages/domain/src/subtitle/segment.test.ts

import { describe, it, expect } from "vitest";
import {
  createSegment,
  updateSourceText,
  updateTranslatedText,
  updateState,
} from "./segment";

describe("SubtitleSegment", () => {
  describe("createSegment", () => {
    it("creates a new segment with default values", () => {
      const segment = createSegment("seg-001", 1, "Hello", 0, 1000);

      expect(segment.id).toBe("seg-001");
      expect(segment.sequence).toBe(1);
      expect(segment.sourceText).toBe("Hello");
      expect(segment.translatedText).toBe("");
      expect(segment.startMs).toBe(0);
      expect(segment.endMs).toBe(1000);
      expect(segment.state).toBe("live");
      expect(segment.sourceVersion).toBe(1);
      expect(segment.translationVersion).toBe(0);
    });
  });

  describe("updateSourceText", () => {
    it("updates source text and increments version", () => {
      const segment = createSegment("seg-001", 1, "Hello", 0, 1000);
      const updated = updateSourceText(segment, "Hello World");

      expect(updated.sourceText).toBe("Hello World");
      expect(updated.sourceVersion).toBe(2);
      expect(updated.id).toBe("seg-001");
    });
  });

  describe("updateTranslatedText", () => {
    it("updates translated text and increments version", () => {
      const segment = createSegment("seg-001", 1, "Hello", 0, 1000);
      const updated = updateTranslatedText(segment, "你好");

      expect(updated.translatedText).toBe("你好");
      expect(updated.translationVersion).toBe(1);
    });
  });

  describe("updateState", () => {
    it("updates segment state", () => {
      const segment = createSegment("seg-001", 1, "Hello", 0, 1000);
      const updated = updateState(segment, "revisable");

      expect(updated.state).toBe("revisable");
    });
  });
});

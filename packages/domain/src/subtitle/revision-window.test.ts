// packages/domain/src/subtitle/revision-window.test.ts

import { describe, it, expect } from "vitest";
import { createSegment, updateState } from "./segment";
import {
  shouldLockSegment,
  calculateSegmentsToLock,
  DEFAULT_REVISION_WINDOW,
} from "./revision-window";

describe("RevisionWindow", () => {
  describe("shouldLockSegment", () => {
    it("returns false for live segments within window", () => {
      const segments = [
        createSegment("seg-001", 1, "Hello", 0, 1000),
        createSegment("seg-002", 2, "World", 1000, 2000),
      ];
      const segment = segments[0];

      expect(shouldLockSegment(segment, segments)).toBe(false);
    });

    it("returns true for segments beyond max sentences", () => {
      const segments = Array.from({ length: 6 }, (_, i) =>
        createSegment(`seg-${i}`, i + 1, `Text ${i}`, i * 1000, (i + 1) * 1000)
      );
      const oldestSegment = segments[0];

      expect(shouldLockSegment(oldestSegment, segments)).toBe(true);
    });

    it("returns true for segments beyond max time", () => {
      const currentTime = Date.now();
      const segments = [
        createSegment("seg-001", 1, "Hello", 0, 1000),
      ];
      const segment = segments[0];

      // 距离结束时间超过 20 秒
      expect(shouldLockSegment(segment, segments, DEFAULT_REVISION_WINDOW, currentTime + 25_000)).toBe(true);
    });

    it("returns false for segments within time window", () => {
      const currentTime = Date.now();
      const segments = [
        createSegment("seg-001", 1, "Hello", 0, 1000),
      ];
      const segment = segments[0];

      // 距离结束时间在 20 秒内
      expect(shouldLockSegment(segment, segments, DEFAULT_REVISION_WINDOW, currentTime + 10_000)).toBe(false);
    });

    it("returns false for already locked segments", () => {
      const segments = [
        updateState(createSegment("seg-001", 1, "Hello", 0, 1000), "locked"),
      ];
      const segment = segments[0];

      expect(shouldLockSegment(segment, segments)).toBe(false);
    });
  });

  describe("calculateSegmentsToLock", () => {
    it("returns empty array when no segments should be locked", () => {
      const segments = [
        createSegment("seg-001", 1, "Hello", 0, 1000),
        createSegment("seg-002", 2, "World", 1000, 2000),
      ];

      expect(calculateSegmentsToLock(segments)).toEqual([]);
    });

    it("returns segments that should be locked", () => {
      const segments = Array.from({ length: 6 }, (_, i) =>
        createSegment(`seg-${i}`, i + 1, `Text ${i}`, i * 1000, (i + 1) * 1000)
      );

      const toLock = calculateSegmentsToLock(segments);
      expect(toLock.length).toBe(1);
      expect(toLock[0].id).toBe("seg-0");
    });
  });
});

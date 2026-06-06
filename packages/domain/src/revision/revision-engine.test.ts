// packages/domain/src/revision/revision-engine.test.ts

import { describe, it, expect } from "vitest";
import { SubtitleTimeline } from "../subtitle/timeline";
import {
  createUpsertOperation,
  createReplaceOperation,
  createRevisionRequest,
} from "./operation";
import { RevisionEngine, DEFAULT_REVISION_ENGINE_CONFIG } from "./revision-engine";

describe("RevisionEngine", () => {
  describe("applyRevisionRequest", () => {
    it("applies valid upsert operation", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);

      const engine = new RevisionEngine();
      const request = createRevisionRequest(
        "req-001",
        "session-001",
        0,
        [createUpsertOperation("seg-001", "你好")],
      );

      const response = engine.applyRevisionRequest(request, timeline, "session-001");

      expect(response.appliedOperations.length).toBe(1);
      expect(response.rejectedOperations.length).toBe(0);

      const segment = timeline.getSegment("seg-001");
      expect(segment?.translatedText).toBe("你好");
    });

    it("applies valid replace operation", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      timeline.updateTranslatedText("seg-001", "你好");

      const engine = new RevisionEngine();
      const request = createRevisionRequest(
        "req-001",
        "session-001",
        1,
        [createReplaceOperation("seg-001", "修正后的翻译", 1, "术语修正")],
      );

      const response = engine.applyRevisionRequest(request, timeline, "session-001");

      expect(response.appliedOperations.length).toBe(1);
      expect(response.rejectedOperations.length).toBe(0);

      const segment = timeline.getSegment("seg-001");
      expect(segment?.translatedText).toBe("修正后的翻译");
    });

    it("rejects operation with mismatched sessionId", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);

      const engine = new RevisionEngine();
      const request = createRevisionRequest(
        "req-001",
        "session-002",
        0,
        [createUpsertOperation("seg-001", "你好")],
      );

      const response = engine.applyRevisionRequest(request, timeline, "session-001");

      expect(response.appliedOperations.length).toBe(0);
      expect(response.rejectedOperations.length).toBe(1);
      expect(response.rejectedOperations[0]?.reason).toContain("会话 ID 不匹配");
    });

    it("rejects operation with old baseRevision", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);

      const engine = new RevisionEngine({ maxRevisionGap: 5 });
      const request = createRevisionRequest(
        "req-001",
        "session-001",
        10, // baseRevision 过旧
        [createUpsertOperation("seg-001", "你好")],
      );

      const response = engine.applyRevisionRequest(request, timeline, "session-001");

      expect(response.appliedOperations.length).toBe(0);
      expect(response.rejectedOperations.length).toBe(1);
      expect(response.rejectedOperations[0]?.reason).toContain("修订版本过旧");
    });

    it("rejects operation on locked segment", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      timeline.updateState("seg-001", "locked");

      const engine = new RevisionEngine();
      const request = createRevisionRequest(
        "req-001",
        "session-001",
        0,
        [createUpsertOperation("seg-001", "你好")],
      );

      const response = engine.applyRevisionRequest(request, timeline, "session-001");

      expect(response.appliedOperations.length).toBe(0);
      expect(response.rejectedOperations.length).toBe(1);
      expect(response.rejectedOperations[0]?.reason).toContain("已锁定");
    });

    it("rejects replace operation with mismatched version", () => {
      const timeline = new SubtitleTimeline();
      const now = Date.now();
      timeline.addSegment("seg-001", "Hello", now, now + 1000);
      timeline.updateTranslatedText("seg-001", "你好");

      const engine = new RevisionEngine();
      const request = createRevisionRequest(
        "req-001",
        "session-001",
        1,
        [createReplaceOperation("seg-001", "修正", 999)], // 版本不匹配
      );

      const response = engine.applyRevisionRequest(request, timeline, "session-001");

      expect(response.appliedOperations.length).toBe(0);
      expect(response.rejectedOperations.length).toBe(1);
      expect(response.rejectedOperations[0]?.reason).toContain("版本不匹配");
    });
  });
});

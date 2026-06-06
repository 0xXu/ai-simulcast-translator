// packages/domain/src/revision/operation.test.ts

import { describe, it, expect } from "vitest";
import {
  createUpsertOperation,
  createReplaceOperation,
  createRevisionRequest,
  validateRevisionOperation,
} from "./operation";

describe("RevisionOperation", () => {
  describe("createUpsertOperation", () => {
    it("creates upsert operation with default version", () => {
      const op = createUpsertOperation("seg-001", "你好");

      expect(op.type).toBe("upsert");
      expect(op.segmentId).toBe("seg-001");
      expect(op.translation).toBe("你好");
      expect(op.expectedVersion).toBe(0);
    });

    it("creates upsert operation with custom version", () => {
      const op = createUpsertOperation("seg-001", "你好", 2, "术语修正");

      expect(op.expectedVersion).toBe(2);
      expect(op.reason).toBe("术语修正");
    });
  });

  describe("createReplaceOperation", () => {
    it("creates replace operation", () => {
      const op = createReplaceOperation("seg-001", "修正后的翻译", 3, "后文明确含义");

      expect(op.type).toBe("replace");
      expect(op.segmentId).toBe("seg-001");
      expect(op.translation).toBe("修正后的翻译");
      expect(op.expectedVersion).toBe(3);
      expect(op.reason).toBe("后文明确含义");
    });
  });

  describe("createRevisionRequest", () => {
    it("creates revision request", () => {
      const operations = [
        createUpsertOperation("seg-001", "你好"),
        createReplaceOperation("seg-002", "修正", 2),
      ];
      const request = createRevisionRequest("req-001", "session-001", 5, operations);

      expect(request.requestId).toBe("req-001");
      expect(request.sessionId).toBe("session-001");
      expect(request.baseRevision).toBe(5);
      expect(request.operations.length).toBe(2);
    });
  });

  describe("validateRevisionOperation", () => {
    it("validates correct operation", () => {
      const op = createUpsertOperation("seg-001", "你好");
      expect(validateRevisionOperation(op)).toBe(true);
    });

    it("rejects operation with empty segmentId", () => {
      const op = createUpsertOperation("", "你好");
      expect(validateRevisionOperation(op)).toBe(false);
    });

    it("rejects operation with negative version", () => {
      const op = createUpsertOperation("seg-001", "你好", -1);
      expect(validateRevisionOperation(op)).toBe(false);
    });
  });
});

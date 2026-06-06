# PR 04：版本化字幕修订引擎实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现版本化字幕修订引擎，解析结构化 upsert 和 replace 操作，通过 sessionId、baseRevision 和 expectedVersion 阻止旧响应覆盖新字幕。

**Architecture:** 在 `packages/domain` 包中实现修订引擎，与 SubtitleTimeline 集成。使用版本号和会话 ID 确保修订操作的幂等性和顺序性。

**Tech Stack:** TypeScript 6、Vitest 4

---

## 审查修正

原计划只对 `replace` 校验 `expectedVersion`，这会允许过期 `upsert` 覆盖新译文，
与本 PR 的 Goal 和总设计冲突。修正后的规则：

- `upsert` 和 `replace` 都必须比较 `expectedVersion` 与当前
  `translationVersion`。
- 首次翻译使用 `expectedVersion: 0`。
- 操作名称表达写入意图，不改变并发控制规则。
- 测试必须覆盖“旧 upsert 在新译文已经写入后被拒绝”。

---

## 文件结构

```text
packages/domain/src/revision/
  operation.ts                # 修订操作类型定义
  operation.test.ts           # 修订操作测试
  revision-engine.ts          # 修订引擎类
  revision-engine.test.ts     # 修订引擎测试
```

## 依赖关系

```text
packages/domain/src/subtitle/ (SubtitleSegment、SubtitleTimeline)
    ↑
packages/domain/src/revision/ (修订引擎)
    ↑
packages/application (用例编排，后续 PR)
```

---

## Task 1: 定义修订操作类型（失败的测试）

**Files:**
- Create: `packages/domain/src/revision/operation.ts`
- Create: `packages/domain/src/revision/operation.test.ts`

- [ ] **Step 1: 创建 revision 目录**

```bash
mkdir -p packages/domain/src/revision
```

- [ ] **Step 2: 定义修订操作类型**

```typescript
// packages/domain/src/revision/operation.ts

/**
 * 修订操作类型
 */
export type RevisionOperationType = "upsert" | "replace";

/**
 * 修订操作接口
 */
export interface RevisionOperation {
  readonly type: RevisionOperationType;
  readonly segmentId: string;
  readonly expectedVersion: number;
  readonly translation: string;
  readonly reason?: string;
}

/**
 * 修订请求接口
 */
export interface RevisionRequest {
  readonly requestId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly operations: readonly RevisionOperation[];
}

/**
 * 修订响应接口
 */
export interface RevisionResponse {
  readonly requestId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly appliedOperations: readonly RevisionOperation[];
  readonly rejectedOperations: readonly {
    readonly operation: RevisionOperation;
    readonly reason: string;
  }[];
}

/**
 * 创建 upsert 操作
 */
export function createUpsertOperation(
  segmentId: string,
  translation: string,
  expectedVersion: number = 0,
  reason?: string,
): RevisionOperation {
  return {
    type: "upsert",
    segmentId,
    expectedVersion,
    translation,
    reason,
  };
}

/**
 * 创建 replace 操作
 */
export function createReplaceOperation(
  segmentId: string,
  translation: string,
  expectedVersion: number,
  reason?: string,
): RevisionOperation {
  return {
    type: "replace",
    segmentId,
    expectedVersion,
    translation,
    reason,
  };
}

/**
 * 创建修订请求
 */
export function createRevisionRequest(
  requestId: string,
  sessionId: string,
  baseRevision: number,
  operations: readonly RevisionOperation[],
): RevisionRequest {
  return {
    requestId,
    sessionId,
    baseRevision,
    operations,
  };
}

/**
 * 验证修订操作是否有效
 */
export function validateRevisionOperation(operation: RevisionOperation): boolean {
  if (operation.type !== "upsert" && operation.type !== "replace") {
    return false;
  }

  if (typeof operation.segmentId !== "string" || operation.segmentId.length === 0) {
    return false;
  }

  if (typeof operation.expectedVersion !== "number" || operation.expectedVersion < 0) {
    return false;
  }

  if (typeof operation.translation !== "string") {
    return false;
  }

  return true;
}
```

- [ ] **Step 3: 编写修订操作测试**

```typescript
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
```

- [ ] **Step 4: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
FAIL  src/revision/operation.test.ts
Error: Cannot find module './operation'
```

- [ ] **Step 5: 提交失败测试**

```bash
git add packages/domain/src/revision/operation.ts packages/domain/src/revision/operation.test.ts
git commit -m "test: 定义修订操作类型"
```

---

## Task 2: 实现修订操作类型

**Files:**
- Modify: `packages/domain/src/revision/operation.ts`（已在 Task 1 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
Test Files  4 passed (4)
Tests       28 passed (28)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/domain/src/revision/operation.ts
git commit -m "feat: 实现修订操作类型"
```

---

## Task 3: 实现修订引擎（失败的测试）

**Files:**
- Create: `packages/domain/src/revision/revision-engine.ts`
- Create: `packages/domain/src/revision/revision-engine.test.ts`

- [ ] **Step 1: 定义修订引擎类**

```typescript
// packages/domain/src/revision/revision-engine.ts

import type { SubtitleSegment } from "../subtitle/segment";
import { updateTranslatedText, updateState } from "../subtitle/segment";
import type { SubtitleTimeline } from "../subtitle/timeline";
import type {
  RevisionRequest,
  RevisionResponse,
  RevisionOperation,
} from "./operation";
import { validateRevisionOperation } from "./operation";

/**
 * 修订引擎配置
 */
export interface RevisionEngineConfig {
  /**
   * 允许的最大版本差异
   * 如果 baseRevision 与当前 revision 差距超过此值，拒绝修订
   */
  readonly maxRevisionGap: number;
}

/**
 * 默认修订引擎配置
 */
export const DEFAULT_REVISION_ENGINE_CONFIG: RevisionEngineConfig = {
  maxRevisionGap: 10,
};

/**
 * 修订引擎类
 * 处理版本化的字幕修订操作
 */
export class RevisionEngine {
  private config: RevisionEngineConfig;

  constructor(config: RevisionEngineConfig = DEFAULT_REVISION_ENGINE_CONFIG) {
    this.config = config;
  }

  /**
   * 应用修订请求到时间线
   */
  applyRevisionRequest(
    request: RevisionRequest,
    timeline: SubtitleTimeline,
    currentSessionId: string,
  ): RevisionResponse {
    const appliedOperations: RevisionOperation[] = [];
    const rejectedOperations: { operation: RevisionOperation; reason: string }[] = [];

    // 检查 sessionId 是否匹配
    if (request.sessionId !== currentSessionId) {
      for (const operation of request.operations) {
        rejectedOperations.push({
          operation,
          reason: "会话 ID 不匹配",
        });
      }
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        baseRevision: request.baseRevision,
        appliedOperations,
        rejectedOperations,
      };
    }

    // 检查 baseRevision 是否可接受
    const currentRevision = timeline.getRevision();
    const revisionGap = currentRevision - request.baseRevision;

    if (revisionGap < 0 || revisionGap > this.config.maxRevisionGap) {
      for (const operation of request.operations) {
        rejectedOperations.push({
          operation,
          reason: `修订版本过旧：当前版本 ${currentRevision}，请求基础版本 ${request.baseRevision}`,
        });
      }
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        baseRevision: request.baseRevision,
        appliedOperations,
        rejectedOperations,
      };
    }

    // 逐个应用操作
    for (const operation of request.operations) {
      const result = this.applyOperation(operation, timeline);
      if (result.success) {
        appliedOperations.push(operation);
      } else {
        rejectedOperations.push({
          operation,
          reason: result.reason,
        });
      }
    }

    return {
      requestId: request.requestId,
      sessionId: request.sessionId,
      baseRevision: request.baseRevision,
      appliedOperations,
      rejectedOperations,
    };
  }

  /**
   * 应用单个操作
   */
  private applyOperation(
    operation: RevisionOperation,
    timeline: SubtitleTimeline,
  ): { success: boolean; reason: string } {
    // 验证操作格式
    if (!validateRevisionOperation(operation)) {
      return { success: false, reason: "操作格式无效" };
    }

    // 获取目标片段
    const segment = timeline.getSegment(operation.segmentId);
    if (!segment) {
      return { success: false, reason: `片段 ${operation.segmentId} 不存在` };
    }

    // 检查片段状态
    if (segment.state === "locked") {
      return { success: false, reason: `片段 ${operation.segmentId} 已锁定` };
    }

    // 检查版本匹配
    if (segment.translationVersion !== operation.expectedVersion) {
      return {
        success: false,
        reason: `版本不匹配：当前版本 ${segment.translationVersion}，期望版本 ${operation.expectedVersion}`,
      };
    }

    // 应用操作
    const updated = updateTranslatedText(segment, operation.translation);
    if (!updated) {
      return { success: false, reason: `更新片段 ${operation.segmentId} 失败` };
    }

    return { success: true, reason: "" };
  }
}
```

- [ ] **Step 2: 编写修订引擎测试**

```typescript
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
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
FAIL  src/revision/revision-engine.test.ts
Error: Cannot find module './revision-engine'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add packages/domain/src/revision/revision-engine.ts packages/domain/src/revision/revision-engine.test.ts
git commit -m "test: 定义修订引擎"
```

---

## Task 4: 实现修订引擎

**Files:**
- Modify: `packages/domain/src/revision/revision-engine.ts`（已在 Task 3 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
Test Files  5 passed (5)
Tests       34 passed (34)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/domain/src/revision/revision-engine.ts
git commit -m "feat: 实现修订引擎"
```

---

## Task 5: 更新 domain 包公开入口

**Files:**
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: 更新 index.ts 导出修订引擎**

```typescript
// packages/domain/src/index.ts

export {
  type SegmentState,
  type SubtitleSegment,
  createSegment,
  updateSourceText,
  updateTranslatedText,
  updateState,
} from "./subtitle/segment";

export {
  type RevisionWindowConfig,
  DEFAULT_REVISION_WINDOW,
  shouldLockSegment,
  calculateSegmentsToLock,
} from "./subtitle/revision-window";

export {
  SubtitleTimeline,
} from "./subtitle/timeline";

export {
  type RevisionOperationType,
  type RevisionOperation,
  type RevisionRequest,
  type RevisionResponse,
  createUpsertOperation,
  createReplaceOperation,
  createRevisionRequest,
  validateRevisionOperation,
} from "./revision/operation";

export {
  type RevisionEngineConfig,
  DEFAULT_REVISION_ENGINE_CONFIG,
  RevisionEngine,
} from "./revision/revision-engine";
```

- [ ] **Step 2: 验证类型导出**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain typecheck
```

Expected:

```text
Exit code 0
```

- [ ] **Step 3: 提交入口文件**

```bash
git add packages/domain/src/index.ts
git commit -m "feat: 更新 domain 包公开入口以包含修订引擎"
```

---

## Task 6: PR 合并前检查

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: 检查工作区变更**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
git status --short
git diff --check
```

Expected:

```text
git diff --check 无输出
```

- [ ] **Step 2: 执行完整自动化验证**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm -r test:run
pnpm -r typecheck
```

Expected:

```text
测试和类型检查全部通过
```

- [ ] **Step 3: 准备 PR**

PR 标题：

```text
feat: 新增版本化字幕修订引擎
```

PR 描述：

```markdown
## 功能描述

实现版本化字幕修订引擎，解析结构化 upsert 和 replace 操作，通过 sessionId、baseRevision 和 expectedVersion 阻止旧响应覆盖新字幕。

## 实现思路

- 创建修订操作类型定义（upsert、replace）
- 实现 RevisionEngine 类处理版本化修订
- 通过 sessionId 验证会话有效性
- 通过 baseRevision 检查修订版本是否过旧
- 通过 expectedVersion 防止版本冲突
- 与 SubtitleTimeline 集成应用修订

## 测试方式

1. 执行 `pnpm install`
2. 执行 `pnpm -r test:run`，确认所有测试通过（34 个测试）
3. 执行 `pnpm -r typecheck`

## 验证结果

- ✅ 34/34 测试通过
- ✅ 类型检查通过
- ✅ 工作树干净
```

---

## PR 04 完成定义

- `packages/domain` 包可独立编译和测试。
- 修订操作类型定义完整（upsert、replace）。
- RevisionEngine 可以处理版本化修订请求。
- 通过 sessionId、baseRevision、expectedVersion 阻止旧响应覆盖新字幕。
- 锁定字幕不能被修订。
- `pnpm -r test:run`、`pnpm -r typecheck` 全部通过。
- 所有提交信息均使用英文类型前缀和中文描述。
- PR 只交付版本化字幕修订引擎，不包含音频、ASR、MiMo 或 UI 逻辑。

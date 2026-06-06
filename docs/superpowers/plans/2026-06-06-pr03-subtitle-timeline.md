# PR 03：字幕时间线领域模型实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现字幕时间线领域模型，包括 SubtitleSegment、SubtitleTimeline 和修订窗口，维护 live、revisable、locked 生命周期。

**Architecture:** 在 `packages/domain` 包中实现纯领域逻辑，不依赖 Electron、网络或外部服务。使用 TypeScript 类型系统和单元测试确保类型安全和行为正确。

**Tech Stack:** TypeScript 6、Vitest 4

---

## 审查修正

`locked` 是不可逆的领域状态，不是普通展示标签。修正后的规则：

- `SubtitleTimeline.updateState` 必须拒绝 `locked -> live/revisable`。
- `updateSourceText` 和 `updateTranslatedText` 必须拒绝修改 locked 片段。
- `applyRevisionWindow` 每锁定一个片段都必须增加全局 revision。
- `applyRevisionWindow` 返回锁定后的新对象，而不是锁定前快照。
- 测试必须同时断言 stored state、返回 state、revision 增量和不可逆性。

---

## 文件结构

```text
packages/domain/
  package.json
  tsconfig.json
  src/
    index.ts                    # 公开入口
    subtitle/
      segment.ts                # SubtitleSegment 接口和类型
      segment.test.ts           # SubtitleSegment 测试
      timeline.ts               # SubtitleTimeline 类
      timeline.test.ts          # SubtitleTimeline 测试
      revision-window.ts        # 修订窗口逻辑
      revision-window.test.ts   # 修订窗口测试
```

## 依赖关系

```text
packages/domain (纯领域逻辑，无外部依赖)
    ↑
packages/application (用例编排，后续 PR)
    ↑
apps/desktop (Electron 应用，后续 PR)
```

---

## Task 1: 创建 packages/domain 包基础结构

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/src/index.ts`

- [ ] **Step 1: 创建 domain 包的 package.json**

```json
{
  "name": "@simulcast/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "typescript": "6.0.3",
    "vitest": "4.1.8"
  }
}
```

- [ ] **Step 2: 创建 domain 包的 TypeScript 配置**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: 创建占位 index.ts**

```typescript
// packages/domain/src/index.ts
// 占位文件 - 将在后续 Task 中填充导出

export {};
```

- [ ] **Step 4: 安装依赖并验证**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm install
pnpm --filter @simulcast/domain typecheck
```

Expected:

```text
Exit code 0
```

- [ ] **Step 5: 提交基础结构**

```bash
git add packages/domain/package.json packages/domain/tsconfig.json packages/domain/src/index.ts pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore: 创建字幕领域模型包"
```

---

## Task 2: 定义 SubtitleSegment 接口（失败的测试）

**Files:**
- Create: `packages/domain/src/subtitle/segment.ts`
- Create: `packages/domain/src/subtitle/segment.test.ts`

- [ ] **Step 1: 创建 subtitle 目录**

```bash
mkdir -p packages/domain/src/subtitle
```

- [ ] **Step 2: 定义 SubtitleSegment 接口**

```typescript
// packages/domain/src/subtitle/segment.ts

/**
 * 字幕片段状态
 */
export type SegmentState = "live" | "revisable" | "locked";

/**
 * 字幕片段接口
 */
export interface SubtitleSegment {
  readonly id: string;
  readonly sequence: number;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly state: SegmentState;
  readonly sourceVersion: number;
  readonly translationVersion: number;
  readonly updatedAt: number;
  readonly revisionReason?: string;
}

/**
 * 创建新的字幕片段
 */
export function createSegment(
  id: string,
  sequence: number,
  sourceText: string,
  startMs: number,
  endMs: number,
): SubtitleSegment {
  return {
    id,
    sequence,
    sourceText,
    translatedText: "",
    startMs,
    endMs,
    state: "live",
    sourceVersion: 1,
    translationVersion: 0,
    updatedAt: Date.now(),
  };
}

/**
 * 更新字幕片段的原文
 */
export function updateSourceText(
  segment: SubtitleSegment,
  sourceText: string,
): SubtitleSegment {
  return {
    ...segment,
    sourceText,
    sourceVersion: segment.sourceVersion + 1,
    updatedAt: Date.now(),
  };
}

/**
 * 更新字幕片段的译文
 */
export function updateTranslatedText(
  segment: SubtitleSegment,
  translatedText: string,
): SubtitleSegment {
  return {
    ...segment,
    translatedText,
    translationVersion: segment.translationVersion + 1,
    updatedAt: Date.now(),
  };
}

/**
 * 更新字幕片段状态
 */
export function updateState(
  segment: SubtitleSegment,
  state: SegmentState,
): SubtitleSegment {
  return {
    ...segment,
    state,
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 3: 编写 SubtitleSegment 测试**

```typescript
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
```

- [ ] **Step 4: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
FAIL  src/subtitle/segment.test.ts
Error: Cannot find module './segment'
```

- [ ] **Step 5: 提交失败测试**

```bash
git add packages/domain/src/subtitle/segment.ts packages/domain/src/subtitle/segment.test.ts
git commit -m "test: 定义字幕片段接口与操作"
```

---

## Task 3: 实现 SubtitleSegment

**Files:**
- Modify: `packages/domain/src/subtitle/segment.ts`（已在 Task 2 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/domain/src/subtitle/segment.ts
git commit -m "feat: 实现字幕片段接口与操作"
```

---

## Task 4: 实现修订窗口逻辑（失败的测试）

**Files:**
- Create: `packages/domain/src/subtitle/revision-window.ts`
- Create: `packages/domain/src/subtitle/revision-window.test.ts`

- [ ] **Step 1: 定义修订窗口常量和函数**

```typescript
// packages/domain/src/subtitle/revision-window.ts

import type { SubtitleSegment } from "./segment";

/**
 * 修订窗口配置
 */
export interface RevisionWindowConfig {
  /**
   * 最近可修订的句子数量
   */
  readonly maxSentences: number;

  /**
   * 最近可修订的时间窗口（毫秒）
   */
  readonly maxTimeMs: number;
}

/**
 * 默认修订窗口配置
 */
export const DEFAULT_REVISION_WINDOW: RevisionWindowConfig = {
  maxSentences: 5,
  maxTimeMs: 20_000, // 20 秒
};

/**
 * 判断字幕片段是否应该被锁定
 * 规则：超出任一修订边界后锁定
 * - 不再属于最近 N 个可修订句子；或
 * - 距离该段结束时间超过 T 毫秒
 */
export function shouldLockSegment(
  segment: SubtitleSegment,
  allSegments: readonly SubtitleSegment[],
  config: RevisionWindowConfig = DEFAULT_REVISION_WINDOW,
  currentTimeMs: number = Date.now(),
): boolean {
  // 已经锁定的片段不需要再次判断
  if (segment.state === "locked") {
    return false;
  }

  // 按 sequence 排序，获取最新的 N 个片段
  const sortedSegments = [...allSegments].sort((a, b) => a.sequence - b.sequence);
  const recentSegments = sortedSegments.slice(-config.maxSentences);
  const isRecentSentence = recentSegments.some((s) => s.id === segment.id);

  // 如果不在最近 N 个句子中，应该锁定
  if (!isRecentSentence) {
    return true;
  }

  // 如果距离结束时间超过 T 毫秒，应该锁定
  const timeSinceEnd = currentTimeMs - segment.endMs;
  if (timeSinceEnd > config.maxTimeMs) {
    return true;
  }

  return false;
}

/**
 * 计算哪些片段应该被锁定
 */
export function calculateSegmentsToLock(
  segments: readonly SubtitleSegment[],
  config: RevisionWindowConfig = DEFAULT_REVISION_WINDOW,
  currentTimeMs: number = Date.now(),
): readonly SubtitleSegment[] {
  return segments.filter((segment) =>
    shouldLockSegment(segment, segments, config, currentTimeMs)
  );
}
```

- [ ] **Step 2: 编写修订窗口测试**

```typescript
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
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
FAIL  src/subtitle/revision-window.test.ts
Error: Cannot find module './revision-window'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add packages/domain/src/subtitle/revision-window.ts packages/domain/src/subtitle/revision-window.test.ts
git commit -m "test: 定义修订窗口逻辑"
```

---

## Task 5: 实现修订窗口逻辑

**Files:**
- Modify: `packages/domain/src/subtitle/revision-window.ts`（已在 Task 4 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
Test Files  2 passed (2)
Tests       10 passed (10)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/domain/src/subtitle/revision-window.ts
git commit -m "feat: 实现修订窗口逻辑"
```

---

## Task 6: 实现 SubtitleTimeline 类（失败的测试）

**Files:**
- Create: `packages/domain/src/subtitle/timeline.ts`
- Create: `packages/domain/src/subtitle/timeline.test.ts`

- [ ] **Step 1: 定义 SubtitleTimeline 类**

```typescript
// packages/domain/src/subtitle/timeline.ts

import type { SubtitleSegment, SegmentState } from "./segment";
import { createSegment, updateState } from "./segment";
import {
  shouldLockSegment,
  calculateSegmentsToLock,
  DEFAULT_REVISION_WINDOW,
  type RevisionWindowConfig,
} from "./revision-window";

/**
 * 字幕时间线类
 * 管理字幕片段的集合和生命周期
 */
export class SubtitleTimeline {
  private segments: Map<string, SubtitleSegment> = new Map();
  private sequenceCounter: number = 0;
  private revisionCounter: number = 0;
  private config: RevisionWindowConfig;

  constructor(config: RevisionWindowConfig = DEFAULT_REVISION_WINDOW) {
    this.config = config;
  }

  /**
   * 获取所有片段（按 sequence 排序）
   */
  getSegments(): readonly SubtitleSegment[] {
    return Array.from(this.segments.values()).sort(
      (a, b) => a.sequence - b.sequence
    );
  }

  /**
   * 获取指定 ID 的片段
   */
  getSegment(id: string): SubtitleSegment | undefined {
    return this.segments.get(id);
  }

  /**
   * 添加新的字幕片段
   */
  addSegment(
    id: string,
    sourceText: string,
    startMs: number,
    endMs: number,
  ): SubtitleSegment {
    this.sequenceCounter++;
    const segment = createSegment(id, this.sequenceCounter, sourceText, startMs, endMs);
    this.segments.set(id, segment);
    this.revisionCounter++;
    return segment;
  }

  /**
   * 更新片段原文
   */
  updateSourceText(id: string, sourceText: string): SubtitleSegment | undefined {
    const segment = this.segments.get(id);
    if (!segment || segment.state === "locked") {
      return undefined;
    }

    const updated = {
      ...segment,
      sourceText,
      sourceVersion: segment.sourceVersion + 1,
      updatedAt: Date.now(),
    };
    this.segments.set(id, updated);
    this.revisionCounter++;
    return updated;
  }

  /**
   * 更新片段译文
   */
  updateTranslatedText(id: string, translatedText: string): SubtitleSegment | undefined {
    const segment = this.segments.get(id);
    if (!segment || segment.state === "locked") {
      return undefined;
    }

    const updated = {
      ...segment,
      translatedText,
      translationVersion: segment.translationVersion + 1,
      updatedAt: Date.now(),
    };
    this.segments.set(id, updated);
    this.revisionCounter++;
    return updated;
  }

  /**
   * 更新片段状态
   */
  updateState(id: string, state: SegmentState): SubtitleSegment | undefined {
    const segment = this.segments.get(id);
    if (!segment || (segment.state === "locked" && state !== "locked")) {
      return undefined;
    }

    const updated = updateState(segment, state);
    this.segments.set(id, updated);
    this.revisionCounter++;
    return updated;
  }

  /**
   * 应用修订窗口规则，锁定应该锁定的片段
   */
  applyRevisionWindow(currentTimeMs: number = Date.now()): readonly SubtitleSegment[] {
    const segments = this.getSegments();
    const toLock = calculateSegmentsToLock(segments, this.config, currentTimeMs);
    const locked: SubtitleSegment[] = [];

    for (const segment of toLock) {
      const updated = this.updateState(segment.id, "locked");
      if (updated) {
        locked.push(updated);
      }
    }

    return locked;
  }

  /**
   * 获取当前修订版本号
   */
  getRevision(): number {
    return this.revisionCounter;
  }

  /**
   * 获取片段数量
   */
  getSize(): number {
    return this.segments.size;
  }

  /**
   * 清空时间线
   */
  clear(): void {
    this.segments.clear();
    this.sequenceCounter = 0;
    this.revisionCounter = 0;
  }
}
```

- [ ] **Step 2: 编写 SubtitleTimeline 测试**

```typescript
// packages/domain/src/subtitle/timeline.test.ts

import { describe, it, expect } from "vitest";
import { SubtitleTimeline } from "./timeline";

describe("SubtitleTimeline", () => {
  describe("addSegment", () => {
    it("adds a new segment", () => {
      const timeline = new SubtitleTimeline();
      const segment = timeline.addSegment("seg-001", "Hello", 0, 1000);

      expect(segment.id).toBe("seg-001");
      expect(segment.sequence).toBe(1);
      expect(timeline.getSize()).toBe(1);
    });

    it("increments sequence counter", () => {
      const timeline = new SubtitleTimeline();
      timeline.addSegment("seg-001", "Hello", 0, 1000);
      const segment2 = timeline.addSegment("seg-002", "World", 1000, 2000);

      expect(segment2.sequence).toBe(2);
    });
  });

  describe("getSegments", () => {
    it("returns segments sorted by sequence", () => {
      const timeline = new SubtitleTimeline();
      timeline.addSegment("seg-002", "World", 1000, 2000);
      timeline.addSegment("seg-001", "Hello", 0, 1000);

      const segments = timeline.getSegments();
      expect(segments[0].id).toBe("seg-001");
      expect(segments[1].id).toBe("seg-002");
    });
  });

  describe("updateSourceText", () => {
    it("updates source text", () => {
      const timeline = new SubtitleTimeline();
      timeline.addSegment("seg-001", "Hello", 0, 1000);
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
      timeline.addSegment("seg-001", "Hello", 0, 1000);
      const updated = timeline.updateTranslatedText("seg-001", "你好");

      expect(updated?.translatedText).toBe("你好");
      expect(updated?.translationVersion).toBe(1);
    });
  });

  describe("applyRevisionWindow", () => {
    it("locks segments beyond max sentences", () => {
      const timeline = new SubtitleTimeline({ maxSentences: 3, maxTimeMs: 20_000 });

      for (let i = 0; i < 5; i++) {
        timeline.addSegment(`seg-${i}`, `Text ${i}`, i * 1000, (i + 1) * 1000);
      }

      const locked = timeline.applyRevisionWindow();
      expect(locked.length).toBe(2); // seg-0 和 seg-1 应该被锁定
    });

    it("does not lock segments within window", () => {
      const timeline = new SubtitleTimeline({ maxSentences: 5, maxTimeMs: 20_000 });

      for (let i = 0; i < 3; i++) {
        timeline.addSegment(`seg-${i}`, `Text ${i}`, i * 1000, (i + 1) * 1000);
      }

      const locked = timeline.applyRevisionWindow(Date.now() + 5_000);
      expect(locked.length).toBe(0);
    });
  });

  describe("getRevision", () => {
    it("increments revision on modifications", () => {
      const timeline = new SubtitleTimeline();

      expect(timeline.getRevision()).toBe(0);

      timeline.addSegment("seg-001", "Hello", 0, 1000);
      expect(timeline.getRevision()).toBe(1);

      timeline.updateSourceText("seg-001", "Hello World");
      expect(timeline.getRevision()).toBe(2);
    });
  });

  describe("clear", () => {
    it("clears all segments", () => {
      const timeline = new SubtitleTimeline();
      timeline.addSegment("seg-001", "Hello", 0, 1000);
      timeline.addSegment("seg-002", "World", 1000, 2000);

      timeline.clear();

      expect(timeline.getSize()).toBe(0);
      expect(timeline.getRevision()).toBe(0);
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
FAIL  src/subtitle/timeline.test.ts
Error: Cannot find module './timeline'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add packages/domain/src/subtitle/timeline.ts packages/domain/src/subtitle/timeline.test.ts
git commit -m "test: 定义字幕时间线类"
```

---

## Task 7: 实现 SubtitleTimeline 类

**Files:**
- Modify: `packages/domain/src/subtitle/timeline.ts`（已在 Task 6 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/domain test:run
```

Expected:

```text
Test Files  3 passed (3)
Tests       18 passed (18)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/domain/src/subtitle/timeline.ts
git commit -m "feat: 实现字幕时间线类"
```

---

## Task 8: 创建 domain 包公开入口

**Files:**
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: 更新 index.ts 导出所有类型和类**

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
git commit -m "feat: 创建 domain 包公开入口"
```

---

## Task 9: 更新根 package.json 脚本

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 domain 包到脚本**

当前根 package.json 的 scripts 应该已经使用 `pnpm -r`，无需修改。

- [ ] **Step 2: 验证脚本可用**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm test:run
pnpm typecheck
```

Expected:

```text
All commands exit with code 0
```

---

## Task 10: PR 合并前检查

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
pnpm test:run
pnpm typecheck
```

Expected:

```text
测试和类型检查全部通过
```

- [ ] **Step 3: 准备 PR**

PR 标题：

```text
feat: 新增字幕时间线领域模型
```

PR 描述：

```markdown
## 功能描述

实现字幕时间线领域模型，包括 SubtitleSegment、SubtitleTimeline 和修订窗口，维护 live、revisable、locked 生命周期。

## 实现思路

- 创建 `packages/domain` 包，纯领域逻辑，无外部依赖
- 实现 `SubtitleSegment` 接口和操作函数
- 实现 `SubtitleTimeline` 类管理字幕集合
- 实现修订窗口逻辑，自动锁定超出边界的字幕
- 使用单元测试确保行为正确

## 测试方式

1. 执行 `pnpm install`
2. 执行 `pnpm test:run`，确认所有测试通过（18 个测试）
3. 执行 `pnpm typecheck`

## 验证结果

- ✅ 18/18 测试通过
- ✅ 类型检查通过
- ✅ 工作树干净
```

---

## PR 03 完成定义

- `packages/domain` 包可独立编译和测试。
- `SubtitleSegment` 接口定义完整，包含所有必需字段。
- `SubtitleTimeline` 类可以管理字幕集合和生命周期。
- 修订窗口逻辑正确：超过 5 句或 20 秒的片段被锁定。
- 锁定片段不能恢复为可修订状态。
- `pnpm test:run`、`pnpm typecheck` 全部通过。
- 所有提交信息均使用英文类型前缀和中文描述。
- PR 只交付字幕时间线领域模型，不包含音频、ASR、MiMo 或 UI 逻辑。

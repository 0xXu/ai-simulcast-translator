# PR 02：类型安全 IPC 契约实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `packages/contracts` 定义类型安全的 IPC 命令、事件和协议版本，通过 preload 白名单暴露调用，使控制窗可以查询应用状态。

**Architecture:** 创建独立的 `packages/contracts` 包定义 IPC 协议类型和运行时 Schema。preload 层通过白名单模式暴露类型安全的 API，主进程实现命令处理器。使用 Vitest 进行单元测试，确保协议版本校验和类型安全。

**Tech Stack:** TypeScript 6、Vitest 4、Electron 42、Zod（Schema 校验）

---

## 审查修正

原计划中的 preload 示例调用 `ipcRenderer.invoke("app.status")` 时没有发送
`IpcMessage`，但主进程处理器会校验该消息，导致真实调用必然失败。修正后的
契约要求：

- preload 为每次命令构造 `{ protocolVersion, timestamp }`。
- 主进程继续在边界使用 Zod 校验请求。
- 测试必须模拟 `ipcRenderer.invoke`，断言 channel 和 request，而不只检查
  TypeScript 接口。
- PR 完成条件仍然是 `window.api.getAppStatus()` 可以真实返回应用状态。

---

## 文件结构

```text
packages/
  contracts/
    package.json
    tsconfig.json
    src/
      index.ts              # 公开入口
      ipc.ts                # IPC 命令和事件类型定义
      schemas.ts            # Zod Schema 运行时校验
      ipc.test.ts           # 协议版本和类型测试
apps/desktop/
  src/
    preload/
      index.ts              # 修改：暴露类型安全 API
      api.ts                # 新增：白名单 API 定义
      types.d.ts            # 修改：更新全局类型声明
    main/
      ipc/
        register-handlers.ts  # 新增：注册 IPC 命令处理器
        app-status.ts         # 新增：app.status 命令实现
      index.ts              # 修改：初始化 IPC 处理器
```

## 依赖关系

```text
packages/contracts
    ↓
apps/desktop/preload (导入类型)
    ↓
apps/desktop/main (导入类型和 Schema)
```

---

## Task 1: 创建 packages/contracts 包基础结构

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: 创建 contracts 包的 package.json**

```json
{
  "name": "@simulcast/contracts",
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
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "6.0.3",
    "vitest": "4.1.8"
  }
}
```

- [ ] **Step 2: 创建 contracts 包的 TypeScript 配置**

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

- [ ] **Step 3: 更新 pnpm-workspace.yaml（如已包含 packages/* 则跳过）**

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 4: 验证包可被 pnpm 识别**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm list --depth -1
```

Expected:

```text
@simulcast/contracts
@simulcast/desktop
```

- [ ] **Step 5: 提交基础结构**

```bash
git add packages/contracts/package.json packages/contracts/tsconfig.json
git commit -m "chore: 创建类型安全 IPC 契约包"
```

---

## Task 2: 定义 IPC 协议类型（失败的测试）

**Files:**
- Create: `packages/contracts/src/ipc.ts`
- Create: `packages/contracts/src/ipc.test.ts`

- [ ] **Step 1: 定义 IPC 命令和事件类型**

```typescript
// packages/contracts/src/ipc.ts

/**
 * 协议版本号
 */
export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/**
 * 基础消息结构
 */
export interface IpcMessage {
  readonly protocolVersion: ProtocolVersion;
  readonly timestamp: number;
}

/**
 * 应用状态查询响应
 */
export interface AppStatus {
  readonly isRunning: boolean;
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly uptime: number;
}

/**
 * 前端到后端的命令
 */
export interface FrontendToBackendCommands {
  readonly "app.status": {
    readonly request: IpcMessage;
    readonly response: AppStatus;
  };
}

/**
 * 后端到前端的事件
 */
export interface BackendToFrontendEvents {
  readonly "app.ready": {
    readonly timestamp: number;
  };
}

/**
 * 命令名称类型
 */
export type CommandName = keyof FrontendToBackendCommands;

/**
 * 事件名称类型
 */
export type EventName = keyof BackendToFrontendEvents;
```

- [ ] **Step 2: 编写协议版本校验测试**

```typescript
// packages/contracts/src/ipc.test.ts

import { describe, it, expect } from "vitest";
import { PROTOCOL_VERSION } from "./ipc";

describe("IPC Protocol", () => {
  it("exports protocol version as a constant", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(typeof PROTOCOL_VERSION).toBe("number");
  });

  it("protocol version is immutable", () => {
    expect(() => {
      // @ts-expect-error: Testing immutability
      (PROTOCOL_VERSION as any) = 2;
    }).toThrow();
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/contracts test:run
```

Expected:

```text
FAIL  src/ipc.test.ts
Error: Cannot find module './ipc'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add packages/contracts/src/ipc.ts packages/contracts/src/ipc.test.ts
git commit -m "test: 定义 IPC 协议版本类型"
```

---

## Task 3: 实现 IPC 协议类型

**Files:**
- Modify: `packages/contracts/src/ipc.ts`（已在 Task 2 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/contracts test:run
```

Expected:

```text
Test Files  1 passed (1)
Tests       2 passed (2)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/contracts/src/ipc.ts
git commit -m "feat: 实现 IPC 协议类型定义"
```

---

## Task 4: 定义 Zod Schema 运行时校验（失败的测试）

**Files:**
- Create: `packages/contracts/src/schemas.ts`
- Create: `packages/contracts/src/schemas.test.ts`

- [ ] **Step 1: 定义 Zod Schema**

```typescript
// packages/contracts/src/schemas.ts

import { z } from "zod";
import { PROTOCOL_VERSION } from "./ipc";
import type { AppStatus, IpcMessage } from "./ipc";

/**
 * 协议版本 Schema
 */
export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);

/**
 * IPC 消息基础 Schema
 */
export const IpcMessageSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  timestamp: z.number().int().positive(),
});

/**
 * AppStatus Schema
 */
export const AppStatusSchema = z.object({
  isRunning: z.boolean(),
  version: z.string(),
  platform: z.enum([
    "aix",
    "darwin",
    "freebsd",
    "linux",
    "openbsd",
    "sunos",
    "win32",
  ]),
  uptime: z.number().nonnegative(),
});

/**
 * 验证 IPC 消息
 */
export function validateIpcMessage(data: unknown): IpcMessage {
  return IpcMessageSchema.parse(data);
}

/**
 * 安全验证 IPC 消息（返回结果对象）
 */
export function safeValidateIpcMessage(data: unknown): {
  success: true;
  data: IpcMessage;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = IpcMessageSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}
```

- [ ] **Step 2: 编写 Schema 验证测试**

```typescript
// packages/contracts/src/schemas.test.ts

import { describe, it, expect } from "vitest";
import {
  IpcMessageSchema,
  AppStatusSchema,
  validateIpcMessage,
  safeValidateIpcMessage,
} from "./schemas";
import { PROTOCOL_VERSION } from "./ipc";

describe("IPC Schemas", () => {
  describe("IpcMessageSchema", () => {
    it("validates a correct IPC message", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
      };

      expect(IpcMessageSchema.parse(message)).toEqual(message);
    });

    it("rejects invalid protocol version", () => {
      const message = {
        protocolVersion: 999,
        timestamp: Date.now(),
      };

      expect(() => IpcMessageSchema.parse(message)).toThrow();
    });

    it("rejects negative timestamp", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: -1,
      };

      expect(() => IpcMessageSchema.parse(message)).toThrow();
    });
  });

  describe("AppStatusSchema", () => {
    it("validates correct app status", () => {
      const status = {
        isRunning: true,
        version: "0.1.0",
        platform: "darwin",
        uptime: 12345,
      };

      expect(AppStatusSchema.parse(status)).toEqual(status);
    });

    it("rejects invalid platform", () => {
      const status = {
        isRunning: true,
        version: "0.1.0",
        platform: "invalid",
        uptime: 12345,
      };

      expect(() => AppStatusSchema.parse(status)).toThrow();
    });
  });

  describe("validateIpcMessage", () => {
    it("returns parsed data for valid message", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
      };

      expect(validateIpcMessage(message)).toEqual(message);
    });

    it("throws for invalid message", () => {
      expect(() => validateIpcMessage({})).toThrow();
    });
  });

  describe("safeValidateIpcMessage", () => {
    it("returns success result for valid message", () => {
      const message = {
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
      };

      const result = safeValidateIpcMessage(message);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(message);
      }
    });

    it("returns error result for invalid message", () => {
      const result = safeValidateIpcMessage({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/contracts test:run
```

Expected:

```text
FAIL  src/schemas.test.ts
Error: Cannot find module './schemas'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add packages/contracts/src/schemas.ts packages/contracts/src/schemas.test.ts
git commit -m "test: 定义 Zod Schema 运行时校验"
```

---

## Task 5: 实现 Zod Schema

**Files:**
- Modify: `packages/contracts/src/schemas.ts`（已在 Task 4 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/contracts test:run
```

Expected:

```text
Test Files  2 passed (2)
Tests       10 passed (10)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/contracts/src/schemas.ts
git commit -m "feat: 实现 Zod Schema 运行时校验"
```

---

## Task 6: 创建 contracts 包公开入口

**Files:**
- Create: `packages/contracts/src/index.ts`

- [ ] **Step 1: 创建公开入口文件**

```typescript
// packages/contracts/src/index.ts

export {
  PROTOCOL_VERSION,
  type ProtocolVersion,
  type IpcMessage,
  type AppStatus,
  type FrontendToBackendCommands,
  type BackendToFrontendEvents,
  type CommandName,
  type EventName,
} from "./ipc";

export {
  ProtocolVersionSchema,
  IpcMessageSchema,
  AppStatusSchema,
  validateIpcMessage,
  safeValidateIpcMessage,
} from "./schemas";
```

- [ ] **Step 2: 验证类型导出**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/contracts typecheck
```

Expected:

```text
Exit code 0
```

- [ ] **Step 3: 提交入口文件**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat: 创建 contracts 包公开入口"
```

---

## Task 7: 更新 desktop 包依赖 contracts

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: 添加 contracts 依赖**

```json
{
  "dependencies": {
    "@simulcast/contracts": "workspace:*",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm install
```

Expected:

```text
Lockfile is up to date
Done in Xms
```

- [ ] **Step 3: 提交依赖更新**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore: 添加 contracts 包依赖"
```

---

## Task 8: 创建 preload 白名单 API（失败的测试）

**Files:**
- Create: `apps/desktop/src/preload/api.ts`
- Create: `apps/desktop/src/preload/api.test.ts`

- [ ] **Step 1: 定义白名单 API**

```typescript
// apps/desktop/src/preload/api.ts

import type {
  AppStatus,
  CommandName,
  FrontendToBackendCommands,
} from "@simulcast/contracts";

/**
 * 白名单 API 类型定义
 * 只暴露安全的、类型化的接口给渲染进程
 */
export interface PreloadApi {
  /**
   * 查询应用状态
   */
  readonly getAppStatus: () => Promise<AppStatus>;

  /**
   * 获取运行时信息
   */
  readonly getRuntimeInfo: () => Readonly<{
    platform: NodeJS.Platform;
    versions: Readonly<{
      chrome: string;
      electron: string;
      node: string;
    }>;
  }>;
}
```

- [ ] **Step 2: 编写 API 类型测试**

```typescript
// apps/desktop/src/preload/api.test.ts

import { describe, it, expectTypeOf } from "vitest";
import type { PreloadApi } from "./api";
import type { AppStatus } from "@simulcast/contracts";

describe("PreloadApi Types", () => {
  it("getAppStatus returns Promise<AppStatus>", () => {
    expectTypeOf<PreloadApi["getAppStatus"]>().returns.toMatchTypeOf<
      Promise<AppStatus>
    >();
  });

  it("getRuntimeInfo returns readonly object", () => {
    const returnType = expectTypeOf<PreloadApi["getRuntimeInfo"]>().returns;
    returnType.toHaveProperty("platform");
    returnType.toHaveProperty("versions");
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
FAIL  src/preload/api.test.ts
Error: Cannot find module './api'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add apps/desktop/src/preload/api.ts apps/desktop/src/preload/api.test.ts
git commit -m "test: 定义 preload 白名单 API 类型"
```

---

## Task 9: 实现 preload 白名单 API

**Files:**
- Modify: `apps/desktop/src/preload/api.ts`（已在 Task 8 创建）
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: 实现 preload API 桥接**

```typescript
// apps/desktop/src/preload/index.ts

import { contextBridge, ipcRenderer } from "electron";
import type { PreloadApi } from "./api";
import type { AppStatus } from "@simulcast/contracts";

const runtimeInfo = Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
});

const api: PreloadApi = {
  async getAppStatus(): Promise<AppStatus> {
    return ipcRenderer.invoke("app.status", {
      protocolVersion: PROTOCOL_VERSION,
      timestamp: Date.now(),
    });
  },

  getRuntimeInfo() {
    return runtimeInfo;
  },
};

contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("runtimeInfo", runtimeInfo);
```

- [ ] **Step 2: 更新全局类型声明**

```typescript
// apps/desktop/src/preload/types.d.ts

export {};

import type { PreloadApi } from "./api";

declare global {
  interface Window {
    readonly api: PreloadApi;
    readonly runtimeInfo: Readonly<{
      platform: NodeJS.Platform;
      versions: Readonly<{
        chrome: string;
        electron: string;
        node: string;
      }>;
    }>;
  }
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
Test Files  5 passed (5)
Tests       35 passed (35)
```

- [ ] **Step 4: 提交实现**

```bash
git add apps/desktop/src/preload/index.ts apps/desktop/src/preload/api.ts apps/desktop/src/preload/types.d.ts
git commit -m "feat: 实现 preload 白名单 API"
```

---

## Task 10: 实现主进程 IPC 处理器（失败的测试）

**Files:**
- Create: `apps/desktop/src/main/ipc/app-status.ts`
- Create: `apps/desktop/src/main/ipc/app-status.test.ts`
- Create: `apps/desktop/src/main/ipc/register-handlers.ts`

- [ ] **Step 1: 实现 app.status 命令处理器**

```typescript
// apps/desktop/src/main/ipc/app-status.ts

import { app } from "electron";
import type { AppStatus } from "@simulcast/contracts";

/**
 * 获取应用状态
 */
export function getAppStatus(): AppStatus {
  return {
    isRunning: true,
    version: app.getVersion(),
    platform: process.platform,
    uptime: process.uptime(),
  };
}
```

- [ ] **Step 2: 编写 app.status 测试**

```typescript
// apps/desktop/src/main/ipc/app-status.test.ts

import { describe, it, expect, vi } from "vitest";
import { getAppStatus } from "./app-status";

// Mock electron app
vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.1.0",
  },
}));

describe("getAppStatus", () => {
  it("returns valid app status", () => {
    const status = getAppStatus();

    expect(status.isRunning).toBe(true);
    expect(status.version).toBe("0.1.0");
    expect(status.platform).toBe(process.platform);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns serializable data", () => {
    const status = getAppStatus();
    const serialized = JSON.stringify(status);
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual(status);
  });
});
```

- [ ] **Step 3: 实现 IPC 处理器注册**

```typescript
// apps/desktop/src/main/ipc/register-handlers.ts

import { ipcMain } from "electron";
import { getAppStatus } from "./app-status";
import { validateIpcMessage } from "@simulcast/contracts";

/**
 * 注册所有 IPC 命令处理器
 */
export function registerIpcHandlers(): void {
  ipcMain.handle("app.status", (_event, request) => {
    // 验证请求格式
    validateIpcMessage(request);

    return getAppStatus();
  });
}
```

- [ ] **Step 4: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
FAIL  src/main/ipc/app-status.test.ts
Error: Cannot find module './app-status'
```

- [ ] **Step 5: 提交失败测试**

```bash
git add apps/desktop/src/main/ipc/app-status.ts apps/desktop/src/main/ipc/app-status.test.ts apps/desktop/src/main/ipc/register-handlers.ts
git commit -m "test: 定义主进程 IPC 处理器"
```

---

## Task 11: 实现主进程 IPC 处理器

**Files:**
- Modify: `apps/desktop/src/main/ipc/app-status.ts`（已在 Task 10 创建）
- Modify: `apps/desktop/src/main/ipc/register-handlers.ts`（已在 Task 10 创建）
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: 在主进程初始化时注册 IPC 处理器**

```typescript
// apps/desktop/src/main/index.ts (添加到文件顶部导入)

import { registerIpcHandlers } from "./ipc/register-handlers";
```

```typescript
// apps/desktop/src/main/index.ts (在 app.whenReady() 回调中添加)

void app
  .whenReady()
  .then(() => {
    registerIpcHandlers();  // <-- 添加这行
    createApplicationWindows();

    app.on("activate", () => {
      createApplicationWindows();
      controlWindow?.show();
      controlWindow?.focus();
    });
  })
  .catch((error: unknown) => {
    handleStartupFailure("应用启动失败", error);
  });
```

- [ ] **Step 2: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
Test Files  6 passed (6)
Tests       37 passed (37)
```

- [ ] **Step 3: 提交实现**

```bash
git add apps/desktop/src/main/ipc apps/desktop/src/main/index.ts
git commit -m "feat: 实现主进程 IPC 处理器"
```

---

## Task 12: 类型检查和构建验证

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: 运行类型检查**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm typecheck
```

Expected:

```text
Exit code 0
```

- [ ] **Step 2: 运行生产构建**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm build
```

Expected:

```text
out/main/index.js
out/preload/index.js
out/renderer/index.html
```

- [ ] **Step 3: 运行所有测试**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm test:run
```

Expected:

```text
Test Files  6 passed (6)
Tests       37 passed (37)
```

---

## Task 13: 更新根 package.json 脚本

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 contracts 包脚本**

```json
{
  "scripts": {
    "dev": "pnpm --filter @simulcast/desktop dev",
    "build": "pnpm --filter @simulcast/desktop build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:run": "pnpm -r test:run"
  }
}
```

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

- [ ] **Step 3: 提交脚本更新**

```bash
git add package.json
git commit -m "chore: 更新根 package.json 脚本以支持多包"
```

---

## Task 14: PR 合并前检查

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
pnpm build
```

Expected:

```text
测试、类型检查和构建全部通过
```

- [ ] **Step 3: 检查安全边界**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
grep -r "nodeIntegration: true" apps/desktop/src || echo "未发现安全问题"
grep -r "contextIsolation: false" apps/desktop/src || echo "未发现安全问题"
```

Expected:

```text
未发现安全问题
未发现安全问题
```

- [ ] **Step 4: 准备 PR**

PR 标题：

```text
feat: 新增类型安全 IPC 契约与应用状态查询
```

PR 描述：

```markdown
## 功能描述

创建类型安全的 IPC 通信契约，定义命令、事件和协议版本。
通过 preload 白名单模式暴露安全的 API，使控制窗可以查询应用状态。

## 实现思路

- 创建 `packages/contracts` 包定义 IPC 协议类型和 Zod Schema
- preload 层通过白名单暴露类型安全的 `getAppStatus` API
- 主进程实现 `app.status` 命令处理器
- 所有跨进程消息必须携带协议版本号
- 运行时使用 Zod 校验输入数据

## 测试方式

1. 执行 `pnpm install`
2. 执行 `pnpm test:run`，确认所有测试通过
3. 执行 `pnpm typecheck` 和 `pnpm build`
4. 启动应用后，控制窗应能通过 `window.api.getAppStatus()` 查询状态

## 风险与限制

- 当前只实现 `app.status` 命令，后续 PR 将添加更多命令
- IPC 处理器未捕获异常，后续 PR 将添加错误处理
```

---

## PR 02 完成定义

- `packages/contracts` 包可独立编译和测试。
- `app.status` 命令可通过 preload API 调用并返回有效数据。
- 非法协议版本在运行时被 Zod 拒绝。
- Renderer 无法访问任意 `ipcRenderer`（只能通过白名单 API）。
- `pnpm test:run`、`pnpm typecheck`、`pnpm build` 全部通过。
- 所有提交信息均使用英文类型前缀和中文描述。
- PR 只交付类型安全 IPC 契约，不包含音频、ASR、MiMo 或字幕业务逻辑。

# PR 08 Desktop-to-ASR Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect 400 ms PCM chunks from the Electron Renderer to a real faster-whisper Worker managed by Electron Main, then return session-scoped English transcript and recoverable error events to the UI.

**Architecture:** The Renderer owns system-audio capture but can only cross the process boundary through a narrow preload API. Preload converts `Int16Array` PCM to base64 and sends versioned messages; Main validates them, owns one active ASR session, starts `WhisperWorkerAdapter` with explicit `--engine faster-whisper` arguments, and broadcasts typed ASR events to both windows. PR 08 displays the latest raw overlapping Whisper result; deduplication, stable segmentation, and `segmentId` generation remain PR 09 work.

**Tech Stack:** Electron 42 IPC/contextBridge, React 19, TypeScript 6, Zod, Vitest, Node child processes, Python 3.12, faster-whisper

---

## Scope

Included:

- One active ASR session at a time.
- Versioned start, PCM, and stop messages.
- A preload whitelist that never exposes `ipcRenderer`, `Buffer`, or arbitrary channels.
- Explicit real Worker launch arguments: `--engine faster-whisper`.
- Monotonically increasing audio sequence numbers within a session.
- Session-filtered transcript, status, and error events.
- Raw English transcript display in the control and overlay windows.
- Recoverable UI errors when the Worker is unavailable, exits, or rejects audio.

Excluded:

- Overlapping-window deduplication and stable transcript segmentation.
- Subtitle timeline writes and stable `segmentId` generation.
- MiMo translation, semantic rewind, and revision highlighting.
- Shipping Python, uv, or model files inside an installer.
- Downloading a model in CI.

## File Structure

### Create

- `packages/contracts/src/asr.ts`
  - Shared ASR request, event, state, and result types.
- `packages/contracts/src/asr-schemas.ts`
  - Runtime validation for all Renderer-to-Main ASR messages.
- `packages/contracts/src/asr.test.ts`
  - Type and schema boundary tests.
- `apps/desktop/src/main/asr/asr-session-controller.ts`
  - Owns the active session, sequence counter, Worker lifecycle, and event filtering.
- `apps/desktop/src/main/asr/asr-session-controller.test.ts`
  - Controller behavior with a fake Worker adapter.
- `apps/desktop/src/main/asr/register-asr-handlers.ts`
  - Registers fixed Electron IPC channels and publishes ASR events.
- `apps/desktop/src/main/asr/register-asr-handlers.test.ts`
  - Validates channels, payload rejection, and event forwarding.
- `apps/desktop/src/main/asr/resolve-worker-cwd.ts`
  - Resolves the ASR project directory in development and packaged layouts.
- `apps/desktop/src/main/asr/resolve-worker-cwd.test.ts`
  - Covers development, packaged, and environment override paths.
- `apps/desktop/src/renderer/features/asr/asr-session-client.ts`
  - Renderer-side session facade over `window.api`.
- `apps/desktop/src/renderer/features/asr/asr-session-client.test.ts`
  - Covers start, chunk forwarding, stop, and event cleanup.

### Modify

- `packages/contracts/src/index.ts`
  - Export ASR types and validators.
- `packages/infrastructure/src/asr/whisper-worker-adapter.ts`
  - Inject spawn dependencies, accept launch options, reset sequence state, and retain structured Worker messages.
- `packages/infrastructure/src/asr/whisper-worker-adapter.test.ts`
  - Verify explicit engine arguments, monotonic sequences, timeout cleanup, and restart behavior.
- `apps/desktop/package.json`
  - Add the infrastructure workspace dependency.
- `pnpm-lock.yaml`
  - Record the workspace dependency.
- `apps/desktop/electron.vite.config.ts`
  - Bundle both workspace packages into Main.
- `apps/desktop/src/main/index.ts`
  - Construct the adapter/controller, register handlers, broadcast events, and stop the Worker on shutdown.
- `apps/desktop/src/preload/api.ts`
  - Add only typed ASR session methods and an event subscription.
- `apps/desktop/src/preload/api.test.ts`
  - Assert the public ASR API types.
- `apps/desktop/src/preload/index.ts`
  - Convert PCM to base64 and use fixed IPC channels.
- `apps/desktop/src/preload/index.test.ts`
  - Prove whitelist behavior and listener cleanup.
- `apps/desktop/src/renderer/features/audio/audio-capture.ts`
  - Keep PCM metadata and reject malformed worklet messages.
- `apps/desktop/src/renderer/features/audio/audio-capture.test.ts`
  - Verify exactly one 16 kHz mono PCM callback per worklet chunk.
- `apps/desktop/src/renderer/src/app/app.tsx`
  - Coordinate ASR startup with capture and render raw transcript/status.
- `apps/desktop/src/renderer/src/app/app.test.tsx`
  - Cover success, stale-session filtering, stop, Worker failure, and overlay rendering.
- `apps/desktop/src/renderer/src/app/styles.css`
  - Add raw transcript and ASR status styles.
- `README.md`
  - Document PR 08 runtime prerequisites and real-session verification.
- `.env.example`
  - Document ASR Worker directory and faster-whisper launch settings.

## IPC Contract

Use these fixed channels:

```text
asr.session.start   Renderer -> Main invoke
asr.audio           Renderer -> Main send
asr.session.stop    Renderer -> Main invoke
asr.event           Main -> Renderer event
```

Do not add a generic `invoke(channel, payload)` preload method.

The active session owns sequence numbering. Renderer audio chunks do not choose a
sequence; Main assigns `1, 2, 3, ...` immediately before calling the Worker
adapter. Starting a new session resets the sequence to `0`.

### Task 1: Define Typed ASR Contracts and Runtime Schemas

**Files:**
- Create: `packages/contracts/src/asr.ts`
- Create: `packages/contracts/src/asr-schemas.ts`
- Create: `packages/contracts/src/asr.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/contracts/src/asr.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  AsrAudioRequestSchema,
  AsrSessionRequestSchema,
  type AsrEvent,
} from "./index";

describe("ASR contracts", () => {
  it("accepts a valid session request", () => {
    expect(
      AsrSessionRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        timestamp: 100,
        sessionId: "session-1",
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      timestamp: 100,
      sessionId: "session-1",
    });
  });

  it("rejects malformed audio payloads", () => {
    expect(() =>
      AsrAudioRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        timestamp: 100,
        sessionId: "",
        audioData: "not base64!",
        sampleRate: 44_100,
        channels: 2,
      }),
    ).toThrow();
  });

  it("models transcript, status, and error events", () => {
    const events: AsrEvent[] = [
      {
        type: "status",
        sessionId: "session-1",
        state: "ready",
        message: "ASR Worker is ready",
      },
      {
        type: "transcript",
        sessionId: "session-1",
        sequence: 4,
        text: "Hello world",
        confidence: 0.9,
        startMs: 0,
        endMs: 1_200,
        isFinal: false,
      },
      {
        type: "error",
        sessionId: "session-1",
        code: "WORKER_EXITED",
        message: "ASR Worker exited",
        recoverable: true,
      },
    ];

    expect(events).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing exports**

Run:

```bash
pnpm --filter @simulcast/contracts test:run -- src/asr.test.ts
```

Expected: FAIL because `AsrAudioRequestSchema`, `AsrSessionRequestSchema`, and
`AsrEvent` do not exist.

- [ ] **Step 3: Add the ASR types**

Create `packages/contracts/src/asr.ts`:

```typescript
import type { IpcMessage } from "./ipc";

export type AsrSessionState =
  | "idle"
  | "starting"
  | "ready"
  | "error";

export interface AsrSessionRequest extends IpcMessage {
  readonly sessionId: string;
}

export interface AsrAudioRequest extends IpcMessage {
  readonly sessionId: string;
  readonly audioData: string;
  readonly sampleRate: 16000;
  readonly channels: 1;
}

export interface AsrSessionResponse {
  readonly sessionId: string;
  readonly state: AsrSessionState;
}

export interface AsrStatusEvent {
  readonly type: "status";
  readonly sessionId: string;
  readonly state: AsrSessionState;
  readonly message: string | null;
}

export interface AsrTranscriptEvent {
  readonly type: "transcript";
  readonly sessionId: string;
  readonly sequence: number;
  readonly text: string;
  readonly confidence: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly isFinal: boolean;
}

export interface AsrErrorEvent {
  readonly type: "error";
  readonly sessionId: string;
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export type AsrEvent =
  | AsrStatusEvent
  | AsrTranscriptEvent
  | AsrErrorEvent;
```

- [ ] **Step 4: Add strict request schemas**

Create `packages/contracts/src/asr-schemas.ts`:

```typescript
import { z } from "zod";
import { IpcMessageSchema } from "./schemas";
import type { AsrAudioRequest, AsrSessionRequest } from "./asr";

const SessionIdSchema = z.string().trim().min(1).max(128);
const Base64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const AsrSessionRequestSchema = IpcMessageSchema.extend({
  sessionId: SessionIdSchema,
});

export const AsrAudioRequestSchema = IpcMessageSchema.extend({
  sessionId: SessionIdSchema,
  audioData: Base64Schema,
  sampleRate: z.literal(16000),
  channels: z.literal(1),
});

export function validateAsrSessionRequest(data: unknown): AsrSessionRequest {
  return AsrSessionRequestSchema.parse(data);
}

export function validateAsrAudioRequest(data: unknown): AsrAudioRequest {
  return AsrAudioRequestSchema.parse(data);
}
```

- [ ] **Step 5: Export the contract**

Append to `packages/contracts/src/index.ts`:

```typescript
export {
  type AsrSessionState,
  type AsrSessionRequest,
  type AsrAudioRequest,
  type AsrSessionResponse,
  type AsrStatusEvent,
  type AsrTranscriptEvent,
  type AsrErrorEvent,
  type AsrEvent,
} from "./asr";

export {
  AsrSessionRequestSchema,
  AsrAudioRequestSchema,
  validateAsrSessionRequest,
  validateAsrAudioRequest,
} from "./asr-schemas";
```

- [ ] **Step 6: Run contract checks**

Run:

```bash
pnpm --filter @simulcast/contracts test:run
pnpm --filter @simulcast/contracts typecheck
```

Expected: all contract tests and type checks PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/asr.ts \
  packages/contracts/src/asr-schemas.ts \
  packages/contracts/src/asr.test.ts \
  packages/contracts/src/index.ts
git commit -m "feat: 定义桌面 ASR 会话协议"
```

### Task 2: Make the Worker Adapter Explicit and Testable

**Files:**
- Modify: `packages/infrastructure/src/asr/whisper-worker-adapter.ts`
- Modify: `packages/infrastructure/src/asr/whisper-worker-adapter.test.ts`
- Modify: `packages/infrastructure/src/index.ts`

- [ ] **Step 1: Add failing adapter launch and sequence tests**

Add these cases to
`packages/infrastructure/src/asr/whisper-worker-adapter.test.ts` using a fake
child process with `stdin.write`, `stdout`, `stderr`, `kill`, and event hooks:

```typescript
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";

function createFakeChildProcess() {
  const events = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const writes: string[] = [];
  const stdin = new PassThrough();
  vi.spyOn(stdin, "write").mockImplementation((chunk: any) => {
    writes.push(String(chunk));
    return true;
  });
  const process = Object.assign(events, {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(() => true),
  }) as unknown as ChildProcess;

  return {
    process,
    emitStdout(line: string) {
      stdout.write(Buffer.from(line));
    },
    writtenMessages() {
      return writes.map((line) => JSON.parse(line));
    },
  };
}

it("starts the real faster-whisper engine with explicit arguments", async () => {
  const child = createFakeChildProcess();
  const spawnProcess = vi.fn(() => child.process);
  const adapter = new WhisperWorkerAdapter({
    workerCwd: "/repo/workers/asr",
    spawnProcess,
    startupTimeoutMs: 100,
  });

  const started = adapter.start({
    engine: "faster-whisper",
    modelName: "small.en",
    device: "cpu",
    computeType: "int8",
  });
  child.emitStdout('{"type":"status","status":"ready"}\n');
  await started;

  expect(spawnProcess).toHaveBeenCalledWith(
    "uv",
    [
      "run",
      "python",
      "-m",
      "asr_worker.main",
      "--engine",
      "faster-whisper",
      "--model",
      "small.en",
      "--device",
      "cpu",
      "--compute-type",
      "int8",
    ],
    {
      cwd: "/repo/workers/asr",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
});

it("writes monotonically increasing sequence numbers", async () => {
  const child = createFakeChildProcess();
  const adapter = new WhisperWorkerAdapter({
    workerCwd: "/repo/workers/asr",
    spawnProcess: vi.fn(() => child.process),
  });
  const started = adapter.start({
    engine: "faster-whisper",
    modelName: "small.en",
    device: "cpu",
    computeType: "int8",
  });
  child.emitStdout('{"type":"status","status":"ready"}\n');
  await started;

  adapter.sendAudio("session-1", "YQ==");
  adapter.sendAudio("session-1", "Yg==");

  expect(child.writtenMessages()).toMatchObject([
    { session_id: "session-1", sequence: 1 },
    { session_id: "session-1", sequence: 2 },
  ]);
});

it("resets sequence numbers after stop and restart", async () => {
  const first = createFakeChildProcess();
  const second = createFakeChildProcess();
  const spawnProcess = vi.fn()
    .mockReturnValueOnce(first.process)
    .mockReturnValueOnce(second.process);
  const adapter = new WhisperWorkerAdapter({
    workerCwd: "/repo/workers/asr",
    spawnProcess,
  });
  const options = {
    engine: "faster-whisper" as const,
    modelName: "small.en",
    device: "cpu",
    computeType: "int8",
  };
  const firstStart = adapter.start(options);
  first.emitStdout('{"type":"status","status":"ready"}\n');
  await firstStart;
  adapter.sendAudio("session-1", "YQ==");
  adapter.stop();

  const secondStart = adapter.start(options);
  second.emitStdout('{"type":"status","status":"ready"}\n');
  await secondStart;
  adapter.sendAudio("session-2", "Yg==");

  expect(second.writtenMessages().at(-1)).toMatchObject({
    session_id: "session-2",
    sequence: 1,
  });
});
```

The helper must construct real `EventEmitter` instances for stdout, stderr, and
the child process. Do not mock private adapter methods for these new cases.

- [ ] **Step 2: Run the adapter tests and verify failure**

Run:

```bash
pnpm --filter @simulcast/infrastructure test:run
```

Expected: FAIL because the constructor and `start()` do not accept options and
the current launch command omits `--engine faster-whisper`.

- [ ] **Step 3: Add adapter configuration**

Add these public types:

```typescript
import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface WhisperWorkerLaunchOptions {
  readonly engine: "mock" | "faster-whisper";
  readonly modelName: string;
  readonly device: string;
  readonly computeType: string;
}

export interface WhisperWorkerAdapterOptions {
  readonly workerCwd: string;
  readonly startupTimeoutMs?: number;
  readonly spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
}
```

Change construction and startup to:

```typescript
export class WhisperWorkerAdapter extends EventEmitter {
  private readonly workerCwd: string;
  private readonly startupTimeoutMs: number;
  private readonly spawnProcess: NonNullable<
    WhisperWorkerAdapterOptions["spawnProcess"]
  >;

  constructor(options: WhisperWorkerAdapterOptions) {
    super();
    this.workerCwd = options.workerCwd;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 5_000;
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  async start(options: WhisperWorkerLaunchOptions): Promise<void> {
    if (this.process) {
      return;
    }

    this.sequenceCounter = 0;
    const args = [
      "run",
      "python",
      "-m",
      "asr_worker.main",
      "--engine",
      options.engine,
      "--model",
      options.modelName,
      "--device",
      options.device,
      "--compute-type",
      options.computeType,
    ];

    this.process = this.spawnProcess("uv", args, {
      cwd: this.workerCwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
}
```

Preserve existing message parsing. Ensure startup timeout:

- clears its timer on ready, process error, exit, and stop;
- kills and clears the child process on timeout;
- rejects exactly once;
- does not leave an `"error"` EventEmitter event without a Main listener.

Reset `sequenceCounter` in both `start()` and `stop()`.

- [ ] **Step 4: Export launch types**

Update `packages/infrastructure/src/index.ts`:

```typescript
export {
  WhisperWorkerAdapter,
  type AsrMessage,
  type WhisperWorkerLaunchOptions,
  type WhisperWorkerAdapterOptions,
} from "./asr/whisper-worker-adapter";
```

- [ ] **Step 5: Run adapter checks**

Run:

```bash
pnpm --filter @simulcast/infrastructure test:run
pnpm --filter @simulcast/infrastructure typecheck
```

Expected: all infrastructure tests and type checks PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/src/asr/whisper-worker-adapter.ts \
  packages/infrastructure/src/asr/whisper-worker-adapter.test.ts \
  packages/infrastructure/src/index.ts
git commit -m "feat: 支持显式启动真实 Whisper Worker"
```

### Task 3: Add Main-Process ASR Session Ownership

**Files:**
- Create: `apps/desktop/src/main/asr/asr-session-controller.ts`
- Create: `apps/desktop/src/main/asr/asr-session-controller.test.ts`
- Create: `apps/desktop/src/main/asr/resolve-worker-cwd.ts`
- Create: `apps/desktop/src/main/asr/resolve-worker-cwd.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/electron.vite.config.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add the infrastructure workspace dependency**

Run:

```bash
pnpm --filter @simulcast/desktop add @simulcast/infrastructure@workspace:*
```

Expected: `apps/desktop/package.json` and `pnpm-lock.yaml` include
`@simulcast/infrastructure`.

Update `apps/desktop/electron.vite.config.ts` so Main bundles both local
workspace packages:

```typescript
externalizeDepsPlugin({
  exclude: [
    "@simulcast/contracts",
    "@simulcast/infrastructure",
  ],
}),
```

- [ ] **Step 2: Write failing Worker path tests**

Create `apps/desktop/src/main/asr/resolve-worker-cwd.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveAsrWorkerCwd } from "./resolve-worker-cwd";

describe("resolveAsrWorkerCwd", () => {
  it("uses an explicit override", () => {
    expect(
      resolveAsrWorkerCwd({
        appPath: "/repo/apps/desktop",
        resourcesPath: "/Applications/App/Contents/Resources",
        isPackaged: false,
        override: "/custom/asr",
      }),
    ).toBe("/custom/asr");
  });

  it("resolves the workspace Worker during development", () => {
    expect(
      resolveAsrWorkerCwd({
        appPath: "/repo/apps/desktop",
        resourcesPath: "/unused",
        isPackaged: false,
      }),
    ).toBe("/repo/workers/asr");
  });

  it("resolves packaged Worker resources", () => {
    expect(
      resolveAsrWorkerCwd({
        appPath: "/unused",
        resourcesPath: "/Applications/App/Contents/Resources",
        isPackaged: true,
      }),
    ).toBe("/Applications/App/Contents/Resources/workers/asr");
  });
});
```

- [ ] **Step 3: Implement deterministic Worker path resolution**

Create `apps/desktop/src/main/asr/resolve-worker-cwd.ts`:

```typescript
import { resolve } from "node:path";

export interface ResolveAsrWorkerCwdOptions {
  readonly appPath: string;
  readonly resourcesPath: string;
  readonly isPackaged: boolean;
  readonly override?: string;
}

export function resolveAsrWorkerCwd(
  options: ResolveAsrWorkerCwdOptions,
): string {
  if (options.override) {
    return resolve(options.override);
  }

  if (options.isPackaged) {
    return resolve(options.resourcesPath, "workers/asr");
  }

  return resolve(options.appPath, "../../workers/asr");
}
```

- [ ] **Step 4: Write failing controller tests**

Create a fake adapter implementing:

```typescript
interface AsrWorkerPort {
  start(options: WhisperWorkerLaunchOptions): Promise<void>;
  stop(): void;
  sendAudio(
    sessionId: string,
    audioData: string,
    sampleRate: number,
    channels: number,
  ): void;
  getIsReady(): boolean;
  on(event: "result" | "error" | "exit", listener: (...args: any[]) => void): this;
  off(event: "result" | "error" | "exit", listener: (...args: any[]) => void): this;
}
```

Cover:

```typescript
function validAudioRequest(
  sessionId: string,
  audioData: string,
): AsrAudioRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    timestamp: 100,
    sessionId,
    audioData,
    sampleRate: 16000,
    channels: 1,
  };
}

it("starts exactly one real-engine session", async () => {
  await controller.startSession("session-1");

  expect(adapter.start).toHaveBeenCalledWith({
    engine: "faster-whisper",
    modelName: "small.en",
    device: "cpu",
    computeType: "int8",
  });
  await expect(controller.startSession("session-2")).rejects.toThrow(
    "已有 ASR 会话正在运行",
  );
});

it("forwards audio only for the active ready session", async () => {
  await controller.startSession("session-1");
  controller.sendAudio(validAudioRequest("session-1", "YQ=="));

  expect(adapter.sendAudio).toHaveBeenCalledWith(
    "session-1",
    "YQ==",
    16000,
    1,
  );
  expect(() =>
    controller.sendAudio(validAudioRequest("stale-session", "Yg==")),
  ).toThrow("ASR 会话不匹配");
});

it("drops Worker results from a stale session", async () => {
  await controller.startSession("session-1");
  adapter.emit("result", {
    type: "result",
    session_id: "session-2",
    sequence: 1,
    text: "stale",
  });

  expect(publish).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "transcript" }),
  );
});

it("publishes a recoverable error when the Worker exits", async () => {
  await controller.startSession("session-1");
  adapter.emit("exit", 1);

  expect(publish).toHaveBeenCalledWith({
    type: "error",
    sessionId: "session-1",
    code: "WORKER_EXITED",
    message: "ASR Worker exited with code 1",
    recoverable: true,
  });
});
```

- [ ] **Step 5: Implement the session controller**

Create `apps/desktop/src/main/asr/asr-session-controller.ts` with:

```typescript
export interface AsrSessionControllerOptions {
  readonly worker: AsrWorkerPort;
  readonly publish: (event: AsrEvent) => void;
  readonly launch: WhisperWorkerLaunchOptions;
}

export class AsrSessionController {
  private activeSessionId: string | null = null;
  private state: AsrSessionState = "idle";

  async startSession(sessionId: string): Promise<AsrSessionResponse> {
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      throw new Error("已有 ASR 会话正在运行");
    }
    if (this.activeSessionId === sessionId && this.state === "ready") {
      return { sessionId, state: "ready" };
    }

    this.activeSessionId = sessionId;
    this.state = "starting";
    this.publish({
      type: "status",
      sessionId,
      state: "starting",
      message: "正在启动本地语音识别",
    });

    try {
      await this.worker.start(this.launch);
      this.state = "ready";
      this.publish({
        type: "status",
        sessionId,
        state: "ready",
        message: "本地语音识别已就绪",
      });
      return { sessionId, state: "ready" };
    } catch (error) {
      this.state = "error";
      this.publish({
        type: "error",
        sessionId,
        code: "WORKER_START_FAILED",
        message: error instanceof Error ? error.message : "ASR Worker 启动失败",
        recoverable: true,
      });
      this.worker.stop();
      this.activeSessionId = null;
      throw error;
    }
  }

  sendAudio(request: AsrAudioRequest): void {
    if (request.sessionId !== this.activeSessionId) {
      throw new Error("ASR 会话不匹配");
    }
    if (this.state !== "ready" || !this.worker.getIsReady()) {
      throw new Error("ASR Worker 尚未就绪");
    }
    this.worker.sendAudio(
      request.sessionId,
      request.audioData,
      request.sampleRate,
      request.channels,
    );
  }

  stopSession(sessionId: string): AsrSessionResponse {
    if (sessionId === this.activeSessionId) {
      this.worker.stop();
      this.activeSessionId = null;
      this.state = "idle";
    }
    return { sessionId, state: "idle" };
  }

  dispose(): void {
    this.worker.stop();
    this.activeSessionId = null;
    this.state = "idle";
  }
}
```

In the constructor, attach stable handler functions for `result`, `error`, and
`exit`. Map snake_case Worker fields to camelCase contract events. Publish only
when `message.session_id === activeSessionId`; for Worker errors with an empty
session ID, associate the error with the active session. Remove listeners in
`dispose()`.

- [ ] **Step 6: Run controller and build checks**

Run:

```bash
pnpm --filter @simulcast/desktop test:run -- src/main/asr
pnpm --filter @simulcast/desktop typecheck
pnpm --filter @simulcast/desktop build
```

Expected: controller/path tests PASS, typecheck PASS, and the Main bundle can
resolve `@simulcast/infrastructure`.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/package.json \
  apps/desktop/electron.vite.config.ts \
  apps/desktop/src/main/asr \
  pnpm-lock.yaml
git commit -m "feat: 新增主进程 ASR 会话控制器"
```

### Task 4: Register Fixed IPC Channels and Expose the Preload Whitelist

**Files:**
- Create: `apps/desktop/src/main/asr/register-asr-handlers.ts`
- Create: `apps/desktop/src/main/asr/register-asr-handlers.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/api.ts`
- Modify: `apps/desktop/src/preload/api.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.test.ts`

- [ ] **Step 1: Write failing Main handler tests**

Mock `electron.ipcMain` and assert:

```typescript
it("registers only the fixed ASR channels", () => {
  registerAsrHandlers(controller);

  expect(ipcMain.handle).toHaveBeenCalledWith(
    "asr.session.start",
    expect.any(Function),
  );
  expect(ipcMain.on).toHaveBeenCalledWith(
    "asr.audio",
    expect.any(Function),
  );
  expect(ipcMain.handle).toHaveBeenCalledWith(
    "asr.session.stop",
    expect.any(Function),
  );
});

it("rejects invalid audio before it reaches the controller", () => {
  registerAsrHandlers(controller);
  const listener = findOnListener("asr.audio");

  expect(() => listener({}, { sessionId: "session-1" })).toThrow();
  expect(controller.sendAudio).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Implement handler registration**

Create `apps/desktop/src/main/asr/register-asr-handlers.ts`:

```typescript
import { ipcMain } from "electron";
import {
  validateAsrAudioRequest,
  validateAsrSessionRequest,
} from "@simulcast/contracts";
import type { AsrSessionController } from "./asr-session-controller";

export function registerAsrHandlers(
  controller: AsrSessionController,
): () => void {
  ipcMain.handle("asr.session.start", (_event, payload) => {
    const request = validateAsrSessionRequest(payload);
    return controller.startSession(request.sessionId);
  });

  ipcMain.on("asr.audio", (_event, payload) => {
    controller.sendAudio(validateAsrAudioRequest(payload));
  });

  ipcMain.handle("asr.session.stop", (_event, payload) => {
    const request = validateAsrSessionRequest(payload);
    return controller.stopSession(request.sessionId);
  });

  return () => {
    ipcMain.removeHandler("asr.session.start");
    ipcMain.removeAllListeners("asr.audio");
    ipcMain.removeHandler("asr.session.stop");
  };
}
```

- [ ] **Step 3: Write failing preload API type tests**

Extend `apps/desktop/src/preload/api.test.ts`:

```typescript
it("exposes typed ASR session methods", () => {
  expectTypeOf<PreloadApi["startAsrSession"]>()
    .returns.toMatchTypeOf<Promise<AsrSessionResponse>>();
  expectTypeOf<PreloadApi["sendAsrAudio"]>()
    .parameters.toEqualTypeOf<
      [sessionId: string, pcm: Int16Array, sampleRate?: 16000, channels?: 1]
    >();
  expectTypeOf<PreloadApi["onAsrEvent"]>()
    .returns.toMatchTypeOf<() => void>();
});
```

- [ ] **Step 4: Extend only the typed preload surface**

Add to `PreloadApi`:

```typescript
readonly startAsrSession: (
  sessionId: string,
) => Promise<AsrSessionResponse>;
readonly sendAsrAudio: (
  sessionId: string,
  pcm: Int16Array,
  sampleRate?: 16000,
  channels?: 1,
) => void;
readonly stopAsrSession: (
  sessionId: string,
) => Promise<AsrSessionResponse>;
readonly onAsrEvent: (
  listener: (event: AsrEvent) => void,
) => () => void;
```

Implement in preload:

```typescript
function sessionRequest(sessionId: string): AsrSessionRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    timestamp: Date.now(),
    sessionId,
  };
}

startAsrSession(sessionId) {
  return ipcRenderer.invoke("asr.session.start", sessionRequest(sessionId));
},

sendAsrAudio(sessionId, pcm, sampleRate = 16000, channels = 1) {
  const audioData = Buffer.from(
    pcm.buffer,
    pcm.byteOffset,
    pcm.byteLength,
  ).toString("base64");
  ipcRenderer.send("asr.audio", {
    ...sessionRequest(sessionId),
    audioData,
    sampleRate,
    channels,
  });
},

stopAsrSession(sessionId) {
  return ipcRenderer.invoke("asr.session.stop", sessionRequest(sessionId));
},

onAsrEvent(listener) {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: AsrEvent) => {
    listener(payload);
  };
  ipcRenderer.on("asr.event", wrapped);
  return () => ipcRenderer.removeListener("asr.event", wrapped);
},
```

- [ ] **Step 5: Add preload runtime tests**

Extend the Electron mock with `send`, `on`, and `removeListener`. Assert:

```typescript
expect(send).toHaveBeenCalledWith(
  "asr.audio",
  expect.objectContaining({
    protocolVersion: PROTOCOL_VERSION,
    sessionId: "session-1",
    audioData: Buffer.from(new Int16Array([1, -1]).buffer).toString("base64"),
    sampleRate: 16000,
    channels: 1,
  }),
);

const unsubscribe = api.onAsrEvent(listener);
expect(on).toHaveBeenCalledWith("asr.event", expect.any(Function));
unsubscribe();
expect(removeListener).toHaveBeenCalledWith(
  "asr.event",
  on.mock.calls.at(-1)?.[1],
);
```

- [ ] **Step 6: Wire Main startup and shutdown**

In `apps/desktop/src/main/index.ts`:

1. Resolve the Worker path with `resolveAsrWorkerCwd`.
2. Construct `WhisperWorkerAdapter`.
3. Construct `AsrSessionController`.
4. Publish every `AsrEvent` to all non-destroyed windows:

```typescript
function publishAsrEvent(event: AsrEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("asr.event", event);
    }
  }
}
```

5. Register handlers after `app.whenReady()`.
6. Call `controller.dispose()` in `app.on("before-quit")`.

Use launch defaults:

```typescript
{
  engine: "faster-whisper",
  modelName: process.env.WHISPER_MODEL ?? "small.en",
  device: process.env.WHISPER_DEVICE ?? "cpu",
  computeType: process.env.WHISPER_COMPUTE_TYPE ?? "int8",
}
```

- [ ] **Step 7: Run IPC and preload checks**

Run:

```bash
pnpm --filter @simulcast/desktop test:run -- src/main/asr src/preload
pnpm --filter @simulcast/desktop typecheck
pnpm --filter @simulcast/desktop build
```

Expected: all selected tests PASS and no generic IPC capability is exposed.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/main/asr/register-asr-handlers.ts \
  apps/desktop/src/main/asr/register-asr-handlers.test.ts \
  apps/desktop/src/main/index.ts \
  apps/desktop/src/preload/api.ts \
  apps/desktop/src/preload/api.test.ts \
  apps/desktop/src/preload/index.ts \
  apps/desktop/src/preload/index.test.ts
git commit -m "feat: 接通 ASR IPC 与 preload 白名单"
```

### Task 5: Connect AudioCapture PCM to an ASR Session Client

**Files:**
- Create: `apps/desktop/src/renderer/features/asr/asr-session-client.ts`
- Create: `apps/desktop/src/renderer/features/asr/asr-session-client.test.ts`
- Modify: `apps/desktop/src/renderer/features/audio/audio-capture.ts`
- Modify: `apps/desktop/src/renderer/features/audio/audio-capture.test.ts`

- [ ] **Step 1: Write failing AudioCapture metadata tests**

Change the PCM callback contract to:

```typescript
export interface CapturedPcmChunk {
  readonly data: Int16Array;
  readonly sampleRate: 16000;
  readonly channels: 1;
}
```

Test a worklet message:

```typescript
const onPcmData = vi.fn();
capture.setOnPcmData(onPcmData);
await capture.start();

workletNode.port.onmessage?.({
  data: {
    type: "pcm",
    data: new Int16Array([1, -1]),
    sampleRate: 16000,
    channels: 1,
  },
} as MessageEvent);

expect(onPcmData).toHaveBeenCalledOnce();
expect(onPcmData).toHaveBeenCalledWith({
  data: new Int16Array([1, -1]),
  sampleRate: 16000,
  channels: 1,
});
```

Also assert that `sampleRate: 44_100`, `channels: 2`, non-`Int16Array` data, and
unknown message types do not invoke the callback.

- [ ] **Step 2: Implement strict worklet message handling**

In `audio-capture.ts`, use:

```typescript
private onPcmData:
  ((chunk: CapturedPcmChunk) => void) | null = null;

setOnPcmData(callback: (chunk: CapturedPcmChunk) => void): void {
  this.onPcmData = callback;
}
```

Inside `port.onmessage`, require:

```typescript
if (
  event.data?.type !== "pcm"
  || !(event.data.data instanceof Int16Array)
  || event.data.sampleRate !== 16000
  || event.data.channels !== 1
) {
  return;
}
```

Then update the level and call the callback once.

- [ ] **Step 3: Write failing session-client tests**

Create `asr-session-client.test.ts`:

```typescript
function createFakePreloadApi(): PreloadApi & {
  emit(event: AsrEvent): void;
} {
  let listener: ((event: AsrEvent) => void) | null = null;
  return {
    getAppStatus: vi.fn(),
    getRuntimeInfo: vi.fn(),
    startAsrSession: vi.fn(async (sessionId) => ({
      sessionId,
      state: "ready" as const,
    })),
    sendAsrAudio: vi.fn(),
    stopAsrSession: vi.fn(async (sessionId) => ({
      sessionId,
      state: "idle" as const,
    })),
    onAsrEvent: vi.fn((callback) => {
      listener = callback;
      return () => {
        listener = null;
      };
    }),
    emit(event) {
      listener?.(event);
    },
  };
}

const result = {
  sequence: 1,
  text: "Hello",
  confidence: 0.9,
  startMs: 0,
  endMs: 1_000,
  isFinal: false,
} as const;

it("starts, forwards PCM, and stops one session", async () => {
  const api = createFakePreloadApi();
  const client = new AsrSessionClient(api, () => "session-1");

  await client.start();
  client.send({
    data: new Int16Array([1, -1]),
    sampleRate: 16000,
    channels: 1,
  });
  await client.stop();

  expect(api.startAsrSession).toHaveBeenCalledWith("session-1");
  expect(api.sendAsrAudio).toHaveBeenCalledWith(
    "session-1",
    new Int16Array([1, -1]),
    16000,
    1,
  );
  expect(api.stopAsrSession).toHaveBeenCalledWith("session-1");
});

it("filters events from previous sessions", async () => {
  const api = createFakePreloadApi();
  const onEvent = vi.fn();
  const client = new AsrSessionClient(api, () => "session-1");
  client.setOnEvent(onEvent);
  await client.start();

  api.emit({ type: "transcript", sessionId: "old-session", ...result });
  api.emit({ type: "transcript", sessionId: "session-1", ...result });

  expect(onEvent).toHaveBeenCalledOnce();
});
```

- [ ] **Step 4: Implement the Renderer session facade**

Create `asr-session-client.ts`:

```typescript
import type { AsrEvent } from "@simulcast/contracts";
import type { PreloadApi } from "../../../preload/api";
import type { CapturedPcmChunk } from "../audio/audio-capture";

export class AsrSessionClient {
  private sessionId: string | null = null;
  private onEvent: ((event: AsrEvent) => void) | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly api: PreloadApi,
    private readonly createSessionId: () => string = () => crypto.randomUUID(),
  ) {}

  setOnEvent(callback: (event: AsrEvent) => void): void {
    this.onEvent = callback;
  }

  async start(): Promise<void> {
    if (this.sessionId) {
      return;
    }
    const sessionId = this.createSessionId();
    this.sessionId = sessionId;
    this.unsubscribe = this.api.onAsrEvent((event) => {
      if (event.sessionId === this.sessionId) {
        this.onEvent?.(event);
      }
    });
    try {
      await this.api.startAsrSession(sessionId);
    } catch (error) {
      this.unsubscribe();
      this.unsubscribe = null;
      this.sessionId = null;
      throw error;
    }
  }

  send(chunk: CapturedPcmChunk): void {
    if (!this.sessionId) {
      return;
    }
    this.api.sendAsrAudio(
      this.sessionId,
      chunk.data,
      chunk.sampleRate,
      chunk.channels,
    );
  }

  async stop(): Promise<void> {
    const sessionId = this.sessionId;
    this.sessionId = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (sessionId) {
      await this.api.stopAsrSession(sessionId);
    }
  }
}
```

- [ ] **Step 5: Run audio and client checks**

Run:

```bash
pnpm --filter @simulcast/desktop test:run -- \
  src/renderer/features/audio/audio-capture.test.ts \
  src/renderer/features/asr/asr-session-client.test.ts
pnpm --filter @simulcast/desktop typecheck
```

Expected: selected tests and typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/features/audio/audio-capture.ts \
  apps/desktop/src/renderer/features/audio/audio-capture.test.ts \
  apps/desktop/src/renderer/features/asr
git commit -m "feat: 将系统音频 PCM 接入 ASR 会话"
```

### Task 6: Display Raw Session-Scoped Transcripts and Recoverable Errors

**Files:**
- Modify: `apps/desktop/src/renderer/src/app/app.tsx`
- Modify: `apps/desktop/src/renderer/src/app/app.test.tsx`
- Modify: `apps/desktop/src/renderer/src/app/styles.css`

- [ ] **Step 1: Write failing control-window flow tests**

Extend the test controller interfaces so capture exposes `setOnPcmData`, and
inject an `AsrSessionClientController`:

```typescript
export interface AsrSessionClientController {
  setOnEvent(callback: (event: AsrEvent) => void): void;
  start(): Promise<void>;
  send(chunk: CapturedPcmChunk): void;
  stop(): Promise<void>;
}
```

Add tests:

```typescript
const validChunk: CapturedPcmChunk = {
  data: new Int16Array([1, -1]),
  sampleRate: 16000,
  channels: 1,
};

function createFakeAsrClient(
  overrides: Partial<AsrSessionClientController> = {},
) {
  let onEvent: ((event: AsrEvent) => void) | null = null;
  return {
    setOnEvent: vi.fn((callback) => {
      onEvent = callback;
    }),
    start: vi.fn(overrides.start ?? (async () => {})),
    send: vi.fn(overrides.send ?? (() => {})),
    stop: vi.fn(overrides.stop ?? (async () => {})),
    emit(event: AsrEvent) {
      onEvent?.(event);
    },
  };
}

function createFakeCapture(
  overrides: Partial<AudioCaptureController> = {},
) {
  let onStatus:
    | Parameters<AudioCaptureController["setOnStatusChange"]>[0]
    | null = null;
  let onPcm:
    | Parameters<AudioCaptureController["setOnPcmData"]>[0]
    | null = null;
  return {
    setOnStatusChange: vi.fn((callback) => {
      onStatus = callback;
    }),
    setOnPcmData: vi.fn((callback) => {
      onPcm = callback;
    }),
    start: vi.fn(async () => {
      await overrides.start?.();
      onStatus?.({
        state: "capturing",
        level: { level: 42, timestamp: 100 },
        error: null,
      });
    }),
    stop: vi.fn(() => {
      overrides.stop?.();
      onStatus?.({ state: "idle", level: null, error: null });
    }),
    emitPcm(chunk: CapturedPcmChunk) {
      onPcm?.(chunk);
    },
  };
}

function renderApp(options: {
  asr?: ReturnType<typeof createFakeAsrClient>;
  capture?: ReturnType<typeof createFakeCapture>;
  asrStartError?: Error;
} = {}) {
  const capture = options.capture ?? createFakeCapture();
  const asr = options.asr ?? createFakeAsrClient({
    start: options.asrStartError
      ? async () => { throw options.asrStartError; }
      : async () => {},
  });
  render(
    <App
      windowKind="control"
      createAudioCapture={() => capture}
      createAsrSessionClient={() => asr}
    />,
  );
  return { capture, asr };
}

it("starts ASR before capture and forwards PCM", async () => {
  const order: string[] = [];
  const asr = createFakeAsrClient({
    start: async () => { order.push("asr"); },
  });
  const capture = createFakeCapture({
    start: async () => { order.push("capture"); },
  });
  renderApp({ asr, capture });

  fireEvent.click(screen.getByRole("button", { name: "开始采集" }));
  await screen.findByText("系统音频采集中");
  capture.emitPcm(validChunk);

  expect(order).toEqual(["asr", "capture"]);
  expect(asr.send).toHaveBeenCalledWith(validChunk);
});

it("shows the latest transcript for the active session", async () => {
  const { asr } = renderApp();
  asr.emit({
    type: "transcript",
    sessionId: "session-1",
    sequence: 4,
    text: "Today we are building a real time translation assistant.",
    confidence: 0.9,
    startMs: 0,
    endMs: 1_600,
    isFinal: false,
  });

  expect(
    await screen.findByText(
      "Today we are building a real time translation assistant.",
    ),
  ).toBeInTheDocument();
});

it("stops capture if ASR startup fails", async () => {
  const { capture } = renderApp({
    asrStartError: new Error("ASR Worker startup timeout"),
  });

  fireEvent.click(screen.getByRole("button", { name: "开始采集" }));

  expect(
    await screen.findByText("ASR Worker startup timeout"),
  ).toBeInTheDocument();
  expect(capture.start).not.toHaveBeenCalled();
});

it("stops both capture and ASR", async () => {
  const { capture, asr } = renderApp();
  fireEvent.click(screen.getByRole("button", { name: "开始采集" }));
  await screen.findByText("系统音频采集中");
  fireEvent.click(screen.getByRole("button", { name: "停止采集" }));

  expect(capture.stop).toHaveBeenCalledOnce();
  expect(asr.stop).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Add application state and startup ordering**

In `ControlWindow`:

1. Create capture and ASR refs once.
2. Register capture status, PCM, and ASR event callbacks once.
3. On start:
   - clear the previous error;
   - `await asr.start()`;
   - then `await capture.start()`;
   - if capture fails after ASR starts, `await asr.stop()`.
4. On stop:
   - stop capture synchronously;
   - await ASR stop;
   - retain the last transcript until the next session starts.
5. On unmount:
   - stop capture;
   - invoke ASR stop without updating unmounted state.

Track:

```typescript
const [asrState, setAsrState] =
  useState<AsrSessionState>("idle");
const [latestTranscript, setLatestTranscript] = useState("");
const [asrError, setAsrError] = useState<string | null>(null);
```

Map events:

```typescript
if (event.type === "status") {
  setAsrState(event.state);
}
if (event.type === "transcript") {
  setLatestTranscript(event.text);
}
if (event.type === "error") {
  setAsrState("error");
  setAsrError(event.message);
  captureRef.current?.stop();
}
```

Render a raw transcript panel labelled `实时英文原文`. State clearly in UI copy
that overlapping text may repeat until PR 09 stabilization.

- [ ] **Step 3: Replace the overlay demo with ASR event rendering**

The overlay window cannot share React state with the control window. Construct
an event-only `AsrSessionClient` subscription or a small `AsrEventSubscriber`
that calls `window.api.onAsrEvent` and renders the latest transcript event.

Requirements:

- Ignore empty text.
- Ignore events older than the latest observed sequence for the current
  `sessionId`.
- When a new session ID appears, reset the latest sequence.
- Display `等待英文原文` before the first result.
- Do not render Chinese demo translation in PR 08.

Add an overlay test that emits two transcript events and proves the second
replaces the first in place.

- [ ] **Step 4: Add focused styles**

Add classes for:

```css
.transcript-panel
.transcript-label
.transcript-text
.asr-status
.asr-error
```

Keep the overlay height stable when text changes. Use existing colors and
spacing; do not redesign unrelated UI.

- [ ] **Step 5: Run Renderer checks**

Run:

```bash
pnpm --filter @simulcast/desktop test:run -- src/renderer
pnpm --filter @simulcast/desktop typecheck
```

Expected: Renderer tests and typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/app/app.tsx \
  apps/desktop/src/renderer/src/app/app.test.tsx \
  apps/desktop/src/renderer/src/app/styles.css
git commit -m "feat: 展示实时 Whisper 英文原文"
```

### Task 7: Document and Verify the Complete PR 08 Chain

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/plans/2026-06-07-pr08-desktop-asr-session.md`

- [ ] **Step 1: Document runtime configuration**

Add to `.env.example`:

```dotenv
# 可选；默认按仓库结构定位 workers/asr
ASR_WORKER_DIR=
WHISPER_MODEL=small.en
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

In README, document:

```bash
uv sync --project workers/asr --extra dev
pnpm install
pnpm dev
```

State that clicking `开始采集` now starts the real faster-whisper Worker and the
first audio chunk may trigger a one-time `small.en` download. Include macOS
screen/system-audio permission instructions and a note that PR 08 shows raw
overlapping English results.

- [ ] **Step 2: Run all automated checks**

Run:

```bash
uv run --project workers/asr pytest -q
pnpm test:run
pnpm typecheck
pnpm build
git diff --check
```

Expected:

- Python: all tests PASS without downloading a model.
- TypeScript: all workspace tests PASS.
- Typecheck PASS.
- Electron build PASS.
- `git diff --check` prints nothing.

- [ ] **Step 3: Run the real desktop acceptance flow**

Run:

```bash
uv sync --project workers/asr --extra dev
pnpm dev
```

Then:

1. Start an English speech or the fixed macOS `say` sample.
2. Click `开始采集`.
3. Grant macOS screen/system-audio permission.
4. Confirm the UI moves through ASR `starting` to `ready`.
5. Confirm the Worker command includes `--engine faster-whisper`.
6. Confirm the first non-empty English result appears in both windows.
7. Confirm repeated overlapping text replaces the current raw transcript
   instead of adding unbounded DOM rows.
8. Click `停止采集`.
9. Confirm audio capture stops and the Python child process exits.
10. Start again and confirm the new session begins at audio sequence `1`.

Expected: a real English transcript appears. Record the actual model download
time, first-result latency, and any macOS permission issue in the PR
description.

- [ ] **Step 4: Test recoverable failure**

Temporarily launch with:

```bash
ASR_WORKER_DIR=/missing/asr pnpm dev
```

Click `开始采集`.

Expected:

- The application remains open.
- The control window shows a recoverable Worker startup error.
- Audio capture does not continue.
- Clicking `开始采集` after restoring the correct path can retry.

- [ ] **Step 5: Update the plan completion checklist**

Append a short `## Verification Record` section containing:

```markdown
- [x] Python tests
- [x] Workspace tests
- [x] Typecheck
- [x] Build
- [x] Diff check
- [x] Real faster-whisper desktop session
- [x] Recoverable Worker startup failure
```

Do not mark the real-model items complete until they have actually run.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md .env.example \
  docs/superpowers/plans/2026-06-07-pr08-desktop-asr-session.md
git commit -m "docs: 补充桌面 ASR 会话验证说明"
```

## PR 08 Completion Definition

- Renderer PCM crosses the process boundary only through typed preload methods.
- Every Main-bound ASR payload is versioned and runtime validated.
- Main owns one active session and rejects stale-session audio.
- Audio sequences are monotonic and reset for a new session.
- Worker launch explicitly selects `faster-whisper`.
- Worker results are returned only to the matching session.
- Both windows display the latest raw English transcript.
- Worker startup failure, processing error, and unexpected exit remain
  recoverable and visible.
- Stop and application shutdown terminate the Worker.
- No PR 09 stabilization or MiMo behavior is included.
- All commit messages use an English type prefix and Chinese description.
- Automated checks and the real-model acceptance flow pass.

## Self-Review

Spec coverage:

- Renderer whitelist boundary: Tasks 1, 4, and 5.
- Monotonic session audio: Tasks 2 and 3.
- Explicit real engine selection: Tasks 2 and 3.
- Session-scoped Worker events: Tasks 3, 4, and 6.
- Recoverable not-ready/exit UI: Tasks 3, 4, 6, and 7.
- Real faster-whisper validation: Task 7.

Scope remains one subsystem: the desktop-to-ASR session chain. Transcript
stabilization and MiMo are intentionally separate PRs.

No implementation step uses placeholder behavior. All later task names and
types match the contracts introduced in Task 1.

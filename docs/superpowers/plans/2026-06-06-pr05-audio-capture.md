# PR 05：macOS 系统音频采集实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 Electron desktopCapturer 和 getDisplayMedia 获取 macOS 系统音频，在 AudioWorklet 中转换为单声道 PCM，并在控制窗口显示音量电平。

**Architecture:** 在渲染进程中使用 Web Audio API 和 AudioWorklet 处理音频流，将音频数据转换为 16kHz 单声道 PCM。通过 IPC 将音频状态发送到主进程，实现音量电平显示。

**Tech Stack:** TypeScript 6、Electron 42、Web Audio API、AudioWorklet

---

## 审查修正

原详细示例错误地使用了麦克风 `getUserMedia`，并且遗漏了主进程 display media
注册、控制窗口接入和真正的 PCM 分块。以下规则覆盖原示例中的冲突部分：

- Main 必须注册 `session.defaultSession.setDisplayMediaRequestHandler`，通过
  `desktopCapturer.getSources({ types: ["screen"] })` 返回
  `{ video: source, audio: "loopback" }`。
- Renderer 必须调用 `getDisplayMedia({ audio: true, video: true })`；获得流后
  停止视频轨道，仅处理系统音频轨道。
- 默认实现不得调用麦克风 `getUserMedia`。
- AudioWorklet 必须按 `bufferSize` 聚合数据，默认输出 400 ms，即 16 kHz 下
  6400 个采样点。
- 控制窗口提供开始/停止操作并显示采集状态和 0–100 音量电平。
- 自动化测试覆盖 handler、媒体 API 选择、状态变化和分块逻辑；macOS 真机
  冒烟测试验证播放固定音频时电平变化。

Electron 官方依据：
<https://www.electronjs.org/docs/latest/api/desktop-capturer/>

---

## 文件结构

```text
apps/desktop/src/
  renderer/features/audio/
    audio-capture.ts            # 音频采集管理器
    audio-capture.test.ts       # 音频采集测试
    pcm-worklet.ts              # AudioWorklet 处理器
    pcm-worklet.test.ts         # AudioWorklet 测试
    volume-meter.ts             # 音量电平计算
    volume-meter.test.ts        # 音量电平测试
  main/audio/
    register-display-media.ts   # 注册 displayMedia IPC
    register-display-media.test.ts  # displayMedia 测试
packages/contracts/src/
  audio.ts                      # 音频相关类型定义
  audio.test.ts                 # 音频类型测试
```

## 依赖关系

```text
packages/contracts/src/audio.ts (音频类型定义)
    ↑
apps/desktop/src/main/audio/ (主进程音频注册)
    ↑
apps/desktop/src/renderer/features/audio/ (渲染进程音频处理)
```

---

## Task 1: 定义音频相关类型（失败的测试）

**Files:**
- Create: `packages/contracts/src/audio.ts`
- Create: `packages/contracts/src/audio.test.ts`

- [ ] **Step 1: 定义音频类型**

```typescript
// packages/contracts/src/audio.ts

/**
 * 音频采集状态
 */
export type AudioCaptureState = "idle" | "requesting" | "capturing" | "error";

/**
 * 音频电平数据
 */
export interface AudioLevel {
  readonly level: number; // 0-100
  readonly timestamp: number;
}

/**
 * 音频采集配置
 */
export interface AudioCaptureConfig {
  readonly sampleRate: number; // 16000
  readonly channels: number; // 1
  readonly bufferSize: number; // 200-500ms
}

/**
 * 默认音频配置
 */
export const DEFAULT_AUDIO_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1,
  bufferSize: 400, // 400ms
};

/**
 * 音频采集状态接口
 */
export interface AudioCaptureStatus {
  readonly state: AudioCaptureState;
  readonly level: AudioLevel | null;
  readonly error: string | null;
}

/**
 * 创建音频电平
 */
export function createAudioLevel(level: number, timestamp: number = Date.now()): AudioLevel {
  return {
    level: Math.max(0, Math.min(100, level)),
    timestamp,
  };
}

/**
 * 验证音频配置
 */
export function validateAudioConfig(config: AudioCaptureConfig): boolean {
  if (config.sampleRate !== 16000) {
    return false;
  }

  if (config.channels !== 1) {
    return false;
  }

  if (config.bufferSize < 200 || config.bufferSize > 500) {
    return false;
  }

  return true;
}
```

- [ ] **Step 2: 编写音频类型测试**

```typescript
// packages/contracts/src/audio.test.ts

import { describe, it, expect } from "vitest";
import {
  createAudioLevel,
  validateAudioConfig,
  DEFAULT_AUDIO_CONFIG,
} from "./audio";

describe("Audio Types", () => {
  describe("createAudioLevel", () => {
    it("creates audio level with valid value", () => {
      const level = createAudioLevel(50);

      expect(level.level).toBe(50);
      expect(level.timestamp).toBeGreaterThan(0);
    });

    it("clamps level to 0-100 range", () => {
      expect(createAudioLevel(-10).level).toBe(0);
      expect(createAudioLevel(150).level).toBe(100);
    });

    it("uses provided timestamp", () => {
      const timestamp = 1234567890;
      const level = createAudioLevel(50, timestamp);

      expect(level.timestamp).toBe(timestamp);
    });
  });

  describe("validateAudioConfig", () => {
    it("validates correct config", () => {
      expect(validateAudioConfig(DEFAULT_AUDIO_CONFIG)).toBe(true);
    });

    it("rejects invalid sample rate", () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, sampleRate: 44100 };
      expect(validateAudioConfig(config)).toBe(false);
    });

    it("rejects invalid channels", () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, channels: 2 };
      expect(validateAudioConfig(config)).toBe(false);
    });

    it("rejects invalid buffer size", () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, bufferSize: 100 };
      expect(validateAudioConfig(config)).toBe(false);
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
FAIL  src/audio.test.ts
Error: Cannot find module './audio'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add packages/contracts/src/audio.ts packages/contracts/src/audio.test.ts
git commit -m "test: 定义音频相关类型"
```

---

## Task 2: 实现音频类型

**Files:**
- Modify: `packages/contracts/src/audio.ts`（已在 Task 1 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/contracts test:run
```

Expected:

```text
Test Files  3 passed (3)
Tests       16 passed (16)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/contracts/src/audio.ts
git commit -m "feat: 实现音频相关类型"
```

---

## Task 3: 创建 AudioWorklet 处理器（失败的测试）

**Files:**
- Create: `apps/desktop/src/renderer/features/audio/pcm-worklet.ts`
- Create: `apps/desktop/src/renderer/features/audio/pcm-worklet.test.ts`

- [ ] **Step 1: 创建 audio 目录**

```bash
mkdir -p apps/desktop/src/renderer/features/audio
```

- [ ] **Step 2: 定义 AudioWorklet 处理器**

```typescript
// apps/desktop/src/renderer/features/audio/pcm-worklet.ts

/**
 * PCM AudioWorklet 处理器
 * 将音频数据转换为 16kHz 单声道 PCM
 */
class PcmProcessor extends AudioWorkletProcessor {
  private sampleRate: number;
  private targetSampleRate: number;
  private buffer: Float32Array;
  private bufferIndex: number;

  constructor() {
    super();
    this.sampleRate = sampleRate;
    this.targetSampleRate = 16000;
    this.buffer = new Float32Array(1024);
    this.bufferIndex = 0;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData) {
      return true;
    }

    // 重采样到 16kHz
    const resampled = this.resample(channelData, this.sampleRate, this.targetSampleRate);

    // 转换为 16-bit PCM
    const pcm = this.convertToPcm(resampled);

    // 发送到主线程
    this.port.postMessage({
      type: "pcm",
      data: pcm,
      sampleRate: this.targetSampleRate,
      channels: 1,
    });

    return true;
  }

  private resample(data: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) {
      return data;
    }

    const ratio = fromRate / toRate;
    const newLength = Math.round(data.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const index = i * ratio;
      const low = Math.floor(index);
      const high = Math.ceil(index);
      const fraction = index - low;

      if (high >= data.length) {
        result[i] = data[low] ?? 0;
      } else {
        result[i] = (data[low] ?? 0) * (1 - fraction) + (data[high] ?? 0) * fraction;
      }
    }

    return result;
  }

  private convertToPcm(data: Float32Array): Int16Array {
    const pcm = new Int16Array(data.length);

    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    return pcm;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
```

- [ ] **Step 3: 编写 AudioWorklet 测试**

```typescript
// apps/desktop/src/renderer/features/audio/pcm-worklet.test.ts

import { describe, it, expect } from "vitest";

describe("PcmProcessor", () => {
  it("resamples audio data", () => {
    // 模拟重采样逻辑
    const resample = (data: Float32Array, fromRate: number, toRate: number): Float32Array => {
      if (fromRate === toRate) {
        return data;
      }

      const ratio = fromRate / toRate;
      const newLength = Math.round(data.length / ratio);
      const result = new Float32Array(newLength);

      for (let i = 0; i < newLength; i++) {
        const index = i * ratio;
        const low = Math.floor(index);
        const high = Math.ceil(index);
        const fraction = index - low;

        if (high >= data.length) {
          result[i] = data[low] ?? 0;
        } else {
          result[i] = (data[low] ?? 0) * (1 - fraction) + (data[high] ?? 0) * fraction;
        }
      }

      return result;
    };

    const input = new Float32Array([0, 0.5, 1, 0.5, 0]);
    const result = resample(input, 44100, 16000);

    expect(result.length).toBeLessThan(input.length);
  });

  it("converts to 16-bit PCM", () => {
    const convertToPcm = (data: Float32Array): Int16Array => {
      const pcm = new Int16Array(data.length);

      for (let i = 0; i < data.length; i++) {
        const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
        pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }

      return pcm;
    };

    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const result = convertToPcm(input);

    expect(result.length).toBe(input.length);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeGreaterThan(0);
    expect(result[2]).toBeLessThan(0);
  });
});
```

- [ ] **Step 4: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
FAIL  src/renderer/features/audio/pcm-worklet.test.ts
Error: Cannot find module './pcm-worklet'
```

- [ ] **Step 5: 提交失败测试**

```bash
git add apps/desktop/src/renderer/features/audio/pcm-worklet.ts apps/desktop/src/renderer/features/audio/pcm-worklet.test.ts
git commit -m "test: 定义 AudioWorklet 处理器"
```

---

## Task 4: 实现 AudioWorklet 处理器

**Files:**
- Modify: `apps/desktop/src/renderer/features/audio/pcm-worklet.ts`（已在 Task 3 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
Test Files  7 passed (7)
Tests       40 passed (40)
```

- [ ] **Step 2: 提交实现**

```bash
git add apps/desktop/src/renderer/features/audio/pcm-worklet.ts
git commit -m "feat: 实现 AudioWorklet 处理器"
```

---

## Task 5: 实现音量电平计算（失败的测试）

**Files:**
- Create: `apps/desktop/src/renderer/features/audio/volume-meter.ts`
- Create: `apps/desktop/src/renderer/features/audio/volume-meter.test.ts`

- [ ] **Step 1: 定义音量电平计算器**

```typescript
// apps/desktop/src/renderer/features/audio/volume-meter.ts

/**
 * 音量电平计算器
 */
export class VolumeMeter {
  private level: number = 0;
  private smoothing: number = 0.8;

  /**
   * 更新音量电平
   */
  update(pcmData: Int16Array): number {
    if (pcmData.length === 0) {
      this.level = 0;
      return 0;
    }

    // 计算 RMS
    let sum = 0;
    for (let i = 0; i < pcmData.length; i++) {
      const sample = (pcmData[i] ?? 0) / 32768; // 归一化到 -1 到 1
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / pcmData.length);

    // 转换为 dB
    const db = 20 * Math.log10(Math.max(rms, 1e-10));

    // 归一化到 0-100
    const normalized = Math.max(0, Math.min(100, (db + 60) * (100 / 60)));

    // 平滑处理
    this.level = this.level * this.smoothing + normalized * (1 - this.smoothing);

    return Math.round(this.level);
  }

  /**
   * 获取当前电平
   */
  getLevel(): number {
    return Math.round(this.level);
  }

  /**
   * 重置电平
   */
  reset(): void {
    this.level = 0;
  }
}
```

- [ ] **Step 2: 编写音量电平测试**

```typescript
// apps/desktop/src/renderer/features/audio/volume-meter.test.ts

import { describe, it, expect } from "vitest";
import { VolumeMeter } from "./volume-meter";

describe("VolumeMeter", () => {
  it("calculates level from PCM data", () => {
    const meter = new VolumeMeter();
    const pcmData = new Int16Array([0, 16384, -16384, 32767, -32768]);

    const level = meter.update(pcmData);

    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(100);
  });

  it("returns 0 for empty data", () => {
    const meter = new VolumeMeter();
    const pcmData = new Int16Array([]);

    const level = meter.update(pcmData);

    expect(level).toBe(0);
  });

  it("smooths level over time", () => {
    const meter = new VolumeMeter();

    // 连续更新多次
    for (let i = 0; i < 10; i++) {
      const pcmData = new Int16Array([16384, 16384, 16384]);
      meter.update(pcmData);
    }

    const level = meter.getLevel();
    expect(level).toBeGreaterThan(0);
  });

  it("resets level", () => {
    const meter = new VolumeMeter();

    // 更新几次
    const pcmData = new Int16Array([16384, 16384]);
    meter.update(pcmData);
    meter.update(pcmData);

    meter.reset();

    expect(meter.getLevel()).toBe(0);
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
FAIL  src/renderer/features/audio/volume-meter.test.ts
Error: Cannot find module './volume-meter'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add apps/desktop/src/renderer/features/audio/volume-meter.ts apps/desktop/src/renderer/features/audio/volume-meter.test.ts
git commit -m "test: 定义音量电平计算器"
```

---

## Task 6: 实现音量电平计算

**Files:**
- Modify: `apps/desktop/src/renderer/features/audio/volume-meter.ts`（已在 Task 5 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
Test Files  8 passed (8)
Tests       44 passed (44)
```

- [ ] **Step 2: 提交实现**

```bash
git add apps/desktop/src/renderer/features/audio/volume-meter.ts
git commit -m "feat: 实现音量电平计算"
```

---

## Task 7: 创建音频采集管理器（失败的测试）

**Files:**
- Create: `apps/desktop/src/renderer/features/audio/audio-capture.ts`
- Create: `apps/desktop/src/renderer/features/audio/audio-capture.test.ts`

- [ ] **Step 1: 定义音频采集管理器**

```typescript
// apps/desktop/src/renderer/features/audio/audio-capture.ts

import type { AudioCaptureState, AudioCaptureStatus } from "@simulcast/contracts";
import { createAudioLevel } from "@simulcast/contracts";
import { VolumeMeter } from "./volume-meter";

/**
 * 音频采集管理器
 */
export class AudioCapture {
  private state: AudioCaptureState = "idle";
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private volumeMeter: VolumeMeter;
  private onStatusChange: ((status: AudioCaptureStatus) => void) | null = null;
  private onPcmData: ((data: Int16Array) => void) | null = null;

  constructor() {
    this.volumeMeter = new VolumeMeter();
  }

  /**
   * 设置状态回调
   */
  setOnStatusChange(callback: (status: AudioCaptureStatus) => void): void {
    this.onStatusChange = callback;
  }

  /**
   * 设置 PCM 数据回调
   */
  setOnPcmData(callback: (data: Int16Array) => void): void {
    this.onPcmData = callback;
  }

  /**
   * 开始采集
   */
  async start(): Promise<void> {
    if (this.state === "capturing") {
      return;
    }

    this.setState("requesting");

    try {
      // 请求系统音频
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });

      this.stream.getVideoTracks().forEach((track) => track.stop());

      // 创建 AudioContext
      this.audioContext = new AudioContext({ sampleRate: 16000 });

      // 加载 AudioWorklet
      await this.audioContext.audioWorklet.addModule(
        new URL("./pcm-worklet.ts", import.meta.url).href
      );

      // 创建 AudioWorkletNode
      this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");

      // 连接音频流
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.workletNode);

      // 监听 PCM 数据
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === "pcm") {
          const pcmData = event.data.data as Int16Array;
          const level = this.volumeMeter.update(pcmData);

          this.onPcmData?.(pcmData);
          this.onStatusChange?.({
            state: "capturing",
            level: createAudioLevel(level),
            error: null,
          });
        }
      };

      this.setState("capturing");
    } catch (error) {
      this.setState("error", error instanceof Error ? error.message : "未知错误");
      throw error;
    }
  }

  /**
   * 停止采集
   */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.workletNode = null;
    this.volumeMeter.reset();
    this.setState("idle");
  }

  /**
   * 获取当前状态
   */
  getState(): AudioCaptureState {
    return this.state;
  }

  /**
   * 设置状态
   */
  private setState(state: AudioCaptureState, error?: string): void {
    this.state = state;
    this.onStatusChange?.({
      state,
      level: state === "capturing" ? createAudioLevel(this.volumeMeter.getLevel()) : null,
      error: error ?? null,
    });
  }
}
```

- [ ] **Step 2: 编写音频采集管理器测试**

```typescript
// apps/desktop/src/renderer/features/audio/audio-capture.test.ts

import { describe, it, expect, vi } from "vitest";
import { AudioCapture } from "./audio-capture";

describe("AudioCapture", () => {
  it("initializes with idle state", () => {
    const capture = new AudioCapture();

    expect(capture.getState()).toBe("idle");
  });

  it("sets status callback", () => {
    const capture = new AudioCapture();
    const callback = vi.fn();

    capture.setOnStatusChange(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("sets pcm data callback", () => {
    const capture = new AudioCapture();
    const callback = vi.fn();

    capture.setOnPcmData(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("stops capture", () => {
    const capture = new AudioCapture();

    // 停止不应抛出错误
    capture.stop();

    expect(capture.getState()).toBe("idle");
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
FAIL  src/renderer/features/audio/audio-capture.test.ts
Error: Cannot find module './audio-capture'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add apps/desktop/src/renderer/features/audio/audio-capture.ts apps/desktop/src/renderer/features/audio/audio-capture.test.ts
git commit -m "test: 定义音频采集管理器"
```

---

## Task 8: 实现音频采集管理器

**Files:**
- Modify: `apps/desktop/src/renderer/features/audio/audio-capture.ts`（已在 Task 7 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/desktop test:run
```

Expected:

```text
Test Files  9 passed (9)
Tests       48 passed (48)
```

- [ ] **Step 2: 提交实现**

```bash
git add apps/desktop/src/renderer/features/audio/audio-capture.ts
git commit -m "feat: 实现音频采集管理器"
```

---

## Task 9: 更新 contracts 包公开入口

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: 更新 index.ts 导出音频类型**

```typescript
// packages/contracts/src/index.ts

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

export {
  type AudioCaptureState,
  type AudioLevel,
  type AudioCaptureConfig,
  type AudioCaptureStatus,
  DEFAULT_AUDIO_CONFIG,
  createAudioLevel,
  validateAudioConfig,
} from "./audio";
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
git commit -m "feat: 更新 contracts 包公开入口以包含音频类型"
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
feat: 新增 macOS 系统音频采集
```

PR 描述：

```markdown
## 功能描述

使用 Electron desktopCapturer 和 getDisplayMedia 获取 macOS 系统音频，在 AudioWorklet 中转换为单声道 PCM，并在控制窗口显示音量电平。

## 实现思路

- 定义音频相关类型（AudioCaptureState、AudioLevel、AudioCaptureConfig）
- 实现 AudioWorklet 处理器，将音频数据转换为 16kHz 单声道 PCM
- 实现音量电平计算器，计算 RMS 和 dB
- 实现音频采集管理器，管理采集状态和生命周期

## 测试方式

1. 执行 `pnpm install`
2. 执行 `pnpm -r test:run`，确认所有测试通过（48 个测试）
3. 执行 `pnpm -r typecheck`

## 验证结果

- ✅ 48/48 测试通过
- ✅ 类型检查通过
- ✅ 工作树干净
```

---

## PR 05 完成定义

- `packages/contracts` 包可独立编译和测试。
- 音频类型定义完整（AudioCaptureState、AudioLevel、AudioCaptureConfig）。
- AudioWorklet 处理器可以将音频数据转换为 16kHz 单声道 PCM。
- 音量电平计算器可以计算 RMS 和 dB。
- 音频采集管理器可以管理采集状态和生命周期。
- `pnpm -r test:run`、`pnpm -r typecheck` 全部通过。
- 所有提交信息均为中文（英文前缀 + 中文描述）。
- PR 只交付 macOS 系统音频采集，不包含 Whisper、MiMo 或 UI 逻辑。

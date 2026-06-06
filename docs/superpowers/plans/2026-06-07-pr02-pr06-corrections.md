# PR 02–06 Corrective PRs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过七个单一职责修复 PR，使 PR 02–06 的实现满足设计文档、各自完成定义和可复现演示要求。

**Architecture:** 修复保持现有 contracts、domain、infrastructure、Electron Main/Renderer 和 Python Worker 边界不变。每个 PR 只修复一个可独立验证的行为，使用测试先行，后续 PR 基于前一个修复 PR 顺序推进。

**Tech Stack:** TypeScript 6、Electron 42、React 19、Vitest 4、Python 3.12、pytest、pnpm 11、uv

---

## 修复 PR 顺序

| 顺序 | 分支建议 | 标题 | 独立验收 |
|---|---|---|---|
| FIX 01 | `codex/fix-ipc-request-envelope` | `fix: 为应用状态 IPC 补充协议请求` | preload 发送合法 request，handler 返回状态 |
| FIX 02 | `codex/fix-subtitle-lock-semantics` | `fix: 保证锁定字幕不可修改并推进时间线版本` | locked 不可逆，锁定增加 revision |
| FIX 03 | `codex/fix-revision-upsert-version` | `fix: 阻止过期 upsert 覆盖新版字幕` | stale upsert 被拒绝 |
| FIX 04 | `codex/fix-system-audio-capture` | `fix: 接通 macOS 系统音频采集与电平展示` | loopback 捕获可由控制窗启动并显示电平 |
| FIX 05 | `codex/fix-pcm-chunking` | `fix: 按 400 毫秒聚合 PCM 音频块` | 每块默认 6400 个 16 kHz 样本 |
| FIX 06 | `codex/fix-worker-line-framing` | `fix: 可靠解析 Worker 逐行 JSON 输出` | 跨 chunk 和多行 chunk 都正确 |
| FIX 07 | `codex/fix-worker-message-validation` | `fix: 校验 Worker 消息并保留错误会话` | 非法消息结构化报错，处理错误可路由 |

## FIX 01：IPC 请求封装

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/api.test.ts`

- [ ] 先增加测试，模拟 `ipcRenderer.invoke`，断言调用参数包含
  `PROTOCOL_VERSION` 和非负时间戳。
- [ ] 运行 `pnpm --filter @simulcast/desktop test:run`，确认测试因缺少 request 失败。
- [ ] 在 preload 中构造 `IpcMessage` 并作为第二个参数传给 `invoke`。
- [ ] 运行桌面测试、类型检查和构建。
- [ ] 使用英文类型前缀和中文描述提交。

## FIX 02：字幕锁定语义

**Files:**
- Modify: `packages/domain/src/subtitle/timeline.ts`
- Modify: `packages/domain/src/subtitle/timeline.test.ts`

- [ ] 增加 locked 不能恢复、不能修改原文/译文、自动锁定增加 revision、
  返回对象已经 locked 的失败测试。
- [ ] 运行 domain 测试并确认新增断言失败。
- [ ] 在 `SubtitleTimeline` 边界拒绝 locked 修改，通过 `updateState` 完成自动锁定。
- [ ] 运行 domain 测试和类型检查。
- [ ] 使用英文类型前缀和中文描述提交。

## FIX 03：修订操作版本校验

**Files:**
- Modify: `packages/domain/src/revision/revision-engine.ts`
- Modify: `packages/domain/src/revision/revision-engine.test.ts`

- [ ] 增加 translationVersion 已为 1 时，`expectedVersion: 0` 的 upsert 被拒绝测试。
- [ ] 运行测试并确认旧 upsert 当前会错误通过。
- [ ] 对所有操作统一执行 expectedVersion 检查。
- [ ] 运行 domain 全量测试和类型检查。
- [ ] 使用英文类型前缀和中文描述提交。

## FIX 04：macOS 系统音频与电平展示

**Files:**
- Create: `apps/desktop/src/main/audio/register-display-media.ts`
- Create: `apps/desktop/src/main/audio/register-display-media.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/renderer/features/audio/audio-capture.ts`
- Modify: `apps/desktop/src/renderer/features/audio/audio-capture.test.ts`
- Modify: `apps/desktop/src/renderer/src/app/app.tsx`
- Modify: `apps/desktop/src/renderer/src/app/app.test.tsx`
- Modify: `apps/desktop/src/renderer/src/app/styles.css`

- [ ] 测试 Main handler 返回屏幕源和 `audio: "loopback"`。
- [ ] 测试 AudioCapture 使用 `getDisplayMedia` 而不是麦克风 API。
- [ ] 测试控制窗可开始、停止并渲染采集状态和音量电平。
- [ ] 实现 Main handler、Renderer 捕获和控制窗接入。
- [ ] 运行桌面测试、类型检查、构建和 macOS 人工冒烟测试。
- [ ] 使用英文类型前缀和中文描述提交。

## FIX 05：PCM 分块

**Files:**
- Create: `apps/desktop/src/renderer/features/audio/pcm-chunker.ts`
- Create: `apps/desktop/src/renderer/features/audio/pcm-chunker.test.ts`
- Modify: `apps/desktop/src/renderer/features/audio/pcm-worklet.ts`

- [ ] 为 16 kHz、400 ms 配置编写 6400 样本才输出的失败测试。
- [ ] 实现可独立测试的固定容量 PCM 聚合器。
- [ ] 在 AudioWorklet 中重采样后写入聚合器，只发送完整数据块。
- [ ] 运行桌面测试、类型检查和构建。
- [ ] 使用英文类型前缀和中文描述提交。

## FIX 06：Worker 行分帧

**Files:**
- Modify: `packages/infrastructure/src/asr/whisper-worker-adapter.ts`
- Modify: `packages/infrastructure/src/asr/whisper-worker-adapter.test.ts`

- [ ] 使用可注入进程或公开的 chunk 消费边界，测试半条 JSON 不触发解析错误。
- [ ] 测试后续 chunk 补全后只发出一次 result。
- [ ] 测试单 chunk 两行消息依次发出。
- [ ] 实现持久 stdout 缓冲区并在停止时清空。
- [ ] 运行 infrastructure 测试和类型检查。
- [ ] 使用英文类型前缀和中文描述提交。

## FIX 07：Worker 消息校验

**Files:**
- Modify: `workers/asr/src/asr_worker/protocol.py`
- Modify: `workers/asr/src/asr_worker/main.py`
- Modify: `workers/asr/src/asr_worker/test_protocol.py`
- Modify: `workers/asr/src/asr_worker/test_main.py`

- [ ] 测试数组 JSON、缺少必需字段、错误字段类型返回 `ValueError`。
- [ ] 测试引擎处理失败时 error 保留输入 `session_id`。
- [ ] 实现显式字段和类型校验，将边界异常统一为 `ValueError`。
- [ ] 运行 `uv run --project workers/asr pytest -q`。
- [ ] 使用英文类型前缀和中文描述提交。

## 全量门禁

每个 PR 至少执行自身相关测试。FIX 07 完成后执行：

```bash
pnpm test:run
pnpm typecheck
pnpm build
uv sync --project workers/asr --extra dev --frozen
uv run --project workers/asr pytest -q
git diff --check
```

预期全部通过，且主分支静态演示或当前已完成演示能力仍可启动。

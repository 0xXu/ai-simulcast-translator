# AI 同声传译助手实施路线图

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过一组单功能 PR，将空仓库逐步交付为可捕获 macOS 系统音频、使用 faster-whisper 识别、使用 MiMo 翻译并回溯修订字幕的 Electron 桌面应用。

**Architecture:** 前端使用 Electron Renderer + React，本地后端使用 Electron Main + TypeScript，ASR 使用独立 Python Worker。业务规则集中在 Domain/Application，外部模型、音频、存储和 IPC 通过适配器接入；每个 PR 合并后主分支都保持可运行和可演示。

**Tech Stack:** Electron 42、React 19、TypeScript 6、electron-vite 5、Vitest 4、Playwright 1.60、Python 3.12、faster-whisper、MiMo OpenAI-compatible Chat Completions API、pnpm 11。

---

## 1. 计划拆分原则

完整规格包含桌面壳、音频、ASR、模型翻译、字幕领域模型、语义回溯、UI、容错和打包等独立子系统。为遵守“每个 PR 只做一件事”，不使用一个超大计划一次实现全部功能，而是按下列 PR 顺序推进。

每个 PR 必须满足：

- 只实现标题所描述的单一能力。
- 提交信息使用英文类型前缀和中文描述，例如
  `fix: 修订窗口测试使用相对时间避免时间窗口判断失败`。
- 包含自动化测试或可重复的人工验证步骤。
- 合并后 `pnpm test`、`pnpm typecheck`、`pnpm build` 仍通过。
- 主分支可以启动；未接通的外部能力使用 Mock 或明确降级。
- README 只记录已经验证可执行的命令。

### 1.1 PR 01–06 审查后的修正顺序

在继续叠加后续功能前，先通过以下小型 PR 修复已发现的契约和实现问题：

| 修复 PR | 单一功能 | 验收结果 |
|---|---|---|
| FIX 01 | 修复 `app.status` IPC 请求封装 | preload 发送合法协议消息，真实 handler 调用成功 |
| FIX 02 | 强化字幕 locked 状态与时间线 revision | locked 不可恢复或修改，自动锁定增加 revision |
| FIX 03 | 对所有字幕修订操作执行版本校验 | 过期 `upsert` 和 `replace` 均不能覆盖新译文 |
| FIX 04 | 接通 macOS 系统音频和控制窗口电平 | 使用 `getDisplayMedia` 捕获 loopback 音频并显示电平 |
| FIX 05 | 将 PCM 聚合为 200–500 ms 数据块 | 默认每 400 ms 输出一个 16 kHz 单声道 PCM 块 |
| FIX 06 | 修复 Worker stdout 逐行 JSON 分帧 | JSON 跨 chunk 或同 chunk 多行时都能正确解析 |
| FIX 07 | 强化 Worker 消息校验和错误会话路由 | 非法字段返回 `INVALID_MESSAGE`，处理错误保留 sessionId |

这些 PR 必须按表格顺序独立提交和验证。Worker 打包路径、内置 Python
运行时和根 CI 聚合仍归 PR 14，不混入协议修复 PR。

## 2. PR 顺序总览

| PR | 单一功能 | 依赖 | 合并后的可演示状态 |
|---|---|---|---|
| 01 | Electron + React 静态演示壳 | 无 | 可启动控制窗和悬浮字幕窗 |
| 02 | 类型安全 IPC 契约 | PR 01 | 控制窗可通过 preload 查询应用状态 |
| 03 | 字幕时间线领域模型 | PR 02 | Mock 字幕具有 live/revisable/locked 状态 |
| 04 | 版本化字幕修订引擎 | PR 03 | 可演示旧响应被拒绝和字幕原位替换 |
| 05 | macOS 系统音频采集 | PR 02 | 可使用 loopback 音频并显示系统音频输入电平 |
| 06 | Python ASR Worker 协议 | PR 02 | Mock Worker 可流式返回带时间戳原文 |
| 07 | faster-whisper 识别引擎 | PR 06 | 固定英语 WAV 可通过 Worker 得到真实英文结果 |
| 08 | 桌面音频到 ASR 的会话链路 | PR 05、06、07 | 播放英文音频时显示实时原文 |
| 09 | 增量原文稳定与分段 | PR 08 | 原文不重复，稳定段和活动尾部可区分 |
| 10 | MiMo 文本翻译客户端 | PR 02 | 输入英文可显示 MiMo 中文翻译 |
| 11 | 上下文翻译调度器 | PR 03、09、10 | 最近 5 句或 20 秒随请求发送 |
| 12 | Semantic Rewind | PR 04、11 | 后文可修正最近字幕并高亮 |
| 13 | 设置、安全和异常降级 | PR 05、08、10、12 | 断网或模型失败时继续显示英文 |
| 14 | CI、打包和演示验收 | PR 13 | 新环境可构建，评委可复现完整演示 |

## 3. 各 PR 交付定义

### PR 01：创建可运行的 Electron + React 静态演示壳

**功能描述：** 创建 pnpm workspace、Electron 主进程、受限 preload、React 控制窗口和透明字幕窗口。字幕数据暂用固定演示内容。

**范围：**

- 创建应用骨架和基础脚本。
- 创建控制窗口与悬浮字幕窗口。
- 创建静态演示数据。
- 添加组件测试、类型检查和构建验证。
- 更新 README 为真实可执行命令。

**不包含：** IPC 业务契约、音频、ASR、MiMo、字幕状态机。

**提交信息：**

```bash
git commit -m "feat: 创建可运行的桌面应用骨架"
```

**详细计划：**

`docs/superpowers/plans/2026-06-06-pr01-electron-react-shell.md`

### PR 02：新增类型安全 IPC 契约

**功能描述：** 在 `packages/contracts` 定义命令、事件、协议版本和运行时 Schema，通过 preload 白名单暴露调用。

**主要文件：**

- `packages/contracts/src/ipc.ts`
- `packages/contracts/src/schemas.ts`
- `apps/desktop/src/preload/api.ts`
- `apps/desktop/src/main/ipc/register-app-status.ts`

**测试重点：**

- 非法协议版本被拒绝。
- Renderer 无法访问任意 `ipcRenderer`。
- `app.status` 查询返回可序列化数据。

**提交信息：**

```bash
git commit -m "feat: 新增类型安全的进程通信契约"
```

### PR 03：新增字幕时间线领域模型

**功能描述：** 实现 `SubtitleSegment`、`SubtitleTimeline` 和修订窗口，维护 `live`、`revisable`、`locked` 生命周期。

**主要文件：**

- `packages/domain/src/subtitle/segment.ts`
- `packages/domain/src/subtitle/timeline.ts`
- `packages/domain/src/subtitle/revision-window.ts`
- `packages/domain/src/subtitle/*.test.ts`

**测试重点：**

- 超过最近 5 句的片段锁定。
- 结束超过 20 秒的片段锁定。
- 满足任一边界即锁定。
- 锁定片段不能恢复为可修订状态。

**提交信息：**

```bash
git commit -m "feat: 新增字幕时间线与修订窗口"
```

### PR 04：新增版本化字幕修订引擎

**功能描述：** 解析结构化 `upsert` 和 `replace` 操作，通过 `sessionId`、`baseRevision` 和 `expectedVersion` 阻止旧响应覆盖新字幕。

**主要文件：**

- `packages/domain/src/revision/operation.ts`
- `packages/domain/src/revision/revision-engine.ts`
- `packages/domain/src/revision/revision-engine.test.ts`

**测试重点：**

- 正确版本可以替换字幕。
- 错误版本、错误会话和锁定字幕被拒绝。
- 应用成功后时间线和字幕版本递增。

**提交信息：**

```bash
git commit -m "feat: 新增版本化字幕修订引擎"
```

### PR 05：新增 macOS 系统音频采集

**功能描述：** 使用 Electron `desktopCapturer` 和 `getDisplayMedia` 获取系统音频，在 AudioWorklet 中转换为单声道 PCM，并在控制窗口显示电平。

**技术约束：**

- 首版支持 macOS 13 及以上。
- macOS 14.2 及以上配置 `NSAudioCaptureUsageDescription`。
- Electron 使用系统提供的 CoreAudio Tap 捕获能力。
- macOS 12 及以下显示“不支持直接采集”，文档提供 BlackHole 降级方案。
- 捕获层只输出 PCM 和状态，不直接依赖 Whisper。
- 禁止使用普通麦克风 `getUserMedia({ audio: true })` 冒充系统音频。
- `bufferSize` 的单位为毫秒，默认 400 ms；AudioWorklet 不得按每个 render quantum 直接发送消息。

**主要文件：**

- `apps/desktop/src/main/audio/register-display-media.ts`
- `apps/desktop/src/renderer/features/audio/audio-capture.ts`
- `apps/desktop/src/renderer/features/audio/pcm-worklet.ts`
- `packages/contracts/src/audio.ts`

**测试重点：**

- PCM 转换和电平计算单元测试。
- 无权限、静音流和停止采集状态。
- macOS 真机播放固定音频的人工冒烟测试。

**提交信息：**

```bash
git commit -m "feat: 新增 macOS 系统音频采集"
```

### PR 06：新增 Python ASR Worker 协议

**功能描述：** 创建独立 Python 进程，通过逐行 JSON 协议接收 base64 PCM，返回带会话、序号和时间戳的原文事件。首个 PR 使用确定性 Mock 引擎。

**主要文件：**

- `workers/asr/pyproject.toml`
- `workers/asr/src/asr_worker/protocol.py`
- `workers/asr/src/asr_worker/main.py`
- `workers/asr/tests/test_protocol.py`
- `packages/infrastructure/src/asr/whisper-worker-adapter.ts`

**测试重点：**

- 非法消息返回结构化错误。
- 输入序号保持顺序。
- Worker 崩溃时 TypeScript 适配器发出可恢复错误。

**提交信息：**

```bash
git commit -m "feat: 新增语音识别 Worker 通信协议"
```

### PR 07：接入 faster-whisper

**功能描述：** 在 Python Worker 中实现 `FasterWhisperEngine`，接收 PCM 环形缓冲并按配置模型输出识别片段。

**主要文件：**

- `workers/asr/src/asr_worker/engine.py`
- `workers/asr/src/asr_worker/faster_whisper_engine.py`
- `workers/asr/src/asr_worker/audio_buffer.py`
- `workers/asr/tests/test_audio_buffer.py`
- `workers/asr/tests/test_faster_whisper_engine.py`

**测试重点：**

- 模型加载失败返回明确错误。
- 固定 WAV 样本得到非空英文结果。
- Mock 引擎仍可用于 CI，CI 不下载大模型。

**提交信息：**

```bash
git commit -m "feat: 接入 faster-whisper PCM 识别引擎"
```

### PR 08：接通桌面音频到 ASR 的会话链路

**功能描述：** 将 Renderer 输出的 400 ms PCM 数据块通过受限 preload 发送到
Electron Main，由 Main 管理 Worker 会话、选择真实识别引擎，并把原文事件转发到
Renderer 展示。

**主要文件：**

- `packages/contracts/src/asr.ts`
- `apps/desktop/src/preload/api.ts`
- `apps/desktop/src/main/asr/register-asr-handlers.ts`
- `apps/desktop/src/renderer/features/audio/audio-capture.ts`
- `packages/infrastructure/src/asr/whisper-worker-adapter.ts`

**测试重点：**

- Renderer 只能通过白名单 API 发送 PCM。
- 同一会话的音频序号单调递增。
- Main 启动真实 Worker 时显式传入引擎参数。
- Worker 原文事件按 `sessionId` 回到当前会话。
- Worker 未就绪或退出时 UI 显示可恢复错误。

**提交信息：**

```bash
git commit -m "feat: 接通桌面音频到 ASR 会话链路"
```

### PR 09：新增增量原文稳定与分段

**功能描述：** 合并 4 至 6 秒重叠识别窗口，去除重复前缀，将输出分为稳定前缀和活动尾部，并生成稳定 `segmentId`。

**主要文件：**

- `packages/application/src/transcript/transcript-stabilizer.ts`
- `packages/application/src/transcript/segment-manager.ts`
- `packages/application/src/transcript/*.test.ts`

**测试重点：**

- 重叠窗口不产生重复词。
- Whisper 修正尾部时更新原段而非新增重复段。
- 停顿和句末生成新段。

**提交信息：**

```bash
git commit -m "feat: 新增增量原文稳定与分段"
```

### PR 10：新增 MiMo 文本翻译客户端

**功能描述：** 实现 `TranslatorPort` 的 MiMo 适配器，调用 OpenAI-compatible `/chat/completions`，校验结构化 JSON，并提供可注入 Mock。

**主要文件：**

- `packages/application/src/ports/translator-port.ts`
- `packages/infrastructure/src/mimo/mimo-client.ts`
- `packages/infrastructure/src/mimo/response-schema.ts`
- `packages/infrastructure/src/mimo/mimo-client.test.ts`

**技术约束：**

- 不使用工具调用。
- 每次请求自包含上下文，不发送工具历史。
- API Key 只存在于 Electron Main。
- 非法 JSON 最多重试一次。

**提交信息：**

```bash
git commit -m "feat: 新增 MiMo 文本翻译客户端"
```

### PR 11：新增上下文翻译调度器

**功能描述：** 组合最近 5 句或 20 秒上下文，合并高频输入，同一时刻只运行一个请求并保留一个待处理快照。

**主要文件：**

- `packages/application/src/translation/context-builder.ts`
- `packages/application/src/translation/translation-scheduler.ts`
- `packages/application/src/translation/request-hash.ts`
- `packages/application/src/translation/*.test.ts`

**测试重点：**

- 窗口使用“5 句或 20 秒任一超限即排除”。
- 相同输入哈希不重复请求。
- 请求期间的新文本合并为一个后续请求。
- 超时不阻塞 ASR 事件。

**提交信息：**

```bash
git commit -m "feat: 新增上下文翻译调度器"
```

### PR 12：新增 Semantic Rewind

**功能描述：** 将 MiMo 修订操作接入字幕时间线，在悬浮窗原位替换最近字幕，并对变化文本显示 500 至 800 ms 高亮。

**主要文件：**

- `packages/application/src/revision/apply-translation-response.ts`
- `apps/desktop/src/renderer/entities/subtitle/subtitle-store.ts`
- `apps/desktop/src/renderer/features/subtitles/subtitle-line.tsx`
- `apps/desktop/src/renderer/features/subtitles/subtitle-line.test.tsx`

**测试重点：**

- 后文修订指定 `segmentId`。
- 旧响应不覆盖新版本。
- 锁定字幕不变化。
- 高亮结束后保留修订后的文本。

**提交信息：**

```bash
git commit -m "feat: 新增字幕语义回溯与修订高亮"
```

### PR 13：新增设置、安全和异常降级

**功能描述：** 提供 MiMo 配置、Keychain 密钥保存、运行状态和降级策略。MiMo 故障时继续显示英文原文，Worker 故障时提供重启。

**主要文件：**

- `packages/application/src/settings/settings-service.ts`
- `packages/infrastructure/src/settings/secure-settings-adapter.ts`
- `apps/desktop/src/renderer/features/settings/settings-form.tsx`
- `apps/desktop/src/renderer/features/runtime/runtime-status.tsx`

**测试重点：**

- Renderer 永远收不到 API Key。
- MiMo 超时后原文链路继续。
- Worker 异常状态可见并可重新启动。
- 日志对密钥和字幕正文脱敏。

**提交信息：**

```bash
git commit -m "feat: 新增安全设置与运行异常降级"
```

### PR 14：新增 CI、打包和演示验收

**功能描述：** 建立 GitHub Actions、macOS 构建、Playwright Electron 冒烟测试和固定演示脚本，保证任意提交可复现当前效果。

**主要文件：**

- `.github/workflows/ci.yml`
- `apps/desktop/e2e/app.spec.ts`
- `scripts/verify-demo.mjs`
- `docs/demo.md`
- `README.md`

**测试重点：**

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
- Python `ruff check`、`mypy` 和 `pytest`

**提交信息：**

```bash
git commit -m "chore: 新增持续集成与演示验收流程"
```

## 4. 分支与 PR 规范

每个 PR 从最新 `main` 创建独立分支：

```bash
git switch main
git pull --ff-only
git switch -c 功能/pr01-桌面应用骨架
```

如果远端或平台不接受中文分支名，则使用：

```bash
git switch -c feat/pr01-desktop-shell
```

PR 标题与提交信息均使用“英文类型前缀 + 中文描述”，例如：

```text
feat: 创建可运行的 Electron 与 React 桌面应用骨架
```

允许的常用类型包括 `feat`、`fix`、`test`、`docs`、`refactor`、
`build`、`ci` 和 `chore`。类型后使用半角冒号和一个空格，描述使用中文。

PR 描述固定包含：

```markdown
## 功能描述

## 实现思路

## 测试方式

## 风险与限制
```

## 5. 合并策略

- PR 采用 squash merge 时，squash 提交信息也必须使用英文类型前缀和中文描述。
- 不允许跳过依赖 PR 直接合并后续功能。
- 真实 MiMo、Whisper 或系统音频不可用时，Mock 演示必须仍可启动。
- 每次合并后打一个可选的演示标签，例如 `demo-pr01`。
- 发现主分支无法启动时，优先修复主分支，不继续叠加新功能。

## 6. 技术决策记录

### 系统音频

首选 Electron `desktopCapturer` + `getDisplayMedia`。Electron 官方文档说明 macOS 13 及以上可使用系统提供的音频捕获能力；macOS 14.2 及以上必须配置 `NSAudioCaptureUsageDescription`，否则可能得到无声轨道。macOS 12 及以下使用 BlackHole 等虚拟音频设备降级。

### MiMo

使用 OpenAI-compatible Chat Completions 形式，但不依赖工具调用或工具历史。模型只返回约定 JSON，客户端通过 Schema 校验、版本号和一次重试保证稳定性。

### CI 中的模型

CI 不下载大型 Whisper 模型，也不调用真实 MiMo。单元和集成测试使用确定性 Mock；真实模型、系统音频和 30 分钟运行测试在 macOS 验收流程中执行。

## 7. 完成定义

全部 14 个 PR 合并后，项目必须满足设计文档中的首版验收标准：

1. macOS 播放英文内容时持续显示中文悬浮字幕。
2. 原始音频默认不上传，faster-whisper 在本地识别。
3. MiMo 负责中文翻译和上下文修订。
4. 最近 5 句或 20 秒字幕支持原位修改。
5. 版本冲突不会导致旧响应覆盖新字幕。
6. MiMo 故障时英文原文继续显示。
7. 30 分钟运行不打乱字幕顺序、不明显重复。
8. 新环境按 README 能构建并复现演示。

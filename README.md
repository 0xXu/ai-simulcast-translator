# AI 同声传译助手

AI 同声传译助手是一款面向 macOS 的 Electron 桌面应用，用于观看英语演讲、技术分享、国际会议和网课时实时生成中文字幕。应用采集系统音频，在本地通过 faster-whisper 完成英文 ASR，再调用 MiMo OpenAI-compatible Chat Completions API 生成结构化中文字幕。

项目的核心亮点是 **Semantic Rewind**：字幕不是一次性文本流，而是一条可收敛的时间线。系统会快速显示当前字幕，并允许 MiMo 基于后文语义回溯修订最近 5 句或 20 秒内的字幕；超出窗口的内容会锁定，避免用户已经读过的字幕持续跳动。

## Demo 视频

- Demo 视频链接：待补充
- 上传演示视频后，将这里替换为真实链接，例如：`https://...`

## 当前能力

- 采集 macOS 系统音频，并转换为 16 kHz 单声道 PCM。
- 通过独立 Python ASR Worker 在本地运行 faster-whisper。
- 使用 `mimo-v2.5` 生成中文字幕、统一术语并修订最近字幕。
- 通过 `requestId` 丢弃过期响应，防止旧快照覆盖新字幕。
- 在透明悬浮窗显示中文字幕和英文原文。
- 对被修订的字幕做短暂高亮，减少阅读负担。
- MiMo 未配置或调用失败时，继续显示 ASR 英文原文，不中断演示。
- 提供 Electron E2E 冒烟测试、构建检查和演示验收脚本。

## 技术架构

```text
macOS 系统音频
  -> Renderer AudioCapture
  -> preload 安全 IPC
  -> Electron Main ASR Session
  -> Python faster-whisper Worker
  -> MiMo 字幕翻译协调器
  -> 版本化字幕时间线
  -> Electron 悬浮字幕窗
```

主要模块：

- `apps/desktop`：Electron 主进程、preload、React 控制窗和悬浮字幕窗。
- `packages/contracts`：IPC、ASR、字幕快照等跨进程契约。
- `packages/domain`：字幕时间线、修订窗口和状态规则。
- `packages/application`：翻译请求构建、快照应用和协调器。
- `packages/infrastructure`：MiMo 客户端和 Whisper Worker 适配器。
- `workers/asr`：Python ASR Worker 与 faster-whisper 引擎。

## 环境要求

- macOS 13+，建议 macOS 14.2+ 用于系统音频权限和打包验收。
- Node.js 22.12+ 或 24+。
- pnpm 11.5.2，通过 Corepack 启用。
- Python 3.12。
- `uv`，用于运行 ASR Worker 测试和本地依赖。

## 快速开始

```bash
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install
```

复制环境变量模板：

```bash
cp .env.example .env
```

启动桌面应用：

```bash
pnpm dev
```

启动后会出现控制窗和透明悬浮字幕窗。点击“开始采集”后，macOS 会请求屏幕与系统音频录制权限；授权后，系统音频会被送入本地 ASR Worker。

## MiMo 与 ASR 配置

`.env.example` 包含演示所需的关键变量：

```bash
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_API_KEY=
MIMO_MODEL=mimo-v2.5
WHISPER_MODEL=small.en
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

配置说明：

- `MIMO_BASE_URL`：MiMo OpenAI-compatible API 地址。
- `MIMO_API_KEY`：MiMo API Key，仅 Electron 主进程读取，不暴露给 renderer。
- `MIMO_MODEL`：默认使用 `mimo-v2.5`。
- `WHISPER_MODEL`：默认使用 `small.en`，可按机器性能调整。
- `WHISPER_DEVICE` / `WHISPER_COMPUTE_TYPE`：控制 faster-whisper 推理设备和精度。

如果没有填写 `MIMO_API_KEY` 或 `MIMO_BASE_URL`，应用会自动走英文原文降级路径，方便无外部 API 的本地演示和 CI 验证。

## 打包

构建桌面产物：

```bash
pnpm build
```

打包 macOS 应用：

```bash
corepack pnpm --filter @simulcast/desktop pack
```

打包脚本会把 `workers/asr` 作为 Electron extra resources 带入应用。当前 macOS 配置包含系统音频、麦克风和屏幕录制权限说明。

## 验证命令

常用本地验证：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e
pnpm verify:demo
```

完整 JS CI 同等验证：

```bash
pnpm run ci
```

ASR Worker 测试：

```bash
uv run --project workers/asr --extra dev pytest
```

`pnpm verify:demo` 会检查桌面构建产物、MiMo 降级路径、字幕 IPC 和 renderer 订阅入口。`pnpm test:e2e` 会启动构建后的 Electron 应用，验证控制窗和悬浮字幕窗可以加载。

## 演示验收

更完整的演示流程见 [docs/demo.md](docs/demo.md)，其中包含：

- 无 MiMo Key 的降级演示。
- 真实 MiMo 翻译演示。
- Semantic Rewind 观察脚本。
- 30 分钟连续运行检查清单。
- CI 覆盖范围和本地 macOS 验收范围。

真实验收建议播放一段包含指代、术语和后文反转的英文内容，观察最近字幕是否能原位修订并高亮。

## 数据与隐私

- 原始音频默认只在本地内存中处理，不落盘。
- ASR 原文和有限上下文会发送到 MiMo API。
- API Key 仅由 Electron 主进程读取。
- 日志不得记录 API Key、完整字幕正文或原始音频。

## License

许可证尚未确定。在添加明确许可证前，仓库内容默认保留所有权利。

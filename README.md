# AI 同声传译助手

面向观看英语演讲、技术分享、国际会议和网课的 macOS Electron 桌面应用。应用采集系统音频，在本地使用 faster-whisper 识别英文原文，再通过 `mimo-v2.5` 生成中文字幕，并用 **Semantic Rewind** 在后文消除歧义时回溯修订最近字幕。

当前 `main` 已具备端到端演示链路：系统音频采集、ASR Worker 会话、MiMo/OpenAI-compatible 翻译适配器、字幕快照应用、悬浮窗修订高亮和 MiMo 未配置时的英文原文降级。

## 核心能力

- macOS 系统音频采集和 16 kHz 单声道 PCM 传输。
- 独立 Python ASR Worker，默认使用 faster-whisper，也保留 Mock/测试路径。
- `mimo-v2.5` 文本翻译协调器，按最近 20 秒原文和最近 5 句字幕上下文生成结构化快照。
- 最近 5 句或 20 秒内字幕可原位修订，超过修订窗口后锁定。
- 旧 `requestId` 快照不会覆盖更新字幕。
- MiMo 未配置或调用失败时，悬浮窗继续显示 ASR 英文原文。

## 环境要求

- macOS 13+，建议 macOS 14.2+ 用于系统音频权限验证。
- Node.js 22.12+ 或 24+。
- pnpm 11.5.2，通过 Corepack 启用。
- Python 3.12 和 `uv`，用于 ASR Worker 本地验证。

## 安装

```bash
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install
```

## 配置

复制 `.env.example` 并填写 MiMo 配置：

```bash
cp .env.example .env
```

关键变量：

- `MIMO_BASE_URL`：MiMo OpenAI-compatible API 地址。
- `MIMO_API_KEY`：MiMo API Key，仅主进程读取，不暴露给 renderer。
- `MIMO_MODEL`：默认 `mimo-v2.5`。
- `WHISPER_MODEL`：默认 `small.en`。

未填写 `MIMO_API_KEY` 或 `MIMO_BASE_URL` 时，应用会使用英文原文降级字幕，便于无外部 API 的演示和 CI 验证。

## 启动

```bash
pnpm dev
```

启动后会出现控制窗和透明悬浮字幕窗。点击“开始采集”后，应用会请求系统音频录制权限，并将 PCM 送入本地 ASR Worker。首次使用 macOS 可能需要在系统设置中允许屏幕与系统音频录制权限。

## 验证

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

完整 CI 同等验证：

```bash
pnpm run ci
```

`pnpm verify:demo` 需要先执行 `pnpm build`，它会检查构建产物、MiMo 降级路径、字幕快照 IPC 和 renderer 订阅入口是否存在。
`pnpm test:e2e` 会启动构建后的 Electron 应用，验证控制窗和悬浮字幕窗都能加载。

## ASR Worker 验证

Mock/单元测试路径：

```bash
uv run --project workers/asr --extra dev pytest
```

真实 faster-whisper 冒烟验证需要准备 16 kHz 单声道 WAV：

```bash
mkdir -p /tmp/ai-simulcast-smoke
say -v Samantha "Today we are building a real time translation assistant." -o /tmp/ai-simulcast-smoke/english-demo.aiff
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/ai-simulcast-smoke/english-demo.aiff /tmp/ai-simulcast-smoke/english-demo.wav
uv run --project workers/asr python workers/asr/scripts/smoke_faster_whisper.py /tmp/ai-simulcast-smoke/english-demo.wav
```

## 演示说明

评审或演示人员可以参考 [docs/demo.md](docs/demo.md)。文档包含无 MiMo Key 的降级演示、真实 MiMo 配置演示、Semantic Rewind 观察点和验收清单。

## 数据与隐私

- 原始音频默认只在本地内存中处理，不落盘。
- ASR 原文和有限上下文会发送到 MiMo API。
- API Key 仅由 Electron 主进程读取。
- 日志不得记录 API Key、完整字幕正文或原始音频。

## License

许可证尚未确定。在添加明确许可证前，仓库内容默认保留所有权利。

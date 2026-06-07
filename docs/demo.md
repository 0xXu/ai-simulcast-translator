# AI 同声传译助手演示验收

本文档用于评委或开发者在新环境中复现当前 `main` 的演示状态。

## 1. 准备环境

```bash
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install
pnpm build
pnpm test:e2e
pnpm verify:demo
```

`pnpm verify:demo` 会确认桌面构建产物、字幕 IPC、MiMo 降级路径和 renderer 订阅入口都存在。

## 2. 无 MiMo Key 的降级演示

1. 保持 `.env` 中 `MIMO_API_KEY` 为空，或不创建 `.env`。
2. 运行 `pnpm dev`。
3. 点击控制窗中的“开始采集”。
4. 播放一段英文演讲、课程或视频。
5. 悬浮窗应持续显示 ASR 英文原文，不因 MiMo 未配置而中断。

验收重点：

- 控制窗音频电平会变化。
- ASR session 能启动并接收 PCM。
- 悬浮字幕窗保持可见。
- MiMo 未配置时不崩溃，字幕使用英文原文降级。

## 3. 真实 MiMo 翻译演示

复制 `.env.example` 为 `.env`，填写：

```bash
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_API_KEY=<your-api-key>
MIMO_MODEL=mimo-v2.5
WHISPER_MODEL=small.en
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

运行：

```bash
pnpm dev
```

验收重点：

- 悬浮窗主字幕显示中文。
- 英文原文作为辅助文本显示。
- 后文改变语义时，最近字幕原位更新并短暂高亮。
- 断开 MiMo 或移除 Key 后，ASR 原文仍能显示。

## 4. Semantic Rewind 观察脚本

建议播放或朗读包含指代、术语和否定反转的英文片段：

```text
We first called it a cache.
In this architecture, it is actually a semantic rewind buffer.
It does not rewrite the whole transcript.
It only revises the most recent five captions.
```

观察点：

- 早期字幕先快速出现。
- 后文出现 “semantic rewind buffer” 后，最近字幕可被修订。
- 修订只发生在最近 5 句或 20 秒窗口内。
- 修订高亮持续约 500 至 800 ms。

## 5. 长时间运行检查

至少连续播放 30 分钟英文内容，记录：

- 字幕顺序是否保持递增。
- 是否出现明显重复段落。
- MiMo 不可用时是否继续显示英文原文。
- 控制窗是否保持响应。
- CPU 和内存是否出现异常增长。

## 6. CI 验证范围

GitHub Actions 执行：

- `pnpm format:check`
- `pnpm lint`
- `pnpm -r typecheck`
- `pnpm -r test:run`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm verify:demo`
- `uv run --project workers/asr --extra dev pytest`

CI 不下载 Whisper 大模型，也不调用真实 MiMo API。真实模型、系统音频权限和 30 分钟运行检查属于本地 macOS 验收。

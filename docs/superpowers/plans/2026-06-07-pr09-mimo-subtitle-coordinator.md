# PR 09：新增 MiMo V2.5 中文字幕协调器实施记录

**Goal:** 新增可独立测试的 MiMo V2.5 中文字幕协调器。该协调器接收最近 faster-whisper 原始英文窗口和当前最近可修订字幕上下文，生成一次自包含的结构化字幕快照请求，并通过递增 `requestId`、节流和单并发策略保护实时字幕链路。

**Architecture:** `@simulcast/application` 定义应用层翻译协调器和 `TranslatorPort`，只依赖 `@simulcast/domain`。`@simulcast/infrastructure` 实现 OpenAI-compatible MiMo 客户端与响应 Schema，只在基础设施层处理 `baseUrl`、`apiKey`、HTTP、JSON 解析和一次非法 JSON 重试。

**Scope:**

- 新增 `@simulcast/application` workspace 包。
- 新增字幕快照请求模型、最近 20 秒原文裁剪、最近 5 句/20 秒可修订字幕上下文裁剪。
- 新增 `SubtitleTranslationCoordinator`，支持递增 `requestId`、最小请求间隔、单并发、最多一个最新待处理输入、过期响应丢弃和失败结果返回。
- 新增 `MimoClient`，按 OpenAI Chat Completions 形式调用 `mimo-v2.5`，并设置 `thinking: { type: "disabled" }`。
- 新增 MiMo 响应 Schema，要求严格 JSON 字幕快照。

**Excluded:**

- 不在本 PR 将 MiMo 接入 Electron Main 生命周期。
- 不在 renderer 暴露 API Key。
- 不实现悬浮窗中文字幕展示、Semantic Rewind 高亮或字幕 timeline 写入；这些属于 PR10。
- 不调用真实 MiMo API；单元测试使用 fake fetch 和 fake translator。

## Verification Record

- [x] `pnpm --filter @simulcast/application test:run`
- [x] `pnpm --filter @simulcast/application typecheck`
- [x] `pnpm --filter @simulcast/infrastructure test:run -- src/mimo`
- [x] `pnpm --filter @simulcast/infrastructure typecheck`
- [ ] `pnpm test:run`
- [x] `corepack pnpm -r typecheck`
- [x] `corepack pnpm --filter @simulcast/desktop build`
- [x] `git diff --check`

Full workspace tests currently fail outside PR09 scope because the desktop test
suite tries to download the Electron binary and the download fails in this
environment. One existing Windows path assertion in `renderer-url.test.ts` also
expects a POSIX-style pathname.

## PR Description Draft

### 功能描述

新增 MiMo V2.5 中文字幕协调器。应用层可以把最近 faster-whisper 原始窗口和当前可修订字幕上下文提交给协调器，由协调器构造结构化请求并调用注入的 `TranslatorPort`，得到可校验的中文字幕快照。

### 实现思路

- `@simulcast/application` 负责请求构造、上下文裁剪、节流、单并发、待处理输入合并和过期响应保护。
- `@simulcast/infrastructure` 负责 MiMo HTTP 请求、OpenAI-compatible payload、严格 JSON 解析和一次非法 JSON 重试。
- API Key 只出现在基础设施客户端构造参数中，未进入 renderer 或共享 contracts。

### 测试方式

1. `pnpm --filter @simulcast/application test:run`
2. `pnpm --filter @simulcast/application typecheck`
3. `pnpm --filter @simulcast/infrastructure test:run -- src/mimo`
4. `pnpm --filter @simulcast/infrastructure typecheck`

### 风险与限制

- 当前只交付可注入的协调器和客户端，尚未接入桌面运行链路。
- 真实 MiMo 网络错误、限流和超时会以失败结果或异常形式返回，后续 PR10/主进程集成需要映射为 UI 可见降级状态。
- 字幕快照尚未写入 `SubtitleTimeline`，原位修订和高亮属于 PR10。

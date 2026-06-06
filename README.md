# AI 同声传译助手

一款面向 macOS 的 AI 实时翻译桌面应用。它采集系统音频，通过本地
faster-whisper 识别外语原文，再由 MiMo 完成中文翻译、上下文理解和历史字幕修订。

产品核心能力是 **Semantic Rewind（语义回溯）**：当后续内容改变前文语义时，
系统可以自动修正最近 5 句或 20 秒内已展示的字幕，而不是永久保留第一次翻译。

> 当前状态：已完成 Electron + React 静态演示壳，控制窗和悬浮字幕可启动。
> 系统音频、Whisper、MiMo 和语义回溯将在后续独立 PR 中实现。

## 核心能力

- 捕获 macOS 系统播放的会议、课程、演讲或视频音频。
- 使用本地 faster-whisper 增量识别英文，原始音频默认不上传。
- 使用 MiMo 直接翻译 ASR 文本并结合上下文修正歧义。
- 在透明置顶悬浮窗中展示中文主字幕和可选英文原文。
- 使用 `live`、`revisable`、`locked` 生命周期控制字幕稳定性。
- 通过版本化修订协议防止过期模型响应覆盖新字幕。
- MiMo 不可用时降级显示英文原文，不中断音频识别。

## 工作流程

```text
macOS 系统音频
  -> 音频捕获与重采样
  -> faster-whisper 增量 ASR
  -> 原文稳定与分段
  -> MiMo 上下文翻译
  -> 版本化语义回溯
  -> Electron 悬浮字幕
```

MiMo 首版不直接接收音频。Whisper 负责语音识别和时间戳，MiMo 负责中文翻译、
术语统一、指代消歧及最近上下文的回溯修订。

## 系统架构

项目采用桌面端前后端分离和分层架构：

```text
Frontend
Electron Renderer + React
控制窗口、悬浮字幕、交互和视图状态
          |
          | Typed IPC
          v
Backend
Electron Main + TypeScript
应用用例、字幕领域状态、MiMo、配置和进程管理
          |
          | Versioned Worker Protocol
          v
Inference Worker
Python + faster-whisper
音频预处理和增量语音识别
```

后端依赖方向为：

```text
Infrastructure -> Application -> Domain
IPC Adapter ----> Application -> Domain
```

- React 不包含 MiMo Prompt、字幕锁定算法或版本冲突规则。
- Domain 不依赖 Electron、网络、模型 SDK、文件系统或 Python。
- 音频、ASR、翻译、修订和 UI 通过稳定接口解耦。
- 更换 ASR 或翻译模型不应影响字幕领域模型和前端组件。

完整设计见
[产品与技术设计](docs/superpowers/specs/2026-06-06-ai-simulcast-translator-design.md)。

## 计划技术栈

| 部分 | 技术 |
|---|---|
| 桌面容器 | Electron |
| 前端 | React + TypeScript |
| 本地后端 | Electron Main + TypeScript |
| ASR Worker | Python + faster-whisper |
| 翻译模型 | MiMo OpenAI-compatible API |
| 系统音频 | 优先评估 macOS ScreenCaptureKit |
| 通信 | Typed Electron IPC + Worker Protocol |
| 密钥存储 | macOS Keychain 或 Electron 安全存储 |

## 目标目录结构

目录将在对应功能 PR 中逐步创建：

```text
apps/
  desktop/
    src/main/          Electron 本地后端和依赖组合
    src/preload/       安全、类型化的 IPC API
    src/renderer/      React 前端
packages/
  domain/              字幕领域模型和业务规则
  application/         用例和端口
  contracts/           IPC 与 Worker 协议
  infrastructure/      MiMo、音频和存储适配器
workers/
  asr/                 Python faster-whisper Worker
docs/
  superpowers/specs/   产品与技术设计
```

## 开发状态与启动

### 环境要求

- macOS 13+
- Node.js 22.12+（22.x）或 24+
- pnpm 11.5.2

### 安装与启动

```bash
corepack enable
pnpm install
pnpm dev
```

为控制供应链风险，项目仅授权 Electron 和 esbuild 执行安装构建脚本。

若系统提示 `corepack: command not found`，先安装 Corepack：

```bash
npm install --global corepack@0.34.7
```

启动后会出现两个窗口：控制窗和透明置顶的悬浮字幕窗。当前为静态演示，
无需填写 `.env.example` 中的 MiMo 和 Whisper 配置。

### 验证

```bash
pnpm test:run
pnpm typecheck
pnpm build
```

## 性能目标

- 首个中文字幕中位延迟不高于 3 秒。
- 连续语音下字幕通常每 1.5 秒内更新。
- 30 分钟连续运行不丢失顺序、不产生明显重复字幕。
- 最近 5 句或 20 秒内支持原位修订。
- 超出修订窗口的字幕自动锁定。

## 开发与 PR 规范

所有功能必须通过 Pull Request 合入主分支。

- 每个 PR 只实现或修改一个独立功能。
- 大功能拆分为多个小型、可独立验证的 PR。
- 不在功能 PR 中混入无关重构、格式化或依赖升级。
- 每个 PR 合并后，主分支必须能够安装、启动和复现当前演示。
- 未完成的外部能力使用 Mock、Feature Flag 或明确的降级路径隔离。
- 不得提交 API Key、原始音频、隐私字幕或本机绝对路径。

### PR 描述模板

```markdown
## 功能描述

说明该功能的作用、解决的问题和使用方式。

## 实现思路

说明技术选型、核心数据流、接口和主要实现逻辑。

## 测试方式

列出验证步骤、执行命令和预期结果。UI 变更附截图或录屏。
```

PR 合并前至少应通过格式检查、Lint、类型检查、单元测试、构建和冒烟测试。
评委在任意时间检出主分支，都应能够复现已经完成的演示效果。

## 实施顺序

1. 创建可运行的 Electron + React 桌面骨架。
2. 新增 macOS 系统音频采集和音量状态。
3. 新增 Whisper Worker，显示实时英文原文。
4. 新增 MiMo API 客户端和中文翻译。
5. 新增最近 5 句或 20 秒上下文。
6. 新增版本化字幕修订和 Semantic Rewind。
7. 完善悬浮窗、容错、性能和演示流程。

每一步均通过独立 PR 交付，并保持主分支可运行。

## 数据与隐私

- 原始音频默认仅在本地内存中处理，不落盘。
- ASR 原文和有限上下文会发送至 MiMo API。
- API Key 只由 Electron 主进程读取和保存。
- 日志默认不记录 API Key、完整字幕正文或原始音频。

## License

许可证尚未确定。在添加明确许可证前，仓库内容默认保留所有权利。

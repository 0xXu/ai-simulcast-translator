# AI 同声传译助手产品与技术设计

## 1. 文档信息

- 项目名称：AI 同声传译助手
- 产品形态：macOS Electron 桌面应用
- 核心模型：MiMo 文本模型
- 本地 ASR：faster-whisper
- 目标语言：首版支持英语到简体中文
- 设计日期：2026-06-06
- 文档状态：已确认设计

## 2. 产品概述

本产品面向观看外语演讲、技术分享、国际会议和在线课程的用户。应用采集 macOS 系统音频，实时生成中文字幕，并在后续语义消除歧义时自动修正已展示内容。

传统实时字幕通常按照“识别一句、翻译一句”的方式工作，早期错误会永久保留。本产品的核心差异是维护一条持续收敛的“语义字幕时间线”：当前字幕快速出现，最近一段内容允许 MiMo 根据新上下文回溯修订，较早内容则自动锁定以保证阅读稳定。

产品核心能力命名为 **Semantic Rewind（语义回溯）**。

## 3. 产品目标

### 3.1 核心目标

1. 采集 macOS 正在播放的系统音频。
2. 使用本地 faster-whisper 将音频增量识别为原文。
3. 使用 MiMo 完成英译中、上下文理解和历史字幕修订。
4. 在透明置顶窗口中显示流畅、易读的中文字幕。
5. 保留最近 5 句或最近 20 秒内容作为可修订区。
6. 防止异步请求乱序导致旧字幕覆盖新字幕。

### 3.2 成功指标

- 从说话到首个中文字幕出现的中位延迟不高于 3 秒。
- 正常连续语音下，字幕更新间隔通常不超过 1.5 秒。
- 最近 5 句或 20 秒内的字幕可以按 `segmentId` 原位修正。
- 已锁定字幕不会被后台旧请求修改。
- 30 分钟连续运行不丢失字幕顺序，不发生明显重复段落。
- MiMo 暂时不可用时，ASR 原文仍可继续显示并等待恢复。

### 3.3 首版不包含

- 中文语音合成或同传配音。
- Windows 和 Linux 客户端。
- 多人会议中的说话人分离。
- 云端账户、历史记录同步和多人协作。
- MiMo 直接接收实时音频。
- 超出修订窗口的全文自动重写。

## 4. 目标用户与场景

### 4.1 目标用户

- 观看英文技术演讲的开发者和学生。
- 参加国际线上会议的职场用户。
- 学习英文网课但需要中文辅助的用户。
- 观看无中文字幕直播或视频的用户。

### 4.2 核心使用流程

1. 用户启动应用并授予系统音频捕获权限。
2. 用户填写 MiMo API 地址、API Key 和模型名称。
3. 用户点击“开始翻译”。
4. 应用捕获系统音频并显示连接、采集和模型状态。
5. 悬浮窗持续显示中文主字幕，可选显示英文原文。
6. MiMo 根据后文修正前文时，对应字幕原位更新并短暂高亮。
7. 用户点击“停止”，当前字幕会话结束。

## 5. 设计原则

### 5.1 快速出现，逐步收敛

实时字幕首先满足“跟得上”，随后利用上下文提高准确性。系统不等待完整段落才显示翻译，也不把初次结果当作永久结果。

### 5.2 有限回改

只允许修改最近 5 句或 20 秒内的内容。修订窗口之外的字幕锁定，避免用户阅读过的内容持续跳动。

### 5.3 原文与译文职责分离

Whisper 只负责语音识别和时间戳；MiMo 负责翻译、术语统一、指代消歧和语义回溯。ASR 和翻译均通过适配器隔离，未来可以替换实现。

### 5.4 所有更新可寻址、可排序

字幕以稳定 `segmentId` 标识。MiMo 返回结构化操作而不是整段自由文本，客户端按版本和序列号应用修改。

## 6. 总体架构

```text
macOS 系统音频
    |
    v
AudioCapture
    |
    v
AudioBuffer / Resampler (16 kHz mono PCM)
    |
    v
WhisperWorker (独立 Python 进程)
    |
    v
TranscriptStabilizer
    |
    v
SegmentManager
    |
    v
MiMoTranslationCoordinator
    |
    +--> ContextBuilder
    +--> MiMoClient
    +--> ResponseValidator
    |
    v
RevisionEngine
    |
    v
SubtitleStore
    |
    v
Electron IPC
    |
    v
React OverlayWindow / ControlWindow
```

### 6.1 前后端分离

本项目采用桌面应用中的前后端分离，而不是把业务逻辑直接写在 React 页面中：

```text
┌─────────────────────────────────────────────┐
│ Frontend：Electron Renderer + React         │
│ 控制窗口、悬浮字幕、用户交互、视图状态       │
└───────────────────┬─────────────────────────┘
                    │ Typed IPC Contract
┌───────────────────▼─────────────────────────┐
│ Backend：Electron Main + TypeScript         │
│ 用例编排、字幕领域状态、MiMo、配置、进程管理  │
└───────────────────┬─────────────────────────┘
                    │ Worker Protocol
┌───────────────────▼─────────────────────────┐
│ Inference Worker：Python                    │
│ 音频预处理、faster-whisper、增量识别         │
└─────────────────────────────────────────────┘
```

- 前端不能直接调用 MiMo、访问 API Key、启动 Python 或读取操作系统音频。
- 后端不依赖 React、DOM 或具体页面组件。
- Python Worker 不理解字幕 UI、MiMo 翻译和产品状态，只输出 ASR 领域事件。
- 三部分通过版本化的数据协议通信，可以独立测试和替换。

Electron 主进程在本项目中承担“本地后端”角色。首版不额外启动 HTTP 业务服务器，避免增加部署和端口管理成本；未来如需远程客户端，可以在不修改领域层的情况下增加 HTTP/WebSocket 适配器。

### 6.2 后端分层

后端采用以下依赖方向：

```text
Infrastructure -> Application -> Domain
IPC Adapter ----> Application -> Domain
```

#### Domain

只包含与框架无关的核心业务规则：

- `SubtitleSegment`
- `SubtitleTimeline`
- `RevisionWindow`
- `RevisionOperation`
- 字幕状态转换和版本冲突规则

Domain 不依赖 Electron、MiMo SDK、文件系统、网络或 Python Worker。

#### Application

通过用例编排领域对象：

- `StartTranslationSession`
- `StopTranslationSession`
- `HandleTranscriptUpdate`
- `RequestContextualTranslation`
- `ApplySubtitleRevision`

Application 只依赖抽象端口，例如 `TranslatorPort`、`AsrPort`、`SettingsPort` 和 `EventPublisher`。

#### Infrastructure

实现外部能力：

- `MiMoTranslatorAdapter`
- `WhisperWorkerAdapter`
- `MacOSAudioCaptureAdapter`
- `SecureSettingsAdapter`
- 日志和监控实现

基础设施异常必须转换为应用层可识别的错误，不得把 SDK 原始异常直接暴露给前端。

#### Interface Adapters

负责协议转换：

- Electron IPC Handler
- preload 安全 API
- Worker 消息编解码
- MiMo JSON Schema 校验

适配器只负责输入校验和数据映射，不承载字幕业务规则。

### 6.3 前端分层

React 前端按职责拆分：

```text
app        应用启动、路由、全局依赖注入
features   翻译控制、字幕显示、设置、状态监控
entities   Subtitle、Session、ConnectionStatus
shared     UI 组件、IPC Client、通用工具和类型
```

每个功能内部继续区分：

- `ui`：纯展示组件。
- `model`：前端视图状态和交互状态。
- `api`：调用 preload 暴露的类型安全 IPC。

React 组件不得包含 MiMo Prompt、字幕锁定算法或版本冲突处理。前端 Store 是后端字幕时间线的投影，不是业务事实来源。

### 6.4 跨层接口

所有跨进程消息集中定义在共享协议包中：

```ts
interface BackendToFrontendEvents {
  "session.status": SessionStatus;
  "subtitle.snapshot": SubtitleSnapshot;
  "subtitle.operations": SubtitleOperationBatch;
  "runtime.warning": RuntimeWarning;
}

interface FrontendToBackendCommands {
  "session.start": StartSessionCommand;
  "session.pause": PauseSessionCommand;
  "session.stop": StopSessionCommand;
  "settings.update": UpdateSettingsCommand;
}
```

协议要求：

- 消息包含协议版本和会话 ID。
- 命令、事件和查询使用不同命名，不复用模糊的双向消息。
- 所有外部输入在边界使用 Schema 校验。
- 前端只能通过 preload 白名单 API 调用后端。
- 禁止共享可变对象；跨进程数据必须可序列化。

### 6.5 模块解耦约束

- 业务层通过接口依赖 MiMo 和 Whisper，不依赖具体 SDK。
- 更换 ASR 或翻译模型时，不修改字幕领域模型和 UI。
- 更换 React 状态库时，不影响后端和 Worker。
- 音频采集、ASR、翻译、修订、持久化和展示分别拥有独立模块。
- 模块之间通过领域事件传递结果，不读取其他模块的内部状态。
- 共享目录只允许放稳定协议和无业务偏向的基础类型，禁止变成通用代码堆积区。
- 每个模块提供公开入口，其他模块不得跨目录引用内部实现文件。
- 使用依赖规则检查阻止前端导入后端、Domain 导入 Infrastructure 等非法依赖。

## 7. 技术选型

### 7.1 桌面端

- Electron：窗口、权限、进程管理和应用打包。
- React + TypeScript：控制面板和悬浮字幕 UI。
- Zustand 或等价轻量状态库：渲染进程状态管理。
- Electron IPC：主进程、字幕窗口与控制窗口通信。

### 7.2 ASR 服务

- Python 独立进程运行 faster-whisper。
- Electron 主进程通过标准输入输出或本地 WebSocket 传输音频和事件。
- 默认模型建议 `small.en`；性能较好的设备可切换 `medium.en`。
- 首版优先 Apple Silicon，具体计算后端在技术验证阶段确认。

### 7.3 MiMo 接入

- 使用兼容 OpenAI Chat Completions 的 MiMo API。
- API Key 仅保存在主进程侧，不发送到渲染进程。
- 支持配置 `baseURL`、`apiKey`、`model` 和超时时间。
- 翻译请求不依赖工具调用；要求模型直接返回约定 JSON。
- 对 `content`、可能存在的推理字段和流式分片做适配层封装。

## 8. 音频采集设计

### 8.1 macOS 系统音频

首版使用 Electron 的桌面媒体捕获链路获取系统音频：

1. Electron Main 使用 `session.defaultSession.setDisplayMediaRequestHandler` 注册授权处理器。
2. 处理器通过 `desktopCapturer.getSources` 选择屏幕源，并返回 `audio: "loopback"`。
3. Renderer 仅在用户点击开始后调用 `navigator.mediaDevices.getDisplayMedia`。
4. Renderer 获得流后立即停止不需要的视频轨道，只保留系统音频轨道。
5. AudioWorklet 将音频统一转换为：

- 采样率：16 kHz
- 声道：单声道
- 编码：16-bit PCM little-endian
- 数据块：200 至 500 ms

支持边界：

- 首版直接捕获支持 macOS 13 及以上。
- macOS 14.2 及以上的打包配置必须包含 `NSAudioCaptureUsageDescription`。
- macOS 12.7.6 及以下不宣称支持直接系统音频捕获，提供 BlackHole 等虚拟音频设备作为降级方案。
- `getUserMedia({ audio: true })` 只能用于用户明确选择的虚拟音频输入设备，不能作为系统音频默认实现。

该方案依据 Electron 官方 `desktopCapturer` 文档：
<https://www.electronjs.org/docs/latest/api/desktop-capturer/>

### 8.2 缓冲与背压

- 音频进入固定容量环形缓冲区。
- Whisper 处理落后时，不无限积压历史音频。
- 队列超过阈值后记录告警，并优先保持实时性。
- 暂停与恢复必须重新建立 ASR 边界，避免拼接出错误句子。

## 9. 增量语音识别

faster-whisper 不是原生实时 ASR。系统采用重叠窗口模拟流式识别：

- 每 800 ms 触发一次推理。
- 启动阶段积累 1.6 秒音频后允许首次推理，以满足首屏延迟目标。
- 稳定运行阶段每次读取最近 4 至 6 秒音频。
- 相邻窗口保留重叠部分。
- 依据时间戳、词前缀和文本相似度合并结果。

`TranscriptStabilizer` 将识别结果分成：

- `unstableTail`：当前可能被后续窗口改写的尾部。
- `stablePrefix`：连续多次一致或已明显越过停顿边界的内容。

只有有效新增或修正才触发翻译，避免将高度重复的 Whisper 输出反复发送给 MiMo。

## 10. 字幕数据模型

```ts
type SegmentState = "live" | "revisable" | "locked";

interface SubtitleSegment {
  id: string;
  sequence: number;
  sourceText: string;
  translatedText: string;
  startMs: number;
  endMs: number;
  state: SegmentState;
  sourceVersion: number;
  translationVersion: number;
  updatedAt: number;
  revisionReason?: string;
}
```

### 10.1 生命周期

#### live

当前正在形成的语句。原文和译文均可频繁更新，UI 以较弱视觉权重展示。

#### revisable

已形成可读句子，但仍位于最近 5 句或 20 秒窗口中。MiMo 可以根据后文修正该段。

#### locked

超出任一修订边界后锁定：

- 不再属于最近 5 个可修订句子；或
- 距离该段结束时间超过 20 秒。

锁定后普通翻译请求不可修改该段。用户主动发起会后全文校对属于未来能力，不受此规则约束。

## 11. 翻译触发策略

满足以下任一条件时可以创建翻译请求：

- 稳定原文新增了具有语义的信息。
- 检测到停顿、句末标点或分段边界。
- Whisper 修改了可修订段的原文。
- 距离上次请求超过约 1.2 秒且存在未翻译内容。

同时应用以下限制：

- 同一时刻最多保留一个正在处理的翻译请求和一个待合并请求。
- 新输入到达时合并待处理内容，不为每个音频块单独请求。
- 对完全相同的上下文和原文计算哈希并去重。
- 请求超时后允许重试，但不得阻塞 ASR 管线。

## 12. MiMo 上下文设计

每次请求包含：

1. 固定系统指令。
2. 领域或用户术语表。
3. 已锁定内容的短主题摘要，而非完整历史。
4. 最近 5 句或 20 秒内的可修订双语片段。
5. 当前新增或发生变化的原文。
6. 当前字幕时间线的 `baseRevision`。

### 12.1 模型职责

- 将新增英文翻译成自然、简洁的中文口语字幕。
- 保留数字、单位、代码、产品名和专有名词。
- 根据后续上下文修正可修订区中的错误。
- 仅在确有语义依据时修改历史字幕。
- 不修改输入中标记为 `locked` 的内容。
- 输出严格 JSON，不输出解释或 Markdown。

### 12.2 响应协议

```json
{
  "requestId": "req-018",
  "baseRevision": 17,
  "operations": [
    {
      "type": "replace",
      "segmentId": "seg-012",
      "expectedVersion": 2,
      "translation": "修正后的中文字幕",
      "reason": "后文明确了专业术语含义"
    },
    {
      "type": "upsert",
      "segmentId": "seg-015",
      "expectedVersion": 0,
      "translation": "当前新增字幕"
    }
  ]
}
```

首版只支持 `upsert` 和 `replace`。不允许模型任意删除片段、改变时间戳或调整段落顺序。

## 13. 版本化修订机制

实时翻译请求可能乱序返回。`RevisionEngine` 按以下规则应用操作：

1. 检查响应 JSON 是否符合 Schema。
2. 检查 `requestId` 是否属于当前会话。
3. 检查 `baseRevision` 是否仍可接受。
4. 根据 `segmentId` 定位字幕。
5. 比较 `expectedVersion` 与当前 `translationVersion`。
6. 仅对仍处于 `live` 或 `revisable` 状态的字幕应用更新。
7. 成功修改后增加字幕版本和全局时间线版本。

版本不匹配的操作直接丢弃，并在存在未处理新文本时触发一次合并请求。这样可以避免较慢的旧响应覆盖较新的翻译。

`upsert` 和 `replace` 都必须执行 `expectedVersion` 校验：

- 首次写入使用 `upsert`，其 `expectedVersion` 通常为 `0`。
- 已存在译文时，无论操作名是 `upsert` 还是 `replace`，版本不匹配都必须拒绝。
- `replace` 用于表达语义修订意图，但不能因此拥有不同的并发覆盖规则。

## 14. Semantic Rewind

语义回溯处理以下典型问题：

- 后文补全专业术语，修正之前的音译或普通词义。
- 后文明确代词指向，修正主语或宾语。
- 说话者补充否定或转折，修正前句关系。
- Whisper 修正原文后，重新翻译受影响片段。
- 同一实体在多句中的中文名称不一致，统一最近窗口内的译法。

### 14.1 界面反馈

- 修订后的字幕原位替换，不新增重复行。
- 修改内容使用 500 至 800 ms 的淡色高亮。
- 不弹出提示，不打断观看。
- 控制面板可选展示最近修订记录和修订原因。
- 用户正在选择文本时暂停视觉替换，选择结束后再同步。

## 15. 界面设计

### 15.1 控制窗口

包含：

- 开始、暂停和停止按钮。
- 系统音频采集状态。
- Whisper 模型加载和运行状态。
- MiMo 连接状态与延迟。
- API 配置入口。
- 原文显示开关。
- 字号、透明度和字幕行数设置。
- 当前端到端延迟和错误提示。

### 15.2 悬浮字幕窗口

- 透明、置顶、无常规窗口边框。
- 支持拖动、缩放和点击穿透切换。
- 中文为主字幕，英文原文为可选辅助行。
- 默认只显示最近 2 至 3 个片段。
- `live` 字幕颜色较淡，`revisable` 和 `locked` 字幕视觉稳定。
- 修订只高亮变化文本，不让整个窗口闪烁。

## 16. 进程与安全边界

### 16.1 Electron 主进程

负责：

- 窗口生命周期。
- 音频采集进程管理。
- Whisper Worker 管理。
- MiMo API 调用。
- API Key 安全存储。
- IPC 权限控制。

主进程入口只负责组合依赖和启动应用。具体业务通过 Application 用例执行，不在 IPC Handler 或 Electron 生命周期回调中直接实现。

### 16.2 渲染进程

只接收必要的状态和字幕数据。禁止直接访问 Node.js，启用 `contextIsolation`，通过受限 preload API 通信。

### 16.3 数据隐私

- 原始音频默认只在本地内存中处理，不落盘。
- Whisper 原文和最近上下文会发送到 MiMo API。
- 设置页明确提示哪些数据会离开设备。
- API Key 使用 macOS Keychain 或 Electron 安全存储方案。
- 日志默认不记录完整音频、API Key 或完整字幕正文。

## 17. 容错与降级

### 17.1 MiMo 不可用

- 继续运行 ASR。
- 悬浮窗可降级显示英文原文。
- 缓存有限数量的待翻译稳定片段。
- 恢复连接后只翻译仍有阅读价值的近期内容，不回放大量过期请求。

### 17.2 Whisper 处理过慢

- 显示“识别延迟升高”状态。
- 降低推理频率或切换更小模型。
- 必要时丢弃过旧的未处理音频，以恢复实时性。

### 17.3 MiMo 返回非法 JSON

- 首次失败执行一次 JSON 修复或低温重试。
- 仍失败则忽略该响应，保留现有字幕。
- 不允许解析失败影响音频采集和 ASR。

### 17.4 系统音频权限失败

- 明确说明需要的 macOS 权限。
- 提供重新授权和打开系统设置入口。
- 如果使用虚拟音频设备，检测设备是否存在并显示配置指引。

## 18. 性能预算

目标中位延迟预算：

| 阶段 | 目标 |
|---|---:|
| 音频缓冲 | 0.4–0.8 秒 |
| Whisper 增量识别 | 0.5–1.2 秒 |
| 分段与调度 | 小于 0.1 秒 |
| MiMo 首次翻译 | 0.5–1.2 秒 |
| IPC 与渲染 | 小于 0.1 秒 |
| 总计 | 1.5–3.4 秒 |

低延迟优化优先级：

1. 避免重复 Whisper 和 MiMo 请求。
2. 请求合并与取消过时任务。
3. 选择合适 Whisper 模型。
4. 限制 MiMo 输出长度和上下文体积。
5. 使用短系统提示和稳定 JSON Schema。

## 19. 测试策略

### 19.1 单元测试

- 重叠 ASR 文本合并。
- `live -> revisable -> locked` 状态转换。
- 最近 5 句或 20 秒窗口计算。
- MiMo 响应 Schema 校验。
- 版本冲突与乱序响应处理。
- 相同请求哈希去重。
- Domain 和 Application 测试不启动 Electron、React 或真实网络。
- 对模块依赖方向执行自动化架构测试。

### 19.2 集成测试

- 预录英文音频到 Whisper，再到模拟 MiMo 的完整流程。
- MiMo 延迟、超时、断线和非法 JSON。
- Whisper 修改历史原文时的重新翻译。
- 快速连续输入下的请求合并。
- 暂停、恢复和停止会话。

### 19.3 端到端测试

- 播放固定英文演讲并捕获系统音频。
- 验证字幕首屏延迟、顺序和重复率。
- 注入包含代词、术语和否定反转的测试音频，验证语义回溯。
- 连续运行 30 分钟，观察内存、CPU 和字幕时间线一致性。

### 19.4 人工质量评估

对同一批演讲比较：

- 无上下文逐句翻译。
- 最近 5 句或 20 秒的 MiMo 语义回溯翻译。

记录术语一致性、指代正确率、否定关系、阅读稳定性和修订次数。创新能力的展示应包含至少三个修订前后对比例子。

## 20. 验收标准

首版满足以下条件即可验收：

1. macOS 系统播放英文视频时，悬浮窗可持续显示中文翻译。
2. 应用无需上传原始音频即可完成本地 ASR。
3. MiMo 负责所有中文翻译和语义修订。
4. 最近 5 句或 20 秒的字幕可被原位修正。
5. 旧响应不能覆盖更新版本。
6. 超出修订窗口的字幕会锁定。
7. MiMo 断线时应用不崩溃，并能显示 ASR 原文状态。
8. 修订具有轻量视觉反馈，且不产生重复字幕。
9. 30 分钟测试中字幕顺序保持一致。

## 21. 实施阶段

### 阶段一：技术验证

- 验证 macOS 系统音频采集。
- 验证 faster-whisper 在目标 Mac 上的实时系数。
- 验证 MiMo API 的响应格式、流式行为和平均延迟。
- 用固定文本验证结构化修订协议。

### 阶段二：核心流水线

- 建立 Electron、React 和 Python Worker。
- 完成音频、ASR、分段、翻译和 IPC 链路。
- 实现字幕状态机和版本化 `RevisionEngine`。

### 阶段三：产品界面

- 完成控制窗口和悬浮字幕窗。
- 加入状态、权限、配置和错误反馈。
- 加入修订高亮和可选原文。

### 阶段四：质量与演示

- 调整延迟参数和请求合并策略。
- 准备能触发语义回溯的演示音频。
- 完成长时间运行和异常场景测试。

## 22. PR 开发与交付规范

所有功能开发必须通过 Pull Request 合入主分支，不允许直接在主分支开发或提交未经验证的功能。

### 22.1 单一功能原则

- 每个 PR 只实现或修改一个独立功能。
- PR 应尽可能小，保持清晰、可审查和可独立验证。
- 不在功能 PR 中混入无关重构、格式化或依赖升级。
- 大功能必须拆分为多个按依赖顺序排列的独立 PR。
- 每个 PR 合并后，主分支必须能够安装、启动并运行。

例如，“完成实时同声传译”不能作为单个 PR，应拆分为：

1. 初始化 Electron + React 可运行骨架。
2. 新增 macOS 系统音频采集。
3. 新增 Whisper Worker 与进程通信。
4. 新增增量原文稳定器。
5. 新增 MiMo API 客户端。
6. 新增 MiMo 上下文翻译。
7. 新增版本化字幕修订引擎。
8. 新增悬浮字幕窗口。
9. 新增语义回溯修订视觉反馈。

### 22.2 PR 标题要求

标题必须用一句话准确说明本 PR 新增或修改了什么，避免“更新代码”“优化功能”等模糊描述。

推荐格式：

```text
类型: 一句话说明具体功能
```

示例：

```text
feat: 新增 MiMo 文本翻译客户端
fix: 防止过期翻译响应覆盖新版字幕
test: 增加字幕状态机边界测试
```

### 22.3 提交信息要求

提交信息和 squash merge 信息统一使用“英文类型前缀 + 中文描述”：

```text
type: 中文描述
```

常用类型包括 `feat`、`fix`、`test`、`docs`、`refactor`、`build`、
`ci` 和 `chore`。类型后必须使用半角冒号和一个空格，不使用
`功能：`、`修复：`、`测试：` 等中文类型前缀。

示例：

```text
fix: 修订窗口测试使用相对时间避免时间窗口判断失败
```

### 22.4 PR 描述模板

每个 PR 的描述必须包含以下内容：

```markdown
## 功能描述

说明本 PR 提供的功能、解决的问题，以及用户或其他模块如何使用。

## 实现思路

简要说明技术选型、核心数据流、关键接口和主要实现逻辑。

## 测试方式

列出验证步骤、执行命令和预期结果。涉及 UI 时附上截图或录屏；
涉及异常处理时说明已验证的失败场景。
```

如存在兼容性、性能、安全或后续工作，还应增加“风险与限制”章节。

### 22.5 合并门禁

PR 合并前必须满足：

- 功能范围符合单一功能原则。
- 代码通过格式检查、类型检查和相关自动化测试。
- 新增逻辑具有与风险相匹配的测试覆盖。
- PR 描述包含功能描述、实现思路和测试方式。
- 审查者可以按照 PR 中的步骤独立复现结果。
- 不提交 API Key、音频隐私数据或本地绝对路径。
- 不破坏已有演示链路。
- 对用户可见的功能提供可理解的错误状态。
- 不引入跨层反向依赖或绕过公开模块入口的引用。

### 22.6 主分支可运行要求

主分支在任意 PR 合并后都必须处于可复现的演示状态：

- 新环境可以按照 README 完成安装和启动。
- 必需的环境变量提供 `.env.example`，不得依赖开发者本机隐式配置。
- 尚未完成的外部能力使用明确的 Mock、Feature Flag 或降级路径隔离。
- 禁止将半成品入口暴露为默认演示流程。
- 数据库迁移、模型下载或原生依赖变更必须提供自动化脚本或清晰步骤。
- 每次合并前执行最小演示冒烟测试。
- 评委在任意时间检出主分支，都能复现当前已经完成的演示效果。

### 22.7 推荐的 CI 检查

每个 PR 至少运行：

```text
format/check
lint
typecheck
unit-test
build
smoke-test
```

涉及 Python Worker 时额外运行 Python 格式、类型和单元测试；涉及 Electron 原生音频模块时，增加目标 macOS 架构的构建验证。

### 22.8 功能拆分顺序

PR 应按可演示的纵向增量推进。早期尚未接通真实服务时，也必须保留可运行状态：

1. 可启动桌面应用和静态字幕演示。
2. 接入音频采集，并在界面显示音量状态。
3. 接入 Whisper，展示实时英文原文。
4. 接入 MiMo，展示实时中文翻译。
5. 增加最近 5 句或 20 秒上下文。
6. 增加版本化历史字幕修订。
7. 完善悬浮窗、错误降级和演示流程。

每一步都是可单独检查、可单独测试、可合并且不会使主分支失去演示能力的 PR。

## 23. 主要风险

### macOS 系统音频采集

这是首版最大的工程风险，应最先验证，不应等到 UI 完成后处理。

### Whisper 实时性能

不同 Mac 的性能差异较大。必须提供模型档位，并以保持实时为优先。

### 字幕频繁跳动

MiMo 不应为了语言润色反复改写历史。提示词和响应校验应要求只有语义错误才触发 `replace`。

### MiMo 协议兼容性

兼容 OpenAI Chat Completions 不代表所有字段行为完全一致。首版避免工具调用和复杂多轮消息历史，通过单次结构化请求降低兼容风险。

### API 成本与限流

使用请求合并、上下文裁剪、摘要、哈希去重和单并发策略控制调用量。

## 24. 创新性说明

本项目不把“使用 AI 翻译字幕”本身作为创新点。核心创新是：

1. **语义回溯**：后文可以修正前文，而不是永久保留首轮误译。
2. **版本化字幕时间线**：将字幕视为可演进状态，而不是不可变文本流。
3. **有限稳定窗口**：在准确性与阅读稳定性之间建立明确边界。
4. **结构化修订操作**：模型只提交可验证的局部修改，避免整屏重写。
5. **原文稳定与语义修订协同**：同时处理 ASR 改写和翻译消歧。

该设计让产品从普通“ASR + 翻译”工具升级为能够随语境持续校正理解的实时传译系统。

## 25. 未来扩展

- 接入 MiMo-V2.5-ASR 或其他云端流式 ASR。
- 中文 TTS 同传语音。
- 用户自定义术语库和会前资料导入。
- 会后双语稿、摘要和知识点。
- 多语言自动检测和多目标语言。
- 说话人分离。
- 用户手动锁定、解锁或纠正术语。

## 26. 参考资料

- MiMo-V2.5-ASR：<https://github.com/XiaomiMiMo/MiMo-V2.5-ASR>
- MiMo-Audio：<https://github.com/XiaomiMiMo/MiMo-Audio>
- MiMo：<https://github.com/XiaomiMiMo/MiMo>

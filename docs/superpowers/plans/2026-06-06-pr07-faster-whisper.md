# PR 07：接入 faster-whisper 识别引擎实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Python ASR Worker 内新增可选的 `FasterWhisperEngine`，将 16 kHz 单声道 PCM 数据按重叠时间窗口识别为英文原文，同时保持 Mock 引擎为默认运行模式。

**Architecture:** `AsrWorker` 继续只依赖统一的 ASR 引擎协议。`FasterWhisperEngine` 在内部负责 base64 PCM 解码、滚动窗口、推理节流和结果转换；Worker 不感知模型实现。真实模型通过命令行显式启用，默认 Mock 路径不下载模型，因此当前主分支演示、单元测试和 CI 均保持可运行。

**Tech Stack:** Python 3.12、uv、faster-whisper 1.2.x、NumPy、pytest

---

## 1. PR 边界

本 PR 只交付 Python Worker 内的真实语音识别引擎。

**包含：**

- ASR 引擎协议。
- 最大 6 秒的滚动 PCM 缓冲区。
- 每累计 800 ms 新音频触发一次识别。
- `FasterWhisperEngine` 及模型加载错误处理。
- Worker 的引擎依赖注入和命令行选择。
- 不下载模型的单元测试。
- 显式启用真实模型的本地冒烟验证。

**不包含：**

- Renderer PCM 到 Electron Main 的 IPC 链路。
- TypeScript Worker 适配器的真实引擎启动参数。
- 字幕 UI 接入。
- 重叠窗口去重、稳定前缀和活动尾部。
- MiMo 翻译和前文修订。

以上端到端音频接线单独放在 PR 08；增量原文稳定顺延到 PR 09。这样 PR 07 合并后仍保持当前 Mock 演示可启动，不会因首次下载模型超过 Worker 的 5 秒启动超时。

## 2. 文件结构

```text
workers/asr/
  pyproject.toml
  uv.lock
  src/asr_worker/
    engine.py
    audio_buffer.py
    faster_whisper_engine.py
    main.py
    test_engine.py
    test_audio_buffer.py
    test_faster_whisper_engine.py
    test_main.py
  scripts/
    smoke_faster_whisper.py
```

## 3. 核心约束

- 输入只接受 16 kHz、单声道、little-endian signed 16-bit PCM。
- 缓冲区最多保存最近 6 秒音频。
- 至少积累 1.6 秒音频后才进行首次推理。
- 此后每新增 800 ms 音频进行一次推理。
- 每次推理使用当前缓冲区内最近最多 6 秒音频。
- `FasterWhisperEngine.process_audio()` 保持现有
  `AudioMessage -> Optional[ResultMessage]` 契约。
- PR 09 再处理重叠窗口造成的重复文本；本 PR 不提前实现稳定器。
- `avg_logprob` 不能直接作为置信度，需使用 `exp(avg_logprob)` 并限制到
  `[0.0, 1.0]`。
- `AsrWorker` 默认仍创建 `MockAsrEngine`。
- CI 单元测试使用注入的假模型，不下载 Whisper 模型。

---

## Task 1：添加 faster-whisper 运行依赖

**Files:**

- Modify: `workers/asr/pyproject.toml`
- Modify: `workers/asr/uv.lock`

- [ ] **Step 1: 添加受控版本依赖**

在 `workers/asr/pyproject.toml` 中添加：

```toml
dependencies = [
  "faster-whisper>=1.2.1,<2",
  "numpy>=2,<3",
]
```

保留现有 dev extra 和 pytest 配置。

- [ ] **Step 2: 更新锁文件**

Run:

```bash
uv lock --project workers/asr
uv sync --project workers/asr --extra dev --frozen
```

Expected: 依赖解析成功，`uv.lock` 与 `pyproject.toml` 一致。

- [ ] **Step 3: 提交**

```bash
git add workers/asr/pyproject.toml workers/asr/uv.lock
git commit -m "build: 添加 faster-whisper 运行依赖"
```

---

## Task 2：定义统一的 ASR 引擎协议

**Files:**

- Create: `workers/asr/src/asr_worker/test_engine.py`
- Create: `workers/asr/src/asr_worker/engine.py`
- Modify: `workers/asr/src/asr_worker/mock_engine.py`

- [ ] **Step 1: 编写失败测试**

测试使用 `runtime_checkable Protocol` 验证现有 `MockAsrEngine` 满足协议：

```python
from asr_worker.engine import AsrEngine
from asr_worker.mock_engine import MockAsrEngine


def test_mock_engine_implements_asr_engine() -> None:
    assert isinstance(MockAsrEngine(), AsrEngine)
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
uv run --project workers/asr pytest workers/asr/src/asr_worker/test_engine.py -q
```

Expected: `ModuleNotFoundError: No module named 'asr_worker.engine'`。

- [ ] **Step 3: 实现最小协议**

```python
from typing import Optional, Protocol, runtime_checkable

from .protocol import AudioMessage, ResultMessage


@runtime_checkable
class AsrEngine(Protocol):
    def process_audio(
        self,
        audio_message: AudioMessage,
    ) -> Optional[ResultMessage]:
        ...

    def reset(self) -> None:
        ...
```

将 `MockAsrEngine.reset()` 的返回类型补为 `None`，不改变其行为。

- [ ] **Step 4: 验证并提交**

Run:

```bash
uv run --project workers/asr pytest workers/asr/src/asr_worker/test_engine.py -q
```

Expected: PASS。

```bash
git add workers/asr/src/asr_worker/engine.py \
  workers/asr/src/asr_worker/mock_engine.py \
  workers/asr/src/asr_worker/test_engine.py
git commit -m "feat: 定义统一的 ASR 引擎协议"
```

---

## Task 3：实现滚动 PCM 时间窗口

**Files:**

- Create: `workers/asr/src/asr_worker/test_audio_buffer.py`
- Create: `workers/asr/src/asr_worker/audio_buffer.py`

- [ ] **Step 1: 编写失败测试**

测试至少覆盖：

```python
import numpy as np

from asr_worker.audio_buffer import RollingAudioBuffer


def test_returns_only_available_samples() -> None:
    buffer = RollingAudioBuffer(sample_rate=1000, max_duration_ms=1000)
    buffer.append(np.arange(100, dtype=np.int16))

    actual = buffer.recent(500)

    assert actual.tolist() == list(range(100))


def test_keeps_only_latest_samples_after_overflow() -> None:
    buffer = RollingAudioBuffer(sample_rate=100, max_duration_ms=100)
    buffer.append(np.arange(15, dtype=np.int16))

    assert buffer.recent(100).tolist() == list(range(5, 15))
    assert buffer.duration_ms == 100


def test_recent_returns_requested_tail() -> None:
    buffer = RollingAudioBuffer(sample_rate=1000, max_duration_ms=1000)
    buffer.append(np.arange(800, dtype=np.int16))

    assert buffer.recent(200).tolist() == list(range(600, 800))


def test_clear_removes_all_samples() -> None:
    buffer = RollingAudioBuffer(sample_rate=16000, max_duration_ms=6000)
    buffer.append(np.ones(1600, dtype=np.int16))

    buffer.clear()

    assert buffer.duration_ms == 0
    assert buffer.recent(6000).size == 0
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
uv run --project workers/asr pytest workers/asr/src/asr_worker/test_audio_buffer.py -q
```

Expected: `ModuleNotFoundError: No module named 'asr_worker.audio_buffer'`。

- [ ] **Step 3: 实现有界滚动缓冲区**

实现要求：

- 构造参数必须为正数，否则抛出 `ValueError`。
- 输入统一转换为一维 `np.int16`。
- 单次输入超过容量时只保留末尾容量。
- `duration_ms` 永远不超过 `max_duration_ms`。
- `recent(duration_ms)` 返回副本，不能暴露内部可变数组。

推荐实现：

```python
import numpy as np


class RollingAudioBuffer:
    def __init__(self, sample_rate: int, max_duration_ms: int) -> None:
        if sample_rate <= 0 or max_duration_ms <= 0:
            raise ValueError("sample_rate and max_duration_ms must be positive")
        self.sample_rate = sample_rate
        self.max_duration_ms = max_duration_ms
        self._capacity = sample_rate * max_duration_ms // 1000
        self._samples = np.empty(0, dtype=np.int16)

    @property
    def duration_ms(self) -> int:
        return len(self._samples) * 1000 // self.sample_rate

    def append(self, samples: np.ndarray) -> None:
        incoming = np.asarray(samples, dtype=np.int16).reshape(-1)
        if incoming.size == 0:
            return
        if incoming.size >= self._capacity:
            self._samples = incoming[-self._capacity :].copy()
            return
        combined = np.concatenate((self._samples, incoming))
        self._samples = combined[-self._capacity :]

    def recent(self, duration_ms: int) -> np.ndarray:
        if duration_ms < 0:
            raise ValueError("duration_ms must not be negative")
        count = min(
            len(self._samples),
            self.sample_rate * duration_ms // 1000,
        )
        if count == 0:
            return np.empty(0, dtype=np.int16)
        return self._samples[-count:].copy()

    def clear(self) -> None:
        self._samples = np.empty(0, dtype=np.int16)
```

- [ ] **Step 4: 验证并提交**

Run:

```bash
uv run --project workers/asr pytest workers/asr/src/asr_worker/test_audio_buffer.py -q
```

Expected: PASS。

```bash
git add workers/asr/src/asr_worker/audio_buffer.py \
  workers/asr/src/asr_worker/test_audio_buffer.py
git commit -m "feat: 实现有界滚动 PCM 时间窗口"
```

---

## Task 4：实现 FasterWhisperEngine

**Files:**

- Create: `workers/asr/src/asr_worker/test_faster_whisper_engine.py`
- Create: `workers/asr/src/asr_worker/faster_whisper_engine.py`

- [ ] **Step 1: 编写失败测试**

使用注入的假模型，禁止单元测试下载真实模型。测试至少覆盖：

- 非 16 kHz 或非单声道输入被拒绝。
- 非法 base64 和奇数字节 PCM 被拒绝。
- 前 1.6 秒之前不推理。
- 首次达到 1.6 秒时推理一次。
- 后续每新增 800 ms 推理一次。
- 推理窗口不超过 6 秒。
- 空识别结果返回 `None`。
- 结果保留输入 `session_id` 和 `sequence`。
- `avg_logprob` 转换为 `[0, 1]` 置信度。
- `reset()` 清空缓冲区和节流状态。

假模型形状：

```python
class FakeSegment:
    def __init__(
        self,
        text: str,
        start: float,
        end: float,
        avg_logprob: float,
    ) -> None:
        self.text = text
        self.start = start
        self.end = end
        self.avg_logprob = avg_logprob


class FakeModel:
    def __init__(self, segments: list[FakeSegment]) -> None:
        self.segments = segments
        self.inputs: list[np.ndarray] = []

    def transcribe(self, audio: np.ndarray, **kwargs: object):
        self.inputs.append(audio.copy())
        return iter(self.segments), object()
```

测试通过辅助函数构造 400 ms PCM：

```python
def audio_message(sequence: int, chunks: int = 1) -> AudioMessage:
    samples = np.ones(6400 * chunks, dtype="<i2")
    return AudioMessage(
        session_id="session-1",
        sequence=sequence,
        audio_data=base64.b64encode(samples.tobytes()).decode("ascii"),
        sample_rate=16000,
        channels=1,
    )
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
uv run --project workers/asr \
  pytest workers/asr/src/asr_worker/test_faster_whisper_engine.py -q
```

Expected:
`ModuleNotFoundError: No module named 'asr_worker.faster_whisper_engine'`。

- [ ] **Step 3: 实现配置和模型注入**

定义不可变配置：

```python
@dataclass(frozen=True)
class FasterWhisperConfig:
    model_name: str = "small.en"
    language: str = "en"
    device: str = "cpu"
    compute_type: str = "int8"
    min_window_ms: int = 1600
    step_ms: int = 800
    max_window_ms: int = 6000
```

构造函数接受可选 `model_factory`。生产默认工厂内部再导入
`faster_whisper.WhisperModel`，使测试可以完全替换模型构造。

- [ ] **Step 4: 实现 PCM 解码和推理节流**

处理流程：

1. 校验采样率和声道数。
2. `base64.b64decode(..., validate=True)`。
3. 校验字节数可被 2 整除。
4. 使用 `np.frombuffer(raw, dtype="<i2")` 解码。
5. 追加到 `RollingAudioBuffer`。
6. 累计本轮新增样本数。
7. 未达到首次窗口或 800 ms 步长时返回 `None`。
8. 将最近窗口转换为 `float32`，并除以 `32768.0`。
9. 调用 `model.transcribe()`，固定 `language="en"`、
   `condition_on_previous_text=False` 和 `vad_filter=True`。
10. 合并非空 segment 文本并生成一个临时 `ResultMessage`。

时间戳以当前会话累计输入样本为基准：

```python
window_end_ms = total_samples * 1000 // sample_rate
window_start_ms = max(0, window_end_ms - buffer.duration_ms)
```

segment 的相对秒数加到 `window_start_ms` 后转为绝对毫秒。文本为空时返回
`None`。结果暂设 `is_final=False`，稳定和定稿由后续 PR 处理。

- [ ] **Step 5: 验证并提交**

Run:

```bash
uv run --project workers/asr \
  pytest workers/asr/src/asr_worker/test_faster_whisper_engine.py -q
```

Expected: PASS，且测试输出不包含模型下载。

```bash
git add workers/asr/src/asr_worker/faster_whisper_engine.py \
  workers/asr/src/asr_worker/test_faster_whisper_engine.py
git commit -m "feat: 实现 faster-whisper PCM 识别引擎"
```

---

## Task 5：向 Worker 注入可选识别引擎

**Files:**

- Modify: `workers/asr/src/asr_worker/test_main.py`
- Modify: `workers/asr/src/asr_worker/main.py`

- [ ] **Step 1: 编写失败测试**

测试至少覆盖：

- `AsrWorker(input, output)` 仍默认使用 `MockAsrEngine`。
- 构造函数可注入满足 `AsrEngine` 的假引擎。
- `create_engine("mock", ...)` 返回 Mock。
- `create_engine("faster-whisper", ...)` 使用配置创建真实引擎。
- 未知引擎名称抛出明确错误。
- CLI 默认参数为 `mock`。
- 引擎处理错误继续保留输入 `session_id`。

- [ ] **Step 2: 确认新增测试失败**

Run:

```bash
uv run --project workers/asr pytest workers/asr/src/asr_worker/test_main.py -q
```

Expected: 因 `AsrWorker` 不接受 `engine` 或不存在 `create_engine` 而失败。

- [ ] **Step 3: 保持兼容地实现依赖注入**

构造函数：

```python
def __init__(
    self,
    input_stream: TextIO,
    output_stream: TextIO,
    engine: AsrEngine | None = None,
) -> None:
    self.input_stream = input_stream
    self.output_stream = output_stream
    self.engine = engine or MockAsrEngine()
    self.running = False
```

CLI：

```text
--engine {mock,faster-whisper}   默认 mock
--model small.en
--device cpu
--compute-type int8
```

只有显式传入 `--engine faster-whisper` 时才导入并初始化真实模型。不要修改
TypeScript `WhisperWorkerAdapter` 的默认启动命令。

- [ ] **Step 4: 验证默认路径和真实引擎选择**

Run:

```bash
uv run --project workers/asr pytest workers/asr/src/asr_worker/test_main.py -q
printf '' | uv run --project workers/asr python -m asr_worker.main
```

Expected:

- 测试通过。
- 默认命令立即输出一条 `status=ready` 消息。
- 不下载模型。

- [ ] **Step 5: 提交**

```bash
git add workers/asr/src/asr_worker/main.py workers/asr/src/asr_worker/test_main.py
git commit -m "feat: 支持 Worker 按参数选择识别引擎"
```

---

## Task 6：添加真实模型冒烟脚本和文档

**Files:**

- Create: `workers/asr/scripts/smoke_faster_whisper.py`
- Modify: `README.md`

- [ ] **Step 1: 实现可重复冒烟脚本**

脚本接受一个 16 kHz 单声道 PCM WAV 路径，按 400 ms 切块构造
`AudioMessage`，送入 `FasterWhisperEngine`，打印最后一个非空识别结果。

脚本必须：

- 校验 WAV 的声道、采样宽度和采样率。
- 非空识别时退出码为 0。
- 无识别结果或格式错误时退出码非 0。
- 不写入仓库目录。

- [ ] **Step 2: 在 macOS 生成固定语音并验证**

```bash
mkdir -p /tmp/ai-simulcast-smoke
say -v Samantha \
  "Today we are building a real time translation assistant." \
  -o /tmp/ai-simulcast-smoke/english-demo.aiff
afconvert \
  -f WAVE \
  -d LEI16@16000 \
  -c 1 \
  /tmp/ai-simulcast-smoke/english-demo.aiff \
  /tmp/ai-simulcast-smoke/english-demo.wav
uv run --project workers/asr \
  python workers/asr/scripts/smoke_faster_whisper.py \
  /tmp/ai-simulcast-smoke/english-demo.wav
```

Expected: 首次运行可能下载 `small.en` 模型，随后输出非空英文识别文本。

- [ ] **Step 3: README 说明运行模式**

README 明确区分：

- 默认 Mock：开发、CI、现有桌面演示。
- 真实模型：本地验收，需要首次下载模型。
- PR 07 尚未接通桌面 PCM 到真实 Worker；端到端链路属于 PR 08。

- [ ] **Step 4: 提交**

```bash
git add README.md workers/asr/scripts/smoke_faster_whisper.py
git commit -m "docs: 添加 faster-whisper 本地冒烟验证"
```

---

## Task 7：执行全量门禁并准备 PR

- [ ] **Step 1: Python 门禁**

```bash
uv sync --project workers/asr --extra dev --frozen
uv run --project workers/asr pytest -q
```

- [ ] **Step 2: 仓库门禁**

```bash
pnpm test:run
pnpm typecheck
pnpm build
git diff --check
```

- [ ] **Step 3: 验证默认演示路径未退化**

```bash
printf '' | uv run --project workers/asr python -m asr_worker.main
```

Expected: 5 秒内输出 Mock Worker ready，不触发模型下载。

- [ ] **Step 4: 准备 PR**

PR 标题：

```text
feat: 接入 faster-whisper PCM 识别引擎
```

PR 描述：

```markdown
## 功能描述

在 Python ASR Worker 中新增可选的 faster-whisper 识别引擎。显式启用后，
引擎将 16 kHz 单声道 PCM 按 6 秒滚动窗口、800 ms 步长输出英文原文。
默认仍使用 Mock 引擎，因此当前桌面演示和 CI 不下载模型。

## 实现思路

- 用统一 Protocol 解耦 Worker 和具体 ASR 引擎
- 用有界滚动缓冲区保存最近 6 秒 PCM
- 用最小窗口和步长控制推理频率
- 通过模型工厂注入假模型，避免单元测试下载模型
- 通过 CLI 显式选择真实引擎

## 测试方式

1. `uv run --project workers/asr pytest -q`
2. `pnpm test:run`
3. `pnpm typecheck`
4. `pnpm build`
5. 使用 README 中的固定语音命令执行真实模型冒烟测试

## 风险与限制

- 首次真实运行需要下载模型
- 本 PR 输出仍包含重叠窗口文本，去重和稳定化属于 PR 09
- 桌面音频到真实 Worker 的接线属于 PR 08
```

## PR 07 完成定义

- `FasterWhisperEngine` 满足现有 Worker 的单结果协议。
- 16 kHz 单声道 PCM 可按 6 秒窗口、800 ms 步长执行识别。
- 错误输入和模型异常返回可定位错误。
- 单元测试不下载真实模型。
- 默认 Worker 和当前桌面演示仍使用 Mock。
- 固定英语语音可通过冒烟脚本得到非空英文结果。
- Python 测试、仓库测试、类型检查、构建和 diff 检查全部通过。
- 所有提交信息均使用英文类型前缀和中文描述。
- PR 不包含 Electron 音频接线、字幕稳定、MiMo 或 UI 逻辑。

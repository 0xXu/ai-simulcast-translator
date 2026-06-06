# PR 06：Python ASR Worker 协议实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建独立 Python 进程，通过逐行 JSON 协议接收 base64 PCM，返回带会话、序号和时间戳的原文事件。首个 PR 使用确定性 Mock 引擎。

**Architecture:** 在 `workers/asr` 目录创建 Python 包，使用 uv 管理依赖。通过标准输入输出与 Electron 主进程通信，实现 ASR Worker 协议。

**Tech Stack:** Python 3.12、uv、pytest、TypeScript 6

---

## 审查修正

逐行 JSON 是协议边界，不能假设一次 Node stdout `data` 事件恰好对应一行。
修正后的要求：

- TypeScript 适配器维护持久字符串缓冲区，只处理完整换行消息。
- 支持一条 JSON 被拆到多个 chunk，也支持一个 chunk 包含多行 JSON。
- Worker 协议将非对象 JSON、缺少字段、字段类型错误统一转换为 `ValueError`，
  主循环返回 `INVALID_MESSAGE`。
- 音频处理失败时错误消息必须保留输入消息的 `session_id`。
- Worker 的相对路径和 `uv` 依赖可在开发阶段保留；打包运行时归 PR 14。

---

## 文件结构

```text
workers/asr/
  pyproject.toml              # Python 包配置
  uv.lock                     # uv 锁文件
  src/
    asr_worker/
      __init__.py
      protocol.py             # ASR 协议定义
      protocol.test.py        # 协议测试
      main.py                 # Worker 主入口
      main.test.py            # 主入口测试
      mock_engine.py          # Mock ASR 引擎
      mock_engine.test.py     # Mock 引擎测试
packages/infrastructure/src/asr/
  whisper-worker-adapter.ts   # TypeScript 适配器
  whisper-worker-adapter.test.ts  # 适配器测试
```

## 依赖关系

```text
workers/asr (Python Worker)
    ↑
packages/infrastructure/src/asr/ (TypeScript 适配器)
    ↑
apps/desktop/src/main/ (Electron 主进程)
```

---

## Task 1: 创建 Python 包基础结构

**Files:**
- Create: `workers/asr/pyproject.toml`
- Create: `workers/asr/src/asr_worker/__init__.py`

- [ ] **Step 1: 创建 workers/asr 目录**

```bash
mkdir -p workers/asr/src/asr_worker
```

- [ ] **Step 2: 创建 pyproject.toml**

```toml
# workers/asr/pyproject.toml

[project]
name = "asr-worker"
version = "0.1.0"
description = "AI 同声传译助手 ASR Worker"
requires-python = ">=3.12"
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-cov>=4.0.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/asr_worker"]

[tool.pytest.ini_options]
testpaths = ["src/asr_worker"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
```

- [ ] **Step 3: 创建 __init__.py**

```python
# workers/asr/src/asr_worker/__init__.py

"""ASR Worker 包"""

__version__ = "0.1.0"
```

- [ ] **Step 4: 使用 uv 安装依赖**

```bash
cd workers/asr
uv venv
uv pip install -e ".[dev]"
```

- [ ] **Step 5: 验证安装**

```bash
cd workers/asr
uv run pytest --version
```

Expected:

```text
pytest 8.x.x
```

- [ ] **Step 6: 提交基础结构**

```bash
git add workers/asr/pyproject.toml workers/asr/src/asr_worker/__init__.py
git commit -m "chore: 创建 ASR Worker Python 包"
```

---

## Task 2: 定义 ASR 协议（失败的测试）

**Files:**
- Create: `workers/asr/src/asr_worker/protocol.py`
- Create: `workers/asr/src/asr_worker/protocol.test.py`

- [ ] **Step 1: 定义 ASR 协议**

```python
# workers/asr/src/asr_worker/protocol.py

"""ASR Worker 协议定义"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional
import json


class MessageType(str, Enum):
    """消息类型"""
    AUDIO = "audio"
    RESULT = "result"
    ERROR = "error"
    STATUS = "status"


@dataclass
class AudioMessage:
    """音频消息"""
    session_id: str
    sequence: int
    audio_data: str  # base64 编码的 PCM 数据
    sample_rate: int = 16000
    channels: int = 1


@dataclass
class ResultMessage:
    """识别结果消息"""
    session_id: str
    sequence: int
    text: str
    confidence: float
    start_ms: int
    end_ms: int
    is_final: bool


@dataclass
class ErrorMessage:
    """错误消息"""
    session_id: str
    error_code: str
    error_message: str


@dataclass
class StatusMessage:
    """状态消息"""
    session_id: str
    status: str
    message: Optional[str] = None


def serialize_message(message: AudioMessage | ResultMessage | ErrorMessage | StatusMessage) -> str:
    """序列化消息为 JSON 字符串"""
    if isinstance(message, AudioMessage):
        data = {
            "type": MessageType.AUDIO.value,
            "session_id": message.session_id,
            "sequence": message.sequence,
            "audio_data": message.audio_data,
            "sample_rate": message.sample_rate,
            "channels": message.channels,
        }
    elif isinstance(message, ResultMessage):
        data = {
            "type": MessageType.RESULT.value,
            "session_id": message.session_id,
            "sequence": message.sequence,
            "text": message.text,
            "confidence": message.confidence,
            "start_ms": message.start_ms,
            "end_ms": message.end_ms,
            "is_final": message.is_final,
        }
    elif isinstance(message, ErrorMessage):
        data = {
            "type": MessageType.ERROR.value,
            "session_id": message.session_id,
            "error_code": message.error_code,
            "error_message": message.error_message,
        }
    elif isinstance(message, StatusMessage):
        data = {
            "type": MessageType.STATUS.value,
            "session_id": message.session_id,
            "status": message.status,
        }
        if message.message is not None:
            data["message"] = message.message
    else:
        raise ValueError(f"Unknown message type: {type(message)}")

    return json.dumps(data, ensure_ascii=False)


def deserialize_message(json_str: str) -> AudioMessage | ResultMessage | ErrorMessage | StatusMessage:
    """从 JSON 字符串反序列化消息"""
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}")

    message_type = data.get("type")
    if not message_type:
        raise ValueError("Missing 'type' field")

    try:
        msg_type = MessageType(message_type)
    except ValueError:
        raise ValueError(f"Unknown message type: {message_type}")

    if msg_type == MessageType.AUDIO:
        return AudioMessage(
            session_id=data["session_id"],
            sequence=data["sequence"],
            audio_data=data["audio_data"],
            sample_rate=data.get("sample_rate", 16000),
            channels=data.get("channels", 1),
        )
    elif msg_type == MessageType.RESULT:
        return ResultMessage(
            session_id=data["session_id"],
            sequence=data["sequence"],
            text=data["text"],
            confidence=data["confidence"],
            start_ms=data["start_ms"],
            end_ms=data["end_ms"],
            is_final=data["is_final"],
        )
    elif msg_type == MessageType.ERROR:
        return ErrorMessage(
            session_id=data["session_id"],
            error_code=data["error_code"],
            error_message=data["error_message"],
        )
    elif msg_type == MessageType.STATUS:
        return StatusMessage(
            session_id=data["session_id"],
            status=data["status"],
            message=data.get("message"),
        )
    else:
        raise ValueError(f"Unhandled message type: {msg_type}")
```

- [ ] **Step 2: 编写协议测试**

```python
# workers/asr/src/asr_worker/protocol.test.py

"""ASR 协议测试"""

import pytest
from .protocol import (
    AudioMessage,
    ResultMessage,
    ErrorMessage,
    StatusMessage,
    MessageType,
    serialize_message,
    deserialize_message,
)


class TestSerializeMessage:
    """测试消息序列化"""

    def test_serialize_audio_message(self):
        message = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64encodeddata",
            sample_rate=16000,
            channels=1,
        )
        result = serialize_message(message)

        assert '"type": "audio"' in result
        assert '"session_id": "session-001"' in result
        assert '"sequence": 1' in result

    def test_serialize_result_message(self):
        message = ResultMessage(
            session_id="session-001",
            sequence=1,
            text="Hello",
            confidence=0.95,
            start_ms=0,
            end_ms=1000,
            is_final=True,
        )
        result = serialize_message(message)

        assert '"type": "result"' in result
        assert '"text": "Hello"' in result
        assert '"is_final": true' in result

    def test_serialize_error_message(self):
        message = ErrorMessage(
            session_id="session-001",
            error_code="INVALID_AUDIO",
            error_message="Invalid audio format",
        )
        result = serialize_message(message)

        assert '"type": "error"' in result
        assert '"error_code": "INVALID_AUDIO"' in result

    def test_serialize_status_message(self):
        message = StatusMessage(
            session_id="session-001",
            status="ready",
            message="Worker is ready",
        )
        result = serialize_message(message)

        assert '"type": "status"' in result
        assert '"status": "ready"' in result
        assert '"message": "Worker is ready"' in result


class TestDeserializeMessage:
    """测试消息反序列化"""

    def test_deserialize_audio_message(self):
        json_str = '{"type": "audio", "session_id": "session-001", "sequence": 1, "audio_data": "base64data", "sample_rate": 16000, "channels": 1}'
        message = deserialize_message(json_str)

        assert isinstance(message, AudioMessage)
        assert message.session_id == "session-001"
        assert message.sequence == 1
        assert message.audio_data == "base64data"

    def test_deserialize_result_message(self):
        json_str = '{"type": "result", "session_id": "session-001", "sequence": 1, "text": "Hello", "confidence": 0.95, "start_ms": 0, "end_ms": 1000, "is_final": true}'
        message = deserialize_message(json_str)

        assert isinstance(message, ResultMessage)
        assert message.text == "Hello"
        assert message.is_final is True

    def test_deserialize_error_message(self):
        json_str = '{"type": "error", "session_id": "session-001", "error_code": "INVALID_AUDIO", "error_message": "Invalid audio format"}'
        message = deserialize_message(json_str)

        assert isinstance(message, ErrorMessage)
        assert message.error_code == "INVALID_AUDIO"

    def test_deserialize_status_message(self):
        json_str = '{"type": "status", "session_id": "session-001", "status": "ready", "message": "Worker is ready"}'
        message = deserialize_message(json_str)

        assert isinstance(message, StatusMessage)
        assert message.status == "ready"
        assert message.message == "Worker is ready"

    def test_deserialize_invalid_json(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            deserialize_message("invalid json")

    def test_deserialize_missing_type(self):
        json_str = '{"session_id": "session-001"}'
        with pytest.raises(ValueError, match="Missing 'type' field"):
            deserialize_message(json_str)

    def test_deserialize_unknown_type(self):
        json_str = '{"type": "unknown", "session_id": "session-001"}'
        with pytest.raises(ValueError, match="Unknown message type"):
            deserialize_message(json_str)


class TestRoundTrip:
    """测试序列化/反序列化往返"""

    def test_audio_message_roundtrip(self):
        original = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64data",
            sample_rate=16000,
            channels=1,
        )
        serialized = serialize_message(original)
        deserialized = deserialize_message(serialized)

        assert isinstance(deserialized, AudioMessage)
        assert deserialized.session_id == original.session_id
        assert deserialized.sequence == original.sequence
        assert deserialized.audio_data == original.audio_data

    def test_result_message_roundtrip(self):
        original = ResultMessage(
            session_id="session-001",
            sequence=1,
            text="Hello",
            confidence=0.95,
            start_ms=0,
            end_ms=1000,
            is_final=True,
        )
        serialized = serialize_message(original)
        deserialized = deserialize_message(serialized)

        assert isinstance(deserialized, ResultMessage)
        assert deserialized.text == original.text
        assert deserialized.is_final == original.is_final
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd workers/asr
uv run pytest src/asr_worker/protocol.test.py -v
```

Expected:

```text
FAIL  src/asr_worker/protocol.test.py
Error: Cannot find module './protocol'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add workers/asr/src/asr_worker/protocol.py workers/asr/src/asr_worker/protocol.test.py
git commit -m "test: 定义 ASR 协议"
```

---

## Task 3: 实现 ASR 协议

**Files:**
- Modify: `workers/asr/src/asr_worker/protocol.py`（已在 Task 2 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd workers/asr
uv run pytest src/asr_worker/protocol.test.py -v
```

Expected:

```text
Test Files  1 passed (1)
Tests       15 passed (15)
```

- [ ] **Step 2: 提交实现**

```bash
git add workers/asr/src/asr_worker/protocol.py
git commit -m "feat: 实现 ASR 协议"
```

---

## Task 4: 实现 Mock ASR 引擎（失败的测试）

**Files:**
- Create: `workers/asr/src/asr_worker/mock_engine.py`
- Create: `workers/asr/src/asr_worker/mock_engine.test.py`

- [ ] **Step 1: 定义 Mock ASR 引擎**

```python
# workers/asr/src/asr_worker/mock_engine.py

"""Mock ASR 引擎 - 用于测试和开发"""

from typing import Optional
from .protocol import AudioMessage, ResultMessage


class MockAsrEngine:
    """确定性 Mock ASR 引擎"""

    def __init__(self):
        self.processed_count = 0

    def process_audio(self, audio_message: AudioMessage) -> Optional[ResultMessage]:
        """处理音频数据，返回识别结果"""
        self.processed_count += 1

        # 模拟识别结果
        return ResultMessage(
            session_id=audio_message.session_id,
            sequence=audio_message.sequence,
            text=f"Mock result {self.processed_count}",
            confidence=0.95,
            start_ms=0,
            end_ms=1000,
            is_final=True,
        )

    def reset(self):
        """重置引擎状态"""
        self.processed_count = 0
```

- [ ] **Step 2: 编写 Mock 引擎测试**

```python
# workers/asr/src/asr_worker/mock_engine.test.py

"""Mock ASR 引擎测试"""

import pytest
from .mock_engine import MockAsrEngine
from .protocol import AudioMessage


class TestMockAsrEngine:
    """测试 Mock ASR 引擎"""

    def test_process_audio_returns_result(self):
        engine = MockAsrEngine()
        audio = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64data",
        )

        result = engine.process_audio(audio)

        assert result is not None
        assert result.session_id == "session-001"
        assert result.sequence == 1
        assert "Mock result 1" in result.text
        assert result.confidence == 0.95
        assert result.is_final is True

    def test_process_audio_increments_count(self):
        engine = MockAsrEngine()
        audio = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64data",
        )

        engine.process_audio(audio)
        assert engine.processed_count == 1

        engine.process_audio(audio)
        assert engine.processed_count == 2

    def test_reset_clears_state(self):
        engine = MockAsrEngine()
        audio = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64data",
        )

        engine.process_audio(audio)
        assert engine.processed_count == 1

        engine.reset()
        assert engine.processed_count == 0
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd workers/asr
uv run pytest src/asr_worker/mock_engine.test.py -v
```

Expected:

```text
FAIL  src/asr_worker/mock_engine.test.py
Error: Cannot find module './mock_engine'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add workers/asr/src/asr_worker/mock_engine.py workers/asr/src/asr_worker/mock_engine.test.py
git commit -m "test: 定义 Mock ASR 引擎"
```

---

## Task 5: 实现 Mock ASR 引擎

**Files:**
- Modify: `workers/asr/src/asr_worker/mock_engine.py`（已在 Task 4 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd workers/asr
uv run pytest src/asr_worker/mock_engine.test.py -v
```

Expected:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
```

- [ ] **Step 2: 提交实现**

```bash
git add workers/asr/src/asr_worker/mock_engine.py
git commit -m "feat: 实现 Mock ASR 引擎"
```

---

## Task 6: 实现 Worker 主入口（失败的测试）

**Files:**
- Create: `workers/asr/src/asr_worker/main.py`
- Create: `workers/asr/src/asr_worker/main.test.py`

- [ ] **Step 1: 定义 Worker 主入口**

```python
# workers/asr/src/asr_worker/main.py

"""ASR Worker 主入口"""

import sys
import json
from typing import TextIO

from .protocol import (
    AudioMessage,
    ResultMessage,
    ErrorMessage,
    StatusMessage,
    serialize_message,
    deserialize_message,
)
from .mock_engine import MockAsrEngine


class AsrWorker:
    """ASR Worker 主类"""

    def __init__(self, input_stream: TextIO, output_stream: TextIO):
        self.input_stream = input_stream
        self.output_stream = output_stream
        self.engine = MockAsrEngine()
        self.running = False

    def run(self):
        """运行 Worker"""
        self.running = True

        # 发送就绪状态
        self._send_status("ready", "ASR Worker is ready")

        while self.running:
            try:
                line = self.input_stream.readline()
                if not line:
                    break

                line = line.strip()
                if not line:
                    continue

                self._process_message(line)
            except Exception as e:
                self._send_error("UNKNOWN", str(e))

    def stop(self):
        """停止 Worker"""
        self.running = False

    def _process_message(self, line: str):
        """处理输入消息"""
        try:
            message = deserialize_message(line)
        except ValueError as e:
            self._send_error("INVALID_MESSAGE", str(e))
            return

        if isinstance(message, AudioMessage):
            self._process_audio(message)
        else:
            self._send_error("UNSUPPORTED_TYPE", f"Unsupported message type: {type(message)}")

    def _process_audio(self, audio: AudioMessage):
        """处理音频数据"""
        try:
            result = self.engine.process_audio(audio)
            if result:
                self._send_result(result)
        except Exception as e:
            self._send_error("PROCESSING_ERROR", str(e))

    def _send_result(self, result: ResultMessage):
        """发送识别结果"""
        self._send_message(serialize_message(result))

    def _send_error(self, error_code: str, error_message: str, session_id: str = ""):
        """发送错误消息"""
        error = ErrorMessage(
            session_id=session_id,
            error_code=error_code,
            error_message=error_message,
        )
        self._send_message(serialize_message(error))

    def _send_status(self, status: str, message: str = None, session_id: str = ""):
        """发送状态消息"""
        status_msg = StatusMessage(
            session_id=session_id,
            status=status,
            message=message,
        )
        self._send_message(serialize_message(status_msg))

    def _send_message(self, message: str):
        """发送消息到输出流"""
        self.output_stream.write(message + "\n")
        self.output_stream.flush()


def main():
    """主入口"""
    worker = AsrWorker(sys.stdin, sys.stdout)
    worker.run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 编写 Worker 主入口测试**

```python
# workers/asr/src/asr_worker/main.test.py

"""ASR Worker 主入口测试"""

import io
import pytest
from .main import AsrWorker
from .protocol import AudioMessage, serialize_message


class TestAsrWorker:
    """测试 ASR Worker"""

    def test_worker_sends_ready_status(self):
        input_stream = io.StringIO("")
        output_stream = io.StringIO()

        worker = AsrWorker(input_stream, output_stream)
        worker.run()

        output = output_stream.getvalue()
        assert '"status": "ready"' in output
        assert '"message": "ASR Worker is ready"' in output

    def test_worker_processes_audio_message(self):
        audio = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64data",
        )
        input_stream = io.StringIO(serialize_message(audio) + "\n")
        output_stream = io.StringIO()

        worker = AsrWorker(input_stream, output_stream)
        worker.run()

        output = output_stream.getvalue()
        assert '"type": "result"' in output
        assert '"text": "Mock result 1"' in output

    def test_worker_handles_invalid_json(self):
        input_stream = io.StringIO("invalid json\n")
        output_stream = io.StringIO()

        worker = AsrWorker(input_stream, output_stream)
        worker.run()

        output = output_stream.getvalue()
        assert '"type": "error"' in output
        assert '"error_code": "INVALID_MESSAGE"' in output

    def test_worker_handles_missing_type(self):
        input_stream = io.StringIO('{"session_id": "session-001"}\n')
        output_stream = io.StringIO()

        worker = AsrWorker(input_stream, output_stream)
        worker.run()

        output = output_stream.getvalue()
        assert '"type": "error"' in output
        assert '"error_code": "INVALID_MESSAGE"' in output

    def test_worker_stops_on_empty_input(self):
        input_stream = io.StringIO("")
        output_stream = io.StringIO()

        worker = AsrWorker(input_stream, output_stream)
        worker.run()

        # 应该只发送 ready 状态然后退出
        output = output_stream.getvalue()
        assert '"status": "ready"' in output
```

- [ ] **Step 3: 运行测试验证失败**

Run:

```bash
cd workers/asr
uv run pytest src/asr_worker/main.test.py -v
```

Expected:

```text
FAIL  src/asr_worker/main.test.py
Error: Cannot find module './main'
```

- [ ] **Step 4: 提交失败测试**

```bash
git add workers/asr/src/asr_worker/main.py workers/asr/src/asr_worker/main.test.py
git commit -m "test: 定义 Worker 主入口"
```

---

## Task 7: 实现 Worker 主入口

**Files:**
- Modify: `workers/asr/src/asr_worker/main.py`（已在 Task 6 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd workers/asr
uv run pytest src/asr_worker/main.test.py -v
```

Expected:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

- [ ] **Step 2: 提交实现**

```bash
git add workers/asr/src/asr_worker/main.py
git commit -m "feat: 实现 Worker 主入口"
```

---

## Task 8: 创建 TypeScript 适配器（失败的测试）

**Files:**
- Create: `packages/infrastructure/src/asr/whisper-worker-adapter.ts`
- Create: `packages/infrastructure/src/asr/whisper-worker-adapter.test.ts`

- [ ] **Step 1: 创建 asr 目录**

```bash
mkdir -p packages/infrastructure/src/asr
```

- [ ] **Step 2: 定义 TypeScript 适配器**

```typescript
// packages/infrastructure/src/asr/whisper-worker-adapter.ts

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

/**
 * ASR Worker 消息类型
 */
export interface AsrMessage {
  readonly type: string;
  readonly session_id?: string;
  readonly sequence?: number;
  readonly text?: string;
  readonly confidence?: number;
  readonly start_ms?: number;
  readonly end_ms?: number;
  readonly is_final?: boolean;
  readonly error_code?: string;
  readonly error_message?: string;
  readonly status?: string;
  readonly message?: string;
}

/**
 * ASR Worker 适配器
 */
export class WhisperWorkerAdapter extends EventEmitter {
  private process: ChildProcess | null = null;
  private isReady: boolean = false;
  private sequenceCounter: number = 0;
  private stdoutBuffer: string = "";

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.process = spawn("uv", ["run", "python", "-m", "asr_worker.main"], {
        cwd: "workers/asr",
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.stdoutBuffer += data.toString();
        const lines = this.stdoutBuffer.split("\n");
        this.stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim()) {
            this._handleMessage(line);
          }
        }
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        console.error("ASR Worker stderr:", data.toString());
      });

      this.process.on("error", (error: Error) => {
        this.emit("error", error);
        reject(error);
      });

      this.process.on("exit", (code: number | null) => {
        this.emit("exit", code);
        this.process = null;
        this.isReady = false;
      });

      // 等待 ready 状态
      this.once("ready", () => {
        this.isReady = true;
        resolve();
      });

      // 超时处理
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error("ASR Worker startup timeout"));
        }
      }, 5000);
    });
  }

  /**
   * 停止 Worker
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isReady = false;
    }
  }

  /**
   * 发送音频数据
   */
  sendAudio(sessionId: string, audioData: string, sampleRate: number = 16000, channels: number = 1): void {
    if (!this.process || !this.isReady) {
      throw new Error("ASR Worker is not ready");
    }

    this.sequenceCounter++;
    const message = {
      type: "audio",
      session_id: sessionId,
      sequence: this.sequenceCounter,
      audio_data: audioData,
      sample_rate: sampleRate,
      channels: channels,
    };

    this.process.stdin?.write(JSON.stringify(message) + "\n");
  }

  /**
   * 检查是否就绪
   */
  getIsReady(): boolean {
    return this.isReady;
  }

  /**
   * 处理消息
   */
  private _handleMessage(line: string): void {
    try {
      const message: AsrMessage = JSON.parse(line);

      if (message.type === "status" && message.status === "ready") {
        this.emit("ready");
      } else if (message.type === "result") {
        this.emit("result", message);
      } else if (message.type === "error") {
        this.emit("error", new Error(message.error_message || "Unknown error"));
      }
    } catch (error) {
      this.emit("error", new Error(`Failed to parse message: ${line}`));
    }
  }
}
```

- [ ] **Step 3: 编写适配器测试**

```typescript
// packages/infrastructure/src/asr/whisper-worker-adapter.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhisperWorkerAdapter } from "./whisper-worker-adapter";

describe("WhisperWorkerAdapter", () => {
  let adapter: WhisperWorkerAdapter;

  beforeEach(() => {
    adapter = new WhisperWorkerAdapter();
  });

  afterEach(() => {
    adapter.stop();
  });

  it("initializes with not ready state", () => {
    expect(adapter.getIsReady()).toBe(false);
  });

  it("emits ready event", () => {
    const readyCallback = vi.fn();
    adapter.on("ready", readyCallback);

    // 模拟 ready 消息
    adapter["_handleMessage"]('{"type": "status", "status": "ready"}');

    expect(readyCallback).toHaveBeenCalled();
    expect(adapter.getIsReady()).toBe(true);
  });

  it("emits result event", () => {
    const resultCallback = vi.fn();
    adapter.on("result", resultCallback);

    // 模拟 result 消息
    adapter["_handleMessage"]('{"type": "result", "session_id": "session-001", "sequence": 1, "text": "Hello", "confidence": 0.95, "start_ms": 0, "end_ms": 1000, "is_final": true}');

    expect(resultCallback).toHaveBeenCalled();
    expect(resultCallback.mock.calls[0][0].text).toBe("Hello");
  });

  it("emits error event", () => {
    const errorCallback = vi.fn();
    adapter.on("error", errorCallback);

    // 模拟 error 消息
    adapter["_handleMessage"]('{"type": "error", "session_id": "session-001", "error_code": "INVALID_AUDIO", "error_message": "Invalid audio format"}');

    expect(errorCallback).toHaveBeenCalled();
  });

  it("throws when sending audio before ready", () => {
    expect(() => {
      adapter.sendAudio("session-001", "base64data");
    }).toThrow("ASR Worker is not ready");
  });
});
```

- [ ] **Step 4: 运行测试验证失败**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/infrastructure test:run
```

Expected:

```text
FAIL  src/asr/whisper-worker-adapter.test.ts
Error: Cannot find module './whisper-worker-adapter'
```

- [ ] **Step 5: 提交失败测试**

```bash
git add packages/infrastructure/src/asr/whisper-worker-adapter.ts packages/infrastructure/src/asr/whisper-worker-adapter.test.ts
git commit -m "test: 定义 TypeScript ASR 适配器"
```

---

## Task 9: 实现 TypeScript 适配器

**Files:**
- Modify: `packages/infrastructure/src/asr/whisper-worker-adapter.ts`（已在 Task 8 创建）

- [ ] **Step 1: 运行测试验证通过**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/infrastructure test:run
```

Expected:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

- [ ] **Step 2: 提交实现**

```bash
git add packages/infrastructure/src/asr/whisper-worker-adapter.ts
git commit -m "feat: 实现 TypeScript ASR 适配器"
```

---

## Task 10: 更新基础设施包公开入口

**Files:**
- Modify: `packages/infrastructure/src/index.ts`

- [ ] **Step 1: 更新 index.ts 导出 ASR 适配器**

```typescript
// packages/infrastructure/src/index.ts

export {
  WhisperWorkerAdapter,
  type AsrMessage,
} from "./asr/whisper-worker-adapter";
```

- [ ] **Step 2: 验证类型导出**

Run:

```bash
cd /Users/huangxu/Desktop/ai-simulcast-translator
pnpm --filter @simulcast/infrastructure typecheck
```

Expected:

```text
Exit code 0
```

- [ ] **Step 3: 提交入口文件**

```bash
git add packages/infrastructure/src/index.ts
git commit -m "feat: 更新基础设施包公开入口以包含 ASR 适配器"
```

---

## Task 11: PR 合并前检查

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
cd workers/asr
uv run pytest
```

Expected:

```text
测试和类型检查全部通过
```

- [ ] **Step 3: 准备 PR**

PR 标题：

```text
feat: 新增 Python ASR Worker 协议
```

PR 描述：

```markdown
## 功能描述

创建独立 Python 进程，通过逐行 JSON 协议接收 base64 PCM，返回带会话、序号和时间戳的原文事件。首个 PR 使用确定性 Mock 引擎。

## 实现思路

- 创建 Python 包，使用 uv 管理依赖
- 定义 ASR 协议（AudioMessage、ResultMessage、ErrorMessage、StatusMessage）
- 实现 Mock ASR 引擎，用于测试和开发
- 实现 Worker 主入口，处理输入输出流
- 创建 TypeScript 适配器，与 Electron 主进程通信

## 测试方式

1. 执行 `cd workers/asr && uv run pytest`
2. 执行 `pnpm -r test:run`
3. 执行 `pnpm -r typecheck`

## 验证结果

- ✅ Python 测试通过
- ✅ TypeScript 测试通过
- ✅ 类型检查通过
- ✅ 工作树干净
```

---

## PR 06 完成定义

- `workers/asr` Python 包可独立编译和测试。
- ASR 协议定义完整（AudioMessage、ResultMessage、ErrorMessage、StatusMessage）。
- Mock ASR 引擎可以处理音频数据并返回识别结果。
- Worker 主入口可以处理输入输出流。
- TypeScript 适配器可以与 Worker 通信。
- `uv run pytest`、`pnpm -r test:run`、`pnpm -r typecheck` 全部通过。
- 所有提交信息均使用英文类型前缀和中文描述。
- PR 只交付 Python ASR Worker 协议，不包含 faster-whisper、MiMo 或 UI 逻辑。

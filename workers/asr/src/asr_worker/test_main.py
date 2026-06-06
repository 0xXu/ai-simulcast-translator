# workers/asr/src/asr_worker/test_main.py

"""ASR Worker 主入口测试"""

import io
import json
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

    def test_worker_handles_non_object_json_as_invalid_message(self):
        input_stream = io.StringIO("[]\n")
        output_stream = io.StringIO()

        worker = AsrWorker(input_stream, output_stream)
        worker.run()

        output = output_stream.getvalue()
        assert '"error_code": "INVALID_MESSAGE"' in output
        assert '"error_code": "UNKNOWN"' not in output

    def test_processing_error_preserves_session_id(self):
        audio = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64data",
        )
        input_stream = io.StringIO(serialize_message(audio) + "\n")
        output_stream = io.StringIO()
        worker = AsrWorker(input_stream, output_stream)

        def fail_processing(_audio):
            raise RuntimeError("engine failed")

        worker.engine.process_audio = fail_processing
        worker.run()

        messages = [
            json.loads(line)
            for line in output_stream.getvalue().splitlines()
        ]
        error = next(message for message in messages if message["type"] == "error")
        assert error["error_code"] == "PROCESSING_ERROR"
        assert error["session_id"] == "session-001"

    def test_worker_stops_on_empty_input(self):
        input_stream = io.StringIO("")
        output_stream = io.StringIO()

        worker = AsrWorker(input_stream, output_stream)
        worker.run()

        # 应该只发送 ready 状态然后退出
        output = output_stream.getvalue()
        assert '"status": "ready"' in output

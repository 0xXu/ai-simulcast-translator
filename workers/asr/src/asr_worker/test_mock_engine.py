# workers/asr/src/asr_worker/test_mock_engine.py

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

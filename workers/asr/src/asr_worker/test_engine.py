from asr_worker.engine import AsrEngine
from asr_worker.mock_engine import MockAsrEngine
from asr_worker.faster_whisper_engine import FasterWhisperEngine


def test_mock_engine_implements_asr_engine() -> None:
    assert isinstance(MockAsrEngine(), AsrEngine)


def test_faster_whisper_engine_implements_asr_engine() -> None:
    assert isinstance(FasterWhisperEngine(), AsrEngine)

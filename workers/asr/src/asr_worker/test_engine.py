from asr_worker.engine import AsrEngine
from asr_worker.mock_engine import MockAsrEngine


def test_mock_engine_implements_asr_engine() -> None:
    assert isinstance(MockAsrEngine(), AsrEngine)

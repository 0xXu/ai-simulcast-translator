import numpy as np
import pytest

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


@pytest.mark.parametrize(
    ("sample_rate", "max_duration_ms"),
    [(0, 1000), (1000, 0), (-1, 1000), (1000, -1)],
)
def test_rejects_non_positive_constructor_arguments(
    sample_rate: int,
    max_duration_ms: int,
) -> None:
    with pytest.raises(ValueError):
        RollingAudioBuffer(sample_rate=sample_rate, max_duration_ms=max_duration_ms)


def test_rejects_negative_recent_duration() -> None:
    buffer = RollingAudioBuffer(sample_rate=1000, max_duration_ms=1000)

    with pytest.raises(ValueError):
        buffer.recent(-1)


def test_append_converts_input_to_flat_int16() -> None:
    buffer = RollingAudioBuffer(sample_rate=1000, max_duration_ms=1000)
    buffer.append([[1.9, 2.1], [3.7, 4.2]])

    actual = buffer.recent(1000)

    assert actual.dtype == np.int16
    assert actual.tolist() == [1, 2, 3, 4]


def test_recent_returns_copy() -> None:
    buffer = RollingAudioBuffer(sample_rate=1000, max_duration_ms=1000)
    buffer.append(np.arange(5, dtype=np.int16))

    actual = buffer.recent(1000)
    actual[0] = 99

    assert buffer.recent(1000).tolist() == [0, 1, 2, 3, 4]

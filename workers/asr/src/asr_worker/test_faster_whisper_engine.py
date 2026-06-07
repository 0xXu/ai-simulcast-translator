"""Tests for FasterWhisperEngine — uses injected FakeModel, no real download."""

import base64
import math

import numpy as np
import pytest

from asr_worker.faster_whisper_engine import FasterWhisperConfig, FasterWhisperEngine
from asr_worker.protocol import AudioMessage


# ---------------------------------------------------------------------------
# Fake model
# ---------------------------------------------------------------------------


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
    def __init__(
        self,
        segments: list[FakeSegment],
        language: str = "en",
        language_probability: float = 0.91,
    ) -> None:
        self.segments = segments
        self.language = language
        self.language_probability = language_probability
        self.inputs: list[np.ndarray] = []
        self.kwargs: list[dict[str, object]] = []

    def transcribe(self, audio: np.ndarray, **kwargs: object):
        self.inputs.append(audio.copy())
        self.kwargs.append(kwargs)
        info = type(
            "TranscriptionInfo",
            (),
            {
                "language": self.language,
                "language_probability": self.language_probability,
            },
        )()
        return iter(self.segments), info


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def audio_message(sequence: int, chunks: int = 1) -> AudioMessage:
    """Build an AudioMessage carrying *chunks* x 400 ms of silence."""
    samples = np.ones(6400 * chunks, dtype="<i2")
    return AudioMessage(
        session_id="session-1",
        sequence=sequence,
        audio_data=base64.b64encode(samples.tobytes()).decode("ascii"),
        sample_rate=16000,
        channels=1,
    )


def _make_engine(
    segments: list[FakeSegment] | None = None,
    config: FasterWhisperConfig | None = None,
) -> tuple[FasterWhisperEngine, FakeModel]:
    if segments is None:
        segments = [
            FakeSegment(text="hello", start=0.0, end=1.0, avg_logprob=-0.5),
        ]
    model = FakeModel(segments)
    engine = FasterWhisperEngine(
        config=config,
        model_factory=lambda **kw: model,
    )
    return engine, model


def _feed(engine: FasterWhisperEngine, n: int, *, chunks: int = 1, start: int = 1):
    """Feed *n* sequential messages (starting at sequence *start*) and return the last result."""
    result = None
    for i in range(start, start + n):
        result = engine.process_audio(audio_message(i, chunks=chunks))
    return result


# ---------------------------------------------------------------------------
# 1. Non-16 kHz rejected
# ---------------------------------------------------------------------------


def test_rejects_non_16k_sample_rate():
    engine, _ = _make_engine()
    msg = audio_message(1)
    msg.sample_rate = 44100
    with pytest.raises(ValueError, match="16000"):
        engine.process_audio(msg)


# ---------------------------------------------------------------------------
# 2. Non-mono rejected
# ---------------------------------------------------------------------------


def test_rejects_non_mono():
    engine, _ = _make_engine()
    msg = audio_message(1)
    msg.channels = 2
    with pytest.raises(ValueError, match="mono"):
        engine.process_audio(msg)


# ---------------------------------------------------------------------------
# 3. Invalid base64 rejected
# ---------------------------------------------------------------------------


def test_rejects_invalid_base64():
    engine, _ = _make_engine()
    msg = audio_message(1)
    msg.audio_data = "!!!not-valid-base64!!!"
    with pytest.raises(Exception):
        engine.process_audio(msg)


# ---------------------------------------------------------------------------
# 4. Odd-byte PCM rejected
# ---------------------------------------------------------------------------


def test_rejects_odd_byte_count():
    engine, _ = _make_engine()
    msg = audio_message(1)
    msg.audio_data = base64.b64encode(b"\x00" * 7).decode("ascii")
    with pytest.raises(ValueError, match="even"):
        engine.process_audio(msg)


# ---------------------------------------------------------------------------
# 5. No inference before 1.0 s
# ---------------------------------------------------------------------------


def test_no_inference_before_min_window():
    engine, model = _make_engine()
    result = _feed(engine, 2)
    assert result is None
    assert len(model.inputs) == 0


# ---------------------------------------------------------------------------
# 6. First inference at 1.0 s
# ---------------------------------------------------------------------------


def test_first_inference_at_min_window():
    engine, model = _make_engine()
    result = _feed(engine, 3)
    assert result is not None
    assert len(model.inputs) == 1


# ---------------------------------------------------------------------------
# 7. Subsequent inference every 400 ms
# ---------------------------------------------------------------------------


def test_subsequent_inference_every_step():
    engine, model = _make_engine()
    _feed(engine, 3, start=1)    # 1200 ms — 1st inference
    _feed(engine, 1, start=4)    # 1600 ms — 2nd inference (+400 ms from last)
    assert len(model.inputs) == 2
    _feed(engine, 1, start=5)    # 2000 ms — 3rd inference (+400 ms more)
    assert len(model.inputs) == 3
    _feed(engine, 2, start=6)    # 2800 ms — 4th & 5th inference (+400 ms each)
    assert len(model.inputs) == 5


# ---------------------------------------------------------------------------
# 8. Inference window capped at max_window_ms
# ---------------------------------------------------------------------------


def test_inference_window_capped():
    engine, model = _make_engine()
    _feed(engine, 6, start=1)
    assert len(model.inputs) == 4
    max_samples = 16000 * 4000 // 1000
    assert model.inputs[-1].size <= max_samples


# ---------------------------------------------------------------------------
# 9. Empty recognition returns None
# ---------------------------------------------------------------------------


def test_empty_segments_returns_none():
    engine, model = _make_engine(segments=[])
    result = _feed(engine, 3)
    assert result is None
    assert len(model.inputs) == 1


def test_all_blank_text_returns_none():
    segs = [FakeSegment(text="   ", start=0.0, end=1.0, avg_logprob=-0.3)]
    engine, model = _make_engine(segments=segs)
    result = _feed(engine, 3)
    assert result is None


# ---------------------------------------------------------------------------
# 10. session_id and sequence preserved
# ---------------------------------------------------------------------------


def test_result_preserves_session_and_sequence():
    engine, _ = _make_engine()
    result = _feed(engine, 4)
    assert result is not None
    assert result.session_id == "session-1"
    assert result.sequence == 4


# ---------------------------------------------------------------------------
# 11. avg_logprob -> confidence via exp()
# ---------------------------------------------------------------------------


def test_confidence_from_avg_logprob():
    logprob = -0.5
    segs = [FakeSegment(text="hi", start=0.0, end=1.0, avg_logprob=logprob)]
    engine, _ = _make_engine(segments=segs)
    result = _feed(engine, 4)
    assert result is not None
    expected = math.exp(logprob)
    assert abs(result.confidence - expected) < 1e-6


def test_confidence_clamped_to_0_1():
    segs = [FakeSegment(text="x", start=0.0, end=1.0, avg_logprob=-100.0)]
    engine, _ = _make_engine(segments=segs)
    result = _feed(engine, 4)
    assert result is not None
    assert result.confidence == 0.0


# ---------------------------------------------------------------------------
# 12. reset() clears buffer and throttle state
# ---------------------------------------------------------------------------


def test_reset_clears_state():
    engine, model = _make_engine()
    _feed(engine, 6, start=1)
    assert len(model.inputs) == 4  # 1200ms, 1600ms, 2000ms, 2400ms

    engine.reset()
    model.inputs.clear()

    result = _feed(engine, 2, start=1)
    assert result is None
    assert len(model.inputs) == 0

    # Feed 3 messages: total 800 + 1200 = 2000 ms.
    # First message of this batch (msg 3) crosses 1000 ms min_window → inference.
    _feed(engine, 3, start=3)
    assert len(model.inputs) >= 1


# ---------------------------------------------------------------------------
# Timestamp correctness
# ---------------------------------------------------------------------------


def test_timestamps_use_absolute_positions():
    segs = [
        FakeSegment(text="hello", start=0.0, end=1.0, avg_logprob=-0.2),
    ]
    engine, _ = _make_engine(segments=segs)
    result = _feed(engine, 4)
    assert result is not None
    assert result.start_ms == 0
    assert result.end_ms == 1000


def test_timestamps_offset_for_later_window():
    segs = [
        FakeSegment(text="world", start=0.0, end=1.0, avg_logprob=-0.1),
    ]
    engine, _ = _make_engine(segments=segs)
    result = _feed(engine, 6)
    assert result is not None
    assert result.start_ms == 0
    assert result.end_ms == 1000


def test_is_final_always_false():
    engine, _ = _make_engine()
    result = _feed(engine, 4)
    assert result is not None
    assert result.is_final is False


def test_auto_language_detection_omits_language_constraint():
    engine, model = _make_engine(
        config=FasterWhisperConfig(model_name="small", language=None),
    )

    result = _feed(engine, 4)

    assert result is not None
    assert "language" not in model.kwargs[0]
    assert result.detected_language == "en"
    assert result.language_probability == pytest.approx(0.91)


def test_manual_language_is_passed_to_transcribe():
    engine, model = _make_engine(
        config=FasterWhisperConfig(model_name="small", language="ja"),
    )

    _feed(engine, 4)

    assert model.kwargs[0]["language"] == "ja"


@pytest.mark.parametrize("language", [None, "ja"])
def test_english_only_model_rejects_multilingual_configuration(language):
    with pytest.raises(ValueError, match="multilingual Whisper model"):
        FasterWhisperEngine(
            config=FasterWhisperConfig(
                model_name="small.en",
                language=language,
            ),
        )

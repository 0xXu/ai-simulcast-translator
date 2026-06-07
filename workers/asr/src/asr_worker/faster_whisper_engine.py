"""FasterWhisperEngine — incremental whisper inference on a rolling audio buffer."""

from __future__ import annotations

import base64
import math
from dataclasses import dataclass
from typing import Any, Callable, Optional

import numpy as np

from .audio_buffer import RollingAudioBuffer
from .protocol import AudioMessage, ResultMessage

_SAMPLE_RATE = 16000


@dataclass(frozen=True)
class FasterWhisperConfig:
    model_name: str = "small"
    language: str | None = None
    device: str = "cpu"
    compute_type: str = "int8"
    min_window_ms: int = 1600
    step_ms: int = 800
    max_window_ms: int = 6000


def _default_model_factory(
    *,
    model_name: str,
    device: str,
    compute_type: str,
) -> Any:
    from faster_whisper import WhisperModel  # type: ignore[import-untyped]

    return WhisperModel(model_name, device=device, compute_type=compute_type)


class FasterWhisperEngine:
    def __init__(
        self,
        config: FasterWhisperConfig | None = None,
        model_factory: Callable[..., Any] | None = None,
    ) -> None:
        self._config = config or FasterWhisperConfig()
        if (
            self._config.model_name.endswith(".en")
            and self._config.language != "en"
        ):
            raise ValueError(
                "automatic or non-English recognition requires a multilingual Whisper model"
            )
        self._factory = model_factory or _default_model_factory
        self._model: Any | None = None
        self._buffer = RollingAudioBuffer(
            sample_rate=_SAMPLE_RATE,
            max_duration_ms=self._config.max_window_ms,
        )
        self._samples_since_last: int = 0
        self._total_samples: int = 0
        self._inference_count: int = 0

    # ------------------------------------------------------------------
    # AsrEngine protocol
    # ------------------------------------------------------------------

    def process_audio(self, audio_message: AudioMessage) -> Optional[ResultMessage]:
        cfg = self._config

        if audio_message.sample_rate != _SAMPLE_RATE:
            raise ValueError(
                f"sample_rate must be {_SAMPLE_RATE}, got {audio_message.sample_rate}"
            )
        if audio_message.channels != 1:
            raise ValueError(
                f"channels must be 1 (mono), got {audio_message.channels}"
            )

        raw = base64.b64decode(audio_message.audio_data, validate=True)
        if len(raw) % 2 != 0:
            raise ValueError(
                f"PCM byte count must be even, got {len(raw)}"
            )

        samples = np.frombuffer(raw, dtype="<i2")
        self._buffer.append(samples)
        self._samples_since_last += samples.size
        self._total_samples += samples.size

        # Determine whether to run inference.
        new_ms = self._samples_since_last * 1000 // _SAMPLE_RATE
        if self._inference_count == 0:
            if new_ms < cfg.min_window_ms:
                return None
        else:
            if new_ms < cfg.step_ms:
                return None

        # Reset throttle counter.
        self._samples_since_last = 0
        self._inference_count += 1

        # Build float32 audio from the recent window.
        window_ms = min(cfg.max_window_ms, self._buffer.duration_ms)
        recent = self._buffer.recent(window_ms)
        audio_f32 = recent.astype(np.float32) / 32768.0

        # Run transcription.
        model = self._get_model()
        transcribe_options: dict[str, object] = {
            "condition_on_previous_text": False,
            "vad_filter": True,
        }
        if cfg.language is not None:
            transcribe_options["language"] = cfg.language
        segments_iter, info = model.transcribe(audio_f32, **transcribe_options)

        # Collect non-empty segment texts and timestamps.
        texts: list[str] = []
        seg_start_s: float | None = None
        seg_end_s: float = 0.0
        logprob_sum = 0.0
        logprob_count = 0

        for seg in segments_iter:
            stripped = seg.text.strip()
            if not stripped:
                continue
            texts.append(stripped)
            if seg_start_s is None:
                seg_start_s = seg.start
            seg_end_s = seg.end
            logprob_sum += seg.avg_logprob
            logprob_count += 1

        if not texts:
            return None

        # Timestamps: convert segment-relative seconds to absolute ms.
        window_end_ms = self._total_samples * 1000 // _SAMPLE_RATE
        window_start_ms = max(0, window_end_ms - self._buffer.duration_ms)

        start_ms = window_start_ms + int(seg_start_s * 1000)  # type: ignore[arg-type]
        end_ms = window_start_ms + int(seg_end_s * 1000)

        # Confidence: exp(avg_logprob) clamped to [0, 1].
        avg_logprob = logprob_sum / logprob_count
        raw_confidence = math.exp(avg_logprob)
        # Clamp: very small subnormals round to exact 0.0
        confidence = max(0.0, min(1.0, raw_confidence)) if raw_confidence > 1e-15 else 0.0

        return ResultMessage(
            session_id=audio_message.session_id,
            sequence=audio_message.sequence,
            text=" ".join(texts),
            confidence=confidence,
            start_ms=start_ms,
            end_ms=end_ms,
            is_final=False,
            detected_language=getattr(info, "language", None),
            language_probability=getattr(info, "language_probability", None),
        )

    def reset(self) -> None:
        self._buffer.clear()
        self._samples_since_last = 0
        self._total_samples = 0
        self._inference_count = 0

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _get_model(self) -> Any:
        if self._model is None:
            self._model = self._factory(
                model_name=self._config.model_name,
                device=self._config.device,
                compute_type=self._config.compute_type,
            )
        return self._model

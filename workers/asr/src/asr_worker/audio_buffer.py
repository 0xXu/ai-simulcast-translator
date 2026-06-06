from typing import Any

import numpy as np


class RollingAudioBuffer:
    def __init__(self, sample_rate: int, max_duration_ms: int) -> None:
        if sample_rate <= 0:
            raise ValueError("sample_rate must be positive")
        if max_duration_ms <= 0:
            raise ValueError("max_duration_ms must be positive")

        self._sample_rate = sample_rate
        self._max_duration_ms = max_duration_ms
        self._max_samples = sample_rate * max_duration_ms // 1000
        self._samples = np.array([], dtype=np.int16)

    @property
    def duration_ms(self) -> int:
        return min(self._max_duration_ms, self._samples.size * 1000 // self._sample_rate)

    def append(self, samples: Any) -> None:
        incoming = np.asarray(samples, dtype=np.int16).reshape(-1)
        if self._max_samples == 0:
            self._samples = np.array([], dtype=np.int16)
            return

        if incoming.size >= self._max_samples:
            self._samples = incoming[-self._max_samples :].copy()
            return

        combined = np.concatenate((self._samples, incoming))
        self._samples = combined[-self._max_samples :].copy()

    def recent(self, duration_ms: int) -> np.ndarray:
        if duration_ms < 0:
            raise ValueError("duration_ms must not be negative")

        requested_samples = self._sample_rate * duration_ms // 1000
        if requested_samples == 0:
            return np.array([], dtype=np.int16)

        return self._samples[-requested_samples:].copy()

    def clear(self) -> None:
        self._samples = np.array([], dtype=np.int16)

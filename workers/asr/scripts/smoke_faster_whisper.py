#!/usr/bin/env python3
"""Smoke test for FasterWhisperEngine with a real WAV file."""

import base64
import sys
import wave
from pathlib import Path

import numpy as np

from asr_worker.faster_whisper_engine import FasterWhisperEngine, FasterWhisperConfig
from asr_worker.protocol import AudioMessage


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <wav-path>", file=sys.stderr)
        sys.exit(1)

    wav_path = Path(sys.argv[1])
    if not wav_path.exists():
        print(f"File not found: {wav_path}", file=sys.stderr)
        sys.exit(1)

    with wave.open(str(wav_path), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if channels != 1:
        print(f"Expected mono WAV, got {channels} channels", file=sys.stderr)
        sys.exit(1)
    if sampwidth != 2:
        print(f"Expected 16-bit WAV, got {sampwidth * 8}-bit", file=sys.stderr)
        sys.exit(1)
    if framerate != 16000:
        print(f"Expected 16000 Hz WAV, got {framerate} Hz", file=sys.stderr)
        sys.exit(1)

    samples = np.frombuffer(raw, dtype="<i2")
    engine = FasterWhisperEngine(FasterWhisperConfig())

    chunk_size = 6400  # 400 ms @ 16 kHz
    last_result = None
    for i in range(0, len(samples), chunk_size):
        chunk = samples[i : i + chunk_size]
        audio_data = base64.b64encode(chunk.tobytes()).decode("ascii")
        msg = AudioMessage(
            session_id="smoke",
            sequence=i // chunk_size + 1,
            audio_data=audio_data,
            sample_rate=16000,
            channels=1,
        )
        result = engine.process_audio(msg)
        if result is not None and result.text.strip():
            last_result = result

    if last_result is None:
        print("No recognition result obtained.", file=sys.stderr)
        sys.exit(1)

    print(f"Text: {last_result.text}")
    print(f"Confidence: {last_result.confidence:.4f}")
    print(f"Detected language: {last_result.detected_language or 'unknown'}")


if __name__ == "__main__":
    main()

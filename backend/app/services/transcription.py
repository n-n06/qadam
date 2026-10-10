"""Speech-to-text with faster-whisper (the CTranslate2 build of OpenAI Whisper). Task N3 / competency C5."""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from ..config import get_settings
from .drafting import SegmentIn

log = logging.getLogger("qadam.transcription")

_model = None
_lock = threading.Lock()


@dataclass
class TranscriptionResult:
    segments: list[SegmentIn]
    duration: float
    language: str


def _get_model():
    """Load once, lazily: the first call downloads/loads the weights, later calls reuse them."""
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel

            s = get_settings()
            log.info("Loading Whisper model %s (%s, %s)", s.whisper_model, s.whisper_device, s.whisper_compute_type)
            _model = WhisperModel(s.whisper_model, device=s.whisper_device, compute_type=s.whisper_compute_type)
        return _model


def transcribe_file(path: Path) -> TranscriptionResult:
    s = get_settings()
    model = _get_model()
    started = time.perf_counter()
    raw_segments, info = model.transcribe(
        str(path),
        language=s.whisper_language or None,
        vad_filter=True,  # skip silence -> fewer hallucinated lines
        beam_size=5,
    )
    segments = [
        SegmentIn(start_sec=round(seg.start, 2), speaker=None, text=seg.text.strip())
        for seg in raw_segments  # generator: decoding happens here
        if seg.text.strip()
    ]
    elapsed = time.perf_counter() - started
    # Same numbers the T4 benchmark reports: time per minute of audio.
    log.info(
        "Transcribed %.1fs of audio in %.1fs (%.2fs per audio minute), language=%s",
        info.duration, elapsed, elapsed / max(info.duration / 60, 1e-6), info.language,
    )
    return TranscriptionResult(segments=segments, duration=info.duration, language=info.language)

"""Streaming video reader.

Frames are yielded one at a time so a full-length recording never has to fit in
memory. Timestamps come from the decoder (CAP_PROP_POS_MSEC) when available and
fall back to ``index / fps``.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional, Tuple

import cv2
import numpy as np


class VideoOpenError(ValueError):
    pass


@dataclass(frozen=True)
class VideoProperties:
    width: int
    height: int
    fps: float
    fps_reported: bool
    frame_count_reported: Optional[int]

    @property
    def container_duration_s(self) -> Optional[float]:
        if self.frame_count_reported and self.fps > 0:
            return self.frame_count_reported / self.fps
        return None


@dataclass
class ReadStats:
    frames_decoded: int = 0
    decode_failures: int = 0
    last_timestamp_s: float = 0.0
    reached_end: bool = False


def probe(path: str | Path) -> VideoProperties:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise VideoOpenError(f"Unable to open video (missing file or unsupported codec): {path}")
        raw_fps = cap.get(cv2.CAP_PROP_FPS)
        fps_ok = bool(raw_fps and raw_fps > 0 and np.isfinite(raw_fps))
        count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        return VideoProperties(
            width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            fps=float(raw_fps) if fps_ok else 30.0,
            fps_reported=fps_ok,
            frame_count_reported=int(count) if count and count > 0 else None,
        )
    finally:
        cap.release()


def iter_frames(
    path: str | Path,
    fps: float,
    stats: ReadStats,
    max_seconds: Optional[float] = None,
    max_consecutive_failures: int = 10,
) -> Iterator[Tuple[int, float, np.ndarray]]:
    """Yield ``(frame_index, timestamp_s, frame)`` for every decodable frame.

    ``stats`` is updated in place so callers can report coverage even when they
    stop iterating early.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise VideoOpenError(f"Unable to open video (missing file or unsupported codec): {path}")
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    total = int(total) if total and total > 0 else None
    index = 0
    consecutive_failures = 0
    try:
        while True:
            ok = cap.grab()
            if not ok:
                # grab() fails at end of stream. Only count it as a decode failure
                # if the container says more frames should exist.
                if total is not None and index < total - 1:
                    stats.decode_failures += 1
                    consecutive_failures += 1
                    if consecutive_failures <= max_consecutive_failures:
                        continue
                stats.reached_end = True
                return
            ok, frame = cap.retrieve()
            if not ok or frame is None:
                stats.decode_failures += 1
                consecutive_failures += 1
                if consecutive_failures > max_consecutive_failures:
                    return
                index += 1
                continue
            consecutive_failures = 0
            msec = cap.get(cv2.CAP_PROP_POS_MSEC)
            ts = msec / 1000.0 if index > 0 and msec > 0 else index / fps
            if max_seconds is not None and ts >= max_seconds:
                return
            stats.frames_decoded += 1
            stats.last_timestamp_s = ts
            yield index, ts, frame
            index += 1
    finally:
        cap.release()


def sha256_of(path: str | Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()

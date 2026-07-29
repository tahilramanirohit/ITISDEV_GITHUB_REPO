from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np


class VideoCaptureService:
    def __init__(self, source: str):
        self.source = source
        self.capture = cv2.VideoCapture(source)
        if not self.capture.isOpened():
            raise ValueError(f"Unable to open video source: {source}")

    def __enter__(self) -> "VideoCaptureService":
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.release()

    def release(self) -> None:
        if self.capture is not None:
            self.capture.release()

    def read_frames(self, max_frames: int = 300) -> Tuple[List[Dict[str, Any]], float, float]:
        frames: List[Dict[str, Any]] = []
        fps = float(self.capture.get(cv2.CAP_PROP_FPS) or 30.0)
        frame_count = int(self.capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = frame_count / fps if fps > 0 else 0.0

        index = 0
        while index < max_frames:
            ret, frame = self.capture.read()
            if not ret:
                break
            timestamp = index / fps
            frames.append({"frame": frame, "timestamp": timestamp})
            index += 1
        self.release()
        return frames, fps, duration

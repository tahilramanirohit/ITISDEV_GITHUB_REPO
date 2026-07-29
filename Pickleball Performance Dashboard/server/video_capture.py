from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple
import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

class VideoCaptureService:
    def __init__(self, source: str):
        self.source = source
        self.capture = cv2.VideoCapture(source)
        if not self.capture.isOpened():
            raise ValueError(f"Unable to open video source or unsupported codec: {source}")

    def __enter__(self) -> "VideoCaptureService":
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.release()

    def release(self) -> None:
        if self.capture is not None:
            self.capture.release()

    def read_frames(self, max_frames: int = 300) -> Tuple[List[Dict[str, Any]], float, float]:
        frames: List[Dict[str, Any]] = []
        
        raw_fps = self.capture.get(cv2.CAP_PROP_FPS)
        fps = float(raw_fps) if raw_fps and raw_fps > 0 else 30.0
        
        index = 0
        corrupt_frame_count = 0
        max_corrupt_allowance = 10 

        while index < max_frames:
            ret, frame = self.capture.read()
            
            if not ret:
                corrupt_frame_count += 1
                if corrupt_frame_count > max_corrupt_allowance:
                    logger.warning("Max corrupted frame limit reached. Stopping video capture.")
                    break
                continue
            
            corrupt_frame_count = 0
            frame_copy = frame.copy()
            
            # THE FIX: Get the exact presentation timestamp directly from the video file
            msec = self.capture.get(cv2.CAP_PROP_POS_MSEC)
            
            # Fallback to the math equation ONLY if the video codec lacks msec data
            timestamp = (msec / 1000.0) if msec > 0 else (index / fps)
            
            frames.append({"frame": frame_copy, "timestamp": timestamp})
            index += 1
            
        self.release()
        
        # Calculate actual duration based on the final frame's exact timestamp
        actual_duration = frames[-1]["timestamp"] if frames else 0.0
        return frames, fps, actual_duration

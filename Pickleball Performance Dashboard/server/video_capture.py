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
        
        # Safely extract FPS with a fallback to 30.0 if header is corrupted
        raw_fps = self.capture.get(cv2.CAP_PROP_FPS)
        fps = float(raw_fps) if raw_fps and raw_fps > 0 else 30.0
        
        # Safely extract total frames with a fallback
        raw_frame_count = self.capture.get(cv2.CAP_PROP_FRAME_COUNT)
        total_frames = int(raw_frame_count) if raw_frame_count and raw_frame_count > 0 else 0
        
        duration = total_frames / fps if fps > 0 else 0.0

        index = 0
        corrupt_frame_count = 0
        max_corrupt_allowance = 10 # Allow a few corrupted frames before abandoning

        while index < max_frames:
            ret, frame = self.capture.read()
            
            if not ret:
                # If we couldn't read, it might be the end of the video or a corrupted frame
                corrupt_frame_count += 1
                if corrupt_frame_count > max_corrupt_allowance:
                    logger.warning("Max corrupted frame limit reached. Stopping video capture.")
                    break
                continue
            
            # Reset corrupt count on successful read
            corrupt_frame_count = 0
            
            # To avoid memory pointer errors when storing arrays, we make a clear copy
            frame_copy = frame.copy()
            timestamp = index / fps
            
            frames.append({"frame": frame_copy, "timestamp": timestamp})
            index += 1
            
        self.release()
        
        # Recalculate duration if we stopped early due to reaching max_frames
        actual_duration = len(frames) / fps if fps > 0 else 0.0
        return frames, fps, actual_duration

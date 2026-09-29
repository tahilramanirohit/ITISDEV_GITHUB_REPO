"""Optional per-frame pickleball observations from locally supplied YOLO weights.

This reports only boxes actually returned by the model. Choosing the real ball
among several candidates is done afterwards by :mod:`picklepro.ball_tracking`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, List, Optional

from .detection import DetectorUnavailable

BALL_IMAGE_SIZE = 1280


def ball_class_id(names: Any) -> int:
    items = names.items() if isinstance(names, dict) else enumerate(names if names is not None else [])
    for class_id, label in items:
        if str(label).strip().lower() in {"pickleball", "ball"}:
            return int(class_id)
    raise DetectorUnavailable("Ball weights must contain a pickleball/ball class; check the model's class names.")


class BallDetector:
    def __init__(self, weights: str, model: Optional[Any] = None):
        if model is None:
            if not Path(weights).is_file():
                raise DetectorUnavailable(f"Ball model weights not found: {weights}")
            try:
                from ultralytics import YOLO  # type: ignore
            except ImportError as exc:
                raise DetectorUnavailable("Ball detection requires requirements-yolo.txt.") from exc
            try:
                model = YOLO(weights)
            except Exception as exc:
                raise DetectorUnavailable(f"Could not load ball model weights: {type(exc).__name__}") from exc
        self.model = model
        self.class_id = ball_class_id(getattr(model, "names", {}))

    def detect(self, frame) -> Optional[dict]:
        found = self.candidates(frame, limit=1)
        return found[0] if found else None

    def candidates(self, frame, limit: int = 4) -> List[dict]:
        """Up to ``limit`` ball boxes, most confident first.

        A pickleball is only 10-25 px wide in 1080p video, so the model runs at
        1280 px (instead of its 640 px default) to keep the ball visible.
        """
        results = self.model.predict(frame, classes=[self.class_id], conf=0.15, imgsz=BALL_IMAGE_SIZE, verbose=False)
        if not results or results[0].boxes is None or len(results[0].boxes) == 0:
            return []
        out = []
        for found in sorted(results[0].boxes, key=lambda box: -float(box.conf[0]))[:limit]:
            coords = found.xyxy[0]
            if hasattr(coords, "cpu"):
                coords = coords.cpu()
            box = [int(round(float(v))) for v in coords]
            if box[2] > box[0] and box[3] > box[1]:
                out.append({"bbox": box, "confidence": round(float(found.conf[0]), 3)})
        return out

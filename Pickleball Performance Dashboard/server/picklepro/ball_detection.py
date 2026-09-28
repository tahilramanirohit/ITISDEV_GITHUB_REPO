"""Optional per-frame pickleball observations from locally supplied YOLO weights.

This reports only boxes actually returned by the model. It does not interpolate
a trajectory or infer hits, speed, height, or shot type.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from .detection import DetectorUnavailable


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
        results = self.model.predict(frame, classes=[self.class_id], conf=0.15, verbose=False)
        if not results or results[0].boxes is None or len(results[0].boxes) == 0:
            return None
        best = max(results[0].boxes, key=lambda box: float(box.conf[0]))
        coords = best.xyxy[0]
        if hasattr(coords, "cpu"):
            coords = coords.cpu()
        box = [int(round(float(v))) for v in coords]
        if box[2] <= box[0] or box[3] <= box[1]:
            return None
        return {"bbox": box, "confidence": round(float(best.conf[0]), 3)}

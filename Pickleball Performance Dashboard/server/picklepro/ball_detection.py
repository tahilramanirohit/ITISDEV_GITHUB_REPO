"""Optional per-frame pickleball observations from locally supplied YOLO weights.

This reports only boxes actually returned by the model(s). Choosing the real
ball among several candidates is done afterwards by :mod:`picklepro.ball_tracking`.

Several ball models can run together (``weights`` separated by ``os.pathsep``,
or a list). Their boxes are pooled: boxes from different models that cover the
same spot are merged, and agreement raises the confidence. No single public
model finds the ball reliably in every kind of footage, and their misses
differ, so the pool finds more real balls than any one model. Look-alikes that
only one model reports (a neon shoe, a banner logo) are mostly removed by the
tracker because they do not move like a ball.
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, List, Optional, Sequence, Union

from .detection import DetectorUnavailable

BALL_IMAGE_SIZE = 1280
MIN_CONFIDENCE = 0.1
MERGE_DISTANCE = 1.0  # box widths between centres of the "same" ball


def ball_class_id(names: Any) -> int:
    items = names.items() if isinstance(names, dict) else enumerate(names if names is not None else [])
    for class_id, label in items:
        if str(label).strip().lower() in {"pickleball", "ball"}:
            return int(class_id)
    raise DetectorUnavailable("Ball weights must contain a pickleball/ball class; check the model's class names.")


def split_weights(weights: Union[str, Sequence[str], None]) -> List[str]:
    if not weights:
        return []
    if isinstance(weights, str):
        return [w for w in weights.split(os.pathsep) if w]
    return [w for w in weights if w]


def _load(weights: str):
    if not Path(weights).is_file():
        raise DetectorUnavailable(f"Ball model weights not found: {Path(weights).name}")
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:
        raise DetectorUnavailable("Ball detection requires requirements-yolo.txt.") from exc
    try:
        return YOLO(weights)
    except Exception as exc:
        raise DetectorUnavailable(f"Could not load ball model weights: {type(exc).__name__}") from exc


def _boxes(model: Any, class_id: int, frame) -> List[dict]:
    results = model.predict(frame, classes=[class_id], conf=MIN_CONFIDENCE, imgsz=BALL_IMAGE_SIZE, verbose=False)
    if not results or results[0].boxes is None or len(results[0].boxes) == 0:
        return []
    out = []
    for found in results[0].boxes:
        coords = found.xyxy[0]
        if hasattr(coords, "cpu"):
            coords = coords.cpu()
        box = [int(round(float(v))) for v in coords]
        if box[2] > box[0] and box[3] > box[1]:
            out.append({"bbox": box, "confidence": float(found.conf[0])})
    return out


def _merge(groups: List[List[dict]]) -> List[dict]:
    """Pool boxes from several models; one box per spot, noisy-OR confidence."""
    pooled: List[dict] = []
    for boxes in groups:
        for b in sorted(boxes, key=lambda b: -b["confidence"]):
            cx, cy = (b["bbox"][0] + b["bbox"][2]) / 2, (b["bbox"][1] + b["bbox"][3]) / 2
            size = max(b["bbox"][2] - b["bbox"][0], b["bbox"][3] - b["bbox"][1])
            match = None
            for p in pooled:
                px, py = (p["bbox"][0] + p["bbox"][2]) / 2, (p["bbox"][1] + p["bbox"][3]) / 2
                psize = max(p["bbox"][2] - p["bbox"][0], p["bbox"][3] - p["bbox"][1])
                if math.hypot(cx - px, cy - py) <= MERGE_DISTANCE * max(size, psize) and id(boxes) not in p["_from"]:
                    match = p
                    break
            if match is None:
                pooled.append({"bbox": b["bbox"], "confidence": b["confidence"], "_miss": 1 - b["confidence"],
                               "_from": {id(boxes)}})
            else:
                match["_miss"] *= 1 - b["confidence"]
                match["_from"].add(id(boxes))
                if b["confidence"] > match["confidence"]:
                    match["bbox"] = b["bbox"]
                match["confidence"] = 1 - match["_miss"]
    return [{"bbox": p["bbox"], "confidence": round(p["confidence"], 3)}
            for p in sorted(pooled, key=lambda p: -p["confidence"])]


class BallDetector:
    def __init__(self, weights: Union[str, Sequence[str]], model: Optional[Any] = None):
        if model is not None:
            self.models = list(model) if isinstance(model, (list, tuple)) else [model]
        else:
            paths = split_weights(weights)
            if not paths:
                raise DetectorUnavailable("No ball model weights were given.")
            self.models = [_load(p) for p in paths]
        self.class_ids = [ball_class_id(getattr(m, "names", {})) for m in self.models]

    @property
    def model_count(self) -> int:
        return len(self.models)

    def detect(self, frame) -> Optional[dict]:
        found = self.candidates(frame, limit=1)
        return found[0] if found else None

    def candidates(self, frame, limit: int = 6) -> List[dict]:
        """Up to ``limit`` ball boxes, most confident first.

        A pickleball is only 10-25 px wide in 1080p video, so the models run at
        1280 px (instead of the 640 px default) to keep the ball visible.
        """
        groups = [_boxes(m, cid, frame) for m, cid in zip(self.models, self.class_ids)]
        return _merge(groups)[:limit]

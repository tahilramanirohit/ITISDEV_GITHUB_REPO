"""Per-frame person detection with simple identity tracking.

Two detectors are available:

* ``motion`` (default, always available): OpenCV MOG2 background subtraction
  plus box/foot-point association across brief missed detections. It finds
  *moving blobs*, not people, and has no
  confidence score, so detections report ``confidence=None``. It assumes a
  fixed camera.
* ``yolo`` (optional): Ultralytics YOLOv8 person detection with its built-in
  tracker. Requires ``pip install -r requirements-yolo.txt`` and a local weights
  file. Ultralytics is AGPL-3.0 licensed — see docs/ADVISER_DECISIONS.md before
  adopting it. Weights are never downloaded implicitly.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def calculate_iou(box1: List[int], box2: List[int]) -> float:
    """Calculate Intersection over Union (IoU) for two bounding boxes (x1, y1, x2, y2)."""
    x1_inter = max(box1[0], box2[0])
    y1_inter = max(box1[1], box2[1])
    x2_inter = min(box1[2], box2[2])
    y2_inter = min(box1[3], box2[3])

    inter_area = max(0, x2_inter - x1_inter) * max(0, y2_inter - y1_inter)

    box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])

    union_area = box1_area + box2_area - inter_area
    return inter_area / union_area if union_area > 0 else 0.0


class DetectorUnavailable(RuntimeError):
    pass


class PlayerTracker:
    """Stateful tracker: feed frames in order with :meth:`update`."""

    def __init__(self, detector: str = "motion", yolo_weights: Optional[str] = None,
                 min_area_fraction: float = 0.002):
        self.detector = detector
        self.yolo_model = None
        self.yolo_person_class_id = None
        if detector == "yolo":
            self.yolo_model = _load_yolo(yolo_weights)
            self.yolo_person_class_id = person_class_id(getattr(self.yolo_model, "names", {}))
        elif detector != "motion":
            raise ValueError(f"Unknown detector '{detector}'. Use 'motion' or 'yolo'.")

        # State for the motion tracker.
        self.min_area_fraction = min_area_fraction
        self.next_id = 1
        self.active_tracks: Dict[int, List[int]] = {}  # { track_id: [x1, y1, x2, y2] }
        self.missed_frames: Dict[int, int] = {}
        # MOG2 is robust to shadows; shadows are marked 127 and removed by thresholding below.
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=16, detectShadows=True)

    @property
    def detector_name(self) -> str:
        return "ultralytics-yolov8-person" if self.detector == "yolo" else "opencv-mog2-motion"

    @property
    def confidence_is_model_score(self) -> bool:
        return self.detector == "yolo"

    def update(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if self.detector == "yolo":
            return self._detect_and_track_yolo(frame)
        return self._detect_and_track_motion(frame)

    def _detect_and_track_yolo(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Uses Ultralytics YOLOv8 with built-in persist=True tracking."""
        # Custom pickleball models need not use COCO's class 0 for people.
        results = self.yolo_model.track(frame, persist=True, classes=[self.yolo_person_class_id], verbose=False)

        detections = []
        if results and len(results) > 0 and results[0].boxes:
            for box in results[0].boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                conf = float(box.conf[0].cpu().numpy())
                # YOLOv8 track returns an ID if persist=True was successful
                track_id = int(box.id[0].cpu().numpy()) if box.id is not None else None
                detections.append({
                    "track_id": track_id,
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "confidence": round(conf, 3),
                })
        return detections

    def _detect_and_track_motion(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Background subtraction + IoU association. Finds moving blobs, not people."""
        fg_mask = self.bg_subtractor.apply(frame)
        # Drop shadow pixels (127) and keep confident foreground (255).
        _, fg_mask = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        current_detections = []
        frame_area = frame.shape[0] * frame.shape[1]
        min_area = frame_area * self.min_area_fraction
        # Blobs covering most of the frame are lighting changes or camera shake, not players.
        max_area = frame_area * 0.5
        for contour in contours:
            if min_area < cv2.contourArea(contour) < max_area:
                x, y, w, h = cv2.boundingRect(contour)
                # Aspect ratio check (standing people are usually taller than wide)
                if h > w * 0.8:
                    current_detections.append([x, y, x + w, y + h])

        ids = associate_boxes(current_detections, self.active_tracks, self.missed_frames)
        matched = {tid for tid in ids if tid is not None}
        survivors = {
            tid: box for tid, box in self.active_tracks.items()
            if tid not in matched and self.missed_frames.get(tid, 0) < 2
        }
        next_misses = {tid: self.missed_frames.get(tid, 0) + 1 for tid in survivors}
        tracked_output = []
        for bbox, tid in zip(current_detections, ids):
            if tid is None:
                tid = self.next_id
                self.next_id += 1
            survivors[tid] = bbox
            next_misses[tid] = 0
            tracked_output.append({"track_id": tid, "bbox": bbox, "confidence": None})
        self.active_tracks = survivors
        self.missed_frames = next_misses
        return tracked_output


def associate_boxes(boxes: List[List[int]], previous: Dict[int, List[int]],
                    missed: Dict[int, int]) -> List[Optional[int]]:
    """Assign each observed box once; retain IDs after a short detection gap.

    Only observed boxes are returned. A remembered track never creates a fake
    position or contributes time to a heatmap.
    """
    candidates = []
    for index, box in enumerate(boxes):
        foot_x = (box[0] + box[2]) / 2
        foot_y = box[3]
        area = max(1, (box[2] - box[0]) * (box[3] - box[1]))
        for tid, old in previous.items():
            overlap = calculate_iou(box, old)
            old_area = max(1, (old[2] - old[0]) * (old[3] - old[1]))
            distance = float(np.hypot(foot_x - (old[0] + old[2]) / 2, foot_y - old[3]))
            limit = max(18.0, 0.75 * max(box[3] - box[1], old[3] - old[1]))
            if overlap >= 0.2:
                score = 2.0 + overlap
            elif 0.5 <= area / old_area <= 2.0 and distance <= limit:
                score = 1.0 - distance / limit - 0.1 * missed.get(tid, 0)
            else:
                continue
            candidates.append((score, index, tid))
    matches: List[Optional[int]] = [None] * len(boxes)
    used = set()
    for _score, index, tid in sorted(candidates, reverse=True):
        if matches[index] is None and tid not in used:
            matches[index] = tid
            used.add(tid)
    return matches


def person_class_id(names) -> int:
    """Find a person class in COCO or custom pickleball model metadata."""
    items = names.items() if isinstance(names, dict) else enumerate(names if names is not None else [])
    for class_id, label in items:
        if str(label).strip().lower() in {"person", "player", "human"}:
            return int(class_id)
    raise DetectorUnavailable("YOLO weights must contain a person/player/human class; check the model's class names.")


def _load_yolo(weights: Optional[str]):
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:
        raise DetectorUnavailable(
            "detector 'yolo' requested but ultralytics is not installed (pip install -r requirements-yolo.txt)."
        ) from exc
    if not weights or not Path(weights).is_file():
        raise DetectorUnavailable(
            "detector 'yolo' requires a local weights file (--yolo-weights or PICKLEPRO_YOLO_WEIGHTS)."
        )
    logger.info("Loading YOLO weights from %s", weights)
    return YOLO(weights)

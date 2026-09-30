"""Court proposals and checks for a player-confirmed fixed-camera mapping.

The preview is a proposal, never a measurement. The worker checks the saved
points again against the source frame before using them for court metrics.
"""

from __future__ import annotations

from typing import Any, Optional

import cv2
import numpy as np

from .auto_court import CourtPoseDetector
from .court import CalibrationError, CourtCalibration, LANDMARKS_M, calibration_from_dict
from .court_lines import CourtTracker
from .court_refine import MIN_INLIER_SHARE, MIN_VISIBLE_SAMPLES, _score, line_distance_map

PAINTED_NAMES = tuple(name for name in LANDMARKS_M if "net_sideline" not in name)
MIN_SPAN_FRACTION = 0.08


def review_points(cal: CourtCalibration) -> list[dict[str, Any]]:
    """Project named ground landmarks into a still frame for editable handles."""
    inverse = np.linalg.inv(cal.homography)
    court = np.asarray([LANDMARKS_M[name] for name in PAINTED_NAMES], dtype=np.float64)
    image = cv2.perspectiveTransform(court.reshape(-1, 1, 2), inverse).reshape(-1, 2)
    width, height = cal.image_size
    return [
        {"landmark": name, "pixel": [round(float(x), 1), round(float(y), 1)]}
        for name, (x, y) in zip(PAINTED_NAMES, image)
        if np.isfinite([x, y]).all() and 0 <= x < width and 0 <= y < height
    ]


def proposed_calibration(frame: np.ndarray, court_weights: Optional[str] = None) -> Optional[CourtCalibration]:
    """Use RohitVer's line fit and optional existing pose model on one still."""
    model = CourtPoseDetector(court_weights) if court_weights else None
    return CourtTracker(model).update(0.0, frame)


def checked_review(data: dict, frame: Optional[np.ndarray] = None) -> CourtCalibration:
    """Reject malformed or weak corrections before they produce court metrics."""
    if not isinstance(data, dict) or not isinstance(data.get("points"), list):
        raise CalibrationError("Court correction needs named points.")
    try:
        width, height = int(data["image_width"]), int(data["image_height"])
    except (KeyError, TypeError, ValueError) as exc:
        raise CalibrationError("Court correction needs the preview's width and height.") from exc
    if width < 320 or height < 240:
        raise CalibrationError("Court preview is too small for correction.")
    names = [p.get("landmark") for p in data["points"] if isinstance(p, dict)]
    if len(names) != len(data["points"]) or len(set(names)) != len(names):
        raise CalibrationError("Each court landmark must appear exactly once.")
    if any(name not in PAINTED_NAMES for name in names):
        raise CalibrationError("Use named painted-court landmarks, not the raised net posts.")
    try:
        pixels = np.asarray([p["pixel"] for p in data["points"]], dtype=np.float64)
    except (KeyError, TypeError, ValueError) as exc:
        raise CalibrationError("Each landmark needs an image position.") from exc
    if pixels.ndim != 2 or pixels.shape[1] != 2 or not np.isfinite(pixels).all():
        raise CalibrationError("Court landmark positions must be finite x/y coordinates.")
    if (pixels[:, 0] < 0).any() or (pixels[:, 0] >= width).any() or (pixels[:, 1] < 0).any() or (pixels[:, 1] >= height).any():
        raise CalibrationError("Court landmarks must be inside the preview image.")
    if np.ptp(pixels[:, 0]) < width * MIN_SPAN_FRACTION or np.ptp(pixels[:, 1]) < height * MIN_SPAN_FRACTION:
        raise CalibrationError("Court landmarks are too close together; choose points spread across the visible court.")
    cal = calibration_from_dict(data)
    if cal.quality != "good":
        raise CalibrationError("Court points disagree; correct their positions before analysis.")
    if frame is not None:
        validate_confirmed_frame(cal, frame)
    return cal


def validate_confirmed_frame(cal: CourtCalibration, frame: np.ndarray) -> None:
    if (frame.shape[1], frame.shape[0]) != cal.image_size:
        cal = cal.scaled_to(frame.shape[1], frame.shape[0])
    distance, usable, scale = line_distance_map(frame)
    transform = np.diag([scale, scale, 1.0]) @ np.linalg.inv(cal.homography)
    _cost, visible, inliers = _score(transform, distance, usable)
    if visible < MIN_VISIBLE_SAMPLES or inliers < MIN_INLIER_SHARE:
        raise CalibrationError("The corrected court does not match enough visible painted lines. Use a fixed, clear court view and adjust the points.")

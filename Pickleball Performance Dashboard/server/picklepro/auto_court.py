"""Optional court pose model adapter for each usable video frame.

The 14-point layout matches the public pickleball-analysis court model. Model
weights are supplied by the operator; no weights are fetched or bundled here.
Only observed, confident keypoints are used. A robust fit discards outliers,
and weak geometry returns no calibration instead of a plausible-looking map.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from .court import LANDMARKS_M, CourtCalibration, calibrate
from .detection import DetectorUnavailable
from .video_io import ReadStats, VideoProperties, iter_frames


# Court model's top edge is the far baseline for a camera behind the near end.
MODEL_LANDMARKS = (
    "far_left_baseline", "far_right_baseline", "near_right_baseline", "near_left_baseline",
    "far_left_kitchen", "far_right_kitchen", "near_left_kitchen", "near_right_kitchen",
    "far_center_baseline", "far_center_kitchen", "near_center_kitchen", "near_center_baseline",
    "left_net_sideline", "right_net_sideline",
)
MIN_KEYPOINTS = 6
MIN_COURT_AREA_M2 = 10.0


def _to_numpy(value) -> np.ndarray:
    if value is None:
        return np.empty((0,))
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    return np.asarray(value)


def calibration_from_pose(result: object, image_size: tuple[int, int],
                          min_confidence: float = 0.5) -> Optional[CourtCalibration]:
    """Fit a court from one model result, rejecting sparse or inconsistent poses."""
    poses = _to_numpy(getattr(getattr(result, "keypoints", None), "data", None))
    if poses.ndim == 2:
        poses = poses[None, ...]
    if poses.ndim != 3 or poses.shape[2] < 3:
        return None

    best: Optional[CourtCalibration] = None
    for pose in poses:
        points = {}
        for name, row in zip(MODEL_LANDMARKS, pose):
            x, y, score = map(float, row[:3])
            if (score >= min_confidence and np.isfinite([x, y, score]).all()
                    and 0 <= x < image_size[0] and 0 <= y < image_size[1]):
                points[name] = (x, y)
        if len(points) < MIN_KEYPOINTS:
            continue
        names = list(points)
        image = np.asarray([points[name] for name in names], dtype=np.float64)
        court = np.asarray([LANDMARKS_M[name] for name in names], dtype=np.float64)
        homography, mask = cv2.findHomography(image, court, cv2.RANSAC, 0.20)
        if homography is None or mask is None:
            continue
        inliers = [name for name, valid in zip(names, mask.ravel()) if valid]
        if len(inliers) < MIN_KEYPOINTS:
            continue
        hull = cv2.convexHull(np.asarray([LANDMARKS_M[name] for name in inliers], dtype=np.float32))
        if cv2.contourArea(hull) < MIN_COURT_AREA_M2:
            continue
        try:
            candidate = calibrate({name: points[name] for name in inliers}, image_size)
        except (ValueError, np.linalg.LinAlgError):
            continue
        if candidate.quality == "good" and (
            best is None or len(candidate.landmarks_used) > len(best.landmarks_used)
            or (len(candidate.landmarks_used) == len(best.landmarks_used)
                and candidate.reprojection_rmse_m < best.reprojection_rmse_m)
        ):
            best = candidate
    return best


def detect_court(path: str | Path, props: VideoProperties, weights: str,
                 model=None, seconds_to_scan: float = 5.0) -> Optional[CourtCalibration]:
    """Sample the opening seconds; keep the strongest well-fitted pose."""
    if model is None:
        model = CourtPoseDetector(weights).model

    best: Optional[CourtCalibration] = None
    next_sample_s = 0.0
    for _index, ts, frame in iter_frames(path, props.fps, ReadStats(), max_seconds=seconds_to_scan):
        if ts + 1e-6 < next_sample_s:
            continue
        next_sample_s = ts + 1.0
        results = model.predict(frame, verbose=False)
        candidate = calibration_from_pose(results[0], (props.width, props.height)) if results else None
        if candidate is not None and (
            best is None or len(candidate.landmarks_used) > len(best.landmarks_used)
            or (len(candidate.landmarks_used) == len(best.landmarks_used)
                and candidate.reprojection_rmse_m < best.reprojection_rmse_m)
        ):
            best = candidate
        if best is not None and len(best.landmarks_used) == len(MODEL_LANDMARKS):
            break
    return best


class CourtPoseDetector:
    """Load weights once, then calibrate each sampled frame independently.

    A camera move cannot reuse a homography from an earlier view. Missing or
    weak court keypoints yield None for that frame.
    """

    def __init__(self, weights: str):
        if not Path(weights).is_file():
            raise DetectorUnavailable(f"Court model weights not found: {weights}")
        try:
            from ultralytics import YOLO  # type: ignore
        except ImportError as exc:
            raise DetectorUnavailable("Auto court detection requires requirements-yolo.txt.") from exc
        try:
            self.model = YOLO(weights)
        except Exception as exc:
            raise DetectorUnavailable(f"Could not load court model weights: {type(exc).__name__}") from exc

    def calibrate_frame(self, frame: np.ndarray) -> Optional[CourtCalibration]:
        results = self.model.predict(frame, verbose=False)
        return calibration_from_pose(results[0], (frame.shape[1], frame.shape[0])) if results else None


# Carrying a court map across frames where the court model misses.
HOLD_MAX_S = 1.0            # never reuse a map older than this
HOLD_WORK_WIDTH = 640       # feature matching runs on a downscaled grey frame
HOLD_MIN_INLIERS = 40
HOLD_MAX_SHIFT = 0.25       # of the frame width; larger moves are treated as a new view


class CourtMapHold:
    """Reuse the last model-fitted court map for brief model misses.

    The court model often drops single frames while players cover landmarks.
    When that happens, the camera motion since the last fitted frame is
    measured from background features and applied to its homography. The map
    is only carried for ``HOLD_MAX_S`` and only when the motion estimate is
    well supported; otherwise the frame stays unmapped.
    """

    def __init__(self, max_age_s: float = HOLD_MAX_S):
        self.max_age_s = max_age_s
        self._orb = cv2.ORB_create(nfeatures=1500)
        self._matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
        self._ref: Optional[tuple[float, CourtCalibration, np.ndarray, np.ndarray, float]] = None

    def _features(self, frame: np.ndarray):
        scale = HOLD_WORK_WIDTH / frame.shape[1]
        grey = cv2.cvtColor(cv2.resize(frame, None, fx=scale, fy=scale), cv2.COLOR_BGR2GRAY)
        keypoints, descriptors = self._orb.detectAndCompute(grey, None)
        points = np.float32([k.pt for k in keypoints]) if keypoints else np.zeros((0, 2), np.float32)
        return points, descriptors, scale

    def update(self, time_s: float, frame: np.ndarray, fitted: Optional[CourtCalibration]) -> Optional[CourtCalibration]:
        """Return the fitted map, a carried map, or None for this frame."""
        if fitted is not None:
            points, descriptors, scale = self._features(frame)
            self._ref = (time_s, fitted, points, descriptors, scale) if descriptors is not None else None
            return fitted
        if self._ref is None or time_s - self._ref[0] > self.max_age_s:
            return None
        ref_time, ref_cal, ref_points, ref_desc, scale = self._ref
        points, descriptors, _ = self._features(frame)
        if descriptors is None or len(points) < HOLD_MIN_INLIERS:
            return None
        pairs = self._matcher.knnMatch(descriptors, ref_desc, k=2)
        good = [m for pair in pairs if len(pair) == 2 for m, n in [pair] if m.distance < 0.75 * n.distance]
        if len(good) < HOLD_MIN_INLIERS:
            return None
        src = np.float32([points[m.queryIdx] for m in good]) / scale
        dst = np.float32([ref_points[m.trainIdx] for m in good]) / scale
        motion, mask = cv2.findHomography(src, dst, cv2.RANSAC, 3.0 / scale)
        if motion is None or mask is None or int(mask.sum()) < HOLD_MIN_INLIERS:
            return None
        w, h = frame.shape[1], frame.shape[0]
        corners = np.float32([[0, 0], [w, 0], [0, h], [w, h]]).reshape(-1, 1, 2)
        moved = cv2.perspectiveTransform(corners, motion).reshape(-1, 2)
        if np.max(np.linalg.norm(moved - corners.reshape(-1, 2), axis=1)) > HOLD_MAX_SHIFT * w:
            return None
        # current image -> reference image -> court
        return CourtCalibration(
            homography=ref_cal.homography @ motion,
            landmarks_used=ref_cal.landmarks_used,
            image_size=ref_cal.image_size,
            reprojection_rmse_px=ref_cal.reprojection_rmse_px,
            reprojection_rmse_m=ref_cal.reprojection_rmse_m,
        )

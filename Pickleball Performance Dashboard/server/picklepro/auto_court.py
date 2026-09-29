"""Optional court pose model adapter for fixed-camera video.

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
from .video_io import ROTATE_CODES, ReadStats, VideoProperties, iter_frames


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


def load_court_model(weights: str):
    if not Path(weights).is_file():
        raise DetectorUnavailable(f"Court model weights not found: {weights}")
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:
        raise DetectorUnavailable("Auto court detection requires requirements-yolo.txt.") from exc
    try:
        return YOLO(weights)
    except Exception as exc:
        raise DetectorUnavailable(f"Could not load court model weights: {type(exc).__name__}") from exc


ORIENTATION_MIN_CONFIDENCE = 0.4


def _upright_score(result) -> Optional[float]:
    """Mean keypoint confidence when the pose looks like a court seen from behind the
    near baseline the right way up (near baseline lower in the image than the far
    baseline); None otherwise. Box and person detectors are fooled by upside-down
    frames, but perspective is not."""
    poses = _to_numpy(getattr(getattr(result, "keypoints", None), "data", None))
    if poses.ndim == 2:
        poses = poses[None, ...]
    if poses.ndim != 3 or poses.shape[0] == 0 or poses.shape[1] < 4 or poses.shape[2] < 3:
        return None
    pose = poses[0]
    far_y = (pose[0, 1] + pose[1, 1]) / 2       # far_left/right_baseline
    near_y = (pose[2, 1] + pose[3, 1]) / 2      # near_right/left_baseline
    conf = float(np.mean(pose[:, 2]))
    if not np.isfinite([far_y, near_y, conf]).all() or near_y <= far_y or conf < ORIENTATION_MIN_CONFIDENCE:
        return None
    return conf


def detect_orientation(path: str | Path, props: VideoProperties, model, sample_times=(1.0, 5.0, 10.0)) -> int:
    """Clockwise rotation (0, 90, 180 or 270) that shows the court upright.

    Phones sometimes save landscape recordings with sideways pixels and no rotation
    tag. Keeps 0 unless the video as stored does not look upright and a rotation does."""
    duration = props.container_duration_s or max(sample_times)
    times = sorted({min(t, max(0.0, duration - 0.5)) for t in sample_times})
    scores = {deg: [] for deg in (0, 90, 180, 270)}
    cap = cv2.VideoCapture(str(path))
    try:
        for t in times:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            for deg in scores:
                img = frame if deg == 0 else cv2.rotate(frame, ROTATE_CODES[deg])
                results = model.predict(img, verbose=False)
                score = _upright_score(results[0]) if results else None
                if score is not None:
                    scores[deg].append(score)
    finally:
        cap.release()
    totals = {deg: sum(v) for deg, v in scores.items()}
    if totals[0] > 0 and len(scores[0]) * 2 >= len(times):
        return 0
    best = max(totals, key=totals.get)
    return best if totals[best] > 0 and len(scores[best]) * 2 >= len(times) else 0


def detect_court(path: str | Path, props: VideoProperties, weights: str,
                 model=None, seconds_to_scan: float = 5.0, rotation: int = 0,
                 start_seconds: float = 0.0) -> Optional[CourtCalibration]:
    """Sample the opening seconds; keep the strongest well-fitted pose.

    ``props`` describes the frames after ``rotation``."""
    if model is None:
        model = load_court_model(weights)

    best: Optional[CourtCalibration] = None
    next_sample_s = 0.0
    for _index, ts, frame in iter_frames(path, props.fps, ReadStats(), max_seconds=start_seconds + seconds_to_scan,
                                         rotation=rotation, start_seconds=start_seconds):
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

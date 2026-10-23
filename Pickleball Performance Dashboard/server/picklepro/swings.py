"""Swings and contact posture from body keypoints (pose model).

A shot is a swing. Racket-sport trackers such as SwingVision find strokes from
the player's arm, not only from the ball. With a pose model the player
detector returns the 17 COCO body keypoints for each person, and this module
turns them into:

* **swing strength** around a moment: how fast a wrist moved relative to the
  player's own shoulders, in body heights per second. The shoulders move with
  the player's steps, so walking does not count as a swing;
* **contact posture**: where the hitting wrist was at contact relative to the
  head, shoulders, hips and knees (overhead, shoulder, waist or low).

Only keypoints the model reports with enough confidence are used. With a
plain person model (no keypoints) every function returns ``None`` and the shot
detector falls back to ball and court evidence alone.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST = 5, 6, 7, 8, 9, 10
L_HIP, R_HIP, L_KNEE, R_KNEE = 11, 12, 13, 14
MIN_KEYPOINT_CONF = 0.3
MAX_SAMPLE_GAP_S = 0.35     # longer gaps between pose samples do not give a speed
SWING_WINDOW_S = 0.3        # a swing this close to a ball event can be its stroke


def _point(kps: Sequence[Sequence[float]], index: int) -> Optional[Tuple[float, float]]:
    if kps is None or index >= len(kps):
        return None
    x, y, c = kps[index][:3]
    return (float(x), float(y)) if c >= MIN_KEYPOINT_CONF else None


def _mid(a, b):
    if a and b:
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    return a or b


@dataclass
class Pose:
    time_s: float
    shoulders: Optional[Tuple[float, float]]
    hips: Optional[Tuple[float, float]]
    knees: Optional[Tuple[float, float]]
    head_y: Optional[float]
    wrists: Tuple[Optional[Tuple[float, float]], Optional[Tuple[float, float]]]
    height: float  # body height in px (box height), the scale for speeds


def pose_of(det: dict, time_s: float) -> Optional[Pose]:
    kps = det.get("keypoints")
    if not kps:
        return None
    x1, y1, x2, y2 = det["bbox"]
    shoulders = _mid(_point(kps, L_SHOULDER), _point(kps, R_SHOULDER))
    if shoulders is None:
        return None
    head = [p for p in (_point(kps, i) for i in (NOSE, L_EYE, R_EYE, L_EAR, R_EAR)) if p]
    return Pose(
        time_s=time_s,
        shoulders=shoulders,
        hips=_mid(_point(kps, L_HIP), _point(kps, R_HIP)),
        knees=_mid(_point(kps, L_KNEE), _point(kps, R_KNEE)),
        head_y=min(p[1] for p in head) if head else None,
        wrists=(_point(kps, L_WRIST), _point(kps, R_WRIST)),
        height=max(1.0, float(y2 - y1)),
    )


class SwingIndex:
    """Pose samples per player, for looking up swings near a moment."""

    def __init__(self, frames: Sequence[object]):
        self.series: Dict[object, List[Pose]] = {}
        for f in frames:
            for det in getattr(f, "detections", []) or []:
                tid = det.get("track_id")
                pose = pose_of(det, f.time_s)
                if tid is None or pose is None:
                    continue
                self.series.setdefault(tid, []).append(pose)
        for poses in self.series.values():
            poses.sort(key=lambda p: p.time_s)

    @property
    def available(self) -> bool:
        return bool(self.series)

    def speed(self, track_id: object, t: float, window: float = SWING_WINDOW_S) -> Optional[float]:
        """Fastest wrist movement relative to the shoulders near ``t``, in body heights per second."""
        poses = self.series.get(track_id)
        if not poses:
            return None
        best: Optional[float] = None
        for a, b in zip(poses, poses[1:]):
            if b.time_s < t - window or a.time_s > t + window:
                continue
            dt = b.time_s - a.time_s
            if dt <= 0 or dt > MAX_SAMPLE_GAP_S:
                continue
            for wa, wb in zip(a.wrists, b.wrists):
                if not wa or not wb:
                    continue
                ra = (wa[0] - a.shoulders[0], wa[1] - a.shoulders[1])
                rb = (wb[0] - b.shoulders[0], wb[1] - b.shoulders[1])
                v = math.hypot(rb[0] - ra[0], rb[1] - ra[1]) / dt / ((a.height + b.height) / 2)
                best = v if best is None else max(best, v)
        return best

    def contact(self, track_id: object, t: float, ball_xy: Optional[Tuple[float, float]] = None) -> Optional[dict]:
        """Posture at the pose sample nearest to ``t``: which wrist hit and how high it was."""
        poses = self.series.get(track_id)
        if not poses:
            return None
        pose = min(poses, key=lambda p: abs(p.time_s - t))
        if abs(pose.time_s - t) > MAX_SAMPLE_GAP_S:
            return None
        wrists = [w for w in pose.wrists if w]
        if not wrists:
            return None
        if ball_xy is not None:
            wrist = min(wrists, key=lambda w: math.hypot(w[0] - ball_xy[0], w[1] - ball_xy[1]))
        else:
            wrist = min(wrists, key=lambda w: w[1])  # the higher hand
        hips_y = pose.hips[1] if pose.hips else pose.shoulders[1] + 0.3 * pose.height
        torso = max(1.0, hips_y - pose.shoulders[1])
        # 0 at the hips, 1 at the shoulders; above 1 is above the shoulders.
        height = (hips_y - wrist[1]) / torso
        above_head = pose.head_y is not None and wrist[1] < pose.head_y
        below_hips = wrist[1] > hips_y
        return {"wrist_height": round(height, 2), "above_head": above_head, "below_hips": below_hips}

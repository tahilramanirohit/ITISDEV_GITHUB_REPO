"""Synthetic fixed-camera test footage with known ground truth.

This is *not* evidence of real-world accuracy. It lets the pipeline, projection,
and metric code be exercised end-to-end where the true court position of the
"player" is known exactly. Real accuracy must be measured on permitted,
labelled footage.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np

from .court import COURT_WIDTH_M, LANDMARKS_M, NEAR_KITCHEN_LINE_Y_M, NET_Y_M

FRAME_SIZE = (960, 540)
# Where the four outer court corners appear in the synthetic image (x, y px):
# a camera on a tripod behind and above the near baseline.
_IMAGE_CORNERS = {
    "near_left_baseline": (130.0, 500.0),
    "near_right_baseline": (830.0, 500.0),
    "far_left_baseline": (370.0, 90.0),
    "far_right_baseline": (590.0, 90.0),
}


def court_to_image_homography() -> np.ndarray:
    names = list(_IMAGE_CORNERS)
    src = np.array([LANDMARKS_M[n] for n in names], dtype=np.float32)
    dst = np.array([_IMAGE_CORNERS[n] for n in names], dtype=np.float32)
    return cv2.getPerspectiveTransform(src, dst)


def project(H: np.ndarray, pts_m: List[Tuple[float, float]]) -> np.ndarray:
    return cv2.perspectiveTransform(np.asarray(pts_m, dtype=np.float64).reshape(-1, 1, 2), H).reshape(-1, 2)


def near_player_path(t: float, duration: float) -> Tuple[float, float]:
    """Ground-truth court position (metres) of the near-side player at time t.

    Moves continuously (the motion detector only sees moving objects) between
    the baseline area and the kitchen line, drifting across the court.
    """
    phase = t / max(duration, 1e-6)
    x = COURT_WIDTH_M / 2 + 2.0 * math.sin(2 * math.pi * 1.5 * phase)
    y = 1.0 + (NEAR_KITCHEN_LINE_Y_M + 0.8 - 1.0) * (0.5 - 0.5 * math.cos(2 * math.pi * phase))
    return x, y


@dataclass
class SyntheticClip:
    path: Path
    fps: float
    duration_s: float
    ground_truth: List[Tuple[float, float, float]]  # (t, x_m, y_m) per frame
    calibration: dict


def write_synthetic_clip(path: Path, duration_s: float = 20.0, fps: float = 15.0,
                         landmark_noise_px: float = 0.0, seed: int = 0, codec: str = "mp4v") -> SyntheticClip:
    """Render the clip. ``codec="avc1"`` (H.264) plays in browsers but depends on the
    local OpenCV/FFmpeg build; tests use the always-available ``mp4v``."""
    H = court_to_image_homography()
    w, h = FRAME_SIZE
    background = np.full((h, w, 3), (60, 110, 60), np.uint8)
    court_poly = project(H, [LANDMARKS_M[n] for n in
                             ("near_left_baseline", "near_right_baseline", "far_right_baseline", "far_left_baseline")])
    cv2.fillPoly(background, [court_poly.astype(np.int32)], (140, 90, 40))
    lines = [
        ("near_left_baseline", "near_right_baseline"), ("far_left_baseline", "far_right_baseline"),
        ("near_left_baseline", "far_left_baseline"), ("near_right_baseline", "far_right_baseline"),
        ("near_left_kitchen", "near_right_kitchen"), ("far_left_kitchen", "far_right_kitchen"),
        ("near_center_baseline", "near_center_kitchen"), ("far_center_kitchen", "far_center_baseline"),
    ]
    for a, b in lines:
        pa, pb = project(H, [LANDMARKS_M[a], LANDMARKS_M[b]])
        cv2.line(background, tuple(pa.astype(int)), tuple(pb.astype(int)), (240, 240, 240), 2)
    net = project(H, [(0.0, NET_Y_M), (COURT_WIDTH_M, NET_Y_M)])
    cv2.line(background, tuple(net[0].astype(int)), tuple(net[1].astype(int)), (30, 30, 30), 3)

    # A textured "player" so frame differencing sees the whole body move, as it would a real person.
    texture = np.random.default_rng(seed + 1).integers(0, 255, (400, 160, 3), dtype=np.uint8)
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*codec), fps, (w, h))
    if not writer.isOpened() and codec != "mp4v":
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        raise RuntimeError(f"OpenCV could not open a video writer for {path}")
    n = int(round(duration_s * fps))
    truth = []
    for i in range(n):
        t = i / fps
        x, y = near_player_path(t, duration_s)
        truth.append((t, x, y))
        foot = project(H, [(x, y)])[0]
        # Person height in pixels from the local vertical scale of the court at the foot point.
        ahead = project(H, [(x, y + 0.5)])[0]
        px_per_m = max(8.0, abs(foot[1] - ahead[1]) / 0.5 * 2.2)
        ph, pw = 1.75 * px_per_m, 0.55 * px_per_m
        frame = background.copy()
        x1, x2 = int(foot[0] - pw / 2), int(foot[0] + pw / 2)
        y1, y2 = int(foot[1] - ph), int(foot[1])
        x1, y1 = max(0, x1), max(0, y1)
        if x2 > x1 and y2 > y1:
            frame[y1:y2, x1:x2] = cv2.resize(texture, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
        writer.write(frame)
    writer.release()

    rng = np.random.default_rng(seed)
    names = ["near_left_baseline", "near_right_baseline", "near_left_kitchen", "near_right_kitchen",
             "far_left_baseline", "far_right_baseline"]
    pix = project(H, [LANDMARKS_M[nm] for nm in names])
    pix = pix + rng.normal(0.0, landmark_noise_px, pix.shape) if landmark_noise_px else pix
    calibration = {
        "image_width": w, "image_height": h,
        "points": [{"landmark": nm, "pixel": [round(float(p[0]), 2), round(float(p[1]), 2)]}
                   for nm, p in zip(names, pix)],
    }
    return SyntheticClip(path=path, fps=fps, duration_s=n / fps, ground_truth=truth, calibration=calibration)


def write_calibration(clip: SyntheticClip, path: Path) -> None:
    path.write_text(json.dumps(clip.calibration, indent=2))


def ground_truth_lookup(clip: SyntheticClip) -> Dict[float, Tuple[float, float]]:
    return {round(t, 3): (x, y) for t, x, y in clip.ground_truth}

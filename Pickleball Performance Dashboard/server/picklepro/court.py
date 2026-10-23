"""Pickleball court model and manual ground-plane calibration.

Court coordinate system (metres), as seen from a fixed camera behind the *near*
baseline:

* x runs across the court, 0 at the near-left sideline, 6.096 m at the right.
* y runs along the court, 0 at the near baseline, 13.4112 m at the far baseline.
* The net is at y = 6.7056 m. The non-volley zone (kitchen) extends 2.1336 m
  (7 ft) from the net on each side.

The homography maps image pixels on the *ground plane* to these coordinates.
It is only valid for points on the ground (e.g. a player's feet). It must not
be used to infer ball height, ball speed in the air, or anything off the ground.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import cv2
import numpy as np

FT = 0.3048
COURT_WIDTH_M = 20 * FT
COURT_LENGTH_M = 44 * FT
NET_Y_M = 22 * FT
KITCHEN_DEPTH_M = 7 * FT
NEAR_KITCHEN_LINE_Y_M = NET_Y_M - KITCHEN_DEPTH_M
FAR_KITCHEN_LINE_Y_M = NET_Y_M + KITCHEN_DEPTH_M
COURT_MODEL = "pickleball_full_court_v1"

# Ground-plane landmarks a person can identify on a painted court. Net posts are
# excluded because they are not on the ground plane.
LANDMARKS_M: Dict[str, Tuple[float, float]] = {
    "near_left_baseline": (0.0, 0.0),
    "near_center_baseline": (COURT_WIDTH_M / 2, 0.0),
    "near_right_baseline": (COURT_WIDTH_M, 0.0),
    "near_left_kitchen": (0.0, NEAR_KITCHEN_LINE_Y_M),
    "near_center_kitchen": (COURT_WIDTH_M / 2, NEAR_KITCHEN_LINE_Y_M),
    "near_right_kitchen": (COURT_WIDTH_M, NEAR_KITCHEN_LINE_Y_M),
    "left_net_sideline": (0.0, NET_Y_M),
    "right_net_sideline": (COURT_WIDTH_M, NET_Y_M),
    "far_left_kitchen": (0.0, FAR_KITCHEN_LINE_Y_M),
    "far_center_kitchen": (COURT_WIDTH_M / 2, FAR_KITCHEN_LINE_Y_M),
    "far_right_kitchen": (COURT_WIDTH_M, FAR_KITCHEN_LINE_Y_M),
    "far_left_baseline": (0.0, COURT_LENGTH_M),
    "far_center_baseline": (COURT_WIDTH_M / 2, COURT_LENGTH_M),
    "far_right_baseline": (COURT_WIDTH_M, COURT_LENGTH_M),
}

# Above this reprojection error the calibration is reported as "poor" and the
# heatmap is still produced but flagged with a warning.
POOR_CALIBRATION_RMSE_M = 0.25


class CalibrationError(ValueError):
    pass


@dataclass(frozen=True)
class CourtCalibration:
    homography: np.ndarray  # 3x3, image px -> court metres
    landmarks_used: List[str]
    image_size: Tuple[int, int]  # (width, height) the pixels refer to
    reprojection_rmse_px: float
    reprojection_rmse_m: float

    @property
    def quality(self) -> str:
        return "good" if self.reprojection_rmse_m <= POOR_CALIBRATION_RMSE_M else "poor"

    def scaled_to(self, width: int, height: int) -> "CourtCalibration":
        """Return a calibration for frames of a different resolution (same framing)."""
        sw, sh = self.image_size
        if (sw, sh) == (width, height):
            return self
        s = np.diag([sw / width, sh / height, 1.0])
        return CourtCalibration(
            homography=self.homography @ s,
            landmarks_used=self.landmarks_used,
            image_size=(width, height),
            reprojection_rmse_px=self.reprojection_rmse_px * (width / sw),
            reprojection_rmse_m=self.reprojection_rmse_m,
        )

    def image_to_court(self, points_px: Sequence[Tuple[float, float]]) -> np.ndarray:
        if len(points_px) == 0:
            return np.zeros((0, 2))
        pts = np.asarray(points_px, dtype=np.float64).reshape(-1, 1, 2)
        return cv2.perspectiveTransform(pts, self.homography).reshape(-1, 2)


def calibrate(points: Dict[str, Tuple[float, float]], image_size: Tuple[int, int]) -> CourtCalibration:
    """Fit a ground-plane homography from named landmark pixel positions.

    Needs at least four landmarks, not all on one line. All supplied points are
    used (least squares); the reprojection error is reported so a bad click is
    visible rather than silently absorbed.
    """
    unknown = sorted(set(points) - set(LANDMARKS_M))
    if unknown:
        raise CalibrationError(f"Unknown landmark name(s): {', '.join(unknown)}")
    if len(points) < 4:
        raise CalibrationError("At least 4 court landmarks are required for calibration.")

    names = sorted(points)
    img = np.array([points[n] for n in names], dtype=np.float64)
    world = np.array([LANDMARKS_M[n] for n in names], dtype=np.float64)
    if _collinear(world) or _collinear(img):
        raise CalibrationError("Calibration landmarks must not all lie on a single line.")

    H, _ = cv2.findHomography(img, world, method=0)
    if H is None or not np.all(np.isfinite(H)):
        raise CalibrationError("Could not compute a homography from the supplied landmarks.")

    projected = cv2.perspectiveTransform(img.reshape(-1, 1, 2), H).reshape(-1, 2)
    rmse_m = float(np.sqrt(np.mean(np.sum((projected - world) ** 2, axis=1))))
    back = cv2.perspectiveTransform(world.reshape(-1, 1, 2), np.linalg.inv(H)).reshape(-1, 2)
    rmse_px = float(np.sqrt(np.mean(np.sum((back - img) ** 2, axis=1))))

    return CourtCalibration(
        homography=H,
        landmarks_used=names,
        image_size=(int(image_size[0]), int(image_size[1])),
        reprojection_rmse_px=round(rmse_px, 3),
        reprojection_rmse_m=round(rmse_m, 4),
    )


def calibration_from_dict(data: dict) -> CourtCalibration:
    """Parse ``{"image_width", "image_height", "points": [{"landmark", "pixel": [x, y]}]}``."""
    try:
        size = (int(data["image_width"]), int(data["image_height"]))
        pts = {p["landmark"]: (float(p["pixel"][0]), float(p["pixel"][1])) for p in data["points"]}
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise CalibrationError(f"Malformed calibration data: {exc}") from exc
    return calibrate(pts, size)


def load_calibration(path: Path) -> CourtCalibration:
    return calibration_from_dict(json.loads(Path(path).read_text()))


def foot_point(bbox: Sequence[float]) -> Tuple[float, float]:
    """Bottom-centre of a person box: an approximation of where the feet touch the ground."""
    x1, _y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, float(y2))


def court_half(y_m: float) -> Optional[str]:
    if y_m < NET_Y_M:
        return "near"
    if y_m > NET_Y_M:
        return "far"
    return None


def _collinear(pts: np.ndarray, tol: float = 1e-6) -> bool:
    if len(pts) < 3:
        return True
    centred = pts - pts.mean(axis=0)
    sv = np.linalg.svd(centred, compute_uv=False)
    return sv[1] <= tol * max(sv[0], 1.0)


def landmark_names() -> Iterable[str]:
    return LANDMARKS_M.keys()

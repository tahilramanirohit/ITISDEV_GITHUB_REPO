"""Snap a proposed court map onto the white lines painted on the court.

The court keypoint model gives a rough map: its corners can be off by a line
width, and corners outside the picture are guessed. This module checks the
map against the image itself:

1. **Line pixels.** Thin, bright, unsaturated pixels (a white-line top-hat).
   Areas dense with edges (the net mesh, banner text) and player boxes are ignored.
2. **Fit.** The court's painted lines are sampled every few centimetres and
   projected with the map. The map is adjusted (the image positions of the
   four kitchen corners) to bring those samples onto line pixels, using a
   distance transform and a shrinking pattern search.
3. **Check.** The refined map is kept only when enough of the visible court
   lines land on painted lines. Otherwise the frame has no court map.

The net is not a painted line, so it is not used.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Optional, Sequence, Tuple

import cv2
import numpy as np

from .court import COURT_LENGTH_M, COURT_WIDTH_M, FAR_KITCHEN_LINE_Y_M, NEAR_KITCHEN_LINE_Y_M, NET_Y_M, CourtCalibration

WORK_WIDTH = 960               # line matching runs on a downscaled frame
SAMPLE_STEP_M = 0.05
TOPHAT_KERNEL = 31             # at WORK_WIDTH; wider than a painted line near the camera
TOPHAT_MIN = 35
MAX_SATURATION = 90
MIN_VALUE = 130
DENSITY_WINDOW = 21
MAX_DENSITY = 0.16             # edge share: net mesh and lettering are denser than a line
CLIP_PX = 12.0                 # distance cap in the cost, at WORK_WIDTH
INLIER_PX = 3.0
MIN_VISIBLE_SAMPLES = 100     # at 5 cm spacing: about 5 m of visible painted line
MIN_INLIER_SHARE = 0.5
FOCAL_PRIOR_WEIGHT = 400.0     # cost per (log focal change)^2; 10% ≈ 4 px² of line error
CENTRE_PRIOR_WEIGHT = 16.0     # cost per m^2 of camera movement; 0.5 m ≈ 4 px²
MAX_CORNER_SHIFT = 0.25        # of WORK_WIDTH; refinement is a correction, not a search

W, L = COURT_WIDTH_M, COURT_LENGTH_M
# Painted lines: baselines, sidelines, kitchen lines, and the two centre lines
# (baseline to kitchen line on each side).
PAINTED = [((0, 0), (W, 0)), ((0, L), (W, L)), ((0, 0), (0, L)), ((W, 0), (W, L)),
           ((0, NEAR_KITCHEN_LINE_Y_M), (W, NEAR_KITCHEN_LINE_Y_M)),
           ((0, FAR_KITCHEN_LINE_Y_M), (W, FAR_KITCHEN_LINE_Y_M)),
           ((W / 2, 0), (W / 2, NEAR_KITCHEN_LINE_Y_M)), ((W / 2, FAR_KITCHEN_LINE_Y_M), (W / 2, L))]
ANCHORS_M = np.float32([[0, NEAR_KITCHEN_LINE_Y_M], [W, NEAR_KITCHEN_LINE_Y_M],
                        [0, FAR_KITCHEN_LINE_Y_M], [W, FAR_KITCHEN_LINE_Y_M]])


def _samples() -> np.ndarray:
    pts = []
    for (x1, y1), (x2, y2) in PAINTED:
        n = max(2, int(np.hypot(x2 - x1, y2 - y1) / SAMPLE_STEP_M))
        t = np.linspace(0, 1, n)
        pts.append(np.stack([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t], axis=1))
    return np.concatenate(pts).astype(np.float32)


SAMPLES_M = _samples()

# The net's white top tape: 36 in (0.914 m) at the posts, 12 in outside each
# sideline, sagging to 34 in (0.864 m) in the middle. It is not on the ground,
# so it can only be used through the camera model, where it fixes the depth of
# the far half of the court (whose lines hide behind the net mesh).
POST_OUTSIDE_M = 0.3048
_net_x = np.arange(-POST_OUTSIDE_M, COURT_WIDTH_M + POST_OUTSIDE_M + 1e-6, SAMPLE_STEP_M)
_half = COURT_WIDTH_M / 2 + POST_OUTSIDE_M
NET_TAPE_M = np.stack([_net_x, np.full_like(_net_x, NET_Y_M),
                       0.864 + 0.05 * ((_net_x - COURT_WIDTH_M / 2) / _half) ** 2], axis=1)
NET_WEIGHT = 1.0


def line_distance_map(frame: np.ndarray, exclude_boxes: Sequence[Sequence[int]] = ()) -> Tuple[np.ndarray, np.ndarray, float]:
    """Distance (px, at WORK_WIDTH) to the nearest painted-line pixel, a usable-pixel mask, and the scale."""
    scale = WORK_WIDTH / frame.shape[1]
    small = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    tophat = cv2.morphologyEx(grey, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (TOPHAT_KERNEL,) * 2))
    white = (tophat > TOPHAT_MIN) & (hsv[..., 1] < MAX_SATURATION) & (hsv[..., 2] > MIN_VALUE)
    # The net mesh and banner lettering are full of small edges; a painted
    # line, however wide, only has its two borders.
    edges = cv2.Canny(grey, 60, 160) > 0
    density = cv2.blur(edges.astype(np.float32), (DENSITY_WINDOW, DENSITY_WINDOW))
    usable = density <= MAX_DENSITY
    for x1, y1, x2, y2 in exclude_boxes:
        usable[max(0, int(y1 * scale)):int(y2 * scale) + 1, max(0, int(x1 * scale)):int(x2 * scale) + 1] = False
    lines = white & usable
    dist = cv2.distanceTransform((~lines).astype(np.uint8), cv2.DIST_L2, 3)
    return dist, usable, scale


def _project(h_court_to_img: np.ndarray, pts: np.ndarray) -> np.ndarray:
    return cv2.perspectiveTransform(pts.reshape(-1, 1, 2), h_court_to_img).reshape(-1, 2)


def _score(h_court_to_img, dist, usable, clip=CLIP_PX):
    img = _project(h_court_to_img, SAMPLES_M)
    hgt, wid = dist.shape
    ok = np.isfinite(img).all(axis=1) & (img[:, 0] >= 0) & (img[:, 0] < wid - 1) & (img[:, 1] >= 0) & (img[:, 1] < hgt - 1)
    px = img[ok].astype(np.int32)
    if len(px) == 0:
        return np.inf, 0, 0.0
    keep = usable[px[:, 1], px[:, 0]]
    d = dist[px[keep, 1], px[keep, 0]]
    if len(d) < MIN_VISIBLE_SAMPLES:
        return np.inf, len(d), 0.0
    cost = float(np.mean(np.minimum(d, clip) ** 2))
    return cost, len(d), float(np.mean(d <= INLIER_PX))


def pose_from_homography(h_court_to_img: np.ndarray, cx: float, cy: float):
    """(focal, rotation vector, translation) of a camera that explains a map, or None."""
    shift = np.array([[1, 0, -cx], [0, 1, -cy], [0, 0, 1.0]])
    m = shift @ h_court_to_img
    m = m / np.linalg.norm(m[:, :2])
    h1, h2 = m[:, 0], m[:, 1]
    # Square pixels give two equations in w = 1/f^2 (the court axes are
    # perpendicular and equally long). Either can vanish, for example when the
    # camera looks straight down the court, so solve both in least squares.
    a = np.array([h1[0] * h2[0] + h1[1] * h2[1], h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2])
    b = np.array([h1[2] * h2[2], h1[2] ** 2 - h2[2] ** 2])
    if float(a @ a) < 1e-18:
        return None
    w_inv_f2 = -float(a @ b) / float(a @ a)
    if not np.isfinite(w_inv_f2) or w_inv_f2 <= 0:
        return None
    f = float(1 / np.sqrt(w_inv_f2))
    k_inv = np.diag([1 / f, 1 / f, 1.0])
    c = k_inv @ m
    lam = (np.linalg.norm(c[:, 0]) + np.linalg.norm(c[:, 1])) / 2
    r1, r2, t = c[:, 0] / lam, c[:, 1] / lam, c[:, 2] / lam
    if t[2] < 0:
        r1, r2, t = -r1, -r2, -t
    u, _sv, vt = np.linalg.svd(np.stack([r1, r2, np.cross(r1, r2)], axis=1))
    rot = u @ vt
    if np.linalg.det(rot) < 0:
        return None
    rvec, _ = cv2.Rodrigues(rot)
    return f, rvec.ravel(), t


def homography_from_pose(f: float, rvec: np.ndarray, t: np.ndarray, cx: float, cy: float) -> np.ndarray:
    rot, _ = cv2.Rodrigues(np.asarray(rvec, dtype=np.float64))
    k = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1.0]])
    return k @ np.stack([rot[:, 0], rot[:, 1], t], axis=1)


def _net_cost(f, rvec, t, cx, cy, dist, usable, clip) -> Optional[float]:
    rot, _ = cv2.Rodrigues(np.asarray(rvec, dtype=np.float64))
    cam = NET_TAPE_M @ rot.T + t
    front = cam[:, 2] > 0.1
    if front.sum() < 10:
        return None
    u = f * cam[front, 0] / cam[front, 2] + cx
    v = f * cam[front, 1] / cam[front, 2] + cy
    hgt, wid = dist.shape
    ok = (u >= 0) & (u < wid - 1) & (v >= 0) & (v < hgt - 1)
    ui, vi = u[ok].astype(np.int32), v[ok].astype(np.int32)
    keep = usable[vi, ui]
    if keep.sum() < 20:
        return None
    return float(np.mean(np.minimum(dist[vi[keep], ui[keep]], clip) ** 2))


def camera_centre(rvec: np.ndarray, t: np.ndarray) -> np.ndarray:
    rot, _ = cv2.Rodrigues(np.asarray(rvec, dtype=np.float64))
    return -rot.T @ t


def refine(cal: CourtCalibration, frame: np.ndarray, exclude_boxes: Sequence[Sequence[int]] = (),
           distance: Optional[Tuple[np.ndarray, np.ndarray, float]] = None,
           focal_prior: Optional[float] = None,
           centre_prior: Optional[np.ndarray] = None) -> Tuple[Optional[CourtCalibration], float]:
    """Return (refined calibration or None, share of visible line samples on painted lines).

    The map is adjusted through the camera that produces it (focal length,
    orientation, position), so the result is always a view a real camera could
    take; a map no camera can explain is rejected. ``focal_prior`` (full-size
    pixels) keeps the zoom near what recent frames used: far court lines hide
    behind the net, and without it focal length and distance trade off.
    ``centre_prior`` (court metres) does the same for where the filmer stands.
    """
    dist, usable, scale = distance if distance is not None else line_distance_map(frame, exclude_boxes)
    hgt, wid = dist.shape
    cx, cy = wid / 2, hgt / 2
    s = np.diag([scale, scale, 1.0])
    pose = pose_from_homography(s @ np.linalg.inv(cal.homography), cx, cy)
    if pose is None:
        return None, 0.0
    f0, r0, t0 = pose
    x = np.concatenate([[np.log(f0)], r0, t0])
    steps = np.array([0.04, 0.015, 0.015, 0.015, 0.25, 0.25, 0.25])

    def h_of(v):
        return homography_from_pose(float(np.exp(v[0])), v[1:4], v[4:7], cx, cy)

    log_prior = np.log(focal_prior * scale) if focal_prior else None

    def cost_of(v, clip):
        c, _, _ = _score(h_of(v), dist, usable, clip)
        net = _net_cost(float(np.exp(v[0])), v[1:4], v[4:7], cx, cy, dist, usable, clip)
        if net is not None:
            c = (c + NET_WEIGHT * net) / (1 + NET_WEIGHT)
        if log_prior is not None:
            c += FOCAL_PRIOR_WEIGHT * (v[0] - log_prior) ** 2
        if centre_prior is not None:
            c += CENTRE_PRIOR_WEIGHT * float(np.sum((camera_centre(v[1:4], v[4:7]) - centre_prior) ** 2))
        return c

    # Coarse to fine: a wide distance cap first pulls lines that are a whole
    # line-spacing away, then a tight cap aligns them precisely.
    for clip, scale_step in ((48.0, 1.0), (CLIP_PX, 0.25)):
        best_cost = cost_of(x, clip)
        if not np.isfinite(best_cost):
            return None, 0.0
        k = scale_step
        while k >= 1 / 64:
            improved = False
            for i in range(7):
                for sign in (-1, 1):
                    trial = x.copy()
                    trial[i] += sign * k * steps[i]
                    c = cost_of(trial, clip)
                    if c < best_cost - 1e-6:
                        x, best_cost, improved = trial, c, True
            if not improved:
                k /= 2
    h_small = h_of(x)
    _cost, visible, inliers = _score(h_small, dist, usable)
    if visible < MIN_VISIBLE_SAMPLES or inliers < MIN_INLIER_SHARE:
        return None, inliers
    img_to_court = np.linalg.inv(np.linalg.inv(s) @ h_small)
    img_to_court /= img_to_court[2, 2]
    return replace(cal, homography=img_to_court), inliers

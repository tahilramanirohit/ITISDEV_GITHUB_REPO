"""Find the court map from the painted lines, for a camera behind the near baseline.

Home recordings are usually filmed from behind one baseline. The near
baseline is then below the picture and the far lines are hidden behind the
net, so a keypoint model trained on full-court broadcast views often guesses
wrong. The lines that *are* clearly visible are:

* the near kitchen line: the longest horizontal white line, with a corner at
  each sideline, and
* the near centre line, from the bottom of the picture up to the kitchen line.

Those give the image positions of three court points on the kitchen line
(left corner, centre T, right corner) and the direction of the centre line.
One quantity is still open: where the court's long lines meet at the horizon
(the vanishing point). For each candidate vanishing point along the centre
line, the camera's focal length and the court's depth scale follow from the
ordinary camera assumptions (square pixels, principal point at the image
centre). The candidate whose whole court drawing lands best on the painted
lines wins, and :func:`picklepro.court_refine.refine` then polishes it.
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np

from .court import COURT_WIDTH_M, NEAR_KITCHEN_LINE_Y_M, CourtCalibration
from .court_refine import _score, camera_centre, line_distance_map, pose_from_homography, refine

HORIZONTAL_MAX_DEG = 10.0
MIN_KITCHEN_SHARE = 0.25        # of the frame width, in painted-line length
MAX_LINE_GAP_PX = 70            # players standing on the kitchen line hide parts of it
MIN_FOCAL_WIDTHS, MAX_FOCAL_WIDTHS = 0.35, 4.0
T_JUNCTION_PX = 15
# Where a recording camera can stand: behind (or just inside) the near baseline.
CAMERA_SIDE_MARGIN_M = 6.0
CAMERA_MAX_BEHIND_M = 15.0
CAMERA_MAX_INSIDE_M = 1.0
CAMERA_MIN_Z_M, CAMERA_MAX_Z_M = 0.8, 8.0


def _segments(lines_mask: np.ndarray) -> np.ndarray:
    segs = cv2.HoughLinesP(lines_mask, 1, np.pi / 360, 50, minLineLength=40, maxLineGap=10)
    return np.zeros((0, 4)) if segs is None else segs.reshape(-1, 4).astype(np.float64)


def _angle(seg) -> float:
    x1, y1, x2, y2 = seg
    return math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180


def _group(segs: np.ndarray, angle_tol=3.0, dist_tol=6.0) -> List[np.ndarray]:
    """Greedy grouping of collinear segments, heaviest first."""
    order = np.argsort(-np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1]))
    groups: List[List[np.ndarray]] = []
    for i in order:
        s = segs[i]
        placed = False
        for g in groups:
            ref = g[0]
            da = abs(_angle(s) - _angle(ref))
            if min(da, 180 - da) > angle_tol:
                continue
            if _point_line_distance(((s[0] + s[2]) / 2, (s[1] + s[3]) / 2), ref) <= dist_tol:
                g.append(s)
                placed = True
                break
        if not placed:
            groups.append([s])
    return [np.array(g) for g in groups]


def _point_line_distance(p, seg) -> float:
    x1, y1, x2, y2 = seg
    return abs((y2 - y1) * p[0] - (x2 - x1) * p[1] + x2 * y1 - y2 * x1) / max(1e-9, math.hypot(x2 - x1, y2 - y1))


def _fit(group: np.ndarray) -> Tuple[np.ndarray, float]:
    """Homogeneous line through a group's endpoints, and its total length."""
    pts = np.concatenate([group[:, :2], group[:, 2:]])
    vx, vy, x0, y0 = cv2.fitLine(pts.astype(np.float32), cv2.DIST_L2, 0, 0.01, 0.01).ravel()
    line = np.cross([x0, y0, 1.0], [x0 + vx, y0 + vy, 1.0])
    return line / np.linalg.norm(line[:2]), float(np.sum(np.hypot(group[:, 2] - group[:, 0], group[:, 3] - group[:, 1])))


def _extent(lines_mask: np.ndarray, usable: np.ndarray, line: np.ndarray) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """End points of the painted run along ``line``.

    Stretches hidden behind a player (not usable) never break the run; short
    unpainted gaps (worn paint, shadows) are bridged too.
    """
    h, w = lines_mask.shape
    a, b, c = line
    if abs(b) < 1e-6:
        return None
    xs = np.arange(w)
    ys = -(a * xs + c) / b
    on = np.zeros(w, bool)
    hidden = np.zeros(w, bool)
    for dy in (-2, -1, 0, 1, 2):
        yy = np.round(ys + dy).astype(int)
        ok = (yy >= 0) & (yy < h)
        on[ok] |= lines_mask[yy[ok], xs[ok]] > 0
        hidden[ok] |= ~usable[yy[ok], xs[ok]]
    runs, start, gap = [], None, 0
    for x in range(w):
        if on[x]:
            if start is None:
                start = x
            last, gap = x, 0
        elif start is not None and not hidden[x]:
            gap += 1
            if gap > MAX_LINE_GAP_PX:
                runs.append((start, last))
                start, gap = None, 0
    if start is not None:
        runs.append((start, last))
    if not runs:
        return None
    x1, x2 = max(runs, key=lambda r: r[1] - r[0])
    return np.array([x1, ys[x1], 1.0]), np.array([x2, ys[x2], 1.0])


def _homography(p_left, p_center, p_right, vp, cx, cy) -> Optional[np.ndarray]:
    """Court (x, y) → image H, from three kitchen-line points and the vanishing point of the long lines.

    Works in coordinates centred on the principal point; court origin at the
    centre T of the near kitchen line.
    """
    shift = np.array([[1, 0, -cx], [0, 1, -cy], [0, 0, 1.0]])
    pl, pc, pr, v = (shift @ p for p in (p_left, p_center, p_right, vp))
    half = COURT_WIDTH_M / 2
    # lam_r * pr + lam_l * pl = 2 * pc  (the centre is midway along the court)
    a = np.stack([pr, pl], axis=1)
    lam, *_ = np.linalg.lstsq(a, 2 * pc, rcond=None)
    h1 = (lam[0] * pr - pc) / half
    h3 = pc
    # Square pixels: h1 ⟂ h2 and |h1| = |h2| after removing the focal length f.
    d = v
    num = h1[0] * d[0] + h1[1] * d[1]
    den = h1[2] * d[2]
    if abs(den) < 1e-12 or -num / den <= 0:
        return None
    f = math.sqrt(-num / den)
    n1 = (h1[0] ** 2 + h1[1] ** 2) / f ** 2 + h1[2] ** 2
    n2 = (d[0] ** 2 + d[1] ** 2) / f ** 2 + d[2] ** 2
    if n2 <= 0:
        return None
    beta = math.sqrt(n1 / n2)
    for sign in (1, -1):
        h2 = sign * beta * d
        h = np.stack([h1, h2, h3], axis=1)
        # One metre toward the far side must move up the picture from the centre T.
        far = h @ np.array([0, 1.0, 1.0])
        near = h @ np.array([0, 0.0, 1.0])
        if far[2] * near[2] > 0 and far[1] / far[2] < near[1] / near[2]:
            break
    else:
        return None
    to_origin = np.array([[1, 0, -half], [0, 1, -NEAR_KITCHEN_LINE_Y_M], [0, 0, 1.0]])
    return np.linalg.inv(shift) @ h @ to_origin, f


def camera_position(h_court_to_img: np.ndarray, f: float, cx: float, cy: float) -> Optional[np.ndarray]:
    """Camera centre in court metres (x across, y along the court, z up) implied by a map."""
    k_inv = np.array([[1 / f, 0, -cx / f], [0, 1 / f, -cy / f], [0, 0, 1.0]])
    m = k_inv @ h_court_to_img
    scale = (np.linalg.norm(m[:, 0]) + np.linalg.norm(m[:, 1])) / 2
    if scale <= 0:
        return None
    r1, r2, t = m[:, 0] / scale, m[:, 1] / scale, m[:, 2] / scale
    if t[2] < 0:  # the court must be in front of the camera
        r1, r2, t = -r1, -r2, -t
    r3 = np.cross(r1, r2)
    rot = np.stack([r1, r2, r3], axis=1)
    return -rot.T @ t


def plausible_camera(c: Optional[np.ndarray]) -> bool:
    """Behind the near baseline, above the ground, not far off to the side."""
    if c is None or not np.isfinite(c).all():
        return False
    x, y, z = c
    return (-CAMERA_SIDE_MARGIN_M <= x <= COURT_WIDTH_M + CAMERA_SIDE_MARGIN_M
            and -CAMERA_MAX_BEHIND_M <= y <= CAMERA_MAX_INSIDE_M and CAMERA_MIN_Z_M <= z <= CAMERA_MAX_Z_M)


def fit_from_lines(frame: np.ndarray, exclude_boxes: Sequence[Sequence[int]] = (),
                   distance=None, focal_prior: Optional[float] = None) -> Tuple[Optional[CourtCalibration], float]:
    """Court map from the painted near kitchen line and centre line, and its line-match share."""
    distance = distance if distance is not None else line_distance_map(frame, exclude_boxes)
    dist, usable, scale = distance
    lines_mask = ((dist == 0) & usable).astype(np.uint8) * 255
    h, w = lines_mask.shape
    segs = _segments(lines_mask)
    if len(segs) == 0:
        return None, 0.0
    angles = np.array([_angle(s) for s in segs])
    horizontal = segs[(angles < HORIZONTAL_MAX_DEG) | (angles > 180 - HORIZONTAL_MAX_DEG)]
    steep = segs[(angles > 25) & (angles < 155)]
    if len(horizontal) == 0 or len(steep) == 0:
        return None, 0.0
    # Horizontal candidates: long lines away from the picture's top and bottom
    # edges (a video border can look like a line). The net's top tape is also
    # long and white; the kitchen line is the one the centre line ends at.
    candidates = []
    for kitchen, length in sorted((_fit(g) for g in _group(horizontal)), key=lambda f: -f[1])[:5]:
        y_mid = -(kitchen[2] + kitchen[0] * w / 2) / kitchen[1]
        if length >= MIN_KITCHEN_SHARE * w and 0.03 * h < y_mid < 0.97 * h:
            candidates.append(kitchen)
    centre_groups = [(g, *_fit(g)) for g in _group(steep, angle_tol=4.0, dist_tol=8.0)]
    centre_groups = [c for c in centre_groups if c[2] >= 0.08 * h]

    best = None
    for kitchen in candidates:
        ends = _extent(lines_mask, usable, kitchen)
        if ends is None:
            continue
        left, right = sorted(ends, key=lambda p: p[0])
        if right[0] - left[0] < MIN_KITCHEN_SHARE * w:
            continue
        for group, centre_line, _clen in centre_groups:
            pc = np.cross(kitchen, centre_line)
            if abs(pc[2]) < 1e-9:
                continue
            pc = pc / pc[2]
            if not (left[0] + 0.2 * (right[0] - left[0]) < pc[0] < right[0] - 0.2 * (right[0] - left[0])):
                continue
            ys = np.concatenate([group[:, 1], group[:, 3]])
            # T-junction: the centre line runs down from the kitchen line and stops there.
            if ys.min() < pc[1] - T_JUNCTION_PX or ys.min() > pc[1] + 0.25 * h or ys.mean() < pc[1]:
                continue
            direction = np.array([-centre_line[1], centre_line[0]])
            if direction[1] > 0:
                direction = -direction
            for k in np.geomspace(0.15, 40.0, 60):
                vp = np.array([pc[0] + direction[0] * k * h, pc[1] + direction[1] * k * h, 1.0])
                res = _homography(left, pc, right, vp, w / 2, h / 2)
                if res is None:
                    continue
                h_small, f = res
                if not (MIN_FOCAL_WIDTHS * w <= f <= MAX_FOCAL_WIDTHS * w):
                    continue
                if focal_prior is not None and abs(f / scale / focal_prior - 1) > FOCAL_TOLERANCE:
                    continue
                if not plausible_camera(camera_position(h_small, f, w / 2, h / 2)):
                    continue
                cost, visible, inliers = _score(h_small, dist, usable)
                if np.isfinite(cost) and (best is None or cost < best[0]):
                    best = (cost, h_small, inliers)
    if best is None:
        return None, 0.0
    _cost, h_small, _inl = best
    s = np.diag([scale, scale, 1.0])
    img_to_court = np.linalg.inv(np.linalg.inv(s) @ h_small)
    img_to_court /= img_to_court[2, 2]
    rough = CourtCalibration(homography=img_to_court, landmarks_used=["painted_lines"],
                             image_size=(frame.shape[1], frame.shape[0]),
                             reprojection_rmse_px=0.0, reprojection_rmse_m=0.0)
    return refine(rough, frame, exclude_boxes, distance=distance, focal_prior=focal_prior)


def plausible_map(cal: CourtCalibration) -> bool:
    """Could a real camera behind the near baseline have produced this map?"""
    w, h = cal.image_size
    try:
        pose = pose_from_homography(np.linalg.inv(cal.homography), w / 2, h / 2)
    except np.linalg.LinAlgError:
        return False
    if pose is None:
        return False
    f, rvec, t = pose
    return MIN_FOCAL_WIDTHS * w <= f <= MAX_FOCAL_WIDTHS * w and plausible_camera(camera_centre(rvec, t))


# Following the court from frame to frame.
TRACK_WORK_WIDTH = 640
TRACK_MIN_MATCHES = 40
TRACK_MAX_AGE_S = 3.0          # never carry a map longer than this without confirmation
ACCEPT_SHARE = 0.55            # line-match share a map needs to be used
FRESH_SHARE = 0.68             # a map found from scratch must match better to start or restart
FOCAL_HISTORY = 30
FOCAL_MIN_SAMPLES = 5
FOCAL_TOLERANCE = 0.15         # a fresh fit's focal length may differ this much from the recent median


class CourtTracker:
    """Keep a court map across a video, confirming it against painted lines every frame.

    Each frame offers up to three candidate maps: the previous confirmed map
    moved by the measured camera motion, a fresh fit from the painted lines,
    and (when a court model is configured) the model's own fit. Each is
    snapped onto the painted lines; the best-matching one is used when it
    matches well enough. A frame with no convincing map gets none.
    """

    def __init__(self, model=None):
        self.model = model
        self._orb = cv2.ORB_create(nfeatures=1500)
        self._matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
        self._last = None      # (time_s, calibration, keypoints, descriptors, scale)
        self.sources = {"tracked": 0, "painted_lines": 0, "court_model": 0}
        self._focals: list = []   # focal lengths (px) of confirmed maps; the phone's zoom changes slowly
        self._centres: list = []  # camera positions of confirmed maps; the filmer barely moves
        self._confirmed: Optional[CourtCalibration] = None

    def _features(self, frame):
        scale = TRACK_WORK_WIDTH / frame.shape[1]
        grey = cv2.cvtColor(cv2.resize(frame, None, fx=scale, fy=scale), cv2.COLOR_BGR2GRAY)
        kp, desc = self._orb.detectAndCompute(grey, None)
        pts = np.float32([k.pt for k in kp]) if kp else np.zeros((0, 2), np.float32)
        return pts, desc, scale

    def _carry(self, pts, desc, scale) -> Optional[CourtCalibration]:
        _t, cal, ref_pts, ref_desc, _s = self._last
        if desc is None or ref_desc is None or len(pts) < TRACK_MIN_MATCHES:
            return None
        pairs = self._matcher.knnMatch(desc, ref_desc, k=2)
        good = [m for pair in pairs if len(pair) == 2 for m, n in [pair] if m.distance < 0.75 * n.distance]
        if len(good) < TRACK_MIN_MATCHES:
            return None
        src = np.float32([pts[m.queryIdx] for m in good]) / scale
        dst = np.float32([ref_pts[m.trainIdx] for m in good]) / scale
        motion, mask = cv2.findHomography(src, dst, cv2.RANSAC, 3.0 / scale)
        if motion is None or mask is None or int(mask.sum()) < TRACK_MIN_MATCHES:
            return None
        return CourtCalibration(homography=cal.homography @ motion, landmarks_used=cal.landmarks_used,
                                image_size=cal.image_size, reprojection_rmse_px=cal.reprojection_rmse_px,
                                reprojection_rmse_m=cal.reprojection_rmse_m)

    def reset(self) -> None:
        """Forget the map, for example after a camera cut."""
        self._last = None

    def update(self, time_s: float, frame: np.ndarray, player_boxes: Sequence[Sequence[int]] = ()) -> Optional[CourtCalibration]:
        distance = line_distance_map(frame, player_boxes)
        pts, desc, scale = self._features(frame)
        candidates = []
        if self._last is not None and time_s - self._last[0] <= TRACK_MAX_AGE_S:
            carried = self._carry(pts, desc, scale)
            if carried is not None:
                refined, share = refine(carried, frame, player_boxes, distance=distance,
                                        focal_prior=self.focal, centre_prior=self.centre)
                if refined is not None:
                    candidates.append((share, "tracked", refined))
        if self._confirmed is not None and self.centre is not None:
            # The filmer stands still: the last confirmed camera, re-aimed, often fits again.
            refined, share = refine(self._confirmed, frame, player_boxes, distance=distance,
                                    focal_prior=self.focal, centre_prior=self.centre)
            if refined is not None:
                candidates.append((share, "tracked", refined))
        fresh, share = fit_from_lines(frame, player_boxes, distance=distance, focal_prior=self.focal)
        if fresh is not None and share >= FRESH_SHARE:
            candidates.append((share, "painted_lines", fresh))
        if self.model is not None:
            fitted = self.model.calibrate_frame(frame)
            if fitted is not None:
                refined, share = refine(fitted, frame, player_boxes, distance=distance,
                                        focal_prior=self.focal, centre_prior=self.centre)
                if refined is not None and share >= FRESH_SHARE:
                    candidates.append((share, "court_model", refined))
        candidates = [c for c in candidates if plausible_map(c[2])]
        if not candidates:
            return None
        share, source, cal = max(candidates, key=lambda c: c[0])
        if share < ACCEPT_SHARE:
            return None
        self.sources[source] += 1
        if desc is not None:
            self._last = (time_s, cal, pts, desc, scale)
        pose = pose_from_homography(np.linalg.inv(cal.homography), cal.image_size[0] / 2, cal.image_size[1] / 2)
        if pose is not None:
            self._focals = (self._focals + [pose[0]])[-FOCAL_HISTORY:]
            self._centres = (self._centres + [camera_centre(pose[1], pose[2])])[-FOCAL_HISTORY:]
        self._confirmed = cal
        return cal

    @property
    def centre(self) -> Optional[np.ndarray]:
        """Recent median camera position, once a few maps agree on it."""
        return np.median(np.array(self._centres), axis=0) if len(self._centres) >= FOCAL_MIN_SAMPLES else None

    @property
    def focal(self) -> Optional[float]:
        """Recent median focal length in pixels, once a few maps agree on it."""
        return float(np.median(self._focals)) if len(self._focals) >= FOCAL_MIN_SAMPLES else None

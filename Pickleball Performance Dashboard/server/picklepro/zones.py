"""Zone time for every player on the court (requirements F01, F02, F12).

Coordinates follow the metric dictionary: ``d`` is the distance from the net
toward the player's own baseline, 0 to 6.7056 m; the non-volley (kitchen)
line is at L = 2.1336 m.

* **Zones** (mutually exclusive, sum to 100%): kitchen ``0 <= d < L``,
  transition ``L <= d < 5.2``, baseline ``5.2 <= d <= 6.7056``, and outside
  (beyond a sideline or behind the baseline).
* **Kitchen-line presence**: time in the strip ``L <= d < L + 1.0`` within
  the sidelines, over all positioned time. It is part of the transition zone.
* **Coverage**: observed seconds over evaluable seconds.

The position is the bottom-centre of the player's box mapped to the court.
When a player's position cannot be seen, it is **estimated**, and estimated
time is always reported separately from observed time:

* feet cut off by the bottom of the picture (a near player behind the
  baseline): the camera position recovered from the court lines says where a
  person about 1.7 m tall must stand for their head to appear where it does;
* out of the picture and back again: the position moves in a straight line
  from where the player left to where they came back (up to
  ``MAX_FILL_GAP_S``);
* out of the picture at the start or end: the last known position is kept
  for up to ``HOLD_S``.

The requirements (revision 4) allow gaps of at most 0.5 s to be filled. The
longer estimates are a team choice (30 Sep 2026) so that zone time does not
depend on how much of the court the camera shows; the estimated share says
how much of each result rests on them.
"""

from __future__ import annotations

import bisect
import math
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from .court import COURT_LENGTH_M, COURT_WIDTH_M, KITCHEN_DEPTH_M, NET_Y_M, CourtCalibration, foot_point

HALF_LENGTH_M = COURT_LENGTH_M / 2          # 6.7056 m
KITCHEN_LINE_M = KITCHEN_DEPTH_M            # 2.1336 m from the net
TRANSITION_END_M = 5.2
LINE_STRIP_M = 1.0
NET_TOLERANCE_M = 0.5        # a foot point this far past the net is mapping error, still the kitchen
ZONES = ("kitchen", "transition", "baseline", "outside")
ZONE_DEFINITIONS = {
    "kitchen": "Inside the non-volley zone: 0 to 2.13 m from the net.",
    "transition": "Between the kitchen line and 5.2 m from the net.",
    "baseline": "From 5.2 m from the net to the baseline (6.71 m).",
    "outside": "Beyond a sideline or behind the baseline.",
    "kitchen_line": "The 1 m strip just behind the kitchen line, within the sidelines (part of transition).",
}
PLAYER_HEIGHT_M = 1.7
FEET_CUT_OFF_FRAC = 0.012    # a box this close to the bottom edge has its feet out of the picture
MAX_FILL_GAP_S = 8.0
HOLD_S = 3.0
MAX_SAMPLE_GAP_S = 0.35      # longer steps between samples are gaps
# A "player" seen for less than this share of the window is a brief false
# detection (on CHvsBJ.mp4, 22 frames near the net in the first 2 s), not a
# player whose zone time can be reported.
MIN_OBSERVED_SHARE = 0.15


def distance_from_net(court_xy: Tuple[float, float], side: str) -> float:
    """Distance from the net toward this player's own baseline (negative past the net)."""
    y = court_xy[1]
    return NET_Y_M - y if side == "near" else y - NET_Y_M


def zone_of(court_xy: Tuple[float, float], side: str) -> str:
    x = court_xy[0]
    d = distance_from_net(court_xy, side)
    if x < 0 or x > COURT_WIDTH_M or d > HALF_LENGTH_M or d < -NET_TOLERANCE_M:
        return "outside"
    if d < KITCHEN_LINE_M:
        return "kitchen"
    if d < TRANSITION_END_M:
        return "transition"
    return "baseline"


def on_kitchen_line(court_xy: Tuple[float, float], side: str) -> bool:
    d = distance_from_net(court_xy, side)
    return 0 <= court_xy[0] <= COURT_WIDTH_M and KITCHEN_LINE_M <= d < KITCHEN_LINE_M + LINE_STRIP_M


class _Camera:
    """Camera pose from a court map, for placing a player whose feet are cut off."""

    def __init__(self, cal: CourtCalibration):
        import cv2

        from .court_refine import pose_from_homography

        self.ok = False
        self.h_img_to_court = cal.homography
        self.h_court_to_img = np.linalg.inv(cal.homography)
        w, h = cal.image_size
        pose = pose_from_homography(self.h_court_to_img, w / 2, h / 2)
        if pose is None:
            return
        f, rvec, t = pose
        rot, _ = cv2.Rodrigues(np.asarray(rvec, dtype=np.float64))
        self.k = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1.0]])
        self.rot, self.t = rot, np.asarray(t, dtype=np.float64)
        centre = -rot.T @ self.t
        self.up = 1.0 if centre[2] > 0 else -1.0  # the camera is above the floor
        self.ok = abs(centre[2]) > 0.3

    def _project(self, xyz: np.ndarray) -> Optional[Tuple[float, float]]:
        cam = self.rot @ xyz + self.t
        if cam[2] <= 1e-6:
            return None
        p = self.k @ cam
        return p[0] / p[2], p[1] / p[2]

    def feet_from_head(self, head_x: float, head_y: float, frame_h: int) -> Optional[Tuple[float, float]]:
        """Floor point below the picture whose standing person's head appears at (head_x, head_y)."""
        best, best_err = None, math.inf
        for v in np.linspace(frame_h, frame_h * 3.0, 121):
            p = self.h_img_to_court @ np.array([head_x, v, 1.0])
            if abs(p[2]) < 1e-9:
                continue
            x, y = p[0] / p[2], p[1] / p[2]
            head = self._project(np.array([x, y, self.up * PLAYER_HEIGHT_M]))
            if head is None:
                continue
            err = abs(head[1] - head_y)
            if err < best_err:
                best, best_err = (float(x), float(y)), err
        # The search must actually reach the head row; otherwise there is no estimate.
        return best if best is not None and best_err < 0.05 * frame_h else None


def _positions(times: Sequence[float], per_frame: Sequence[Sequence[dict]],
               calibrations: Sequence[Optional[CourtCalibration]], frame_h: int):
    """player id -> list of (time, (x, y), how) with how in {"observed", "estimated"}."""
    cams: Dict[int, _Camera] = {}
    out: Dict[int, List[Tuple[float, Tuple[float, float], str]]] = {}
    for t, dets, cal in zip(times, per_frame, calibrations):
        if cal is None:
            continue
        for d in dets:
            pid = d.get("track_id")
            if pid is None:
                continue
            x1, y1, x2, y2 = d["bbox"]
            if y2 >= frame_h * (1 - FEET_CUT_OFF_FRAC):
                cam = cams.get(id(cal))
                if cam is None:
                    cam = cams[id(cal)] = _Camera(cal)
                xy = cam.feet_from_head((x1 + x2) / 2, y1, frame_h) if cam.ok else None
                if xy is not None:
                    out.setdefault(pid, []).append((t, xy, "estimated"))
                continue
            xy = cal.image_to_court([foot_point(d["bbox"])])[0]
            out.setdefault(pid, []).append((t, (float(xy[0]), float(xy[1])), "observed"))
    return out


def _fill(samples: List[Tuple[float, Tuple[float, float], str]], grid: Sequence[float]):
    """A position for every grid time: (xy, how) with how observed/estimated, or None."""
    ts = [s[0] for s in samples]
    out = []
    for t in grid:
        i = bisect.bisect_right(ts, t + 1e-6)
        before = samples[i - 1] if i > 0 else None
        after = samples[i] if i < len(samples) else None
        if before is not None and abs(before[0] - t) <= 1e-6:
            out.append((before[1], before[2]))
        elif before is not None and after is not None and after[0] - before[0] <= MAX_FILL_GAP_S:
            gap = after[0] - before[0]
            k = (t - before[0]) / gap
            xy = (before[1][0] + k * (after[1][0] - before[1][0]), before[1][1] + k * (after[1][1] - before[1][1]))
            # A normal step between two observed samples is still an observation.
            how = "observed" if gap <= MAX_SAMPLE_GAP_S and before[2] == after[2] == "observed" else "estimated"
            out.append((xy, how))
        elif before is not None and t - before[0] <= HOLD_S:
            out.append((before[1], "estimated"))
        elif after is not None and after[0] - t <= HOLD_S:
            out.append((after[1], "estimated"))
        else:
            out.append(None)
    return out


def zone_time(times: Sequence[float], per_frame: Sequence[Sequence[dict]],
              calibrations: Sequence[Optional[CourtCalibration]], frame_h: int, frame_interval_s: float,
              players: Sequence[object], windows: Optional[Sequence[Tuple[float, float]]] = None) -> List[dict]:
    """Zone shares per on-court player over ``windows`` (rally windows), or over all sampled time."""
    positions = _positions(times, per_frame, calibrations, frame_h)
    grid = [t for t in times if windows is None or any(a <= t <= b for a, b in windows)]
    results = []
    for p in players:
        if not getattr(p, "on_court", False) or getattr(p, "side", None) not in ("near", "far"):
            continue
        filled = _fill(positions.get(p.player_id, []), grid)
        seconds = {z: 0.0 for z in ZONES}
        line = observed = estimated = 0.0
        for item in filled:
            if item is None:
                continue
            xy, how = item
            seconds[zone_of(xy, p.side)] += frame_interval_s
            line += frame_interval_s if on_kitchen_line(xy, p.side) else 0.0
            if how == "observed":
                observed += frame_interval_s
            else:
                estimated += frame_interval_s
        positioned = observed + estimated
        evaluable = len(grid) * frame_interval_s
        if not evaluable or observed / evaluable < MIN_OBSERVED_SHARE:
            continue
        results.append({
            "player_id": p.player_id,
            "side": p.side,
            "evaluable_s": round(evaluable, 2),
            "observed_s": round(observed, 2),
            "estimated_s": round(estimated, 2),
            "unknown_s": round(max(0.0, evaluable - positioned), 2),
            "coverage": round(observed / evaluable, 3) if evaluable else 0.0,
            "estimated_share": round(estimated / positioned, 3) if positioned else 0.0,
            "zone_seconds": {z: round(s, 2) for z, s in seconds.items()},
            "zone_share": {z: round(s / positioned, 3) if positioned else 0.0 for z, s in seconds.items()},
            "kitchen_line_share": round(line / positioned, 3) if positioned else 0.0,
        })
    return results

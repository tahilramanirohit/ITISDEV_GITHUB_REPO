"""Court-positioning patterns for one selected player, for practice feedback.

These are *movement* measures derived from the selected player's projected
foot position over time, measured from that player's own baseline:

* depth bands: how long the player stood behind the baseline, near it, in the
  transition area ("no-man's land"), at the kitchen line, or inside the kitchen;
* transition lingers: continuous stays of at least ``LINGER_MIN_S`` in the
  transition area;
* approaches: moves from the baseline area to the kitchen line, with how long
  each took.

Like every metric in this pipeline they are whole-clip measures. Rally
boundaries are not detected, so walking between points is included. They
describe *where* the player was, not whether a shot or a decision was good.
Band edges are practical coaching conventions, not validated thresholds.
"""

from __future__ import annotations

from statistics import median
from typing import Dict, List, Optional, Tuple

import numpy as np

from .court import COURT_LENGTH_M, COURT_WIDTH_M, NEAR_KITCHEN_LINE_Y_M, NET_Y_M
from .spatial import SelectedTrack, in_mapped_area

KITCHEN_LINE_FROM_BASELINE_M = NEAR_KITCHEN_LINE_Y_M  # 15 ft
BASELINE_AREA_M = 1.5
# The ready position is just behind the kitchen line. Allow 1 m behind it and a
# small margin past it for foot-point and calibration error.
KITCHEN_LINE_BEHIND_M = 1.0
KITCHEN_LINE_PAST_M = 0.3
LINGER_MIN_S = 2.0
MAX_GAP_S = 1.0          # longer gaps break lingers and approaches
SMOOTHING_SAMPLES = 5    # rolling median over ~0.5 s at 10 fps

BANDS = ("behind_baseline", "baseline_area", "transition", "kitchen_line", "inside_kitchen")
BAND_DEFINITIONS = {
    "behind_baseline": "Behind the player's own baseline (serving and returning happen here).",
    "baseline_area": f"Within {BASELINE_AREA_M:g} m inside the baseline.",
    "transition": "Between the baseline area and the kitchen-line area (often called no-man's land).",
    "kitchen_line": f"From {KITCHEN_LINE_BEHIND_M:g} m behind the kitchen line to {KITCHEN_LINE_PAST_M:g} m past it: "
                    "the usual ready position at the net.",
    "inside_kitchen": "Further inside the non-volley zone, up to the net.",
}
_BACK = {"behind_baseline", "baseline_area"}
_FRONT = {"kitchen_line", "inside_kitchen"}


def depth_from_baseline(y: float, half: str) -> float:
    return y if half == "near" else COURT_LENGTH_M - y


def band_of(depth: float) -> Optional[str]:
    if depth < 0:
        return "behind_baseline"
    if depth < BASELINE_AREA_M:
        return "baseline_area"
    if depth < KITCHEN_LINE_FROM_BASELINE_M - KITCHEN_LINE_BEHIND_M:
        return "transition"
    if depth < KITCHEN_LINE_FROM_BASELINE_M + KITCHEN_LINE_PAST_M:
        return "kitchen_line"
    if depth <= NET_Y_M:
        return "inside_kitchen"
    return None  # past the net: not this player's half


def infer_half(track: SelectedTrack) -> Optional[str]:
    ys = [p[1] for p in track.positions_m if p is not None and in_mapped_area(*p)]
    if not ys:
        return None
    near = sum(y < NET_Y_M for y in ys)
    return "near" if near >= len(ys) - near else "far"


def _smoothed(track: SelectedTrack) -> List[Optional[Tuple[float, float]]]:
    """Rolling median over observed samples; missing frames stay missing."""
    pts = track.positions_m
    out: List[Optional[Tuple[float, float]]] = []
    half = SMOOTHING_SAMPLES // 2
    for i, p in enumerate(pts):
        if p is None:
            out.append(None)
            continue
        window = [q for q in pts[max(0, i - half): i + half + 1] if q is not None]
        arr = np.asarray(window)
        out.append((float(np.median(arr[:, 0])), float(np.median(arr[:, 1]))))
    return out


def positioning_patterns(track: SelectedTrack, frame_interval_s: float,
                         half: Optional[str] = None) -> Optional[dict]:
    """Return the positioning value dict, or None when no usable half is known."""
    half = half or infer_half(track)
    if half is None:
        return None
    pts = _smoothed(track)

    seconds: Dict[str, float] = {b: 0.0 for b in BANDS}
    left = right = 0.0
    lingers: List[float] = []
    approaches: List[float] = []
    retreats = 0
    distance = 0.0

    run_start: Optional[int] = None      # index where the current transition run began
    last_seen: Optional[int] = None      # index of the previous usable sample
    last_back: Optional[int] = None      # index of the latest sample in the baseline bands
    anchor: Optional[str] = None         # "back" or "front": last solid end of the court

    def close_run(end_index: int) -> None:
        nonlocal run_start
        if run_start is not None:
            dur = (end_index - run_start + 1) * frame_interval_s
            if dur >= LINGER_MIN_S:
                lingers.append(dur)
        run_start = None

    for i, p in enumerate(pts):
        if p is None or not in_mapped_area(*p):
            continue
        band = band_of(depth_from_baseline(p[1], half))
        if band is None:
            continue
        gap = (i - last_seen) * frame_interval_s if last_seen is not None else 0.0
        if last_seen is not None and gap > MAX_GAP_S:
            close_run(last_seen)
            anchor, last_back = None, None
        elif last_seen is not None:
            prev = pts[last_seen]
            distance += float(np.hypot(p[0] - prev[0], p[1] - prev[1]))

        seconds[band] += frame_interval_s
        if 0 <= p[0] <= COURT_WIDTH_M:
            if p[0] < COURT_WIDTH_M / 2:
                left += frame_interval_s
            else:
                right += frame_interval_s

        if band == "transition":
            if run_start is None:
                run_start = i
        else:
            close_run(last_seen if last_seen is not None else i)

        if band in _BACK:
            if anchor == "front":
                retreats += 1
            anchor, last_back = "back", i
        elif band in _FRONT:
            if anchor == "back" and last_back is not None:
                approaches.append((i - last_back) * frame_interval_s)
            anchor = "front"
        last_seen = i
    if last_seen is not None:
        close_run(last_seen)

    mapped = sum(seconds.values())
    if mapped <= 0:
        return None
    # The x axis is mirrored for the far-side player (they face the camera).
    player_left, player_right = (left, right) if half == "near" else (right, left)
    return {
        "court_half": half,
        "band_definitions": dict(BAND_DEFINITIONS),
        "seconds": {k: round(v, 3) for k, v in seconds.items()},
        "fraction_of_mapped_time": {k: round(v / mapped, 4) for k, v in seconds.items()},
        "mapped_time_s": round(mapped, 3),
        "left_side_fraction": round(player_left / (player_left + player_right), 4) if left + right else None,
        "transition_lingers": len(lingers),
        "longest_transition_linger_s": round(max(lingers), 3) if lingers else None,
        "approaches_to_kitchen_line": len(approaches),
        "median_approach_s": round(median(approaches), 3) if approaches else None,
        "retreats_to_baseline": retreats,
        "distance_covered_m": round(distance, 2),
    }

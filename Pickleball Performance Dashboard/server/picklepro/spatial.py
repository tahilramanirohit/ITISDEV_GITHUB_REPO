"""Court-coordinate player metrics for one selected player.

All metrics here are *whole-clip* metrics: rally boundaries are not detected,
so time between rallies (walking, picking up balls) is included.

Dwell time: every analyzed frame represents ``frame_interval_s`` of video
(``sample_stride / fps``). If the selected player is observed in that frame,
that interval is attributed to the court cell under the player's projected
foot point. Frames where the player is not observed contribute nothing and
lower ``tracked_fraction``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from .court import (
    COURT_LENGTH_M,
    COURT_MODEL,
    COURT_WIDTH_M,
    FAR_KITCHEN_LINE_Y_M,
    FT,
    NEAR_KITCHEN_LINE_Y_M,
    CourtCalibration,
    court_half,
    foot_point,
)

CELL_SIZE_M = 2 * FT
SIDE_MARGIN_M = 4 * FT   # mapped area beyond each sideline
BACK_MARGIN_M = 8 * FT   # mapped area behind each baseline (serves/returns happen here)

X_MIN, X_MAX = -SIDE_MARGIN_M, COURT_WIDTH_M + SIDE_MARGIN_M
Y_MIN, Y_MAX = -BACK_MARGIN_M, COURT_LENGTH_M + BACK_MARGIN_M

ZONE_DEFINITIONS = {
    "kitchen": "Inside the sidelines and between the two kitchen (non-volley-zone) lines, i.e. within 7 ft of the net on either side.",
    "mid_court": "Inside the court lines but outside the kitchen.",
    "outside_court_lines": "Within the mapped area (4 ft beyond sidelines, 8 ft behind baselines) but outside the court lines.",
}


@dataclass
class Selection:
    method: str  # "track_id" | "court_half"
    track_id: Optional[int] = None
    court_half: Optional[str] = None


@dataclass
class SelectedTrack:
    """Per analyzed frame: the selected player's court position, or None."""
    positions_m: List[Optional[Tuple[float, float]]] = field(default_factory=list)
    ambiguous_frames: int = 0

    @property
    def observed(self) -> int:
        return sum(p is not None for p in self.positions_m)


def in_mapped_area(x: float, y: float) -> bool:
    return X_MIN <= x <= X_MAX and Y_MIN <= y <= Y_MAX


def select_player(
    frames: Sequence[Sequence[dict]],
    calibration: CourtCalibration,
    selection: Selection,
) -> SelectedTrack:
    """Pick the selected player's foot position in each analyzed frame.

    ``frames`` is a list (one entry per analyzed frame) of detection dicts with
    ``track_id`` and ``bbox`` in the calibration's pixel space.
    """
    out = SelectedTrack()
    for detections in frames:
        feet = [foot_point(d["bbox"]) for d in detections]
        court = calibration.image_to_court(feet) if feet else np.zeros((0, 2))
        candidates: List[Tuple[float, float]] = []
        for det, (x, y) in zip(detections, court):
            x, y = float(x), float(y)
            if selection.method == "track_id":
                if det.get("track_id") == selection.track_id:
                    candidates.append((x, y))
            elif selection.method == "court_half":
                if in_mapped_area(x, y) and court_half(y) == selection.court_half:
                    candidates.append((x, y))
            else:
                raise ValueError(f"Unknown selection method {selection.method}")
        if len(candidates) == 1:
            out.positions_m.append(candidates[0])
        else:
            if len(candidates) > 1:
                out.ambiguous_frames += 1
            out.positions_m.append(None)
    return out


def dwell_heatmap(track: SelectedTrack, frame_interval_s: float) -> dict:
    x_edges = np.arange(X_MIN, X_MAX + 1e-9, CELL_SIZE_M)
    y_edges = np.arange(Y_MIN, Y_MAX + 1e-9, CELL_SIZE_M)
    grid = np.zeros((len(y_edges) - 1, len(x_edges) - 1))
    tracked = 0.0
    outside = 0.0
    for pos in track.positions_m:
        if pos is None:
            continue
        tracked += frame_interval_s
        x, y = pos
        if not in_mapped_area(x, y):
            outside += frame_interval_s
            continue
        col = min(int((x - X_MIN) // CELL_SIZE_M), grid.shape[1] - 1)
        row = min(int((y - Y_MIN) // CELL_SIZE_M), grid.shape[0] - 1)
        grid[row, col] += frame_interval_s
    return {
        "units": "seconds",
        "coordinate_system": f"{COURT_MODEL}: x across court from near-left sideline, y from near baseline (metres)",
        "cell_size_m": round(CELL_SIZE_M, 4),
        "x_edges_m": [round(float(v), 4) for v in x_edges],
        "y_edges_m": [round(float(v), 4) for v in y_edges],
        "dwell_seconds": [[round(float(v), 3) for v in row] for row in grid],
        "tracked_time_s": round(tracked, 3),
        "outside_mapped_area_s": round(outside, 3),
    }


def zone_of(x: float, y: float) -> Optional[str]:
    if not in_mapped_area(x, y):
        return None
    inside = 0.0 <= x <= COURT_WIDTH_M and 0.0 <= y <= COURT_LENGTH_M
    if not inside:
        return "outside_court_lines"
    if NEAR_KITCHEN_LINE_Y_M <= y <= FAR_KITCHEN_LINE_Y_M:
        return "kitchen"
    return "mid_court"


def zone_occupancy(track: SelectedTrack, frame_interval_s: float) -> dict:
    seconds: Dict[str, float] = {k: 0.0 for k in ZONE_DEFINITIONS}
    tracked = 0.0
    for pos in track.positions_m:
        if pos is None:
            continue
        tracked += frame_interval_s
        z = zone_of(*pos)
        if z:
            seconds[z] += frame_interval_s
    return {
        "zone_definitions": dict(ZONE_DEFINITIONS),
        "seconds": {k: round(v, 3) for k, v in seconds.items()},
        "fraction_of_tracked_time": {k: round(v / tracked, 4) if tracked else 0.0 for k, v in seconds.items()},
    }

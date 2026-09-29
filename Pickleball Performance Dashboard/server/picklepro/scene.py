"""Camera cuts, per-segment court calibration and static ball false positives.

Phone recordings are often several clips joined together, or the camera is
picked up and moved. A court calibration is only valid for the framing it was
made on (requirement E02: recompute the homography on camera drift), so the
video is split at cuts and each segment gets its own calibration (or none).
"""

from __future__ import annotations

import bisect
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from .court import CourtCalibration

CUT_THUMB = (64, 36)
CUT_MIN_DIFF = 12.0          # mean absolute grey-level change of a thumbnail (0-255)
CUT_MEDIAN_FACTOR = 8.0      # and this many times the clip's typical frame-to-frame change
CUT_MIN_GAP_S = 2.0          # cuts closer than this are one camera move

STATIC_CELL_H = 0.006        # grid cell for static detections, as a share of frame height
STATIC_DWELL_S = 0.15        # a detection "dwells" when another one is this close in time ...
STATIC_DWELL_H = 0.004       # ... and this close in position (lights hold within a few pixels;
                             # a ball, even at the top of an arc, moves more)
STATIC_MIN_SECONDS = 4       # dwelling in the same place in this many different seconds = not a ball


def thumbnail(frame: np.ndarray) -> np.ndarray:
    grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.resize(grey, CUT_THUMB, interpolation=cv2.INTER_AREA).astype(np.float32)


def find_cuts(times: Sequence[float], diffs: Sequence[Optional[float]]) -> List[float]:
    """Times where the picture changes far more than players moving can explain."""
    values = [d for d in diffs if d is not None]
    if not values:
        return []
    threshold = max(CUT_MIN_DIFF, CUT_MEDIAN_FACTOR * float(np.median(values)))
    cuts: List[float] = []
    for t, d in zip(times, diffs):
        if d is not None and d > threshold and (not cuts or t - cuts[-1] >= CUT_MIN_GAP_S):
            cuts.append(t)
    return cuts


@dataclass
class CourtTimeline:
    """Calibration per camera segment. ``starts[i]`` begins segment i; the first starts at 0."""
    starts: List[float] = field(default_factory=lambda: [0.0])
    calibrations: List[Optional[CourtCalibration]] = field(default_factory=lambda: [None])

    @classmethod
    def single(cls, calibration: Optional[CourtCalibration]) -> "CourtTimeline":
        return cls([0.0], [calibration])

    def at(self, t: float) -> Optional[CourtCalibration]:
        return self.calibrations[max(0, bisect.bisect_right(self.starts, t) - 1)]

    __call__ = at

    @property
    def cuts(self) -> List[float]:
        return self.starts[1:]

    def primary(self, end_s: float) -> Optional[CourtCalibration]:
        """The calibration that covers the most time."""
        ends = self.starts[1:] + [end_s]
        best, best_len = None, 0.0
        for s, e, cal in zip(self.starts, ends, self.calibrations):
            if cal is not None and e - s > best_len:
                best, best_len = cal, e - s
        return best


def static_mask(times: Sequence[float], points: Sequence[Tuple[float, float]], frame_h: float) -> List[bool]:
    """True for detections at a place where "a ball" keeps sitting still across the video:
    lights, reflections or a ball lying on the ground. A ball in play passes a spot
    in a frame or two; a false positive dwells there again and again."""
    n = len(points)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda i: times[i])
    dwell = [False] * n
    for a, i in enumerate(order):
        for j in order[a + 1:]:
            if times[j] - times[i] > STATIC_DWELL_S:
                break
            if np.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1]) <= STATIC_DWELL_H * frame_h:
                dwell[i] = dwell[j] = True
    cell = STATIC_CELL_H * frame_h
    seconds: Dict[Tuple[int, int], set] = defaultdict(set)
    keys = [(int(p[0] // cell), int(p[1] // cell)) for p in points]
    for i, (cx, cy) in enumerate(keys):
        if dwell[i]:
            seconds[(cx, cy)].add(int(times[i]))

    def busy(cx: int, cy: int) -> int:
        found = set()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                found |= seconds.get((cx + dx, cy + dy), set())
        return len(found)

    return [dwell[i] and busy(*keys[i]) >= STATIC_MIN_SECONDS for i in range(n)]

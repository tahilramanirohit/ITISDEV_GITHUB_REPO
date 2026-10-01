"""Turn per-frame ball candidates into one plausible ball path.

A ball model returns several candidate boxes per frame, including objects
that only look like a ball: a pickleball printed on a banner, a lamp, or a
spare ball lying by the fence. This module keeps only observations that move
like a ball in play:

1. **Boxes far too large for a ball are removed** (a player's head or a
   bag, which some models report as a ball).
2. **Static objects are removed.** A candidate that reappears at the same
   pixel position over a long time is scenery, not a ball in flight.
3. **Candidates are linked into flights.** Each flight predicts where the ball
   should be next from its current velocity; a candidate is only joined to a
   flight inside a speed-dependent gate. Candidates that fit no flight start a
   new one.
4. **Short or motionless flights are dropped**, and where two flights claim
   the same moment the stronger one (longer, more confident) wins.

Only observed boxes are returned. Nothing is interpolated, so a missing
sample never becomes a hit or bounce downstream.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

REFERENCE_WIDTH = 1920.0
STATIC_RADIUS_PX = 8.0        # at 1920 px width
STATIC_MIN_REPEATS = 6
STATIC_MIN_SPAN_S = 1.5
MAX_LINK_GAP_S = 0.35         # a flight ends when the ball is unseen for longer
MAX_SPEED_PX_S = 6000.0       # fastest plausible image speed at 1920 px width
BASE_GATE_PX = 45.0
MIN_FLIGHT_POINTS = 3
MIN_FLIGHT_TRAVEL_PX = 25.0
MAX_BALL_BOX_PX = 70.0        # at 1920 px width; a ball is 10-40 px even when blurred


@dataclass
class BallCandidate:
    time_s: float
    bbox: Tuple[int, int, int, int]
    confidence: float

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.bbox[0] + self.bbox[2]) / 2, (self.bbox[1] + self.bbox[3]) / 2)


@dataclass
class _Flight:
    points: List[BallCandidate] = field(default_factory=list)

    @property
    def last(self) -> BallCandidate:
        return self.points[-1]

    def velocity(self) -> Tuple[float, float]:
        if len(self.points) < 2:
            return 0.0, 0.0
        a, b = self.points[-2], self.points[-1]
        dt = max(1e-6, b.time_s - a.time_s)
        return (b.center[0] - a.center[0]) / dt, (b.center[1] - a.center[1]) / dt

    def travel(self) -> float:
        xs = [p.center[0] for p in self.points]
        ys = [p.center[1] for p in self.points]
        return math.hypot(max(xs) - min(xs), max(ys) - min(ys))

    def score(self) -> float:
        return len(self.points) * (sum(p.confidence for p in self.points) / len(self.points))


def _static_mask(cands: Sequence[BallCandidate], radius: float) -> List[bool]:
    """True for candidates that sit at a pixel position revisited over time."""
    cell = radius
    grid: Dict[Tuple[int, int], List[int]] = {}
    for i, c in enumerate(cands):
        x, y = c.center
        grid.setdefault((int(x // cell), int(y // cell)), []).append(i)
    static = [False] * len(cands)
    for i, c in enumerate(cands):
        x, y = c.center
        gx, gy = int(x // cell), int(y // cell)
        near = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in grid.get((gx + dx, gy + dy), [])
                if math.hypot(cands[j].center[0] - x, cands[j].center[1] - y) <= radius]
        times = sorted({round(cands[j].time_s, 3) for j in near})
        if len(times) >= STATIC_MIN_REPEATS and times[-1] - times[0] >= STATIC_MIN_SPAN_S:
            static[i] = True
    return static


def track_ball(frames: Sequence[Tuple[float, Sequence[BallCandidate]]], frame_width: int) -> Tuple[List[BallCandidate], dict]:
    """Return one observed ball box per time at most, plus counts for provenance."""
    scale = frame_width / REFERENCE_WIDTH
    everything = [c for _t, cands in frames for c in cands]
    too_big = sum(1 for c in everything
                  if max(c.bbox[2] - c.bbox[0], c.bbox[3] - c.bbox[1]) > MAX_BALL_BOX_PX * scale)
    everything = [c for c in everything
                  if max(c.bbox[2] - c.bbox[0], c.bbox[3] - c.bbox[1]) <= MAX_BALL_BOX_PX * scale]
    static = _static_mask(everything, STATIC_RADIUS_PX * scale)
    moving = [c for c, s in zip(everything, static) if not s]
    by_time: Dict[float, List[BallCandidate]] = {}
    for c in moving:
        by_time.setdefault(c.time_s, []).append(c)

    active: List[_Flight] = []
    finished: List[_Flight] = []
    for t in sorted(by_time):
        still = []
        for f in active:
            (finished if t - f.last.time_s > MAX_LINK_GAP_S else still).append(f)
        active = still
        cands = sorted(by_time[t], key=lambda c: -c.confidence)
        pairs = []
        for fi, f in enumerate(active):
            dt = t - f.last.time_s
            vx, vy = f.velocity()
            px, py = f.last.center[0] + vx * dt, f.last.center[1] + vy * dt
            gate = (BASE_GATE_PX * scale + 0.35 * math.hypot(vx, vy) * dt) * (1 + dt / 0.1)
            reach = MAX_SPEED_PX_S * scale * dt + BASE_GATE_PX * scale
            for ci, c in enumerate(cands):
                d_pred = math.hypot(c.center[0] - px, c.center[1] - py)
                d_last = math.hypot(c.center[0] - f.last.center[0], c.center[1] - f.last.center[1])
                # New flights have no velocity yet: allow any plausible speed.
                if (len(f.points) >= 2 and d_pred <= gate) or (len(f.points) < 2 and d_last <= reach):
                    pairs.append((d_pred, fi, ci))
        used_f, used_c = set(), set()
        for _d, fi, ci in sorted(pairs):
            if fi in used_f or ci in used_c:
                continue
            active[fi].points.append(cands[ci])
            used_f.add(fi)
            used_c.add(ci)
        for ci, c in enumerate(cands):
            if ci not in used_c:
                active.append(_Flight([c]))
    finished.extend(active)

    kept = [f for f in finished if len(f.points) >= MIN_FLIGHT_POINTS and f.travel() >= MIN_FLIGHT_TRAVEL_PX * scale]
    chosen: Dict[float, Tuple[float, BallCandidate]] = {}
    for f in kept:
        s = f.score()
        for p in f.points:
            if p.time_s not in chosen or s > chosen[p.time_s][0]:
                chosen[p.time_s] = (s, p)
    path = [chosen[t][1] for t in sorted(chosen)]
    stats = {
        "candidates": len(everything) + too_big,
        "too_big": too_big,
        "static_removed": sum(static),
        "flights": len(kept),
        "kept": len(path),
    }
    return path, stats

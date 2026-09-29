"""Ball track from per-frame ball detections (image coordinates only).

Steps, following the requirements (E05, E06):

1. Reject detections with no consistent neighbour (isolated false positives)
   and detections that do not move (a ball lying on the ground or a static
   white spot is not a ball in play).
2. Smooth the remaining observations with a constant-velocity Kalman filter
   and a Rauch-Tung-Striebel backward pass, per continuous segment.
3. Fill only short gaps (``MAX_INTERPOLATION_S``) and flag those samples as
   interpolated. Interpolated samples never establish a contact or bounce on
   their own; event detection uses observed samples.

The ball stays in image pixels. A ground-plane homography is only valid where
the ball touches the court (bounces), never for the ball in flight.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

import numpy as np

MAX_INTERPOLATION_S = 0.10      # E06 initial limit; freeze before evaluation
NEIGHBOUR_WINDOW_S = 0.20       # an observation needs a consistent neighbour this close
MAX_BALL_SPEED_H_PER_S = 4.0    # frame heights per second; faster jumps are not the same ball
MIN_JUMP_H = 0.02               # tolerance for detector box jitter
STATIONARY_WINDOW_S = 0.5
STATIONARY_MAX_TRAVEL_H = 0.006
SEGMENT_BREAK_S = 0.5           # longer gaps start a new smoothing segment


@dataclass
class BallObservation:
    t: float
    x: float
    y: float
    confidence: Optional[float] = None


@dataclass
class BallSample:
    t: float
    x: float
    y: float
    vx: float
    vy: float
    observed: bool          # False = interpolated inside a short gap


@dataclass
class BallTrack:
    frame_height: int
    sample_interval_s: float
    observations: List[BallObservation] = field(default_factory=list)   # cleaned, in play
    rejected: int = 0
    stationary: int = 0
    samples: List[BallSample] = field(default_factory=list)             # smoothed + short gaps

    @property
    def observed_s(self) -> float:
        return sum(s.observed for s in self.samples) * self.sample_interval_s

    @property
    def interpolated_s(self) -> float:
        return sum(not s.observed for s in self.samples) * self.sample_interval_s


def _plausible(a: BallObservation, b: BallObservation, h: float) -> bool:
    dt = abs(b.t - a.t)
    return float(np.hypot(b.x - a.x, b.y - a.y)) <= MAX_BALL_SPEED_H_PER_S * h * dt + MIN_JUMP_H * h


def clean_observations(obs: Sequence[BallObservation], frame_height: int) -> Tuple[List[BallObservation], int, int]:
    """Return (kept, rejected_as_isolated, rejected_as_stationary)."""
    obs = sorted(obs, key=lambda o: o.t)
    h = float(frame_height)
    kept: List[BallObservation] = []
    isolated = 0
    for i, o in enumerate(obs):
        ok = False
        for j in range(i - 1, -1, -1):
            if o.t - obs[j].t > NEIGHBOUR_WINDOW_S:
                break
            if _plausible(obs[j], o, h):
                ok = True
                break
        if not ok:
            for j in range(i + 1, len(obs)):
                if obs[j].t - o.t > NEIGHBOUR_WINDOW_S:
                    break
                if _plausible(o, obs[j], h):
                    ok = True
                    break
        if ok:
            kept.append(o)
        else:
            isolated += 1

    moving: List[BallObservation] = []
    stationary = 0
    times = [q.t for q in kept]
    for o in kept:
        lo = bisect.bisect_left(times, o.t - STATIONARY_WINDOW_S / 2)
        hi = bisect.bisect_right(times, o.t + STATIONARY_WINDOW_S / 2)
        window = kept[lo:hi]
        span = max(q.t for q in window) - min(q.t for q in window)
        travel = max(float(np.hypot(q.x - o.x, q.y - o.y)) for q in window)
        if span >= STATIONARY_WINDOW_S * 0.4 and travel <= STATIONARY_MAX_TRAVEL_H * h:
            stationary += 1
        else:
            moving.append(o)
    return moving, isolated, stationary


def _kalman_rts(ts: np.ndarray, zs: np.ndarray, h: float) -> Tuple[np.ndarray, np.ndarray]:
    """Constant-velocity Kalman filter + RTS smoother. Returns positions and velocities."""
    n = len(ts)
    x = np.zeros((n, 4))
    P = np.zeros((n, 4, 4))
    xp = np.zeros((n, 4))
    Pp = np.zeros((n, 4, 4))
    F_all = []
    H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], float)
    R = np.eye(2) * (0.004 * h) ** 2          # detector box-centre noise
    q = (2.0 * h) ** 2                         # acceleration noise (px/s^2)^2; hits are abrupt
    state = np.array([zs[0, 0], zs[0, 1], 0.0, 0.0])
    cov = np.diag([R[0, 0], R[1, 1], (h) ** 2, (h) ** 2])
    for i in range(n):
        dt = ts[i] - ts[i - 1] if i else 0.0
        F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], float)
        G = np.array([[dt * dt / 2, 0], [0, dt * dt / 2], [dt, 0], [0, dt]])
        Q = G @ G.T * q
        state = F @ state
        cov = F @ cov @ F.T + Q
        xp[i], Pp[i] = state, cov
        S = H @ cov @ H.T + R
        K = cov @ H.T @ np.linalg.inv(S)
        state = state + K @ (zs[i] - H @ state)
        cov = (np.eye(4) - K @ H) @ cov
        x[i], P[i] = state, cov
        F_all.append(F)
    xs = x.copy()
    for i in range(n - 2, -1, -1):
        C = P[i] @ F_all[i + 1].T @ np.linalg.inv(Pp[i + 1])
        xs[i] = x[i] + C @ (xs[i + 1] - xp[i + 1])
    return xs[:, :2], xs[:, 2:]


def build_ball_track(observations: Sequence[BallObservation], frame_height: int,
                     sample_interval_s: float) -> BallTrack:
    kept, isolated, stationary = clean_observations(observations, frame_height)
    track = BallTrack(frame_height=frame_height, sample_interval_s=sample_interval_s,
                      observations=kept, rejected=isolated, stationary=stationary)
    if not kept:
        return track
    # Split into segments at long gaps; smooth each separately.
    segments: List[List[BallObservation]] = [[kept[0]]]
    for o in kept[1:]:
        if o.t - segments[-1][-1].t > SEGMENT_BREAK_S:
            segments.append([o])
        else:
            segments[-1].append(o)
    h = float(frame_height)
    for seg in segments:
        ts = np.array([o.t for o in seg])
        zs = np.array([[o.x, o.y] for o in seg])
        pos, vel = _kalman_rts(ts, zs, h) if len(seg) > 1 else (zs, np.zeros_like(zs))
        for i, o in enumerate(seg):
            if i:
                gap = ts[i] - ts[i - 1]
                missing = int(round(gap / sample_interval_s)) - 1
                if 0 < missing and gap - sample_interval_s <= MAX_INTERPOLATION_S + 1e-9:
                    for k in range(1, missing + 1):
                        a = k / (missing + 1)
                        p = pos[i - 1] * (1 - a) + pos[i] * a
                        v = vel[i - 1] * (1 - a) + vel[i] * a
                        track.samples.append(BallSample(float(ts[i - 1] + a * gap), float(p[0]), float(p[1]),
                                                        float(v[0]), float(v[1]), observed=False))
            track.samples.append(BallSample(float(ts[i]), float(pos[i, 0]), float(pos[i, 1]),
                                            float(vel[i, 0]), float(vel[i, 1]), observed=True))
    return track

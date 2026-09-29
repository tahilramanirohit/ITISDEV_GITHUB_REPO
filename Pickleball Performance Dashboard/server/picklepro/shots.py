"""Experimental hits, bounces, rallies, and shot types from observed ball boxes.

This is a rule-based estimate, not a trained classifier. It has been scored on
one hand-labelled clip only (docs/SHOT_TYPES.md; about a quarter of shot types
right), so every output is reported as ``experimental`` / ``not_evaluated``.

How it works
------------
1. Observed ball centres are split into flight segments wherever the ball is
   missing for longer than ``MAX_BALL_GAP_S``. Missing samples are never filled.
2. Inside a segment, a sharp change of direction is an *event*:

   * a **hit** when the ball is within reach of a detected player box and,
     when the court is mapped, its apparent size fits a ball beside that
     player (the depth check that stops a far-court ball "touching" the head
     of a near player in the image);
   * a **bounce** when no player is in reach and the ball's image motion is
     kicked upward. A bounce touches the ground, so its image
     point can be mapped onto the court with the frame's court calibration.

3. Hits more than ``RALLY_GAP_S`` apart start a new rally.
4. Each hit is labelled from measurable features only:

   * the hitter's court position (feet mapped with the frame's calibration):
     back of the court, transition zone, or at the kitchen line;
   * its place in the rally (serve, return, third shot);
   * contact above the hitter's head (overhead smash);
   * whether a bounce was seen since the previous hit (volley vs after bounce);
   * the *ground* speed to the next bounce or hitter: horizontal court
     distance / time. A ground-plane homography cannot measure ball height or
     true 3-D speed, so this is a travel rate across the court, not ball speed;
   * the speed of the incoming shot, which separates a soft reply to a hard
     ball (reset) from a dink, and a fast reply to a hard ball (counter) from
     an attack out of a soft exchange (speed-up);
   * a lob check: the ball rises well above the image line of the far
     baseline, or it hangs in the air for a long, deep shot;
   * the hitter's feet outside the sideline near the net on a volley (erne).

   Shots that depend on things the video cannot see reliably are not named:
   around-the-post (ATP) shots, spin, and forehand versus backhand.

Thresholds are practical coaching conventions, chosen to separate soft and
hard shots. They are not validated.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from .court import (
    COURT_LENGTH_M,
    COURT_WIDTH_M,
    NET_Y_M,
    CourtCalibration,
    court_half,
    foot_point,
)
from .positioning import KITCHEN_LINE_FROM_BASELINE_M, depth_from_baseline

MAX_BALL_GAP_S = 0.6        # longer gaps split the flight into separate segments
MIN_TURN_DEG = 40.0         # direction change that counts as a hit
MIN_BOUNCE_TURN_DEG = 15.0
BOUNCE_KICK = 0.35          # upward change in image velocity, as a share of ball speed
MIN_SPEED_FRAC = 0.06       # of frame height per second; slower balls are rolling or held
MIN_EVENT_GAP_S = 0.3       # merge events closer than this
RALLY_GAP_S = 3.5           # hits further apart than this start a new rally
SERVE_MAX_DEPTH_M = 1.2     # serve is struck from behind or at the baseline
RETURN_MAX_DEPTH_M = 2.0
NET_ZONE_DEPTH_M = KITCHEN_LINE_FROM_BASELINE_M - 1.1   # at or near the kitchen line
DINK_MAX_SPEED = 6.0        # m/s of ground travel
DROP_MAX_SPEED = 9.0
FAST_MIN_SPEED = 9.0        # drives, speed-ups and counters travel at least this fast
MAX_GROUND_SPEED = 28.0     # faster "travel" means a wrong bounce or hitter was matched
MIN_SHOT_SPEED = 0.8        # a "shot" that travels slower than this is a ball being handled
HELD_WINDOW_S = 0.5         # ball samples this close to a hit decide whether it was held
HELD_MIN_POINTS = 2
HELD_MAX_DISTANCE = 0.36     # of the player's height, from the centre of their box
HELD_MIN_SHARE = 0.8
TRANSITION_MIN_DEPTH_M = 2.5  # between the back of the court and the kitchen line
KITCHEN_DEPTH_M = 7 * 0.3048
ERNE_SIDELINE_MARGIN_M = 0.25
LOB_MIN_RISE_M = 3.5        # above the far baseline, in far-baseline scale; drops peak lower
LOB_MIN_HANG_S = 2.0
LOB_MIN_TRAVEL_M = 8.0
MIN_VOLLEY_BALL_COVERAGE = 0.6
BALL_DIAMETER_M = 0.074
MIN_BALL_PX = 3.0           # detectors rarely return smaller boxes
# Observed / expected ball size beside a player. Detector boxes are padded and
# blurred (about twice the true size in 1080p), so only gross mismatches count.
BALL_SIZE_RATIO = (0.3, 4.0)
BOUNCE_MAX_SPEED_RATIO = 0.9  # beside a player, a kick that loses speed is a bounce
CONTACT_HEIGHT_FRAC = 0.59    # usual contact about 1 m up a 1.7 m player
FAR_CONTACT_MAX_DIST = 0.5    # of player height
FAR_CONTACT_WINDOW_S = 0.4
REACH_SCALE = 0.8             # ball-to-player distance (in player heights) that halves a hit's score... roughly
HIT_COST = 0.4               # a candidate must score more than this to be kept as a hit
MIN_HIT_GAP_S = 0.3           # the ball cannot cross the net and come back faster
FEET_CUT_OFF_FRAC = 0.012     # a box this close to the bottom edge has its feet out of the picture
NET_VOLLEY_MAX_INTERVAL_S = 0.85  # kitchen line to kitchen line, a bounce needs longer than this
DINK_MIN_INTERVAL_S = 1.1     # ... and a ball this slow lands in the kitchen, so it bounced
MIN_HITS_WITHOUT_SERVE = 4    # an exchange this long is play even if its serve was missed

SHOT_TYPES = ("serve", "return", "drive", "drop", "dink", "reset",
              "speed_up", "counter", "volley", "lob", "overhead", "erne", "unclassified")
TYPE_DEFINITIONS = {
    "serve": "First hit of a rally, struck underhand from outside the court behind the baseline. It must cross "
             "diagonally into the opposite service court and must not land in the kitchen.",
    "return": "Second hit of a rally: the receiver's reply after the serve bounces, from the back of the court.",
    "drive": "A hard, flat shot that travels fast across the court.",
    "drop": "A soft shot from the back or transition zone that lands near the net (including the third-shot drop).",
    "dink": "A soft shot from the kitchen line that lands in or near the opponents' kitchen.",
    "reset": "A soft reply to a hard incoming ball that takes the pace off it (also called a block).",
    "speed_up": "A sudden fast attack from the kitchen line out of a soft exchange.",
    "counter": "A fast reply, out of the air, to a fast incoming ball (a counterattack in a hands battle).",
    "volley": "A shot hit out of the air before the ball bounces.",
    "lob": "A high shot that rises well above the court or stays in the air for a long, deep flight.",
    "overhead": "An overhead smash: contact above the player's head, hit downward.",
    "erne": "A volley near the net hit with the feet outside the sideline, around the kitchen.",
    "unclassified": "A hit was detected, but there was not enough evidence to name the shot.",
}
SOFT_TYPES = {"dink", "drop", "reset"}
FAST_TYPES = {"drive", "speed_up", "counter", "overhead"}


@dataclass
class FrameObs:
    time_s: float
    detections: List[dict]
    calibration: Optional[CourtCalibration]
    selected_index: Optional[int] = None


@dataclass
class _Point:
    t: float
    x: float
    y: float
    bottom: float
    size: float = 0.0  # mean of box width and height, px


@dataclass
class _Event:
    kind: str  # "hit" | "bounce"
    t: float
    point: _Point
    score: float
    frame: Optional[FrameObs] = None
    hitter: Optional[int] = None  # detection index
    extras: Dict[str, object] = field(default_factory=dict)


def _nearest_frame(frames: Sequence[FrameObs], t: float, tol: float) -> Optional[FrameObs]:
    if not frames:
        return None
    times = [f.time_s for f in frames]
    i = int(np.searchsorted(times, t))
    best = min((frames[j] for j in (i - 1, i) if 0 <= j < len(frames)), key=lambda f: abs(f.time_s - t))
    return best if abs(best.time_s - t) <= tol else None


def _px_per_m(cal: CourtCalibration, foot: Tuple[float, float]) -> Optional[float]:
    court = cal.image_to_court([foot])[0]
    a, b = _court_to_image(cal, [tuple(court), (court[0] + 1.0, court[1])])
    scale = float(math.hypot(b[0] - a[0], b[1] - a[1]))
    return scale if math.isfinite(scale) and scale > 0 else None


def _depth_consistent(frame: FrameObs, box: Sequence[int], p: _Point) -> bool:
    """Is the ball's apparent size plausible for a ball beside this player?

    In the image, the space above a near player's head overlaps the far court.
    A ball next to the far player looks several times smaller, so its box
    size separates the two when the court is mapped.
    """
    if frame.calibration is None or p.size <= 0:
        return True
    scale = _px_per_m(frame.calibration, foot_point(box))
    if scale is None:
        return True
    expected = BALL_DIAMETER_M * scale
    ratio = p.size / max(expected, MIN_BALL_PX)
    return BALL_SIZE_RATIO[0] <= ratio <= BALL_SIZE_RATIO[1]


def _reach_options(frame: Optional[FrameObs], p: _Point, everyone: bool = False) -> Dict[Optional[str], Tuple[int, float]]:
    """Closest player in reach on each side of the net: side -> (detection index, distance / height).

    From behind a baseline, a near player's box covers much of the far court in
    the image, so a ball can be "in reach" of players on both sides at once.
    Which side really hit it is decided over the whole rally (see _alternate).
    """
    out: Dict[Optional[str], Tuple[int, float]] = {}
    if frame is None:
        return out
    for i, det in enumerate(frame.detections):
        x1, y1, x2, y2 = det["bbox"]
        w, h = x2 - x1, max(1.0, y2 - y1)
        if (everyone or x1 - 0.6 * w <= p.x <= x2 + 0.6 * w and y1 - 0.4 * h <= p.y <= y2 + 0.05 * h
                and _depth_consistent(frame, det["bbox"], p)):
            d = math.hypot(p.x - (x1 + x2) / 2, p.y - (y1 + y2) / 2) / h
            court = _to_court(frame.calibration, foot_point(det["bbox"]))
            side = court_half(court[1]) if court else None
            if side not in out or d < out[side][1]:
                out[side] = (i, d)
    return out


def _in_reach(frame: Optional[FrameObs], p: _Point) -> Optional[int]:
    options = _reach_options(frame, p)
    return min(options.values(), key=lambda o: o[1])[0] if options else None


def _segments(points: List[_Point]) -> List[List[_Point]]:
    out: List[List[_Point]] = []
    for p in points:
        if out and p.t - out[-1][-1].t <= MAX_BALL_GAP_S:
            out[-1].append(p)
        else:
            out.append([p])
    return out


def _to_court(cal: Optional[CourtCalibration], xy: Tuple[float, float]) -> Optional[Tuple[float, float]]:
    if cal is None:
        return None
    x, y = cal.image_to_court([xy])[0]
    return float(x), float(y)


def _court_to_image(cal: CourtCalibration, pts: Sequence[Tuple[float, float]]) -> np.ndarray:
    import cv2

    inv = np.linalg.inv(cal.homography)
    return cv2.perspectiveTransform(np.asarray(pts, dtype=np.float64).reshape(-1, 1, 2), inv).reshape(-1, 2)


def court_line_segments(cal: CourtCalibration) -> List[List[int]]:
    """Court lines projected into the image, for drawing over the video."""
    w, l, n = COURT_WIDTH_M, COURT_LENGTH_M, NET_Y_M
    k = KITCHEN_LINE_FROM_BASELINE_M
    segs = [((0, 0), (w, 0)), ((0, l), (w, l)), ((0, 0), (0, l)), ((w, 0), (w, l)),
            ((0, k), (w, k)), ((0, l - k), (w, l - k)), ((0, n), (w, n)),
            ((w / 2, 0), (w / 2, k)), ((w / 2, l - k), (w / 2, l))]
    flat = [pt for seg in segs for pt in seg]
    img = _court_to_image(cal, flat)
    out = []
    for i in range(0, len(img), 2):
        a, b = img[i], img[i + 1]
        if np.all(np.isfinite([a, b])):
            out.append([int(round(a[0])), int(round(a[1])), int(round(b[0])), int(round(b[1]))])
    return out


def _find_events(points: List[_Point], frames: Sequence[FrameObs], frame_h: int, tol: float) -> List[_Event]:
    min_speed = MIN_SPEED_FRAC * frame_h
    events: List[_Event] = []
    for seg in _segments(points):
        # A flight that starts beside a player, then moves fast, begins with a hit
        # (typically a serve whose toss was not detected).
        if len(seg) >= 2:
            a, b = seg[0], seg[1]
            speed = math.hypot(b.x - a.x, b.y - a.y) / max(1e-6, b.t - a.t)
            frame = _nearest_frame(frames, a.t, tol)
            hitter = _in_reach(frame, a)
            if speed >= min_speed and hitter is not None:
                events.append(_Event("hit", a.t, a, 0.5, frame, hitter, extras={"options": _reach_options(frame, a, everyone=True)}))
        for i in range(1, len(seg) - 1):
            a, p, b = seg[i - 1], seg[i], seg[i + 1]
            vin = np.array([p.x - a.x, p.y - a.y]) / max(1e-6, p.t - a.t)
            vout = np.array([b.x - p.x, b.y - p.y]) / max(1e-6, b.t - p.t)
            sin, sout = float(np.linalg.norm(vin)), float(np.linalg.norm(vout))
            if sin < min_speed or sout < min_speed:
                continue
            turn = math.degrees(math.acos(float(np.clip(vin @ vout / (sin * sout), -1.0, 1.0))))
            ratio = sout / sin
            frame = _nearest_frame(frames, p.t, tol)
            hitter = _in_reach(frame, p)
            # A bounce kicks the ball upward in the image and takes speed off it.
            # Seen from behind a baseline, a ball landing on the far side may
            # already be moving up the image, so compare vertical velocities.
            upward_kick = (vin[1] - vout[1]) >= BOUNCE_KICK * max(sin, sout)
            if upward_kick and (turn >= MIN_BOUNCE_TURN_DEG or ratio < 0.5) and (hitter is None or ratio < BOUNCE_MAX_SPEED_RATIO):
                events.append(_Event("bounce", p.t, p, turn / 180, frame, extras={"priority": 2}))
            elif hitter is not None and (turn >= MIN_TURN_DEG or ratio > 1.8 or ratio < 0.45):
                events.append(_Event("hit", p.t, p, turn / 180 + min(1.0, abs(math.log(ratio))), frame, hitter,
                                     extras={"priority": 3, "options": _reach_options(frame, p, everyone=True)}))
        events.extend(_far_side_contacts(seg, frames, tol))
    bounce_times = [e.t for e in events if e.kind == "bounce"]
    # A ball landing just in front of a far player passes their contact point in
    # the image; a bounce there explains the closest approach better than a hit.
    events = [e for e in events if e.extras.get("priority") != 1
              or all(abs(e.t - bt) >= MIN_EVENT_GAP_S - 1e-6 for bt in bounce_times)]
    events.sort(key=lambda e: e.t)
    merged: List[_Event] = []
    last: Dict[str, _Event] = {}
    for e in events:
        prev = last.get(e.kind)
        # Only events of the same kind are merged: a bounce followed quickly by
        # a hit is ordinary play.
        if prev is not None and e.t - prev.t < MIN_EVENT_GAP_S - 1e-6:
            rank = lambda ev: (ev.extras.get("priority", 3), ev.score)  # noqa: E731
            if rank(e) > rank(prev):
                merged[merged.index(prev)] = e
                last[e.kind] = e
            continue
        merged.append(e)
        last[e.kind] = e
    return merged


def _far_side_contacts(seg: List[_Point], frames: Sequence[FrameObs], tol: float) -> List[_Event]:
    """Hits by a player on the far side of the net, found by closest approach.

    From behind the near baseline, a far player's stroke barely bends the ball's
    path in the image: the ball's rise and its approach toward the camera cancel
    out. The contact is taken as the moment the ball passes closest to that
    player's usual contact point (about 1 m above the feet).
    """
    series: Dict[object, List[Tuple[float, int, _Point, FrameObs]]] = {}
    for p in seg:
        frame = _nearest_frame(frames, p.t, tol)
        if frame is None or frame.calibration is None:
            continue
        for i, det in enumerate(frame.detections):
            x1, y1, x2, y2 = det["bbox"]
            h = max(1.0, y2 - y1)
            court = _to_court(frame.calibration, foot_point(det["bbox"]))
            if court is None or court_half(court[1]) != "far" or not _depth_consistent(frame, det["bbox"], p):
                continue
            d = math.hypot(p.x - (x1 + x2) / 2, p.y - (y2 - CONTACT_HEIGHT_FRAC * h)) / h
            key = det.get("track_id", ("index", i))
            series.setdefault(key, []).append((d, i, p, frame))
    out = []
    for samples in series.values():
        for d, i, p, frame in samples:
            if d > FAR_CONTACT_MAX_DIST:
                continue
            window = [s[0] for s in samples if abs(s[2].t - p.t) <= FAR_CONTACT_WINDOW_S]
            if d <= min(window):
                out.append(_Event("hit", p.t, p, 1.0 - d, frame, i, extras={"priority": 1, "options": {"far": (i, d)}}))
    return out


def _held_ball(e: _Event, points: List[_Point], frames: Sequence[FrameObs], tol: float) -> bool:
    """True when the ball stays in the player's hands around this moment.

    A stroke sends the ball away and it arrives from away: within half a
    second of contact it is more than about a third of the player's height
    from their body. A ball being carried, caught or bounced before a serve
    stays close to the body the whole time.
    """
    if e.frame is None or e.hitter is None:
        return False
    tid = e.frame.detections[e.hitter].get("track_id")
    close = total = 0
    for p in points:
        if abs(p.t - e.t) > HELD_WINDOW_S:
            continue
        frame = _nearest_frame(frames, p.t, tol)
        dets = [d for d in (frame.detections if frame else []) if tid is not None and d.get("track_id") == tid]
        if not dets:
            continue
        x1, y1, x2, y2 = dets[0]["bbox"]
        h = max(1.0, y2 - y1)
        total += 1
        # A near player's box covers much of the far court in the image; only a
        # ball whose size fits a ball beside this player can be in their hand.
        if (math.hypot(p.x - (x1 + x2) / 2, p.y - (y1 + y2) / 2) / h <= HELD_MAX_DISTANCE
                and _depth_consistent(frame, dets[0]["bbox"], p)):
            close += 1
    return total >= HELD_MIN_POINTS and close / total >= HELD_MIN_SHARE


def _alternate(hits: List[_Event]) -> List[_Event]:
    """Choose hits and hitters so that, within a rally, the sides alternate.

    Every shot must cross the net, so two hits in a row by the same side are
    impossible (except a missed hit in between). Each candidate can be kept for
    either side that had a player in reach, or dropped. The best-scoring
    sequence wins: a hit scores more when the ball turned sharply and passed
    close to the player; each kept hit costs HIT_COST, so weak candidates that
    break the alternation are left out.
    """
    options = []
    for e in hits:
        # Side None: the court is not mapped here, so this hit cannot break the alternation.
        opts = dict(e.extras.get("options", {}))
        strength = 0.5 + min(float(e.score), 1.5)
        options.append({side: (i, strength * math.exp(-(d / REACH_SCALE) ** 2)) for side, (i, d) in opts.items()})
    n = len(hits)
    best: List[Dict[Optional[str], float]] = [{} for _ in range(n)]
    back: List[Dict[Optional[str], Optional[Tuple[int, Optional[str]]]]] = [{} for _ in range(n)]
    for j in range(n):
        for side, (_i, score) in options[j].items():
            value, prev = score - HIT_COST, None  # first kept hit
            for k in range(j):
                gap = hits[j].t - hits[k].t
                if gap < MIN_HIT_GAP_S:
                    continue
                for side_k, value_k in best[k].items():
                    if gap <= RALLY_GAP_S and side is not None and side_k == side:
                        continue
                    if value_k + score - HIT_COST > value:
                        value, prev = value_k + score - HIT_COST, (k, side_k)
            best[j][side], back[j][side] = value, prev
    ends = [(v, j, side) for j in range(n) for side, v in best[j].items()]
    if not ends:
        return []
    _v, j, side = max(ends, key=lambda e: (e[0], e[1]))
    if _v <= 0:
        return []
    chosen: List[_Event] = []
    node: Optional[Tuple[int, Optional[str]]] = (j, side)
    while node is not None:
        j, side = node
        hits[j].hitter = options[j][side][0]
        chosen.append(hits[j])
        node = back[j][side]
    return chosen[::-1]


def _feet_cut_off(e: _Event, frame_h: int) -> bool:
    """The hitter's box reaches the bottom edge: they stand at or behind the visible court."""
    if e.frame is None or e.hitter is None:
        return False
    return e.frame.detections[e.hitter]["bbox"][3] >= frame_h * (1 - FEET_CUT_OFF_FRAC)


def _serve_position(e: _Event, frame_h: int) -> bool:
    court = _hitter_court(e)
    if court is None:
        return False
    side = court_half(court[1])
    if side == "near" and _feet_cut_off(e, frame_h):
        return True
    return side is not None and depth_from_baseline(court[1], side) <= SERVE_MAX_DEPTH_M


def _in_play(hits: List[_Event], frame_h: int) -> List[_Event]:
    """Keep hits from a serve onward; drop balls knocked back between points.

    A point starts with a serve from behind the baseline. Within each run of
    hits (runs are split by RALLY_GAP_S), hits before the first serve-position
    hit are dropped. A run without one is kept only when it is a long exchange,
    since the serve itself may have been missed.
    """
    runs: List[List[_Event]] = []
    for h in hits:
        if runs and h.t - runs[-1][-1].t <= RALLY_GAP_S:
            runs[-1].append(h)
        else:
            runs.append([h])
    kept: List[_Event] = []
    for run in runs:
        start = next((i for i, h in enumerate(run) if _serve_position(h, frame_h)), None)
        if start is not None:
            kept.extend(run[start:])
        elif len(run) >= MIN_HITS_WITHOUT_SERVE:
            kept.extend(run)
    return kept


def _hitter_court(e: _Event) -> Optional[Tuple[float, float]]:
    if e.frame is None or e.hitter is None:
        return None
    return _to_court(e.frame.calibration, foot_point(e.frame.detections[e.hitter]["bbox"]))


def _bounce_court(e: _Event) -> Optional[Tuple[float, float]]:
    if e.frame is None:
        return None
    return _to_court(e.frame.calibration, (e.point.x, e.point.bottom))


def _inside(xy: Tuple[float, float], side: Optional[str] = None, margin: float = 0.1) -> bool:
    x, y = xy
    if not (-margin <= x <= COURT_WIDTH_M + margin and -margin <= y <= COURT_LENGTH_M + margin):
        return False
    return side is None or court_half(y) == side


def serve_landing(server_xy: Tuple[float, float], landing_xy: Tuple[float, float]) -> Tuple[bool, str]:
    """Is a serve's first bounce inside the service court diagonally opposite the server?

    The receiving service court lies past the kitchen line on the other side of
    the net, on the other half of the court's width (court x runs across the
    court the same way on both sides, so "diagonal" means the other x half).
    """
    sx, sy = server_xy
    lx, ly = landing_xy
    server_side = court_half(sy)
    if court_half(ly) == server_side:
        return False, "fault: the serve did not cross the net"
    if abs(ly - NET_Y_M) < KITCHEN_DEPTH_M:
        return False, "fault: the serve landed in the kitchen"
    if not _inside(landing_xy):
        return False, "fault: the serve landed out"
    if (sx < COURT_WIDTH_M / 2) == (lx < COURT_WIDTH_M / 2):
        return False, "fault: the serve did not cross diagonally"
    return True, "landed in the diagonal service court"


def _lob_rise_m(points: List[_Point], cal: Optional[CourtCalibration]) -> Optional[float]:
    """How far the ball rose above the image line of the far baseline (camera's far end).

    Anything inside the court below about net height appears below that line, so
    a large rise means a high ball whichever side hit it.
    """
    if cal is None or not points:
        return None
    left, right = _court_to_image(cal, [(0.0, COURT_LENGTH_M), (COURT_WIDTH_M, COURT_LENGTH_M)])
    scale = math.hypot(right[0] - left[0], right[1] - left[1]) / COURT_WIDTH_M
    if scale <= 0:
        return None
    rise = []
    for p in points:
        f = 0.0 if right[0] == left[0] else (p.x - left[0]) / (right[0] - left[0])
        line_y = left[1] + f * (right[1] - left[1])
        rise.append((line_y - p.y) / scale)
    return max(rise)


def _classify(number, depth, contact, speed, soft, fast, pace, is_lob, rise, hang, travel, above_head,
              incoming_fast, incoming_soft, lands_in_kitchen, outside_sideline, unmapped, incoming_speed_up=False):
    """Name one shot from its measured features; see TYPE_DEFINITIONS."""
    if number == 1 and depth is not None and depth <= SERVE_MAX_DEPTH_M:
        where = "behind the baseline" if depth < 0 else f"{depth:.1f} m inside the baseline"
        return "serve", f"first hit of the rally, from {where}"
    if number == 2 and depth is not None and depth <= RETURN_MAX_DEPTH_M:
        return "return", "second hit of the rally, from the back of the court"
    if above_head and number > 1:
        return "overhead", "ball contact above the player's head"
    if is_lob:
        return "lob", (f"ball rose about {rise:.1f} m above the far baseline line" if rise and rise >= LOB_MIN_RISE_M
                       else f"long, high flight ({hang:.1f} s over {travel:.1f} m)")
    if depth is None:
        return "unclassified", ("the court was not mapped at this moment" if unmapped
                                else "the hitter's position on the court was not found")
    at_net = depth >= NET_ZONE_DEPTH_M
    if contact == "volley" and at_net and outside_sideline:
        return "erne", "volley near the net with the feet outside the sideline"
    if number == 3 and not at_net:
        if (soft or lands_in_kitchen) and not fast:
            return "drop", "third hit of the rally, soft" + (f" ({pace})" if pace else "") + " from the back"
        if fast:
            return "drive", f"third hit of the rally, fast ({pace}) from the back"
    if at_net:
        if contact == "volley":
            # Kitchen-line volley exchanges ("hands battles") are fast by
            # nature; only a volley that changes the pace gets its own name.
            if fast and incoming_soft:
                return "speed_up", f"fast attack ({pace}) from the kitchen line out of a soft exchange"
            if incoming_speed_up:
                return "counter", "volley straight back at a speed-up"
            if soft and incoming_fast:
                return "reset", f"soft volley ({pace}) at the kitchen line that takes the pace off a fast ball"
            return "volley", "hit out of the air at the kitchen line" + (f" ({pace})" if pace else "")
        if soft or (speed is None and contact == "after_bounce"):
            if incoming_fast:
                return "reset", "soft reply" + (f" ({pace})" if pace else "") + " at the kitchen line to a fast incoming ball"
            return "dink", "soft shot" + (f" ({pace})" if pace else "") + " from the kitchen line after the bounce"
        if fast:
            if incoming_soft:
                return "speed_up", f"fast attack ({pace}) from the kitchen line out of a soft exchange"
            return "drive", f"fast shot ({pace}) from the kitchen line"
        if speed is not None:
            return "dink", f"controlled shot ({pace}) from the kitchen line"
        return "unclassified", "no next bounce or hitter was seen to measure the shot"
    # Back of the court or transition zone.
    if speed is not None and (speed < DROP_MAX_SPEED or (lands_in_kitchen and not fast)):
        if incoming_fast and depth >= TRANSITION_MIN_DEPTH_M:
            return "reset", f"soft reply ({pace}) from the transition zone to a fast incoming ball"
        return "drop", f"soft shot ({pace}) from the back of the court"
    if fast:
        if contact == "volley":
            return "volley", f"fast shot ({pace}) hit out of the air before reaching the kitchen line"
        return "drive", f"fast shot ({pace}) from the back of the court"
    if contact == "volley":
        return "volley", "hit out of the air before reaching the kitchen line"
    return "unclassified", "no next bounce or hitter was seen to measure the shot"


def analyze_shots(ball: Sequence[Tuple[float, Sequence[int]]], frames: Sequence[FrameObs],
                  frame_h: int, frame_interval_s: float) -> dict:
    """Return ``{"shots", "bounces", "rallies", ...}`` dicts ready for the contract."""
    points = [_Point(t, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, float(b[3]), ((b[2] - b[0]) + (b[3] - b[1])) / 2)
              for t, b in sorted(ball, key=lambda x: x[0])]
    tol = max(0.06, frame_interval_s * 0.6)
    events = _find_events(points, frames, frame_h, tol)
    bounces = [e for e in events if e.kind == "bounce"]
    # Between points players carry, catch and bounce the ball before serving.
    # The ball then stays inside the player's box instead of arriving and
    # leaving, so those direction changes are not strokes.
    hits = [e for e in events if e.kind == "hit" and not _held_ball(e, points, frames, tol)]
    hits = _in_play(_alternate(hits), frame_h)

    # Same-side double hits within a second are one stroke seen twice.
    cleaned: List[_Event] = []
    for h in hits:
        hc = _hitter_court(h)
        h.extras["court"] = hc
        h.extras["side"] = court_half(hc[1]) if hc else None
        if cleaned and h.t - cleaned[-1].t < 1.0 and h.extras["side"] and h.extras["side"] == cleaned[-1].extras["side"]:
            if h.score > cleaned[-1].score:
                cleaned[-1] = h
            continue
        cleaned.append(h)
    hits = cleaned

    def label(hits: List[_Event]):
        rally_ids: List[int] = []
        rally = -1
        for i, h in enumerate(hits):
            if i == 0 or h.t - hits[i - 1].t > RALLY_GAP_S:
                rally += 1
            rally_ids.append(rally)

        ball_times = [p.t for p in points]
        shots = []
        for i, h in enumerate(hits):
            number = 1 + sum(1 for j in range(i) if rally_ids[j] == rally_ids[i])
            same_rally_prev = i > 0 and rally_ids[i - 1] == rally_ids[i]
            same_rally_next = i + 1 < len(hits) and rally_ids[i + 1] == rally_ids[i]
            next_hit = hits[i + 1] if same_rally_next else None
            end_t = next_hit.t if next_hit else h.t + RALLY_GAP_S
            landing = next((b for b in bounces if h.t < b.t < end_t), None)
            court = h.extras["court"]
            side = h.extras["side"]
            det = h.frame.detections[h.hitter] if h.frame else None
            box = det["bbox"] if det else None
            reasons: List[str] = []

            # Contact type. Between two players at their kitchen lines, a ball
            # that comes back within NET_VOLLEY_MAX_INTERVAL_S had no time to
            # bounce, and a slow one lands in the kitchen, where it may not be
            # volleyed. Otherwise: was a bounce seen, with good ball coverage?
            contact = "unknown"
            if same_rally_prev:
                prev_t = hits[i - 1].t
                prev_court = hits[i - 1].extras.get("court")
                prev_depth = (depth_from_baseline(prev_court[1], hits[i - 1].extras.get("side"))
                              if prev_court and hits[i - 1].extras.get("side") else None)
                here = h.extras.get("court")
                here_depth = depth_from_baseline(here[1], side) if here and side else None
                both_at_net = (prev_depth is not None and here_depth is not None
                               and prev_depth >= NET_ZONE_DEPTH_M and here_depth >= NET_ZONE_DEPTH_M)
                if both_at_net and h.t - prev_t <= NET_VOLLEY_MAX_INTERVAL_S:
                    contact = "volley"
                elif any(prev_t < b.t < h.t for b in bounces) or (both_at_net and h.t - prev_t >= DINK_MIN_INTERVAL_S):
                    contact = "after_bounce"
                else:
                    expected = max(1, round((h.t - prev_t) / frame_interval_s) - 1)
                    seen = sum(1 for t in ball_times if prev_t < t < h.t)
                    if seen / expected >= MIN_VOLLEY_BALL_COVERAGE:
                        contact = "volley"

            # Ground travel to the next bounce, else to the next hitter.
            speed = None
            landing_xy = _bounce_court(landing) if landing else None
            target_xy, target_t = (landing_xy, landing.t) if landing_xy else (
                (_hitter_court(next_hit), next_hit.t) if next_hit else (None, None))
            if court and target_xy and target_t and target_t > h.t:
                speed = math.hypot(target_xy[0] - court[0], target_xy[1] - court[1]) / (target_t - h.t)
                if speed > MAX_GROUND_SPEED:
                    speed = None  # a mismatched bounce or hitter, not a real shot speed
            landed_in = None
            if landing_xy and side:
                landed_in = _inside(landing_xy, "far" if side == "near" else "near")

            flight = [p for p in points if h.t < p.t < end_t]
            rise = _lob_rise_m(flight, h.frame.calibration if h.frame else None)
            hang = (target_t - h.t) if target_t else None
            travel = math.hypot(target_xy[0] - court[0], target_xy[1] - court[1]) if court and target_xy else None
            is_lob = (rise is not None and rise >= LOB_MIN_RISE_M) or (
                hang is not None and travel is not None and hang >= LOB_MIN_HANG_S and travel >= LOB_MIN_TRAVEL_M)
            depth = depth_from_baseline(court[1], side) if court and side else None
            if number == 1 and side == "near" and _feet_cut_off(h, frame_h):
                depth = min(depth, 0.0) if depth is not None else 0.0  # server's feet below the picture

            prev = shots[-1] if same_rally_prev and shots else None
            incoming = prev["ground_speed_mps"] if prev else None
            incoming_fast = prev is not None and (prev["shot_type"] in FAST_TYPES
                                                  or (incoming is not None and incoming >= FAST_MIN_SPEED))
            incoming_soft = prev is not None and (prev["shot_type"] in SOFT_TYPES
                                                  or (incoming is not None and incoming < DINK_MAX_SPEED))
            lands_in_kitchen = bool(landing_xy and abs(landing_xy[1] - NET_Y_M) <= KITCHEN_DEPTH_M + 0.3)
            soft = speed is not None and speed < DINK_MAX_SPEED
            fast = speed is not None and speed >= FAST_MIN_SPEED
            pace = f"{speed:.1f} m/s across the court" if speed is not None else ""
            outside_sideline = court is not None and (court[0] < -ERNE_SIDELINE_MARGIN_M
                                                      or court[0] > COURT_WIDTH_M + ERNE_SIDELINE_MARGIN_M)
            shot, why = _classify(number, depth, contact, speed, soft, fast, pace, is_lob, rise, hang, travel,
                                  box is not None and h.point.y < box[1], incoming_fast, incoming_soft,
                                  lands_in_kitchen, outside_sideline, court is None,
                                  prev is not None and prev["shot_type"] == "speed_up")
            reasons.append(why)
            if shot == "serve" and court and landing_xy:
                landed_in, verdict = serve_landing(court, landing_xy)
                reasons.append(verdict)
            if contact == "volley" and shot not in ("volley", "serve", "counter", "erne"):
                reasons.append("hit out of the air before the ball bounced")

            selected = bool(h.frame is not None and h.frame.selected_index is not None and h.frame.selected_index == h.hitter)
            shots.append({
                "time_seconds": round(h.t, 3),
                "rally_index": rally_ids[i],
                "shot_number": number,
                "hitter_track_id": det.get("track_id") if det else None,
                "hitter_side": side,
                "by_selected_player": selected,
                "hitter_court_m": [round(court[0], 2), round(court[1], 2)] if court else None,
                "shot_type": shot,
                "contact": contact,
                "ground_speed_mps": round(speed, 2) if speed is not None else None,
                "landing_court_m": [round(landing_xy[0], 2), round(landing_xy[1], 2)] if landing_xy else None,
                "landed_in": landed_in,
                "evidence": "; ".join(reasons),
            })

        return shots, rally

    # A "shot" that barely travels is a ball being handled, not a stroke; drop it
    # and label again, since removing a hit changes shot numbers and rallies.
    for _attempt in range(4):
        shots, rally = label(hits)
        slow = {s["time_seconds"] for s in shots
                if s["ground_speed_mps"] is not None and s["ground_speed_mps"] < MIN_SHOT_SPEED}
        if not slow:
            break
        hits = [h for h in hits if round(h.t, 3) not in slow]

    bounce_out = []
    for b in bounces:
        xy = _bounce_court(b)
        bounce_out.append({"time_seconds": round(b.t, 3),
                           "court_m": [round(xy[0], 2), round(xy[1], 2)] if xy else None,
                           "in_court": _inside(xy) if xy else None})

    rallies = []
    for r in range(rally + 1):
        members = [s for s in shots if s["rally_index"] == r]
        start, end = members[0]["time_seconds"], members[-1]["time_seconds"]
        # Include the final ball flight (up to the last observed ball in reach).
        tail = [p.t for p in points if end < p.t <= end + RALLY_GAP_S]
        rallies.append({"rally_index": r, "start_s": start, "end_s": round(max([end] + tail), 3), "shots": len(members)})

    counts = {t: 0 for t in SHOT_TYPES}
    mine = {t: 0 for t in SHOT_TYPES}
    for s in shots:
        counts[s["shot_type"]] += 1
        if s["by_selected_player"]:
            mine[s["shot_type"]] += 1
    return {
        "shots": shots,
        "bounces": bounce_out,
        "rallies": rallies,
        "counts_by_type": counts,
        "selected_player_counts_by_type": mine,
        "type_definitions": dict(TYPE_DEFINITIONS),
    }

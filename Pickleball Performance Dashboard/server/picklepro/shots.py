"""Contacts, bounce candidates, rallies and rule-based shot classes.

Everything here is derived from a single fixed camera behind a baseline. The
ball is only known in image pixels, so speed and arc are *image-space proxies*
(requirement F07), not true 3D values. Rules abstain ("unclassified") when the
evidence is missing or weak instead of guessing.

Event evidence (E08, E09, E11):

* **Contact** - the ball's direction of travel changes sharply next to a
  player box. When the ball is hidden by the player at the moment of contact,
  the change is measured across the short gap and marked ``occluded``.
* **Bounce candidate** - the ball's image-y velocity drops sharply away from
  any player. From behind a baseline a bounce and a change in flight direction
  can look alike, so these are candidates, never proof of a bounce.
* **Rally** - a run of ball activity separated by at least ``RALLY_GAP_S`` with
  no ball in play. It is *complete* only when ball absence was observed both
  before and after it inside the clip.

Single-label shot precedence (F07, extended with return and overhead, which
are additions to the revision-4 class list and use their own rule version):

    serve -> return -> overhead -> volley -> dink -> drive -> lob -> unclassified

All thresholds live in ``RULES`` and are pilot values to be tuned on labelled
footage and then frozen; results always carry ``RULE_VERSION``.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from .ball_track import BallObservation, BallTrack
from .court import COURT_LENGTH_M, KITCHEN_DEPTH_M, NET_Y_M, CourtCalibration, foot_point

RULE_VERSION = "shots-rules-0.2-unvalidated"
SHOT_CLASSES = ("serve", "return", "overhead", "volley", "dink", "drive", "lob", "unclassified")
CLASS_DEFINITIONS = {
    "serve": "First contact of a rally whose start was observed (ball out of play for at least 1 s before). "
             "With a court calibration the server must also be behind their baseline.",
    "return": "Second contact of a rally, by the other side, after the serve (the two-bounce rule means it follows a bounce).",
    "overhead": "Contact with the ball clearly above the top of the hitter's box (above head height). Not a serve.",
    "volley": "Contact after an opponent's hit, with the ball continuously observed in between and no bounce candidate.",
    "dink": "Slow contact by a player at their kitchen line that lands (or is next played) in the opponent's kitchen area.",
    "drive": "Fast, flat ball after contact (image-space speed and arc proxies).",
    "lob": "High, long ball after contact: the image path rises well above the straight line to where it ends.",
    "unclassified": "Missing or weak ball evidence, ambiguous contact, truncated rally context or conflicting rules.",
}

RULES: Dict[str, float] = {
    "fit_window_s": 0.20,            # before/after windows for local velocity fits
    "min_fit_points": 3,
    "min_turn_deg": 45.0,            # direction change that counts as an event
    "smooth_window_s": 0.25,         # a smooth curve over +/- this window means flight, not an event
    "smooth_max_rms_h": 0.004,       # max RMS residual of that curve, as a share of frame height
    "min_event_speed_h": 0.15,       # frame heights / s; slower balls are not in flight
    "event_merge_s": 0.25,           # events closer than this are one event
    "max_occlusion_gap_s": 0.60,     # contact hidden behind the player
    "player_pad_x": 0.5,             # box widths added left/right when matching a contact
    "player_pad_top": 0.4,           # box heights added above the head (reach)
    "player_pad_bottom": 0.1,
    "min_reach_h": 0.06,             # minimum reach around any box, as a share of frame height
    "player_match_s": 0.20,          # player boxes are sampled less often than the ball
    "bounce_min_dvy_h": 0.35,
    "same_side_bounce_s": 1.0,       # same-side "contact" this soon before another is a bounce        # drop in image-y velocity (frame heights / s)
    "rally_gap_s": 1.5,
    "rally_min_duration_s": 1.0,
    "rally_edge_margin_s": 1.0,      # absence that must be observed before/after a complete rally
    "serve_max_depth_m": 0.30,
    "serve_start_window_s": 0.40,    # first contact this close to the rally start can be a serve       # server's foot at most this far inside the baseline
    "return_min_gap_s": 0.5,
    "overhead_top_margin": 0.15,     # ball centre at least this share of box height above the box top
    "volley_min_observed": 0.70,     # observed share of the interval since the opponent's hit
    "volley_max_gap_s": 0.15,
    "dink_max_speed_ph": 3.5,        # player heights / s, measured just after contact
    "dink_min_depth_m": NET_Y_M - KITCHEN_DEPTH_M - 1.0,   # hitter's foot within 1 m of the kitchen line or inside
    "drive_min_speed_ph": 5.0,
    "drive_max_arc": 0.35,           # arc height / chord length
    "lob_min_arc": 0.60,
    "lob_min_flight_s": 1.0,
    "lob_min_landing_depth_m": COURT_LENGTH_M / 2 - 2.0,   # from the net; deep landing when observed
    "speed_window_s": 0.20,
}


@dataclass
class PlayerFrame:
    t: float
    detections: List[dict]      # {"track_id", "bbox"}


@dataclass
class Event:
    kind: str                   # "contact" | "bounce"
    t: float
    x: float
    y: float
    turn_deg: float
    v_before: Tuple[float, float]
    v_after: Tuple[float, float]
    occluded: bool = False
    first_sight: bool = False   # ball first seen leaving this player after a pause (serve evidence)
    track_id: Optional[int] = None
    bbox: Optional[List[int]] = None
    side: Optional[str] = None          # "near" | "far"
    side_source: Optional[str] = None   # "ball_direction" | "court_calibration" | "image_layout"
    court_xy_m: Optional[Tuple[float, float]] = None   # bounce landing or hitter's foot


@dataclass
class Rally:
    index: int
    start_s: float
    end_s: float
    complete: bool
    observed_fraction: float
    contacts: List[Event] = field(default_factory=list)


@dataclass
class Shot:
    contact: Event
    rally_index: int
    shot_class: str
    evidence: str               # "strong" | "weak"
    reason: str
    speed_ph: Optional[float] = None
    arc: Optional[float] = None


def _fit(obs: Sequence[BallObservation], times: Sequence[float], t0: float, t1: float,
         min_points: int) -> Optional[Tuple[float, float]]:
    lo, hi = bisect.bisect_left(times, t0 - 1e-9), bisect.bisect_right(times, t1 + 1e-9)
    pts = obs[lo:hi]
    if len(pts) < min_points or pts[-1].t - pts[0].t < 0.05:
        return None
    t = np.array([p.t for p in pts])
    vx = float(np.polyfit(t, [p.x for p in pts], 1)[0])
    vy = float(np.polyfit(t, [p.y for p in pts], 1)[0])
    return vx, vy


def _smooth_flight(obs: Sequence[BallObservation], times: Sequence[float], t: float, frame_h: float) -> bool:
    """True when one smooth curve fits the ball path around ``t``: the top of an arc or a
    ball curving in flight, not a hit or bounce (which leave a kink)."""
    w = RULES["smooth_window_s"]
    lo, hi = bisect.bisect_left(times, t - w), bisect.bisect_right(times, t + w)
    pts = obs[lo:hi]
    before = sum(p.t < t for p in pts)
    if before < 3 or len(pts) - before < 3:
        return False
    ts = np.array([p.t for p in pts]) - t
    worst = 0.0
    for vals in (np.array([p.x for p in pts]), np.array([p.y for p in pts])):
        fit = np.polyval(np.polyfit(ts, vals, 2), ts)
        worst = max(worst, float(np.sqrt(np.mean((vals - fit) ** 2))))
    return worst <= RULES["smooth_max_rms_h"] * frame_h


def _angle(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    na, nb = math.hypot(*a), math.hypot(*b)
    if na == 0 or nb == 0:
        return 0.0
    c = max(-1.0, min(1.0, (a[0] * b[0] + a[1] * b[1]) / (na * nb)))
    return math.degrees(math.acos(c))


def _players_at(players: Sequence[PlayerFrame], ptimes: Sequence[float], t: float, tol: float) -> List[dict]:
    if not players:
        return []
    i = bisect.bisect_left(ptimes, t)
    best = min((j for j in (i - 1, i) if 0 <= j < len(players)), key=lambda j: abs(ptimes[j] - t))
    return players[best].detections if abs(ptimes[best] - t) <= tol else []


def _box_sides(detections: List[dict], calibration: Optional[CourtCalibration]) -> List[Optional[str]]:
    """Court side of each player box: from the court calibration, else from the image layout
    (the camera is behind the near baseline, so near-side players stand lower in the image)."""
    if not detections:
        return []
    if calibration is not None:
        feet = calibration.image_to_court([foot_point(d["bbox"]) for d in detections])
        return [("near" if fy < NET_Y_M else "far") if -3.0 <= fy <= COURT_LENGTH_M + 3.0 else None
                for _, fy in feet]
    bottoms = sorted((d["bbox"][3], i) for i, d in enumerate(detections))
    if len(bottoms) == 1:
        return [None]
    gaps = [(bottoms[k + 1][0] - bottoms[k][0], k) for k in range(len(bottoms) - 1)]
    size, cut = max(gaps)
    heights = [d["bbox"][3] - d["bbox"][1] for d in detections]
    if size < 0.5 * float(np.median(heights)):
        return [None] * len(detections)
    sides: List[Optional[str]] = [None] * len(detections)
    for k, (_, i) in enumerate(bottoms):
        sides[i] = "far" if k <= cut else "near"
    return sides


def _direction_side(vb, va, h: float) -> Optional[str]:
    """Camera behind the near baseline: a near-side hit sends the ball up the image
    (away from the camera), a far-side hit sends it down (towards the camera)."""
    dvy = va[1] - vb[1]
    if va[1] < -0.1 * h and dvy < -0.15 * h:
        return "near"
    if va[1] > 0.1 * h and dvy > 0.15 * h:
        return "far"
    return None


def _within_reach(x: float, y: float, bbox: Sequence[int], frame_h: float, scale: float = 1.0) -> Optional[float]:
    x1, y1, x2, y2 = bbox
    w, h = max(1, x2 - x1), max(1, y2 - y1)
    # Far players are small in the image; give every box a minimum reach in pixels.
    floor = RULES["min_reach_h"] * frame_h * scale
    pad_x = max(RULES["player_pad_x"] * w * scale, floor)
    pad_top = max(RULES["player_pad_top"] * h * scale, floor)
    if not (x1 - pad_x <= x <= x2 + pad_x and y1 - pad_top <= y <= y2 + RULES["player_pad_bottom"] * h):
        return None
    # Pixel distance to the box itself (0 inside). Normalising by box size would let a
    # player standing close to the camera, whose box fills much of the frame, claim
    # hits made by a far player whose small box the ball actually touches.
    return math.hypot(max(x1 - x, 0.0, x - x2), max(y1 - y, 0.0, y - y2))


def _area(b: Sequence[int]) -> int:
    return max(0, b[2] - b[0]) * max(0, b[3] - b[1])


def _pick_hitter(x: float, y: float, detections: List[dict], sides: List[Optional[str]],
                 want: Optional[str], frame_h: float, scale: float = 1.0) -> Optional[Tuple[dict, Optional[str]]]:
    best, best_d = None, float("inf")
    for d, side in zip(detections, sides):
        if want is not None and side is not None and side != want:
            continue
        dist = _within_reach(x, y, d["bbox"], frame_h, scale)
        if dist is not None and dist < best_d:
            best, best_d = (d, side), dist
    return best


def detect_events(track: BallTrack, players: Sequence[PlayerFrame],
                  calibration: Optional[CourtCalibration] = None) -> List[Event]:
    """Contacts and bounce candidates from observed (not interpolated) ball samples."""
    obs = track.observations
    times = [o.t for o in obs]
    h = float(track.frame_height)
    w_s, min_pts = RULES["fit_window_s"], int(RULES["min_fit_points"])
    min_speed = RULES["min_event_speed_h"] * h
    ptimes = [p.t for p in players]
    raw: List[Event] = []

    def consider(t: float, x: float, y: float, vb, va, occluded: bool):
        if vb is None or va is None or max(math.hypot(*vb), math.hypot(*va)) < min_speed:
            return
        turn = _angle(vb, va)
        if turn < RULES["min_turn_deg"] / 3:
            return
        if not occluded and _smooth_flight(obs, times, t, h):
            return
        dets = _players_at(players, ptimes, t, RULES["player_match_s"])
        sides = _box_sides(dets, calibration)
        want = _direction_side(vb, va, h)
        hit = _pick_hitter(x, y, dets, sides, want, h) if turn >= RULES["min_turn_deg"] else None
        if hit is not None:
            d, box_side = hit
            side, source = (want, "ball_direction") if want else (box_side, "court_calibration" if calibration else "image_layout")
            raw.append(Event("contact", t, x, y, turn, vb, va, occluded=occluded, track_id=d.get("track_id"), bbox=list(d["bbox"]),
                             side=side, side_source=source if side else None))
            return
        dvy = va[1] - vb[1]
        anyone_close = _pick_hitter(x, y, dets, sides, None, h) is not None
        if not occluded and not anyone_close and dvy <= -RULES["bounce_min_dvy_h"] * h and vb[1] > -0.1 * h:
            raw.append(Event("bounce", t, x, y, turn, vb, va))

    for i, o in enumerate(obs):
        consider(o.t, o.x, o.y, _fit(obs, times, o.t - w_s, o.t, min_pts), _fit(obs, times, o.t, o.t + w_s, min_pts), False)
        if i + 1 < len(obs):
            nxt = obs[i + 1]
            gap = nxt.t - o.t
            if 2 * track.sample_interval_s < gap <= RULES["max_occlusion_gap_s"]:
                consider((o.t + nxt.t) / 2, (o.x + nxt.x) / 2, (o.y + nxt.y) / 2,
                         _fit(obs, times, o.t - w_s, o.t, min_pts), _fit(obs, times, nxt.t, nxt.t + w_s, min_pts), True)

    # A serve rarely shows a direction change: the ball is first seen leaving the
    # server after a pause. Record that as a contact when a player is within reach.
    for i, o in enumerate(obs):
        if i and o.t - obs[i - 1].t < RULES["rally_gap_s"]:
            continue
        va = _fit(obs, times, o.t, o.t + w_s, min_pts)
        if va is None or math.hypot(*va) < min_speed:
            continue
        dets = _players_at(players, ptimes, o.t, RULES["player_match_s"])
        sides = _box_sides(dets, calibration)
        want = "near" if va[1] < -0.1 * h else "far" if va[1] > 0.1 * h else None
        hit = _pick_hitter(o.x, o.y, dets, sides, want, h, scale=1.5)
        if hit is not None:
            d, box_side = hit
            side, source = (want, "ball_direction") if want else (box_side, "court_calibration" if calibration else "image_layout")
            raw.append(Event("contact", o.t, o.x, o.y, 0.0, (0.0, 0.0), va, occluded=True, first_sight=True,
                             track_id=d.get("track_id"), bbox=list(d["bbox"]), side=side, side_source=source if side else None))

    # Non-maximum suppression: one event per burst, contacts win over bounces.
    raw.sort(key=lambda e: e.t)
    events: List[Event] = []
    for e in raw:
        if events and e.t - events[-1].t < RULES["event_merge_s"]:
            prev = events[-1]
            if (e.kind == "contact") > (prev.kind == "contact") or (e.kind == prev.kind and (
                    e.first_sight > prev.first_sight or (e.first_sight == prev.first_sight and e.turn_deg > prev.turn_deg))):
                events[-1] = e
            continue
        events.append(e)

    # Each side hits the ball once before the other side does. Two contacts by the
    # same side in quick succession are usually a bounce in front of the hitter
    # (from behind the baseline it looks like a hit) followed by the real hit.
    # Only reclassify when the ball also lost speed there, as a bounce does; the
    # far side's hit in between may simply have been missed.
    for i in range(len(events) - 1):
        a = events[i]
        b = next((e for e in events[i + 1:] if e.kind == "contact"), None)
        if (a.kind == "contact" and b is not None and a.side is not None and a.side == b.side
                and b.t - a.t <= RULES["same_side_bounce_s"] and not a.first_sight
                and math.hypot(*a.v_after) < math.hypot(*a.v_before)):
            a.kind, a.track_id, a.bbox, a.side, a.side_source = "bounce", None, None, None, None

    if calibration is not None:
        for e in events:
            point = foot_point(e.bbox) if e.kind == "contact" and e.bbox is not None else (e.x, e.y)
            cx, cy = calibration.image_to_court([point])[0]
            e.court_xy_m = (float(cx), float(cy))
    return events


def segment_rallies(track: BallTrack, events: Sequence[Event], clip_start: float, clip_end: float) -> List[Rally]:
    obs = track.observations
    if not obs:
        return []
    groups: List[List[BallObservation]] = [[obs[0]]]
    for o in obs[1:]:
        if o.t - groups[-1][-1].t > RULES["rally_gap_s"]:
            groups.append([o])
        else:
            groups[-1].append(o)
    rallies: List[Rally] = []
    for g in groups:
        start, end = g[0].t, g[-1].t
        if end - start < RULES["rally_min_duration_s"]:
            continue
        contacts = [e for e in events if e.kind == "contact" and start - 0.3 <= e.t <= end + 0.3]
        if not contacts:
            continue
        margin = RULES["rally_edge_margin_s"]
        complete = start - clip_start >= margin and clip_end - end >= margin
        observed = min(1.0, len(g) * track.sample_interval_s / max(end - start, track.sample_interval_s))
        rallies.append(Rally(len(rallies), start, end, complete, observed, contacts))
    return rallies


def _flight(obs: Sequence[BallObservation], times: Sequence[float], t0: float, t1: float) -> List[BallObservation]:
    return list(obs[bisect.bisect_right(times, t0):bisect.bisect_left(times, t1)])


def _arc(points: Sequence[BallObservation]) -> Optional[float]:
    """Height of the path above its chord (towards the top of the image) / chord length."""
    if len(points) < 4:
        return None
    a, b = np.array([points[0].x, points[0].y]), np.array([points[-1].x, points[-1].y])
    chord = b - a
    length = float(np.linalg.norm(chord))
    if length < 1:
        return None
    best = 0.0
    for p in points[1:-1]:
        s = float(np.dot(np.array([p.x, p.y]) - a, chord) / length ** 2)
        on_line = a + max(0.0, min(1.0, s)) * chord
        rise = on_line[1] - p.y                     # positive = above the chord in the image
        best = max(best, rise)
    return best / length


def _speed_ph(e: Event, obs, times) -> Optional[float]:
    """Image speed just after contact, in hitter-box heights per second (scale-aware proxy)."""
    if e.bbox is None:
        return None
    v = _fit(obs, times, e.t, e.t + RULES["speed_window_s"], int(RULES["min_fit_points"]))
    if v is None:
        v = e.v_after
    box_h = max(1, e.bbox[3] - e.bbox[1])
    return math.hypot(*v) / box_h


def _depth_from_own_baseline(e: Event) -> Optional[float]:
    if e.court_xy_m is None or e.side is None:
        return None
    y = e.court_xy_m[1]
    return y if e.side == "near" else COURT_LENGTH_M - y


def _interval_observation(track: BallTrack, t0: float, t1: float) -> Tuple[float, float]:
    """(observed share, longest gap) of ball observations in [t0, t1]."""
    ts = [o.t for o in track.observations if t0 <= o.t <= t1]
    if t1 - t0 <= 0:
        return 1.0, 0.0
    if not ts:
        return 0.0, t1 - t0
    gaps = [ts[0] - t0] + [b - a for a, b in zip(ts, ts[1:])] + [t1 - ts[-1]]
    share = min(1.0, len(ts) * track.sample_interval_s / (t1 - t0))
    return share, max(gaps)


def classify_shots(track: BallTrack, rallies: Sequence[Rally], events: Sequence[Event]) -> List[Shot]:
    obs = track.observations
    times = [o.t for o in obs]
    bounces = [e for e in events if e.kind == "bounce"]
    shots: List[Shot] = []
    for rally in rallies:
        cs = rally.contacts
        serve_side: Optional[str] = None
        for k, c in enumerate(cs):
            nxt_t = cs[k + 1].t if k + 1 < len(cs) else rally.end_s
            prev = cs[k - 1] if k else None
            flight = _flight(obs, times, c.t, nxt_t)
            arc = _arc(flight)
            speed = _speed_ph(c, obs, times)
            landing = next((b for b in bounces if c.t < b.t < nxt_t), None)
            depth = _depth_from_own_baseline(c)

            def shot(cls: str, evidence: str, reason: str) -> Shot:
                return Shot(c, rally.index, cls, evidence, reason,
                            None if speed is None else round(speed, 2), None if arc is None else round(arc, 3))

            # serve: only the contact that starts an observed rally
            at_start = k == 0 and (c.first_sight or c.t - rally.start_s <= RULES["serve_start_window_s"])
            if at_start and rally.complete:
                if depth is not None and depth > RULES["serve_max_depth_m"]:
                    shots.append(shot("unclassified", "weak", "Rally start observed, but the hitter was not behind the baseline."))
                    continue
                serve_side = c.side
                if depth is not None:
                    shots.append(shot("serve", "strong", "Observed rally start; server behind the baseline."))
                else:
                    shots.append(shot("serve", "weak", "Observed rally start; baseline position not checked (no court calibration)."))
                continue
            # return
            first_after_serve = k == 1 and serve_side is not None and shots and shots[-1].shot_class == "serve" \
                and shots[-1].contact is prev
            if first_after_serve:
                other_side = c.side is None or c.side != serve_side
                if other_side and c.t - prev.t >= RULES["return_min_gap_s"]:
                    strong = c.side is not None
                    shots.append(shot("return", "strong" if strong else "weak",
                                      "Second contact after an observed serve, by the other side."
                                      + ("" if strong else " The returner's side could not be determined.")))
                    continue
            # overhead
            if c.bbox is not None and not c.occluded:
                top, box_h = c.bbox[1], max(1, c.bbox[3] - c.bbox[1])
                if c.y <= top - RULES["overhead_top_margin"] * box_h:
                    shots.append(shot("overhead", "weak", "Ball clearly above the hitter's head at contact."))
                    continue
            # volley
            if prev is not None and k >= 2 and c.side is not None and prev.side is not None and c.side != prev.side:
                share, max_gap = _interval_observation(track, prev.t, c.t)
                bounced = any(prev.t < b.t < c.t for b in bounces)
                if share >= RULES["volley_min_observed"] and max_gap <= RULES["volley_max_gap_s"] and not bounced:
                    shots.append(shot("volley", "strong" if share >= 0.9 else "weak",
                                      f"Ball observed {share:.0%} of the time since the opponent's hit, with no bounce candidate."))
                    continue
            # dink
            if speed is not None and speed <= RULES["dink_max_speed_ph"] and depth is not None \
                    and depth >= RULES["dink_min_depth_m"]:
                if landing is not None and landing.court_xy_m is not None \
                        and abs(landing.court_xy_m[1] - NET_Y_M) <= KITCHEN_DEPTH_M \
                        and (landing.court_xy_m[1] > NET_Y_M) == (c.side == "near"):
                    shots.append(shot("dink", "strong", "Slow ball from the kitchen line landing in the opponent's kitchen."))
                    continue
                nxt = cs[k + 1] if k + 1 < len(cs) else None
                nd = _depth_from_own_baseline(nxt) if nxt is not None else None
                if nd is not None and nd >= RULES["dink_min_depth_m"] and nxt.side != c.side:
                    shots.append(shot("dink", "weak", "Slow ball from the kitchen line, next played by an opponent at "
                                                      "their kitchen line; landing not observed."))
                    continue
            # drive
            if speed is not None and speed >= RULES["drive_min_speed_ph"] and arc is not None and arc <= RULES["drive_max_arc"]:
                shots.append(shot("drive", "weak", "Fast, flat image path after contact (image-space proxy)."))
                continue
            # lob
            if arc is not None and arc >= RULES["lob_min_arc"] and nxt_t - c.t >= RULES["lob_min_flight_s"]:
                deep = (landing is not None and landing.court_xy_m is not None
                        and abs(landing.court_xy_m[1] - NET_Y_M) >= RULES["lob_min_landing_depth_m"])
                shots.append(shot("lob", "strong" if deep else "weak",
                                  "High, long image path" + (" landing deep." if deep else "; deep landing not observed.")))
                continue
            reason = "No rule had enough evidence."
            if c.occluded:
                reason = "Contact hidden behind the player; not enough ball evidence."
            elif speed is None or arc is None:
                reason = "Too few ball observations after contact."
            elif depth is None:
                reason = "No court calibration: kitchen and baseline rules cannot be checked."
            shots.append(shot("unclassified", "weak", reason))
    return shots


def summarize(shots: Sequence[Shot]) -> Dict[str, Dict]:
    counts = {c: 0 for c in SHOT_CLASSES}
    for s in shots:
        counts[s.shot_class] += 1
    total = sum(counts.values())
    shares = {c: round(n / total, 4) if total else 0.0 for c, n in counts.items()}
    return {"counts": counts, "shares": shares}

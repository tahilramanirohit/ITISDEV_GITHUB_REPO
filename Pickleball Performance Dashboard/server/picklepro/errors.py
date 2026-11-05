"""Error counting from the computer-vision results (adviser feedback: "count the errors").

Every count comes from things the analysis already measured; nothing is guessed:

* ``serve_fault``: a serve whose next observed bounce was outside the service
  court diagonally opposite the server (``ShotEvent.landed_in`` is False).
* ``out``: any other shot whose next observed bounce was outside the court.
* ``kitchen_fault``: a volley (ball hit before it bounced) with the hitter's
  feet inside the kitchen (non-volley zone).
* ``no_mans_land``: a court positioning error: during a rally, staying at
  least ``LINGER_S`` in the transition zone between the kitchen line and the
  baseline area, where the ball lands at the player's feet. The 1 m strip just
  behind the kitchen line is where players should stand, so it never counts.
* ``stayed_back``: a court positioning error: still in the baseline area
  ``AFTER_RETURN_S`` after hitting the return of serve, instead of moving up
  to the kitchen line.

Shots without an observed bounce are not counted either way: a missing bounce
can be a ball into the net, a winner, or the camera losing the ball.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from .zones import KITCHEN_LINE_M, distance_from_net, on_kitchen_line, zone_of

ERROR_KINDS = ("serve_fault", "out", "kitchen_fault", "no_mans_land", "stayed_back")

LINGER_S = 2.0            # a stay this long in the transition zone counts once
AFTER_RETURN_S = 2.5      # by this long after the return, the returner should have left the baseline
KITCHEN_MARGIN_M = 0.15   # feet must be clearly inside the kitchen: position noise is about this size

ERROR_DEFINITIONS = {
    "serve_fault": "Serve that landed outside the service court diagonally opposite the server.",
    "out": "Shot (not a serve) whose next bounce landed outside the court.",
    "kitchen_fault": f"Volley hit with the feet more than {KITCHEN_MARGIN_M:g} m inside the kitchen (non-volley zone).",
    "no_mans_land": f"Court positioning: {LINGER_S:g} s or more in the transition zone (behind the kitchen-line strip) during a rally.",
    "stayed_back": f"Court positioning: still in the baseline area {AFTER_RETURN_S:g} s after hitting the return of serve.",
}

Position = Tuple[float, Tuple[float, float]]  # (time, (x, y) court metres)


def _event(t: float, kind: str, player_id: Optional[int], side: Optional[str], rally: Optional[int], detail: str) -> dict:
    return {"time_seconds": round(t, 3), "kind": kind, "player_id": player_id, "side": side,
            "rally_index": rally, "detail": detail}


def shot_errors(shots: Sequence[object]) -> List[dict]:
    """Serve faults, shots out and kitchen faults from the classified shots."""
    events = []
    for s in shots:
        pid, side = getattr(s, "hitter_track_id", None), getattr(s, "hitter_side", None)
        rally, t = getattr(s, "rally_index", None), getattr(s, "time_seconds")
        kind = getattr(s, "public_shot_type", None) or getattr(s, "shot_type", None)
        if getattr(s, "landed_in", None) is False:
            if kind == "serve":
                events.append(_event(t, "serve_fault", pid, side, rally, "The serve landed outside the service court."))
            else:
                events.append(_event(t, "out", pid, side, rally, "The ball landed outside the court."))
        feet = getattr(s, "hitter_court_m", None)
        if getattr(s, "contact", None) == "volley" and feet is not None and side in ("near", "far"):
            if 0 <= distance_from_net((feet[0], feet[1]), side) < KITCHEN_LINE_M - KITCHEN_MARGIN_M:
                events.append(_event(t, "kitchen_fault", pid, side, rally, "Volleyed from inside the kitchen."))
    return events


def positioning_errors(positions: Dict[int, List[Position]], sides: Dict[int, str],
                       windows: Sequence[Tuple[float, float, int]], shots: Sequence[object],
                       sample_s: float) -> List[dict]:
    """No-man's-land stays during rallies, and staying back after the return.

    ``positions``: player id → time-ordered (time, court xy); ``windows``: (start, end, rally index).
    A gap longer than three samples ends a stay, so lost tracking is never counted as standing still.
    """
    events = []
    for pid, samples in positions.items():
        side = sides.get(pid)
        if side not in ("near", "far"):
            continue
        for start, end, rally in windows:
            run_start: Optional[float] = None
            last_t: Optional[float] = None

            def close(at: float) -> None:
                if run_start is not None and at - run_start >= LINGER_S:
                    events.append(_event(run_start, "no_mans_land", pid, side, rally,
                                         f"{at - run_start:.1f} s in the transition zone."))

            for t, xy in samples:
                if t < start or t > end:
                    continue
                gap = last_t is not None and t - last_t > 3 * sample_s
                if gap and run_start is not None:
                    close(last_t)
                    run_start = None
                if zone_of(xy, side) == "transition" and not on_kitchen_line(xy, side):
                    run_start = t if run_start is None else run_start
                elif run_start is not None:
                    close(t)
                    run_start = None
                last_t = t
            if run_start is not None and last_t is not None:
                close(last_t)
    for s in shots:
        if getattr(s, "shot_number", None) != 2 or getattr(s, "hitter_track_id", None) is None:
            continue
        pid = s.hitter_track_id
        side = sides.get(pid)
        if side not in ("near", "far"):
            continue
        target = s.time_seconds + AFTER_RETURN_S
        near = [(abs(t - target), xy) for t, xy in positions.get(pid, []) if abs(t - target) <= 2 * sample_s]
        if not near:
            continue
        xy = min(near)[1]
        if zone_of(xy, side) == "baseline":
            events.append(_event(s.time_seconds, "stayed_back", pid, side, s.rally_index,
                                 f"Still at the baseline {AFTER_RETURN_S:g} s after the return."))
    return events


def count_errors(events: Sequence[dict], players: Sequence[Tuple[int, str]]) -> dict:
    """Totals, per-player counts (on-court players, even with zero errors) and the events, oldest first."""
    ordered = sorted(events, key=lambda e: e["time_seconds"])
    totals = {k: 0 for k in ERROR_KINDS}
    per_player: Dict[int, dict] = {pid: {"player_id": pid, "side": side, "counts": {k: 0 for k in ERROR_KINDS}}
                                   for pid, side in players}
    for e in ordered:
        totals[e["kind"]] += 1
        if e["player_id"] in per_player:
            per_player[e["player_id"]]["counts"][e["kind"]] += 1
    return {"definitions": dict(ERROR_DEFINITIONS), "counts": totals,
            "players": list(per_player.values()), "events": ordered}

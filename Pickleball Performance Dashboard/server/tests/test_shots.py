"""Shot, bounce, and rally estimation on a SYNTHETIC rally with known events.

The ball path is generated from court positions and heights, then projected
through the synthetic camera. This checks the rules do what they claim; it is
not evidence of accuracy on real footage.
"""

import math

import numpy as np
import pytest

from picklepro.court import COURT_WIDTH_M, calibrate
from picklepro.fixtures import court_to_image_homography, project
from picklepro.shots import SHOT_TYPES, TYPE_DEFINITIONS, FrameObs, _classify, analyze_shots, court_line_segments
from picklepro.court import LANDMARKS_M

DT = 0.1
H_COURT_TO_IMG = court_to_image_homography()


def _calibration():
    pts = {n: tuple(project(H_COURT_TO_IMG, [LANDMARKS_M[n]])[0]) for n in LANDMARKS_M}
    return calibrate(pts, (960, 540))


def _scale(ground):
    """Image pixels per metre (across the court) at this ground point."""
    a, b = project(H_COURT_TO_IMG, [ground, (ground[0] + 1.0, ground[1])])
    return float(np.hypot(*(b - a)))


def _image(ground, height):
    x, y = project(H_COURT_TO_IMG, [ground])[0]
    return float(x), float(y - height * _scale(ground))


def _player_box(ground):
    x, y = project(H_COURT_TO_IMG, [ground])[0]
    s = _scale(ground)
    return [int(x - 0.3 * s), int(y - 1.7 * s), int(x + 0.3 * s), int(y)]


# (time, event, ground point, height). Hits are at 1 m, bounces at 0 m.
A_BASE, B_BASE = (2.5, -0.3), (4.5, 13.2)
EVENTS = [
    (0.0, "hit A", A_BASE, 1.0),               # serve
    (1.0, "bounce", (4.5, 11.0), 0.0),
    (1.4, "hit B", B_BASE, 1.0),               # return
    (2.5, "bounce", (2.5, 3.0), 0.0),
    (2.8, "hit A", (2.5, 1.0), 1.0),           # third-shot drop
    (4.4, "bounce", (3.5, 8.0), 0.0),
    (4.7, "hit B", (3.5, 9.0), 1.0),           # dink
    (5.9, "bounce", (3.0, 5.5), 0.0),
    (6.2, "hit A", (3.0, 4.8), 1.0),           # fast shot after a bounce
    (6.6, "hit B", (3.5, 9.0), 1.0),           # volley, no bounce
    (7.1, "bounce", (3.0, 1.0), 0.0),
    (7.5, "end", (3.0, -2.0), 0.3),
]
G = 9.81


def _ball_at(t):
    for i in range(len(EVENTS) - 1):
        t0, _, g0, h0 = EVENTS[i]
        t1, _, g1, h1 = EVENTS[i + 1]
        if t0 <= t <= t1:
            s = (t - t0) / (t1 - t0)
            ground = (g0[0] + s * (g1[0] - g0[0]), g0[1] + s * (g1[1] - g0[1]))
            # Free flight under gravity between the two events.
            height = (1 - s) * h0 + s * h1 + 0.5 * G * (t - t0) * (t1 - t)
            return _image(ground, height), ground
    return None


def _player_at(t, who):
    hits = [(et, g) for et, e, g, _ in EVENTS if e == f"hit {who}"]
    for (t0, g0), (t1, g1) in zip(hits, hits[1:]):
        if t0 <= t <= t1:
            s = (t - t0) / (t1 - t0)
            return (g0[0] + s * (g1[0] - g0[0]), g0[1] + s * (g1[1] - g0[1]))
    return hits[0][1] if t < hits[0][0] else hits[-1][1]


def _scene(selected="A"):
    cal = _calibration()
    frames, ball = [], []
    for k in range(int(7.5 / DT) + 1):
        t = round(k * DT, 3)
        dets = [{"track_id": 1, "bbox": _player_box(_player_at(t, "A"))},
                {"track_id": 2, "bbox": _player_box(_player_at(t, "B"))}]
        frames.append(FrameObs(t, dets, cal, 0 if selected == "A" else 1))
        found = _ball_at(t)
        if found is not None:
            (px, py), ground = found
            r = max(1.5, 0.037 * 1.3 * _scale(ground))  # detector boxes are a little padded
            ball.append((t, [round(px - r), round(py - r), round(px + r), round(py + r)]))
    return frames, ball


def test_synthetic_rally_shot_types_hitters_and_bounces():
    frames, ball = _scene()
    out = analyze_shots(ball, frames, 540, DT)
    shots = out["shots"]
    assert [s["time_seconds"] for s in shots] == pytest.approx([0.0, 1.4, 2.8, 4.7, 6.2, 6.6])
    # A's fast shot at the kitchen line after B's dink is a speed-up, reported
    # as a drive (after the bounce); B's volley straight back at it is a volley.
    assert [s["shot_type"] for s in shots] == ["serve", "return", "drop", "dink", "drive", "volley"]
    assert "fast attack" in shots[4]["evidence"]
    assert [s["hitter_track_id"] for s in shots] == [1, 2, 1, 2, 1, 2]
    assert [s["hitter_side"] for s in shots] == ["near", "far"] * 3
    assert shots[5]["contact"] == "volley" and shots[4]["contact"] == "after_bounce"
    assert [s["by_selected_player"] for s in shots] == [True, False] * 3
    assert out["selected_player_counts_by_type"]["drop"] == 1
    assert all(s["rally_index"] == 0 for s in shots)
    assert out["rallies"] == [{"rally_index": 0, "start_s": 0.0, "end_s": pytest.approx(7.5), "shots": 6}]
    # Bounces are on the ground, so their mapped court position is meaningful.
    landed = [b["court_m"] for b in out["bounces"]]
    assert len(landed) == 5
    assert landed[2] == pytest.approx([3.5, 8.0], abs=0.25)
    assert shots[0]["landed_in"] is True and shots[0]["landing_court_m"] == pytest.approx([4.5, 11.0], abs=0.25)


def test_no_calibration_leaves_shots_unclassified_not_guessed():
    frames, ball = _scene()
    for f in frames:
        f.calibration = None
    shots = analyze_shots(ball, frames, 540, DT)["shots"]
    assert shots and all(s["shot_type"] == "unclassified" for s in shots)
    assert all(s["hitter_court_m"] is None for s in shots)


def test_ball_far_from_players_is_not_a_hit():
    frames, ball = _scene()
    for f in frames:
        f.detections = []
    assert analyze_shots(ball, frames, 540, DT)["shots"] == []


def test_shot_landing_ignores_a_bounce_far_outside_the_court(monkeypatch):
    from picklepro import shots as module
    from picklepro.shots import _Event, _Point

    bad = _Event("bounce", 1.0, _Point(1.0, 0, 0, 0), 1.0)
    good = _Event("bounce", 1.2, _Point(1.2, 0, 0, 0), 1.0)
    monkeypatch.setattr(module, "_bounce_court", lambda e: (30.0, 30.0) if e is bad else (3.0, 10.0))
    event, xy = module._landing_event([bad, good], 0.0, 2.0)
    assert event is bad and xy is None  # do not substitute a later bounce


def test_bad_bounce_map_does_not_remove_the_shot_or_invent_pace(monkeypatch):
    from picklepro import shots as module

    frames, ball = _scene()
    original = module._bounce_court
    monkeypatch.setattr(module, "_bounce_court",
                        lambda event: (100.0, 100.0) if abs(event.t - 1.0) < 0.01 else original(event))
    found = analyze_shots(ball, frames, 540, DT)["shots"]
    assert len(found) == 6
    assert found[0]["shot_type"] == "serve"
    assert found[0]["landing_court_m"] is None
    assert found[0]["ground_speed_mps"] is None


def test_long_pause_starts_a_new_rally():
    frames, ball = _scene()
    shifted = [(t + 20.0, b) for t, b in ball]
    later = [FrameObs(f.time_s + 20.0, f.detections, f.calibration, f.selected_index) for f in frames]
    out = analyze_shots(ball + shifted, frames + later, 540, DT)
    assert [r["shots"] for r in out["rallies"]] == [6, 6]


def test_court_lines_project_back_onto_the_court():
    lines = court_line_segments(_calibration())
    assert len(lines) == 9
    near_baseline = lines[0]
    assert near_baseline == pytest.approx([130, 500, 830, 500], abs=1)
    assert COURT_WIDTH_M > 0 and not any(math.isnan(v) for line in lines for v in line)


def _rule(**kw):
    base = dict(number=5, depth=4.0, contact="after_bounce", speed=None, soft=False, fast=False, pace="",
                is_lob=False, rise=None, hang=None, travel=None, above_head=False, incoming_fast=False,
                incoming_soft=False, lands_in_kitchen=False, outside_sideline=False, unmapped=False,
                incoming_speed_up=False)
    base.update(kw)
    if base["speed"] is not None:
        base["soft"] = base["speed"] < 6.0
        base["fast"] = base["speed"] >= 9.0
        base["pace"] = f"{base['speed']:.1f} m/s"
    return _classify(**base)[0]


@pytest.mark.parametrize("features, expected", [
    (dict(number=1, depth=-0.3), "serve"),
    (dict(number=2, depth=0.5), "return"),
    (dict(number=3, depth=0.8, speed=4.0), "drop"),
    (dict(number=3, depth=0.8, speed=7.5, lands_in_kitchen=True), "drop"),
    (dict(number=3, depth=0.8, speed=15.0), "drive"),
    (dict(depth=4.2, speed=3.0), "dink"),
    (dict(depth=4.2, speed=3.0, incoming_fast=True), "reset"),
    (dict(depth=3.0, speed=4.0, incoming_fast=True), "reset"),
    (dict(depth=1.0, speed=4.0, incoming_fast=True), "drop"),
    (dict(depth=4.2, speed=12.0, incoming_soft=True), "speed_up"),
    (dict(depth=4.2, speed=12.0, contact="volley", incoming_speed_up=True), "counter"),
    (dict(depth=4.2, speed=12.0, incoming_fast=True, contact="volley"), "volley"),  # hands battle
    (dict(depth=4.2, speed=12.0, incoming_soft=True, contact="volley"), "speed_up"),
    (dict(depth=4.2, speed=7.0, contact="volley"), "volley"),
    (dict(depth=4.2, contact="after_bounce"), "dink"),  # slow net exchange: bounced in the kitchen
    (dict(depth=4.2, contact="volley", outside_sideline=True), "erne"),
    (dict(depth=1.0, speed=16.0), "drive"),
    (dict(depth=1.0, speed=7.0), "drop"),
    (dict(depth=4.2, above_head=True, speed=15.0), "overhead"),
    (dict(depth=4.2, is_lob=True, rise=5.0), "lob"),
    (dict(depth=None, unmapped=True), "unclassified"),
    (dict(depth=1.0), "unclassified"),
])
def test_each_shot_rule(features, expected):
    assert _rule(**features) == expected


def test_every_shot_type_has_a_definition():
    assert set(TYPE_DEFINITIONS) == set(SHOT_TYPES)


@pytest.mark.parametrize("landing, ok, why", [
    ((4.5, 11.0), True, "diagonal"),
    ((4.5, 8.0), False, "kitchen"),       # within 7 ft of the net
    ((1.5, 11.0), False, "diagonally"),   # straight ahead, same half as the server
    ((4.5, 14.0), False, "out"),          # past the far baseline
    ((4.5, 5.0), False, "cross the net"),
])
def test_serve_must_cross_diagonally_and_clear_the_kitchen(landing, ok, why):
    from picklepro.shots import serve_landing
    valid, verdict = serve_landing((2.0, -0.4), landing)
    assert valid is ok and why in verdict


def _candidate(t, options, score=1.0):
    from picklepro.shots import _Event, _Point
    return _Event("hit", t, _Point(t, 0, 0, 0), score, None, next(iter(options.values()))[0],
                  extras={"options": options})


def test_hits_alternate_between_the_two_sides_of_the_net():
    from picklepro.shots import _alternate
    # The middle candidate is closest to a near player, but the hits before and
    # after it are near hits too: the ball must have gone to the far side.
    hits = [_candidate(0.0, {"near": (0, 0.1)}),
            _candidate(0.8, {"near": (0, 0.1), "far": (2, 0.5)}),
            _candidate(1.6, {"near": (1, 0.1)})]
    kept = _alternate(hits)
    assert [h.t for h in kept] == [0.0, 0.8, 1.6]
    assert [h.hitter for h in kept] == [0, 2, 1]


def test_same_side_candidate_without_another_option_is_dropped():
    from picklepro.shots import _alternate
    hits = [_candidate(0.0, {"near": (0, 0.1)}, score=1.5),
            _candidate(0.8, {"near": (1, 0.6)}, score=0.2),  # weak, and the same side again
            _candidate(1.6, {"far": (2, 0.1)}, score=1.5)]
    assert [h.t for h in _alternate(hits)] == [0.0, 1.6]


def test_unmapped_hits_do_not_constrain_the_alternation():
    from picklepro.shots import _alternate
    hits = [_candidate(0.0, {None: (0, 0.1)}), _candidate(0.8, {None: (1, 0.1)})]
    assert len(_alternate(hits)) == 2


def test_short_exchange_without_a_serve_is_not_play():
    from picklepro.shots import _in_play
    knock = [_candidate(0.0, {"near": (0, 0.1)}), _candidate(1.0, {"far": (1, 0.1)})]  # ball fed back
    rally = [_candidate(10.0 + k, {"near": (0, 0.1)}) for k in range(4)]  # serve not seen, but a real exchange
    assert [h.t for h in _in_play(knock + rally, 540)] == [10.0, 11.0, 12.0, 13.0]


def test_a_ball_rolling_past_the_feet_is_not_a_stroke():
    from picklepro.shots import _Point, _reach_options
    frame = FrameObs(0.0, [{"bbox": [100, 100, 160, 300], "track_id": 1}], None)
    at_waist = _Point(0.0, 150, 200, 205, 10)
    at_shoes = _Point(0.0, 150, 290, 295, 10)
    assert _reach_options(frame, at_shoes, everyone=True) == {}
    assert [o[0] for o in _reach_options(frame, at_waist).values()] == [0]


def test_a_ball_hit_out_of_the_air_is_a_volley_as_in_the_team_shot_table():
    from picklepro.shots import core_type
    assert core_type("drop", "volley", 3.0, False, False, 5)[0] == "volley"
    assert core_type("reset", "volley", 6.0, False, False, 5)[0] == "volley"
    assert core_type("drive", "after_bounce", 3.0, False, True, 5)[0] == "drive"
    for kept in ("serve", "return", "lob", "overhead", "unclassified"):
        assert core_type(kept, "volley", 3.0, False, False, 5)[0] == kept


def test_a_serve_must_go_over_the_net_diagonally():
    from picklepro.court import COURT_WIDTH_M, NET_Y_M
    from picklepro.shots import _serve_direction
    near_left = (1.0, -0.3)
    assert _serve_direction(near_left, (COURT_WIDTH_M - 1.0, NET_Y_M + 4.0)) is True    # to far right
    assert _serve_direction(near_left, (1.0, NET_Y_M + 4.0)) is False                   # straight ahead
    assert _serve_direction(near_left, (COURT_WIDTH_M - 1.0, 3.0)) is False              # same side
    assert _serve_direction(near_left, None) is None


def test_reach_is_measured_from_the_wrist_when_body_points_exist():
    from picklepro.shots import _Point, _wrist_reach
    kps = [[0, 0, 0.0]] * 17
    kps[10] = [300.0, 200.0, 0.9]  # right wrist
    det = {"bbox": [100, 100, 200, 400], "keypoints": kps}
    ball = _Point(1.0, 330.0, 210.0, 215.0, 10.0)
    assert _wrist_reach(det, ball, 300.0) == 0.0           # within a paddle length of the wrist
    assert _wrist_reach({"bbox": det["bbox"]}, ball, 300.0) == float("inf")

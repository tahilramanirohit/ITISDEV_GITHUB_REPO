"""Choosing the real ball among per-frame candidates."""

from picklepro.ball_tracking import BallCandidate, track_ball

DT = 1 / 15


def _flight(t0, n, x0, y0, vx, vy, conf=0.6):
    return [BallCandidate(round(t0 + k * DT, 3), (int(x0 + vx * k * DT), int(y0 + vy * k * DT),
                                                    int(x0 + vx * k * DT) + 14, int(y0 + vy * k * DT) + 14), conf)
            for k in range(n)]


def _frames(*candidate_lists):
    by_time = {}
    for cands in candidate_lists:
        for c in cands:
            by_time.setdefault(c.time_s, []).append(c)
    return sorted(by_time.items())


def test_fixed_logo_is_removed_and_the_flight_is_kept():
    ball = _flight(0.0, 30, 200, 600, 900, -300)
    logo = [BallCandidate(c.time_s, (400, 220, 414, 234), 0.9) for c in ball]  # banner, more confident
    path, stats = track_ball(_frames(ball, logo), 1920)
    assert stats["static_removed"] == len(logo)
    assert [p.bbox for p in path] == [c.bbox for c in ball]


def test_isolated_false_detections_do_not_join_the_flight():
    ball = _flight(0.0, 20, 300, 500, 1200, -200)
    blips = [BallCandidate(round(k * 4 * DT, 3), (1500 + 37 * k, 100 + 53 * k, 1514 + 37 * k, 114 + 53 * k), 0.7)
             for k in range(5)]
    path, _ = track_ball(_frames(ball, blips), 1920)
    assert {p.bbox for p in path} == {c.bbox for c in ball}


def test_a_hit_that_reverses_the_ball_keeps_one_path():
    out = _flight(0.0, 12, 300, 700, 1500, -600)
    last = out[-1]
    back = _flight(last.time_s + DT, 12, last.bbox[0], last.bbox[1], -1400, 500)
    path, _ = track_ball(_frames(out, back), 1920)
    assert len(path) == len(out) + len(back)


def test_nothing_is_invented_when_the_ball_is_missing():
    ball = _flight(0.0, 10, 300, 500, 900, 0) + _flight(2.0, 10, 1200, 500, -900, 0)
    path, _ = track_ball(_frames(ball), 1920)
    times = [p.time_s for p in path]
    assert not any(0.6 < t < 2.0 for t in times)


def test_implausible_teleport_cannot_extend_a_flight():
    ball = [BallCandidate(t, (x, 500, x + 14, 514), 0.7)
            for t, x in [(0.0, 100), (0.1, 500), (0.2, 900)]]
    teleport = BallCandidate(0.3, (1600, 500, 1614, 514), 0.95)
    path, _ = track_ball(_frames(ball, [teleport]), 1920)
    assert [p.bbox for p in path] == [p.bbox for p in ball]


def test_a_ball_lying_on_the_floor_beside_the_court_is_dropped_and_a_high_ball_is_kept():
    import numpy as np
    from picklepro.court import LANDMARKS_M, calibrate
    from picklepro.fixtures import FRAME_SIZE, court_to_image_homography, project
    from picklepro.pipeline import _drop_balls_on_floor_off_court

    h = court_to_image_homography()
    cal = calibrate({n: tuple(project(h, [LANDMARKS_M[n]])[0]) for n in LANDMARKS_M}, FRAME_SIZE)
    # A ball lying 5 m outside the right sideline, drawn at the size a ball would have there.
    x, y = project(h, [(6.1 + 5.0, 4.0)])[0]
    a, b = project(h, [(6.1 + 5.0, 4.0), (6.1 + 5.0 + 0.074, 4.0)])
    size = max(2.0, float(np.hypot(*(b - a))))
    on_floor = BallCandidate(0.0, (int(x - size / 2), int(y - size), int(x + size / 2), int(y)), 0.8)
    # A ball far above the far court: small, high in the picture; its floor spot is far away.
    hx, hy = project(h, [(3.0, 13.0)])[0]
    high = BallCandidate(0.0, (int(hx - 4), int(hy - 90), int(hx + 4), int(hy - 82)), 0.8)
    kept, removed = _drop_balls_on_floor_off_court([(0.0, [on_floor, high])], [0.0], [cal])
    assert removed == 1 and kept[0][1] == [high]


def test_the_flight_of_this_courts_players_beats_a_stronger_one_on_the_next_court():
    ours = _flight(0.0, 20, 900, 500, 800, -200, conf=0.4)
    other = _flight(0.0, 25, 100, 300, 600, 100, conf=0.9)  # longer and more confident
    # Collide at the same moments so only one can be kept per time.
    other = [BallCandidate(o.time_s, o.bbox, o.confidence) for o in other if o.time_s in {c.time_s for c in ours}]
    near = lambda c: c.time_s == ours[0].time_s and c.bbox == ours[0].bbox  # the player hits it at the start
    path, stats = track_ball(_frames(ours, other), 1920)
    assert {p.bbox for p in path} == {c.bbox for c in other}
    path, stats = track_ball(_frames(ours, other), 1920, near_player=near)
    assert {p.bbox for p in path} == {c.bbox for c in ours}
    assert stats["flights_near_players"] == 1


def test_detailed_mode_looks_closer_only_when_the_ball_is_near_a_player_on_the_court():
    from picklepro.pipeline import _ball_near_court_players
    player = {"bbox": [900, 400, 960, 580]}
    near = BallCandidate(1.0, (975, 380, 985, 390), 0.5)     # beside the head
    far = BallCandidate(1.0, (300, 100, 310, 110), 0.5)
    assert _ball_near_court_players([far, near], [player], None)
    assert not _ball_near_court_players([far], [player], None)
    assert not _ball_near_court_players([near], [], None)

    class OffCourt:  # every foot point maps 10 m beside the court
        def image_to_court(self, pts):
            return [(-10.0, 5.0) for _ in pts]
    assert not _ball_near_court_players([near], [player], OffCourt())

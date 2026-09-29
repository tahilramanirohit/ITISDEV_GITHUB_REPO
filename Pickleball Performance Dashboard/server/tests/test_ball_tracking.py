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

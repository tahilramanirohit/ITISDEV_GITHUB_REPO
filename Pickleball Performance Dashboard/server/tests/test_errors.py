from types import SimpleNamespace as NS

import pytest

from picklepro.errors import AFTER_RETURN_S, count_errors, positioning_errors, shot_errors
from picklepro.players import _limit_per_side
from picklepro.worker.runner import WorkerConfig, options_from_params

# Court coordinates: x across (0-6.1 m), y from the near baseline (0) to the far baseline (13.41 m); the net is at 6.705 m.


def shot(t, kind="drive", landed_in=None, pid=1, side="near", contact="after_bounce", feet=None, number=3, rally=0):
    return NS(time_seconds=t, public_shot_type=kind, shot_type=kind, landed_in=landed_in, hitter_track_id=pid, hitter_side=side,
              contact=contact, hitter_court_m=feet, shot_number=number, rally_index=rally)


def test_serve_faults_shots_out_and_kitchen_faults():
    events = shot_errors([
        shot(1.0, "serve", landed_in=False, number=1),
        shot(2.0, "serve", landed_in=True, number=1),
        shot(3.0, "drive", landed_in=False),
        shot(4.0, "drop", landed_in=None),                                   # no bounce seen: not counted
        shot(5.0, "volley", contact="volley", feet=[3.0, 5.6]),              # 1.1 m from the net: inside the kitchen
        shot(6.0, "volley", contact="volley", feet=[3.0, 4.5]),              # 2.2 m from the net: behind the line
        shot(7.0, "volley", contact="volley", feet=[3.0, 8.0], side="far"),  # far side, 1.3 m from the net
    ])
    assert [(e["time_seconds"], e["kind"]) for e in events] == [
        (1.0, "serve_fault"), (3.0, "out"), (5.0, "kitchen_fault"), (7.0, "kitchen_fault")]


def test_no_mans_land_needs_a_long_stay_inside_a_rally():
    step = 0.1
    # Player 1 stands 4 m from the net (transition) for 3 s, then moves to the kitchen line.
    stay = [(round(i * step, 2), (3.0, 6.705 - 4.0)) for i in range(30)]
    move = [(round(3.0 + i * step, 2), (3.0, 6.705 - 2.3)) for i in range(10)]
    # Player 2 passes through the transition zone for only 1 s.
    passing = [(round(i * step, 2), (3.0, 6.705 + 4.0)) for i in range(10)] + [(round(1.0 + i * step, 2), (3.0, 6.705 + 2.3)) for i in range(30)]
    events = positioning_errors({1: stay + move, 2: passing}, {1: "near", 2: "far"}, [(0.0, 5.0, 0)], [], step)
    assert [(e["kind"], e["player_id"]) for e in events] == [("no_mans_land", 1)]
    assert events[0]["detail"].startswith("3.0 s")
    # Outside every rally, the same stay is not an error.
    assert positioning_errors({1: stay}, {1: "near"}, [(10.0, 20.0, 1)], [], step) == []


def test_lost_tracking_ends_a_stay():
    step = 0.1
    samples = [(round(i * step, 2), (3.0, 6.705 - 4.0)) for i in range(15)] + \
              [(round(5.0 + i * step, 2), (3.0, 6.705 - 4.0)) for i in range(15)]
    assert positioning_errors({1: samples}, {1: "near"}, [(0.0, 7.0, 0)], [], step) == []


def test_stayed_back_after_the_return():
    step = 0.1
    ret = shot(10.0, "return", number=2, pid=2, side="far")
    back = [(round(10.0 + i * step, 2), (3.0, 12.5)) for i in range(40)]           # stays near the far baseline
    moved = [(round(10.0 + i * step, 2), (3.0, 12.5 - i * 0.2)) for i in range(40)]  # walks up to the kitchen
    assert [e["kind"] for e in positioning_errors({2: back}, {2: "far"}, [], [ret], step)] == ["stayed_back"]
    assert positioning_errors({2: moved}, {2: "far"}, [], [ret], step) == []
    assert AFTER_RETURN_S == 2.5


def test_counts_per_player_include_players_without_errors():
    events = shot_errors([shot(1.0, "serve", landed_in=False, number=1, pid=1), shot(2.0, "drive", landed_in=False, pid=3)])
    value = count_errors(events, [(1, "near"), (2, "near")])
    assert value["counts"]["serve_fault"] == 1 and value["counts"]["out"] == 1
    assert [(p["player_id"], p["counts"]["serve_fault"], p["counts"]["out"]) for p in value["players"]] == [(1, 1, 0), (2, 0, 0)]
    assert [e["time_seconds"] for e in value["events"]] == [1.0, 2.0]


def _summary(frames, side="near"):
    piece = NS(segment=0, frames=list(range(frames)), start=0.0, mean_hist=lambda: None)
    return (True, side, (3.0, 2.0), [piece])


def test_singles_keeps_one_player_per_side():
    groups = [_summary(100), _summary(80), _summary(60, "far"), _summary(40, "far")]
    on_court = lambda out: sum(1 for s in out if s[0])  # noqa: E731
    assert on_court(_limit_per_side(groups, 2)) == 4
    assert on_court(_limit_per_side(groups, 1)) == 2


def test_worker_reads_the_player_count():
    cfg = WorkerConfig(worker_id="t")
    assert options_from_params({"players_on_court": 2}, cfg, None).players_on_court == 2
    assert options_from_params({}, cfg, None).players_on_court is None
    for bad in (3, True, "4"):
        with pytest.raises(ValueError):
            options_from_params({"players_on_court": bad}, cfg, None)

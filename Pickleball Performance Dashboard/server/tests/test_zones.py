"""Zone time (F01, F02, F12) and the estimates used when a player cannot be seen."""

from types import SimpleNamespace

import numpy as np
import pytest

from picklepro.court import COURT_LENGTH_M, COURT_WIDTH_M, NET_Y_M, CourtCalibration
from picklepro.zones import _Camera, _fill, on_kitchen_line, zone_of, zone_time

W, H = 1920, 1080


def _camera(centre=(COURT_WIDTH_M / 2, -2.0, 2.2), target=(COURT_WIDTH_M / 2, 9.0, 0.0), f=1100.0):
    c = np.array(centre, float)
    d = np.array(target, float) - c
    d /= np.linalg.norm(d)
    right = np.cross(d, [0, 0, 1.0])
    right /= np.linalg.norm(right)
    down = np.cross(d, right)
    rot = np.stack([right, down, d])
    t = -rot @ c
    k = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1.0]])
    court_to_img = k @ np.stack([rot[:, 0], rot[:, 1], t], axis=1)

    def project(p):
        q = k @ (rot @ np.asarray(p, float) + t)
        return q[0] / q[2], q[1] / q[2]
    cal = CourtCalibration(np.linalg.inv(court_to_img), [], (W, H), 0.0, 0.0)
    return cal, project


def test_zones_follow_the_metric_dictionary_for_both_sides():
    near_y = lambda d: NET_Y_M - d  # distance d from the net, near side
    far_y = lambda d: NET_Y_M + d
    assert zone_of((3, near_y(1.0)), "near") == "kitchen"
    assert zone_of((3, near_y(2.5)), "near") == "transition" and on_kitchen_line((3, near_y(2.5)), "near")
    assert not on_kitchen_line((3, near_y(3.5)), "near")
    assert zone_of((3, near_y(6.0)), "near") == "baseline"
    assert zone_of((3, near_y(7.0)), "near") == "outside"          # behind the baseline
    assert zone_of((-0.5, near_y(3.0)), "near") == "outside"       # beyond a sideline
    assert zone_of((3, far_y(1.0)), "far") == "kitchen"
    assert zone_of((3, far_y(6.0)), "far") == "baseline"
    assert zone_of((3, near_y(-0.2)), "near") == "kitchen"         # a foot point just past the net


def test_feet_below_the_picture_are_placed_from_the_head():
    cal, project = _camera()
    x, y = 2.0, 0.5
    feet, head = project((x, y, 0.0)), project((x, y, 1.7))
    assert feet[1] > H and 0 < head[1] < H, "the test needs the feet cut off and the head visible"
    est = _Camera(cal).feet_from_head(head[0], head[1], H)
    assert est is not None and abs(est[0] - x) < 0.15 and abs(est[1] - y) < 0.15


def test_gaps_are_filled_and_marked_as_estimates():
    s = [(0.0, (1.0, 1.0), "observed"), (0.1, (1.0, 1.0), "observed"), (4.1, (3.0, 1.0), "observed")]
    grid = [0.0, 0.1, 2.1, 4.1, 6.0, 7.5]
    out = _fill(s, grid)
    assert out[0] == ((1.0, 1.0), "observed")
    assert out[2][1] == "estimated" and abs(out[2][0][0] - 2.0) < 1e-6   # halfway through the gap
    assert out[4] == ((3.0, 1.0), "estimated")                            # held after the last sighting
    assert out[5] is None                                                 # longer than the hold


def test_zone_time_reports_observed_and_estimated_time_per_player():
    cal, _ = _camera()
    img = np.linalg.inv(cal.homography)

    def box_at(x, y):
        p = img @ np.array([x, y, 1.0])
        u, v = p[0] / p[2], p[1] / p[2]
        return [int(u - 20), int(v - 150), int(u + 20), int(v)]
    times = [i * 0.1 for i in range(50)]
    per_frame = [[{"track_id": 1, "bbox": box_at(3.0, NET_Y_M - 2.5)}] if i < 30 else [] for i in range(50)]
    players = [SimpleNamespace(player_id=1, on_court=True, side="near"),
               SimpleNamespace(player_id=9, on_court=False, side="near")]
    (row,) = zone_time(times, per_frame, [cal] * 50, H, 0.1, players)
    assert row["zone_share"]["transition"] == 1.0 and row["kitchen_line_share"] == 1.0
    assert row["observed_s"] == pytest.approx(3.0) and row["estimated_s"] == pytest.approx(2.0)
    assert row["coverage"] == pytest.approx(0.6) and row["unknown_s"] == 0.0
    assert abs(sum(row["zone_share"].values()) - 1.0) < 1e-6


def test_a_person_seen_only_briefly_gets_no_zone_time():
    cal, _ = _camera()
    img = np.linalg.inv(cal.homography)
    p = img @ np.array([3.0, NET_Y_M - 2.5, 1.0])
    u, v = p[0] / p[2], p[1] / p[2]
    box = [int(u - 20), int(v - 150), int(u + 20), int(v)]
    times = [i * 0.1 for i in range(100)]
    per_frame = [[{"track_id": 3, "bbox": box}] if i < 5 else [] for i in range(100)]
    players = [SimpleNamespace(player_id=3, on_court=True, side="near")]
    assert zone_time(times, per_frame, [cal] * 100, H, 0.1, players) == []

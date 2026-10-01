"""Grouping tracker pieces into players and setting aside people off the court."""

import numpy as np

from picklepro.court import calibration_from_dict
from picklepro.players import PlayerCollector


def _frame(colours):
    """A 720p frame with each (box, BGR colour) painted in."""
    frame = np.full((720, 1280, 3), 90, np.uint8)
    for (x1, y1, x2, y2), bgr in colours:
        frame[y1:y2, x1:x2] = bgr
    return frame


def test_pieces_of_one_player_are_joined_and_a_spectator_is_set_aside(synthetic_clip):
    cal = calibration_from_dict(synthetic_clip.calibration)
    court = cal.homography
    inv = np.linalg.inv(court)

    def box_at(x_m, y_m, h=160):
        p = inv @ np.array([x_m, y_m, 1.0])
        u, v = p[0] / p[2], p[1] / p[2]
        return [int(u - h * 0.2), int(v - h), int(u + h * 0.2), int(v)]

    collector = PlayerCollector()
    red, blue, grey = (40, 40, 200), (200, 60, 40), (60, 60, 60)
    for k in range(60):
        t = k / 10
        me = box_at(2.0 + 0.02 * k, 3.0)
        partner = box_at(4.6, 3.2)
        spectator = box_at(-4.0, 5.0)
        dets = [
            # The tracker loses "me" for a moment at t=3 s and gives a new ID afterwards.
            {"track_id": 1 if k < 30 else 7, "bbox": me, "confidence": 0.9},
            {"track_id": 2, "bbox": partner, "confidence": 0.9},
            {"track_id": 3, "bbox": spectator, "confidence": 0.9},
        ]
        if k == 30:
            dets = dets[1:]
        collector.observe(k, t, _frame([(me, red), (partner, blue), (spectator, grey)]), dets,
                          calibration_from_dict(synthetic_clip.calibration))
    players, mapping = collector.group()
    assert mapping[1] == mapping[7], "one player split by the tracker is joined back"
    assert mapping[1] != mapping[2]
    on = [p for p in players if p.on_court]
    assert len(on) == 2 and all(p.thumbnail and p.thumbnail.startswith("data:image/jpeg;base64,") for p in on)
    off = [p for p in players if not p.on_court]
    assert [p.player_id for p in off] == [mapping[3]]

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


def test_a_side_never_has_more_than_two_players(synthetic_clip):
    cal = calibration_from_dict(synthetic_clip.calibration)
    inv = np.linalg.inv(cal.homography)

    def box_at(x_m, y_m, h=160):
        p = inv @ np.array([x_m, y_m, 1.0])
        u, v = p[0] / p[2], p[1] / p[2]
        return [int(u - h * 0.2), int(v - h), int(u + h * 0.2), int(v)]

    collector = PlayerCollector()
    red, dark_red, blue, green = (40, 40, 200), (20, 20, 110), (200, 60, 40), (40, 200, 40)
    for k in range(80):
        t = k / 10
        me, partner, extra = box_at(2.0, 3.0), box_at(4.6, 3.2), box_at(3.3, 2.0)
        # "Me" is seen in shade after 4 s under a new tracker ID: too different to join by colour alone.
        me_id, me_colour = (1, red) if k < 40 else (5, dark_red)
        dets = [{"track_id": me_id, "bbox": me, "confidence": 0.9},
                {"track_id": 2, "bbox": partner, "confidence": 0.9}]
        paint = [(me, me_colour), (partner, blue)]
        if 20 <= k < 30:  # someone else steps onto the near court while both players are there
            dets.append({"track_id": 9, "bbox": extra, "confidence": 0.9})
            paint.append((extra, green))
        collector.observe(k, t, _frame(paint), dets, cal)
    players, mapping = collector.group()
    near = [p for p in players if p.on_court and p.side == "near"]
    assert len(near) == 2
    assert mapping[1] == mapping[5], "the extra near-side piece is the same player seen again"
    assert not next(p for p in players if p.player_id == mapping[9]).on_court

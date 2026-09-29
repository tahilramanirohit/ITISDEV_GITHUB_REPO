"""Ball track cleaning, contact/bounce events, rallies and shot rules on hand-built
ball paths with known answers (not evidence of accuracy on real footage)."""

import numpy as np
import pytest

from picklepro.ball_track import MAX_INTERPOLATION_S, BallObservation, build_ball_track
from picklepro.shots import (
    CLASS_DEFINITIONS, SHOT_CLASSES, PlayerFrame, classify_shots, detect_events, segment_rallies, summarize,
)

FPS = 30.0
DT = 1 / FPS
H = 360
NEAR_BOX = [270, 200, 340, 340]   # camera behind the near baseline: near player low and large
FAR_BOX = [300, 50, 345, 115]


def path(*legs):
    """legs: (t0, t1, (x0, y0), (x1, y1)) straight segments sampled at FPS."""
    obs = []
    for t0, t1, a, b in legs:
        n = int(round((t1 - t0) * FPS))
        for i in range(n):
            f = i / n
            obs.append(BallObservation(t0 + i * DT, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.9))
    return obs


def players(t_end, near=NEAR_BOX, far=FAR_BOX):
    return [PlayerFrame(t, [{"track_id": 1, "bbox": list(near)}, {"track_id": 2, "bbox": list(far)}])
            for t in np.arange(0, t_end, 0.1)]


def run(obs, t_end, near=NEAR_BOX, far=FAR_BOX):
    track = build_ball_track(obs, H, DT)
    events = detect_events(track, players(t_end, near, far))
    rallies = segment_rallies(track, events, 0.0, t_end)
    return track, events, rallies, classify_shots(track, rallies, events)


def classes(shots):
    return [(s.contact.side, s.shot_class) for s in shots]


def test_isolated_and_stationary_detections_are_dropped():
    moving = path((1.0, 2.0, (300, 280), (320, 120)))
    isolated = [BallObservation(5.0, 50, 50)]
    resting = [BallObservation(6.0 + i * DT, 600, 340) for i in range(30)]
    track = build_ball_track(moving + isolated + resting, H, DT)
    assert track.rejected == 1
    assert track.stationary == 30
    assert len(track.observations) == len(moving)


def test_only_short_gaps_are_interpolated_and_flagged():
    full = path((1.0, 2.0, (300, 280), (320, 120)))
    short_gap = full[:10] + full[13:]          # 3 missing samples = 0.100 s (the limit)
    long_gap = full[:10] + full[14:]           # 4 missing samples = 0.133 s
    t_short = build_ball_track(short_gap, H, DT)
    assert sum(not s.observed for s in t_short.samples) == 3
    t_long = build_ball_track(long_gap, H, DT)
    assert all(s.observed for s in t_long.samples)
    assert 4 * DT > MAX_INTERPOLATION_S


def serve_return_rally():
    return path(
        (2.0, 3.0, (300, 280), (320, 100)),    # near player serves: ball leaves up the image
        (3.0, 4.2, (320, 100), (310, 270)),    # far player returns: ball comes down the image
        (4.2, 5.2, (310, 270), (325, 95)),     # near player hits back
        (5.2, 6.2, (325, 95), (300, 300)),     # far player hits back; rally then ends
    )


def test_serve_return_and_volleys_in_an_observed_rally():
    track, events, rallies, shots = run(serve_return_rally(), 9.0)
    assert len(rallies) == 1 and rallies[0].complete
    assert classes(shots) == [("near", "serve"), ("far", "return"), ("near", "volley"), ("far", "volley")]
    assert shots[0].evidence == "weak"            # no court calibration to check the baseline
    assert all(s.contact.side_source == "ball_direction" for s in shots)


def test_a_rally_cut_by_the_clip_start_has_no_serve():
    obs = [o for o in serve_return_rally() if o.t >= 2.6]
    _, _, rallies, shots = run([BallObservation(o.t - 2.0, o.x, o.y) for o in obs], 7.0)
    assert not rallies[0].complete
    assert "serve" not in [s.shot_class for s in shots]
    assert "return" not in [s.shot_class for s in shots]


def test_a_bounce_before_the_hit_prevents_a_volley():
    obs = path(
        (2.0, 3.0, (300, 280), (320, 100)),
        (3.0, 3.8, (320, 100), (315, 200)),    # far return comes down ...
        (3.8, 4.0, (315, 200), (313, 185)),    # ... bounces away from any player (rises in the image)
        (4.0, 4.4, (313, 185), (310, 270)),
        (4.4, 5.4, (310, 270), (325, 95)),     # near player's third shot
        (5.4, 6.4, (325, 95), (300, 300)),
    )
    _, events, _, shots = run(obs, 9.0)
    assert any(e.kind == "bounce" and 3.6 < e.t < 4.1 for e in events)
    third = next(s for s in shots if 4.2 < s.contact.t < 4.6)
    assert third.shot_class != "volley"


def test_ball_above_the_head_is_an_overhead():
    obs = path(
        (2.0, 3.0, (300, 280), (320, 100)),
        (3.0, 4.2, (320, 100), (305, 185)),    # far return arrives above the near player's head
        (4.2, 5.2, (305, 185), (325, 95)),     # near player hits it from above the box top
        (5.2, 6.2, (325, 95), (300, 300)),
    )
    _, _, _, shots = run(obs, 9.0)
    assert ("near", "overhead") in classes(shots)


def test_high_long_ball_is_a_lob_and_fast_flat_ball_is_a_drive():
    lob = path(
        (2.0, 3.0, (300, 280), (320, 100)),
        (3.0, 4.2, (320, 100), (310, 270)),
        (4.2, 4.9, (310, 270), (250, 20)),     # near player lifts the ball high (not beside the
        (4.9, 5.6, (250, 20), (300, 90)),      # far player's head) and it drops towards them
        (5.6, 6.6, (300, 90), (300, 300)),
    )
    shots = run(lob, 9.0)[3]
    lob_shot = next(s for s in shots if 4.1 < s.contact.t < 4.4)
    # Continuous observation since the return makes it a volley first (precedence);
    # remove the ball evidence of the incoming flight to test the lob rule itself.
    assert lob_shot.shot_class in ("volley", "lob")
    gappy = [o for o in lob if not 3.2 < o.t < 3.9]
    lob_shot = next(s for s in run(gappy, 9.0)[3] if 4.1 < s.contact.t < 4.4)
    assert lob_shot.shot_class == "lob"
    assert lob_shot.arc >= 0.6

    drive = path(
        (2.0, 3.0, (300, 280), (320, 100)),
        (3.0, 3.2, (320, 100), (318, 130)),
        (3.9, 4.2, (315, 220), (310, 270)),    # incoming ball partly unobserved
        (4.2, 4.45, (310, 270), (330, 60)),    # 840 px/s = 6 box heights / s, straight
        (4.45, 5.4, (330, 60), (300, 300)),
    )
    drive_shot = next(s for s in run(drive, 9.0)[3] if 4.1 < s.contact.t < 4.4)
    assert drive_shot.shot_class == "drive"
    assert drive_shot.speed_ph >= 5


def test_no_player_nearby_means_no_contact():
    obs = serve_return_rally()
    track = build_ball_track(obs, H, DT)
    events = detect_events(track, [])
    assert not [e for e in events if e.kind == "contact"]
    assert segment_rallies(track, events, 0.0, 9.0) == []


def test_summary_counts_every_class_and_shares_sum_to_one():
    shots = run(serve_return_rally(), 9.0)[3]
    summary = summarize(shots)
    assert set(summary["counts"]) == set(SHOT_CLASSES) == set(CLASS_DEFINITIONS)
    assert sum(summary["counts"].values()) == len(shots)
    assert sum(summary["shares"].values()) == pytest.approx(1.0)


def _result_with(contacts):
    return {"metrics": {"shot_classification": {"value": {"contacts": [
        {"time_seconds": t, "side": side, "shot_class": cls} for t, side, cls in contacts]}}}}


def test_evaluation_matches_contacts_one_to_one_and_reports_small_classes(tmp_path):
    from picklepro.shot_eval import evaluate, read_labels

    labels_csv = tmp_path / "labels.csv"
    labels_csv.write_text("time_seconds,side,shot_class,notes\n"
                          "1.00,near,serve,\n2.00,far,return,\n3.00,near,drive,\n4.00,far,dink,\n")
    labels = read_labels(labels_csv)
    result = _result_with([(1.05, "near", "serve"), (1.10, "near", "drive"),   # duplicate near one label
                           (2.15, "near", "return"), (3.50, "near", "drive")])  # 3.50 is outside the window
    report = evaluate(result, labels, window_s=0.2, min_support=1)
    assert report["contacts"]["matched"] == 2
    assert report["contacts"]["precision"] == 0.5
    assert report["contacts"]["recall"] == 0.5
    assert report["side_accuracy"] == 0.5
    assert report["per_class"]["serve"]["f1"] == 1.0
    small = evaluate(result, labels, min_support=20)
    assert small["macro_f1"] is None and set(small["insufficient_evidence"]) == {"serve", "return"}


def test_labels_with_unknown_classes_are_rejected(tmp_path):
    from picklepro.shot_eval import read_labels

    bad = tmp_path / "labels.csv"
    bad.write_text("time_seconds,side,shot_class\n1.0,near,smash\n")
    with pytest.raises(ValueError, match="smash"):
        read_labels(bad)

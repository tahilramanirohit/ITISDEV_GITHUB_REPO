"""Scoring detected shots against hand labels."""

from picklepro.evaluate import evaluate


def _result(*shots):
    return {"metrics": {"shot_classification": {"value": {"shots": [
        {"time_seconds": t, "hitter_track_id": p, "shot_type": k} for t, p, k in shots]}}}}


def test_whole_second_labels_match_anywhere_in_that_second():
    labels = {"time_resolution_s": 1.0, "shots": [{"t": 18, "player": 2, "type": "drop"}]}
    report = evaluate(_result((18.9, 2, "drop")), labels)
    assert report["recall"] == 1.0 and report["type_accuracy"] == 1.0


def test_frame_precise_labels_need_a_close_detection():
    labels = {"time_resolution_s": 0.1, "shots": [{"t": 18.4, "player": 2, "type": "drop"},
                                                  {"t": 20.0, "player": 1, "type": "dink", "resolution_s": 1}]}
    report = evaluate(_result((18.9, 2, "drop"), (20.8, 1, "volley")), labels)
    assert report["matched"] == 1  # 18.9 is 0.5 s from 18.4; 20.8 is inside the whole-second label
    assert report["wrong_types"] == {"dink -> volley": 1}


def test_detections_at_not_a_shot_moments_are_counted():
    labels = {"time_resolution_s": 0.1, "shots": [{"t": 3.0, "player": 4, "type": "not_a_shot"}]}
    assert evaluate(_result((3.2, 4, "drive")), labels)["detections_at_not_a_shot_moments"] == 1

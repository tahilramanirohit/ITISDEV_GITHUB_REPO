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


def test_human_identity_mapping_is_explicit_and_cannot_bias_time_matching():
    labels = {"identity_scheme": "human", "tracker_mapping": {"1": 8}, "time_resolution_s": 0.1,
              "shots": [{"t": 1.0, "player": 1, "type": "drive"},
                        {"t": 2.0, "player": 2, "type": "dink"}]}
    report = evaluate(_result((1.02, 9, "drive"), (1.12, 8, "drive"), (2.0, 2, "dink")), labels)
    assert report["matched"] == 2
    assert report["hitter_labels_scored"] == 1
    assert report["hitter_accuracy"] == 0.0


def test_duplicate_human_mapping_is_rejected():
    import pytest

    labels = {"identity_scheme": "human", "tracker_mapping": {"1": 8, "2": 8}, "shots": []}
    with pytest.raises(ValueError, match="different tracker"):
        evaluate(_result(), labels)


def test_finer_labels_accept_the_core_type_they_are_reported_as():
    labels = {"time_resolution_s": 0.1, "shots": [
        {"t": 1.0, "player": 1, "type": "counter"}, {"t": 2.0, "player": 1, "type": "reset"},
        {"t": 3.0, "player": 1, "type": "speed_up"}, {"t": 4.0, "player": 1, "type": "reset"}]}
    report = evaluate(_result((1.0, 1, "volley"), (2.0, 1, "drop"), (3.0, 1, "drive"), (4.0, 1, "lob")), labels)
    assert report["type_accuracy"] == 0.75
    assert report["wrong_types"] == {"reset -> lob": 1}

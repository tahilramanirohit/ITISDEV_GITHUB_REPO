"""Frame-precise ball evaluation counts only the frames humans actually label."""

import pytest

from picklepro.evaluate_ball import evaluate_ball


def _result():
    return {"video": {"width": 1000, "height": 500, "fps": 30},
            "coverage": {"ball_sample_stride": 2},
            "ball_positions": [
                {"time_seconds": 0.0, "bbox": [90, 90, 110, 110]},
                {"time_seconds": 0.2, "bbox": [390, 90, 410, 110]},
                {"time_seconds": 0.3, "bbox": [690, 90, 710, 110]},
                {"time_seconds": 2.0, "bbox": [10, 10, 30, 30]},
            ]}


def test_ball_evaluation_scores_positions_absence_and_unlabelled_frames():
    labels = {"image_width": 500, "image_height": 250, "frames": [
        {"time_seconds": 0.0, "visible": True, "x": 50, "y": 50},
        {"time_seconds": 0.1, "visible": True, "x": 100, "y": 50},
        {"time_seconds": 0.2, "visible": True, "x": 250, "y": 50},
        {"time_seconds": 0.3, "visible": False},
        {"time_seconds": 0.4, "visible": False},
    ]}
    out = evaluate_ball(_result(), labels)
    assert (out["true_positives"], out["false_positives"], out["false_negatives"]) == (1, 2, 2)
    assert out["precision"] == pytest.approx(1 / 3, abs=0.001)
    assert out["recall"] == pytest.approx(1 / 3, abs=0.001)
    assert [r["outcome"] for r in out["rows"]] == [
        "matched", "missed", "wrong_location", "false_detection", "correct_absence"]
    # The prediction at 2 s is outside labelled frames and cannot lower precision.
    assert out["median_error_px"] == 0.0


def test_ball_evaluation_rejects_duplicate_or_unusable_labels():
    with pytest.raises(ValueError, match="unique"):
        evaluate_ball(_result(), {"frames": [
            {"time_seconds": 0.0, "visible": False}, {"time_seconds": 0.0, "visible": False}]})
    with pytest.raises(ValueError, match="boolean"):
        evaluate_ball(_result(), {"frames": [{"time_seconds": 0.0, "visible": "yes"}]})

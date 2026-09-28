"""Ball observations are model boxes, never inferred shot metrics."""

from types import SimpleNamespace

import numpy as np

from picklepro.ball_detection import BallDetector
from picklepro.court import calibration_from_dict
from picklepro.pipeline import AnalysisOptions, analyze_video
from picklepro.spatial import Selection


class FakeBallModel:
    names = {0: "person", 1: "pickleball", 2: "paddle"}

    def predict(self, _frame, **kwargs):
        assert kwargs["classes"] == [1]
        boxes = [
            SimpleNamespace(xyxy=np.asarray([[100, 80, 110, 90]]), conf=[0.8]),
            SimpleNamespace(xyxy=np.asarray([[200, 90, 210, 100]]), conf=[0.3]),
        ]
        return [SimpleNamespace(boxes=boxes)]


def test_custom_model_reports_highest_scored_ball_box():
    detector = BallDetector("operator-weights.pt", model=FakeBallModel())
    assert detector.detect(np.zeros((120, 300, 3), dtype=np.uint8)) == {
        "bbox": [100, 80, 110, 90], "confidence": 0.8,
    }


def test_pipeline_records_ball_observations_without_claiming_shots(synthetic_clip, monkeypatch):
    monkeypatch.setattr("picklepro.pipeline.BallDetector", lambda _weights:
                        BallDetector("operator-weights.pt", model=FakeBallModel()))
    result = analyze_video(synthetic_clip.path, AnalysisOptions(
        ball_weights="operator-weights.pt", selection=Selection("court_half", court_half="near"),
        compute_sha256=False, max_seconds=1))
    assert result.provenance.ball_detector.name == "ultralytics-yolo-ball"
    assert result.coverage.frames_with_ball_detections == len(result.ball_positions) > 0
    assert result.ball_positions[0].bbox == [100, 80, 110, 90]
    assert result.metrics.shot_classification.status == "not_computed"
    assert result.metrics.rally_segmentation.status == "not_computed"


def test_court_player_and_ball_paths_produce_one_honest_result(synthetic_clip, monkeypatch):
    monkeypatch.setattr("picklepro.pipeline.BallDetector", lambda _weights:
                        BallDetector("operator-weights.pt", model=FakeBallModel()))
    monkeypatch.setattr("picklepro.pipeline.detect_court", lambda *_args, **_kwargs:
                        calibration_from_dict(synthetic_clip.calibration))
    result = analyze_video(synthetic_clip.path, AnalysisOptions(
        court_weights="court.pt", ball_weights="object.pt",
        selection=Selection("court_half", court_half="near"), compute_sha256=False))
    assert result.status == "ok"
    assert result.calibration.method == "auto_model_landmarks"
    assert result.coverage.frames_with_detections > 0
    assert result.coverage.frames_with_ball_detections > 0
    assert result.metrics.court_heatmap.status == "measured"

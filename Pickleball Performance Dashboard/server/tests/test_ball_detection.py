"""Ball observations are model boxes, never inferred shot metrics."""

from types import SimpleNamespace

import numpy as np

from picklepro.ball_detection import BallDetector
from picklepro.court import calibration_from_dict
from picklepro.pipeline import AnalysisOptions, analyze_video
from picklepro.spatial import Selection


class FakeBallModel:
    """A ball flying across the frame, plus a fixed ball-like logo that never moves."""
    names = {0: "person", 1: "pickleball", 2: "paddle"}

    def __init__(self):
        self.calls = 0

    def predict(self, _frame, **kwargs):
        assert kwargs["classes"] == [1]
        x = 100 + 12 * self.calls
        self.calls += 1
        boxes = [
            SimpleNamespace(xyxy=np.asarray([[x, 80, x + 10, 90]]), conf=[0.8]),
            SimpleNamespace(xyxy=np.asarray([[200, 190, 210, 200]]), conf=[0.3]),
        ]
        return [SimpleNamespace(boxes=boxes)]


def test_custom_model_reports_ball_candidates_most_confident_first():
    detector = BallDetector("operator-weights.pt", model=FakeBallModel())
    frame = np.zeros((120, 300, 3), dtype=np.uint8)
    assert detector.candidates(frame) == [
        {"bbox": [100, 80, 110, 90], "confidence": 0.8},
        {"bbox": [200, 190, 210, 200], "confidence": 0.3},
    ]
    assert detector.detect(frame) == {"bbox": [112, 80, 122, 90], "confidence": 0.8}


def test_too_few_ball_frames_do_not_produce_shots(synthetic_clip, monkeypatch):
    monkeypatch.setattr("picklepro.pipeline.BallDetector", lambda _weights:
                        BallDetector("operator-weights.pt", model=FakeBallModel()))
    result = analyze_video(synthetic_clip.path, AnalysisOptions(
        ball_weights="operator-weights.pt", selection=Selection("court_half", court_half="near"),
        compute_sha256=False, max_seconds=1))
    assert result.provenance.ball_detector.name == "ultralytics-yolo-ball"
    assert result.coverage.frames_with_ball_detections == len(result.ball_positions) > 0
    # Only the moving ball is kept; the fixed logo at x=200..210, y=190 is scenery.
    assert all(b.bbox[1] == 80 for b in result.ball_positions)
    assert result.ball_positions[0].bbox == [100, 80, 110, 90]
    # One second of sampled frames is too little ball flight to claim any shot.
    assert result.metrics.shot_classification.status == "insufficient_data"
    assert result.metrics.shot_classification.value is None
    assert result.metrics.rally_segmentation.status == "insufficient_data"


def test_court_player_and_ball_paths_produce_one_honest_result(synthetic_clip, monkeypatch):
    monkeypatch.setattr("picklepro.pipeline.BallDetector", lambda _weights:
                        BallDetector("operator-weights.pt", model=FakeBallModel()))
    class FakeCourtDetector:
        def __init__(self, _weights):
            pass

        def calibrate_frame(self, _frame):
            return calibration_from_dict(synthetic_clip.calibration)

    monkeypatch.setattr("picklepro.pipeline.CourtPoseDetector", FakeCourtDetector)
    result = analyze_video(synthetic_clip.path, AnalysisOptions(
        court_weights="court.pt", ball_weights="object.pt",
        selection=Selection("court_half", court_half="near"), compute_sha256=False))
    assert result.status == "ok"
    assert result.calibration.method == "auto_model_landmarks"
    assert result.coverage.frames_with_detections > 0
    assert result.coverage.frames_with_ball_detections > 0
    assert result.metrics.court_heatmap.status == "measured"

"""Synthetic geometry checks for the optional court-model adapter.

These do not establish accuracy on real match footage or validate any weights.
"""

from types import SimpleNamespace

import numpy as np

from picklepro.auto_court import MODEL_LANDMARKS, calibration_from_pose, detect_court
from picklepro.court import LANDMARKS_M, calibration_from_dict
from picklepro.fixtures import court_to_image_homography, project
from picklepro.pipeline import AnalysisOptions, analyze_video
from picklepro.spatial import Selection
from picklepro.video_io import probe


def _pose(score=0.95):
    pixels = project(court_to_image_homography(), [LANDMARKS_M[name] for name in MODEL_LANDMARKS])
    return np.column_stack((pixels, np.full(len(pixels), score)))


def _result(pose):
    return SimpleNamespace(keypoints=SimpleNamespace(data=np.asarray(pose)[None, ...]))


def test_pose_recovers_court_and_rejects_one_bad_keypoint():
    pose = _pose()
    pose[4, :2] += (90, -45)
    cal = calibration_from_pose(_result(pose), (960, 540))
    assert cal is not None
    assert "far_left_kitchen" not in cal.landmarks_used
    assert cal.quality == "good"
    pixel = project(court_to_image_homography(), [(2.0, 3.0)])[0]
    assert np.allclose(cal.image_to_court([tuple(pixel)])[0], (2.0, 3.0), atol=0.15)


def test_sparse_or_low_confidence_pose_does_not_invent_calibration():
    pose = _pose()
    pose[5:, 2] = 0.1
    assert calibration_from_pose(_result(pose), (960, 540)) is None


def test_video_analysis_uses_detected_court_without_manual_json(synthetic_clip, monkeypatch):
    class FakeCourtModel:
        def predict(self, _frame, verbose=False):
            return [_result(_pose())]

    import picklepro.auto_court as auto_court
    real_detect = auto_court.detect_court
    monkeypatch.setattr("picklepro.pipeline.detect_court", lambda path, props, weights, seconds_to_scan:
                        real_detect(path, props, weights, model=FakeCourtModel(), seconds_to_scan=seconds_to_scan))
    result = analyze_video(synthetic_clip.path, AnalysisOptions(
        court_weights="supplied-by-operator.pt", selection=Selection("court_half", court_half="near"),
        compute_sha256=False))
    assert result.status == "ok"
    assert result.calibration.method == "auto_model_landmarks"
    assert result.metrics.court_heatmap.status == "measured"
    assert result.player_selection.tracked_fraction > 0.8


def test_detection_returns_none_when_model_sees_no_court(synthetic_clip):
    class EmptyCourtModel:
        def predict(self, _frame, verbose=False):
            return []

    assert detect_court(synthetic_clip.path, probe(synthetic_clip.path), "unused.pt",
                        model=EmptyCourtModel()) is None


def test_manual_calibration_takes_priority_over_optional_model(synthetic_clip):
    result = analyze_video(synthetic_clip.path, AnalysisOptions(
        calibration=calibration_from_dict(synthetic_clip.calibration),
        court_weights="missing.pt", selection=Selection("court_half", court_half="near"),
        compute_sha256=False))
    assert result.status == "ok"
    assert result.calibration.method == "manual_landmarks"

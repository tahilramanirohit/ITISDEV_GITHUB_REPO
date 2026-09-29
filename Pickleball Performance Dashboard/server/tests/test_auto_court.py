"""Synthetic geometry checks for the optional court-model adapter.

These do not establish accuracy on real match footage or validate any weights.
"""

from types import SimpleNamespace

import numpy as np

from picklepro.auto_court import MODEL_LANDMARKS, calibration_from_pose, detect_court, detect_orientation
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

    monkeypatch.setattr("picklepro.pipeline.load_court_model", lambda _weights: FakeCourtModel())
    result = analyze_video(synthetic_clip.path, AnalysisOptions(
        court_weights="supplied-by-operator.pt", selection=Selection("court_half", court_half="near"),
        compute_sha256=False))
    assert result.status == "ok"
    assert result.calibration.method == "auto_model_landmarks"
    assert result.metrics.court_heatmap.status == "measured"
    assert result.player_selection.tracked_fraction > 0.8
    assert result.video.rotation_applied_deg == 0


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


class GradientCourtModel:
    """Sees an upright court only in wide frames that are dark at the top (the far end)."""

    def predict(self, frame, verbose=False):
        h, w = frame.shape[:2]
        upright = w > h and frame[: h // 4].mean() < frame[-h // 4:].mean()
        pose = _pose()
        if not upright:
            pose[:, 2] = 0.05
        return [_result(pose)]


def _gradient_video(path, rotate=None):
    import cv2

    frame = np.repeat(np.linspace(0, 255, 90, dtype=np.uint8)[:, None], 160, axis=1)
    frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
    if rotate is not None:
        frame = cv2.rotate(frame, rotate)
    h, w = frame.shape[:2]
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 10, (w, h))
    for _ in range(40):
        writer.write(frame)
    writer.release()
    return path


def test_orientation_turns_sideways_pixels_upright_and_leaves_upright_video_alone(tmp_path):
    import cv2

    upright = _gradient_video(tmp_path / "upright.mp4")
    assert detect_orientation(upright, probe(upright), GradientCourtModel(), sample_times=(0.5, 2.0)) == 0
    # Stored rotated 90 degrees clockwise -> needs 270 clockwise to come back.
    sideways = _gradient_video(tmp_path / "sideways.mp4", cv2.ROTATE_90_CLOCKWISE)
    assert detect_orientation(sideways, probe(sideways), GradientCourtModel(), sample_times=(0.5, 2.0)) == 270
    flipped = _gradient_video(tmp_path / "flipped.mp4", cv2.ROTATE_180)
    assert detect_orientation(flipped, probe(flipped), GradientCourtModel(), sample_times=(0.5, 2.0)) == 180

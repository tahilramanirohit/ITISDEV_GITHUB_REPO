"""Identity and custom-model class checks."""

import numpy as np
import pytest

from picklepro.detection import DetectorUnavailable, PlayerTracker, associate_boxes, person_class_id


def test_brief_nonoverlapping_motion_keeps_track_id():
    old = {4: [20, 20, 50, 100]}
    assert associate_boxes([[55, 20, 85, 100]], old, {4: 1}) == [4]


def test_one_old_track_cannot_be_assigned_to_two_detections():
    old = {4: [20, 20, 50, 100]}
    matches = associate_boxes([[21, 20, 51, 100], [35, 20, 65, 100]], old, {4: 0})
    assert matches.count(4) == 1


def test_distant_blob_gets_no_old_identity():
    assert associate_boxes([[500, 20, 530, 100]], {4: [20, 20, 50, 100]}, {4: 0}) == [None]


def test_custom_yolo_model_tracks_person_class_not_ball(monkeypatch):
    class FakeModel:
        names = {0: "pickleball", 1: "person", 2: "paddle"}

        def track(self, _frame, **kwargs):
            assert kwargs["classes"] == [1]
            return []

    monkeypatch.setattr("picklepro.detection._load_yolo", lambda _weights: FakeModel())
    tracker = PlayerTracker(detector="yolo", yolo_weights="unused.pt")
    assert tracker.update(np.zeros((40, 40, 3), dtype=np.uint8)) == []


def test_yolo_model_without_person_class_is_rejected():
    assert person_class_id(["person", "sports ball"]) == 0
    with pytest.raises(DetectorUnavailable, match="person/player/human"):
        person_class_id({0: "pickleball", 1: "paddle"})

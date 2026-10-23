"""Guard against applying a stale court map after camera movement."""

import cv2
import numpy as np

from picklepro.camera_view import likely_scene_cut, view_changed


def test_manual_court_map_is_invalid_after_camera_translation():
    rng = np.random.default_rng(7)
    reference = rng.integers(0, 256, (270, 480, 3), dtype=np.uint8)
    moved = cv2.warpAffine(reference, np.float32([[1, 0, 28], [0, 1, 0]]), (480, 270))
    assert not view_changed(reference, reference.copy())
    assert view_changed(reference, moved)


def test_abrupt_new_view_is_a_cut_but_same_view_is_not():
    red = np.full((90, 160, 3), (0, 0, 255), dtype=np.uint8)
    blue = np.full((90, 160, 3), (255, 0, 0), dtype=np.uint8)
    assert not likely_scene_cut(red, red.copy())
    assert likely_scene_cut(red, blue)

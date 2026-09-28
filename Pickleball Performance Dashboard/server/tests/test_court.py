import numpy as np
import pytest

from picklepro.court import (
    COURT_LENGTH_M,
    COURT_WIDTH_M,
    LANDMARKS_M,
    NET_Y_M,
    CalibrationError,
    calibrate,
    calibration_from_dict,
    court_half,
    foot_point,
)
from picklepro.fixtures import court_to_image_homography, project


def _exact_points(names):
    H = court_to_image_homography()
    return {n: tuple(project(H, [LANDMARKS_M[n]])[0]) for n in names}


def test_court_dimensions_match_regulation():
    assert COURT_WIDTH_M == pytest.approx(6.096)
    assert COURT_LENGTH_M == pytest.approx(13.4112)
    assert NET_Y_M == pytest.approx(COURT_LENGTH_M / 2)
    # Kitchen is 7 ft from the net on each side.
    assert LANDMARKS_M["near_left_kitchen"][1] == pytest.approx(NET_Y_M - 2.1336)
    assert LANDMARKS_M["far_left_kitchen"][1] == pytest.approx(NET_Y_M + 2.1336)


def test_calibration_recovers_court_coordinates():
    pts = _exact_points(["near_left_baseline", "near_right_baseline", "far_left_baseline", "far_right_baseline"])
    cal = calibrate(pts, (960, 540))
    assert cal.reprojection_rmse_m < 1e-3
    assert cal.quality == "good"
    H = court_to_image_homography()
    probe_m = [(1.0, 2.0), (3.0, 6.7), (5.5, 12.0)]
    back = cal.image_to_court([tuple(p) for p in project(H, probe_m)])
    assert np.allclose(back, probe_m, atol=1e-3)


def test_half_court_calibration_with_near_side_only():
    pts = _exact_points(["near_left_baseline", "near_right_baseline", "near_left_kitchen", "near_right_kitchen"])
    cal = calibrate(pts, (960, 540))
    H = court_to_image_homography()
    back = cal.image_to_court([tuple(project(H, [(2.0, 3.0)])[0])])
    assert np.allclose(back[0], (2.0, 3.0), atol=1e-3)


def test_bad_click_is_visible_in_reprojection_error():
    pts = _exact_points(["near_left_baseline", "near_right_baseline", "far_left_baseline",
                         "far_right_baseline", "near_left_kitchen", "near_right_kitchen"])
    x, y = pts["near_left_kitchen"]
    pts["near_left_kitchen"] = (x + 60, y)  # a mis-click
    cal = calibrate(pts, (960, 540))
    assert cal.quality == "poor"
    assert cal.reprojection_rmse_px > 5


@pytest.mark.parametrize("points,match", [
    ({"near_left_baseline": (0, 0), "near_right_baseline": (1, 0), "far_left_baseline": (0, 1)}, "At least 4"),
    ({"near_left_baseline": (0, 0), "near_center_baseline": (1, 0), "near_right_baseline": (2, 0),
      "far_left_baseline": (3, 0)}, "single line"),
    ({"near_left_baseline": (0, 0), "near_right_baseline": (1, 0), "far_left_baseline": (0, 1),
      "net_post": (1, 1)}, "Unknown landmark"),
])
def test_invalid_calibrations_are_rejected(points, match):
    with pytest.raises(CalibrationError, match=match):
        calibrate(points, (100, 100))


def test_malformed_calibration_json():
    with pytest.raises(CalibrationError):
        calibration_from_dict({"points": []})


def test_scaled_calibration_matches_original_framing():
    pts = _exact_points(["near_left_baseline", "near_right_baseline", "far_left_baseline", "far_right_baseline"])
    cal = calibrate(pts, (960, 540))
    big = cal.scaled_to(1920, 1080)
    p = pts["far_left_baseline"]
    assert np.allclose(big.image_to_court([(p[0] * 2, p[1] * 2)])[0], cal.image_to_court([p])[0], atol=1e-6)


def test_foot_point_and_court_half():
    assert foot_point([10, 20, 30, 120]) == (20.0, 120.0)
    assert court_half(1.0) == "near"
    assert court_half(12.0) == "far"

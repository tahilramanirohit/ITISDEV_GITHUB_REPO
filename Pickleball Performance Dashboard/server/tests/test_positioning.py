"""Positioning patterns: exact behaviour on hand-built tracks, and agreement
with ground truth on the SYNTHETIC clip (not evidence of real-footage accuracy)."""

import pytest

from picklepro.court import COURT_LENGTH_M, NEAR_KITCHEN_LINE_Y_M
from picklepro.fixtures import near_player_path
from picklepro.pipeline import AnalysisOptions, analyze_video
from picklepro.court import calibration_from_dict
from picklepro.positioning import band_of, depth_from_baseline, positioning_patterns
from picklepro.spatial import SelectedTrack, Selection

DT = 0.1


def _track(depths, x=2.0, half="near"):
    to_y = (lambda d: d) if half == "near" else (lambda d: COURT_LENGTH_M - d)
    return SelectedTrack(positions_m=[None if d is None else (x, to_y(d)) for d in depths])


def test_bands_follow_the_players_own_baseline():
    assert band_of(-0.5) == "behind_baseline"
    assert band_of(0.5) == "baseline_area"
    assert band_of(2.5) == "transition"
    assert band_of(NEAR_KITCHEN_LINE_Y_M - 0.3) == "kitchen_line"
    assert band_of(NEAR_KITCHEN_LINE_Y_M + 1.0) == "inside_kitchen"
    assert band_of(7.0) is None
    assert depth_from_baseline(COURT_LENGTH_M - 1.0, "far") == pytest.approx(1.0)


@pytest.mark.parametrize("half", ["near", "far"])
def test_approach_linger_and_retreat_are_counted(half):
    # 1 s at the baseline, 3 s standing in transition, then the kitchen line, then back.
    depths = [0.5] * 10 + [2.5] * 30 + [4.3] * 20 + [0.5] * 10
    v = positioning_patterns(_track(depths, half=half), DT)
    assert v["court_half"] == half
    assert v["seconds"]["transition"] == pytest.approx(3.0)
    assert v["seconds"]["kitchen_line"] == pytest.approx(2.0)
    assert v["transition_lingers"] == 1
    assert v["longest_transition_linger_s"] == pytest.approx(3.0)
    assert v["approaches_to_kitchen_line"] == 1
    assert v["median_approach_s"] == pytest.approx(3.1)
    assert v["retreats_to_baseline"] == 1
    assert sum(v["fraction_of_mapped_time"].values()) == pytest.approx(1.0, abs=1e-3)


def test_passing_through_transition_quickly_is_not_a_linger():
    depths = [0.5] * 10 + [2.0, 2.6, 3.2] + [4.3] * 10
    v = positioning_patterns(_track(depths), DT)
    assert v["transition_lingers"] == 0
    assert v["approaches_to_kitchen_line"] == 1
    assert v["median_approach_s"] == pytest.approx(0.4)


def test_long_tracking_gap_breaks_an_approach():
    # The player disappears for 2 s; we cannot say how they got to the line.
    depths = [0.5] * 10 + [None] * 20 + [4.3] * 10
    v = positioning_patterns(_track(depths), DT)
    assert v["approaches_to_kitchen_line"] == 0
    assert v["median_approach_s"] is None


def test_single_frame_jitter_is_smoothed_away():
    depths = [4.3] * 10 + [2.5] + [4.3] * 10
    v = positioning_patterns(_track(depths), DT)
    assert v["seconds"]["transition"] == 0
    assert v["retreats_to_baseline"] == 0


def test_left_side_is_from_the_players_view():
    near = positioning_patterns(_track([4.3] * 10, x=1.0, half="near"), DT)
    far = positioning_patterns(_track([4.3] * 10, x=1.0, half="far"), DT)
    assert near["left_side_fraction"] == 1.0
    assert far["left_side_fraction"] == 0.0


def test_empty_track_has_no_value():
    assert positioning_patterns(SelectedTrack(positions_m=[None] * 5), DT) is None


def test_synthetic_clip_positioning_matches_ground_truth(synthetic_clip):
    r = analyze_video(synthetic_clip.path, AnalysisOptions(
        calibration=calibration_from_dict(synthetic_clip.calibration),
        selection=Selection("court_half", court_half="near"), compute_sha256=False))
    m = r.metrics.positioning
    assert m.status == "measured" and m.validation == "synthetic_only"
    v = m.value

    # Ground truth: sample the known path at the same rate.
    n = 200
    truth = {b: 0 for b in v.seconds}
    for i in range(n):
        _, y = near_player_path(i * synthetic_clip.duration_s / n, synthetic_clip.duration_s)
        truth[band_of(y)] += 1
    for band, count in truth.items():
        assert v.fraction_of_mapped_time[band] == pytest.approx(count / n, abs=0.08), band
    # The path goes baseline -> past the kitchen line -> baseline exactly once.
    assert v.approaches_to_kitchen_line == 1
    assert v.retreats_to_baseline == 1

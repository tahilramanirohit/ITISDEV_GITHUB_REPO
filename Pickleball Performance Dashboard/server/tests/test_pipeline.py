"""Pipeline behaviour on SYNTHETIC footage.

These tests check that the code computes what it claims and reports honestly.
Error figures here come from a rendered clip with a perfect calibration; they
say nothing about accuracy on real footage.
"""

import numpy as np
import pytest
from conftest import write_constant_video

from picklepro.contract import AnalysisResultV1
from picklepro.court import NEAR_KITCHEN_LINE_Y_M, calibration_from_dict, foot_point
from picklepro.fixtures import near_player_path
from picklepro.pipeline import AnalysisOptions, analyze_video
from picklepro.spatial import Selection
from picklepro.video_io import ReadStats, iter_frames, probe


def _opts(clip, **kw):
    base = dict(calibration=calibration_from_dict(clip.calibration),
                selection=Selection("court_half", court_half="near"), compute_sha256=False)
    base.update(kw)
    return AnalysisOptions(**base)


def test_reader_reports_full_duration_and_treats_eof_as_eof(tmp_path):
    path = write_constant_video(tmp_path / "ten_seconds.mp4", frames=100, fps=10)
    props = probe(path)
    assert props.container_duration_s == pytest.approx(10.0)
    stats = ReadStats()
    n = sum(1 for _ in iter_frames(path, props.fps, stats))
    assert n == 100 and stats.frames_decoded == 100
    assert stats.decode_failures == 0 and stats.reached_end


def test_blank_video_is_insufficient_not_success(tmp_path):
    path = write_constant_video(tmp_path / "black.mp4", frames=30, fps=10)
    r = analyze_video(path, AnalysisOptions(compute_sha256=False))
    assert r.status == "insufficient_data"
    assert r.coverage.frames_with_detections == 0
    assert r.player_positions == [] and r.tracks == []
    assert "complete" not in r.message.lower()
    assert r.metrics.court_heatmap.status == "insufficient_data"


def test_entire_clip_is_analyzed_and_coverage_reported(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip))
    c = r.coverage
    assert r.video.container_duration_s == pytest.approx(synthetic_clip.duration_s)
    assert c.analyzed_duration_s == pytest.approx(synthetic_clip.duration_s)
    assert c.fraction_of_video_analyzed == pytest.approx(1.0)
    assert c.frames_decoded == round(synthetic_clip.duration_s * synthetic_clip.fps)
    assert c.stopped_early_reason is None
    assert c.sample_stride == 2  # 15 fps sampled at ~10 fps


def test_max_seconds_is_reported_as_partial_coverage(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip, max_seconds=5))
    assert r.coverage.analyzed_end_s <= 5.0 + 1e-6
    assert r.coverage.fraction_of_video_analyzed == pytest.approx(0.25, abs=0.02)
    assert "max_seconds" in r.coverage.stopped_early_reason
    assert any("max_seconds" in w for w in r.warnings)


def test_motion_detector_reports_no_confidence(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip, max_seconds=4))
    assert r.provenance.detector.name == "opencv-mog2-motion"
    assert r.provenance.detector.confidence_is_model_score is False
    assert all(p.confidence is None for s in r.player_positions for p in s.players)


def test_calibrated_heatmap_is_dwell_time_in_court_coordinates(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip))
    assert r.status == "ok" and r.data_origin == "measured"
    hm = r.metrics.court_heatmap
    assert hm.status == "measured" and hm.scope == "whole_clip"
    assert hm.validation == "not_evaluated"
    v = hm.value
    total = sum(sum(row) for row in v.dwell_seconds)
    assert total + v.outside_mapped_area_s == pytest.approx(v.tracked_time_s, abs=1e-2)
    assert v.tracked_time_s == pytest.approx(r.player_selection.tracked_time_s)
    assert r.player_selection.tracked_fraction > 0.8
    # The synthetic player never crosses the net, so nothing lands on the far half.
    net_row = next(i for i, y in enumerate(v.y_edges_m) if y >= 6.7056)
    assert sum(sum(row) for row in v.dwell_seconds[net_row:]) == 0


def test_synthetic_projection_error_and_zone_time(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip, experimental_zones=True))
    cal = calibration_from_dict(synthetic_clip.calibration)
    errors = []
    for snap in r.player_positions:
        if len(snap.players) != 1:
            continue
        gx, gy = near_player_path(snap.time_seconds, synthetic_clip.duration_s)
        x, y = cal.image_to_court([foot_point(snap.players[0].bbox)])[0]
        errors.append(np.hypot(x - gx, y - gy))
    assert len(errors) > 100
    assert np.median(errors) < 0.15  # synthetic, ideal conditions only

    ts = np.arange(0, synthetic_clip.duration_s, 1 / synthetic_clip.fps)
    truth_kitchen = np.mean([near_player_path(t, synthetic_clip.duration_s)[1] >= NEAR_KITCHEN_LINE_Y_M for t in ts])
    zones = r.metrics.zone_occupancy
    assert zones.status == "experimental" and zones.validation == "synthetic_only"
    assert zones.value.fraction_of_tracked_time["kitchen"] == pytest.approx(truth_kitchen, abs=0.08)


def test_zone_occupancy_is_off_by_default(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip, max_seconds=4, min_tracked_seconds=1))
    assert r.metrics.zone_occupancy.status == "not_computed"
    assert r.metrics.zone_occupancy.value is None


@pytest.mark.parametrize("kw,reason", [
    (dict(calibration=None), "not calibrated"),
    (dict(selection=None), "No player selected"),
    (dict(min_tracked_seconds=60), "at least 60s"),
    (dict(selection=Selection("court_half", court_half="far")), "tracked for 0.0s"),
])
def test_court_metrics_report_insufficient_data(synthetic_clip, kw, reason):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip, **kw))
    assert r.status == "insufficient_data"
    assert r.metrics.court_heatmap.status == "insufficient_data"
    assert r.metrics.court_heatmap.value is None
    assert reason in r.metrics.court_heatmap.reason


def test_unvalidated_analytics_are_never_claimed(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip, max_seconds=3, min_tracked_seconds=1))
    assert r.metrics.rally_segmentation.status == "not_computed"
    assert r.metrics.shot_classification.status == "not_computed"
    dumped = r.model_dump_json()
    for forbidden in ("event_timeline", "PLAYER_BURST_ACTION", "shot recovery"):
        assert forbidden not in dumped


def test_result_round_trips_through_contract(synthetic_clip):
    r = analyze_video(synthetic_clip.path, _opts(synthetic_clip, max_seconds=3))
    assert AnalysisResultV1.model_validate_json(r.model_dump_json()) == r

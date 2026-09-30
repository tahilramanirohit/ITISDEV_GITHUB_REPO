"""Worker lifecycle against the in-memory store (mirrors the SQL lease semantics)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import picklepro.worker.runner as runner
from picklepro.worker.runner import WorkerConfig, process_one
from picklepro.worker.store import InMemoryJobStore, Job


def _job(job_id="job-1", max_attempts=3, params=None, path="u1/s1/v1.mp4"):
    return Job(id=job_id, owner_id="u1", video_asset_id="v1", session_id="s1", storage_bucket="session-videos",
               storage_path=path, original_filename="match.mp4", attempts=0, max_attempts=max_attempts,
               params=params or {})


def _cfg(mode="measured", worker="w1"):
    return WorkerConfig(worker_id=worker, mode=mode, lease_seconds=60, enforce_source_quality=False)


def test_original_media_gate_requires_720p_and_reported_near_30fps():
    from picklepro.video_io import VideoProperties

    good = VideoProperties(1280, 720, 29.97, True, 300)
    runner.validate_source_quality(good)
    with pytest.raises(runner.SourceQualityError, match="720p"):
        runner.validate_source_quality(VideoProperties(960, 540, 30, True, 300))
    runner.validate_source_quality(VideoProperties(720, 1280, 29.85, True, 300))
    with pytest.raises(runner.SourceQualityError, match="720p"):
        runner.validate_source_quality(VideoProperties(540, 960, 30, True, 300))
    with pytest.raises(runner.SourceQualityError, match="30 fps"):
        runner.validate_source_quality(VideoProperties(1280, 720, 25, True, 300))
    with pytest.raises(runner.SourceQualityError, match="unknown"):
        runner.validate_source_quality(VideoProperties(1280, 720, 30, False, 300))


def test_no_job_returns_none():
    assert process_one(InMemoryJobStore(), _cfg()) is None


def test_test_fixture_mode_is_labelled():
    store = InMemoryJobStore()
    store.add_job(_job(), video_bytes=b"whatever")
    out = process_one(store, _cfg(mode="test_fixture"))
    assert out.status == "completed"
    result = store.row("job-1").result
    assert result["data_origin"] == "test_fixture"
    assert result["message"].startswith("TEST DATA")
    assert result["provenance"]["source"]["filename"] == "match.mp4"


def test_measured_mode_runs_pipeline_with_job_params(synthetic_clip):
    store = InMemoryJobStore()
    params = {"calibration": synthetic_clip.calibration, "selection": {"method": "court_half", "court_half": "near"}}
    store.add_job(_job(params=params), video_bytes=synthetic_clip.path.read_bytes())
    out = process_one(store, _cfg())
    assert out.status == "completed"
    result = store.row("job-1").result
    assert result["data_origin"] == "measured"
    assert result["status"] == "ok"
    assert result["metrics"]["court_heatmap"]["status"] == "measured"
    stages = [stage for _p, stage in store.row("job-1").progress]
    assert stages[0] == "downloading" and stages[-1] == "finishing"
    assert [s for i, s in enumerate(stages) if i == 0 or stages[i - 1] != s] == ["downloading", "checking", "analyzing", "finishing"]
    values = [p for p, _s in store.row("job-1").progress]
    assert values == sorted(values) and 0 <= values[0] and values[-1] <= 1


def test_measured_mode_without_calibration_completes_as_insufficient(synthetic_clip):
    store = InMemoryJobStore()
    store.add_job(_job(), video_bytes=synthetic_clip.path.read_bytes())
    assert process_one(store, _cfg()).status == "completed"
    assert store.row("job-1").result["status"] == "insufficient_data"


def test_worker_rejects_original_below_capture_minimum(synthetic_clip):
    store = InMemoryJobStore()
    store.add_job(_job(), video_bytes=synthetic_clip.path.read_bytes())
    out = process_one(store, WorkerConfig(worker_id="w1", lease_seconds=60))
    assert (out.status, out.error_code) == ("failed", "low_quality_video")
    assert store.row("job-1").result is None


def test_worker_defaults_to_near_player_and_passes_court_model():
    opts = runner.options_from_params({}, WorkerConfig(worker_id="w1", court_weights="court.pt"), "match.mp4")
    assert opts.selection.method == "court_half" and opts.selection.court_half == "near"
    assert opts.court_weights == "court.pt"


def test_worker_passes_selected_video_time_and_rejects_invalid_time():
    opts = runner.options_from_params({"selection_time_s": 12.5}, _cfg(), "clip.mp4")
    assert opts.selection_time_s == 12.5
    with pytest.raises(ValueError, match="selection_time_s"):
        runner.options_from_params({"selection_time_s": -1}, _cfg(), "clip.mp4")


def test_worker_uses_confirmed_court_points(synthetic_clip):
    params = {"calibration": synthetic_clip.calibration, "calibration_source": "user_confirmed",
              "calibration_frame_s": 1.2}
    opts = runner.options_from_params(params, _cfg(), "clip.mp4")
    assert opts.calibration is not None
    assert opts.calibration_source == "user_confirmed" and opts.calibration_frame_s == 1.2
    with pytest.raises(ValueError, match="needs calibration"):
        runner.options_from_params({"calibration_source": "user_confirmed"}, _cfg(), "clip.mp4")


def test_worker_rejects_court_correction_that_misses_painted_lines(synthetic_clip):
    wrong = {**synthetic_clip.calibration, "points": [
        {**point, "pixel": [point["pixel"][0] + 100, point["pixel"][1]]}
        for point in synthetic_clip.calibration["points"]]}
    store = InMemoryJobStore()
    store.add_job(_job(params={"calibration": wrong, "calibration_source": "user_confirmed"}),
                  video_bytes=synthetic_clip.path.read_bytes())
    outcome = process_one(store, _cfg())
    assert outcome.status == "failed" and outcome.error_code == "invalid_court_correction"
    assert store.row("job-1").result is None


def test_missing_video_fails_without_retry():
    store = InMemoryJobStore()
    store.add_job(_job())  # no bytes in storage
    out = process_one(store, _cfg())
    assert (out.status, out.error_code) == ("failed", "video_missing")
    assert "Upload it again" in store.row("job-1").error_message


def test_undecodable_video_fails_without_retry():
    store = InMemoryJobStore()
    store.add_job(_job(), video_bytes=b"not a video" * 50)
    out = process_one(store, _cfg())
    assert (out.status, out.error_code) == ("failed", "unreadable_video")


def test_invalid_params_fail_without_retry():
    store = InMemoryJobStore()
    store.add_job(_job(params={"calibration": {"image_width": 1, "image_height": 1, "points": []}}), b"x")
    out = process_one(store, _cfg())
    assert (out.status, out.error_code) == ("failed", "invalid_parameters")


def test_unexpected_error_retries_then_fails(monkeypatch):
    store = InMemoryJobStore()
    store.add_job(_job(max_attempts=2), video_bytes=b"x")

    def boom(*_a, **_k):
        raise RuntimeError("simulated crash")

    monkeypatch.setattr(runner, "analyze_video", boom)
    first = process_one(store, _cfg())
    assert (first.status, first.error_code) == ("queued", "pipeline_error")
    second = process_one(store, _cfg())
    assert (second.status, second.error_code) == ("failed", "pipeline_error")
    assert store.row("job-1").job.attempts == 2
    assert process_one(store, _cfg()) is None


def test_interrupted_worker_job_is_reclaimed_after_lease_expiry():
    store = InMemoryJobStore()
    store.add_job(_job(max_attempts=2), video_bytes=b"x")
    claimed = store.claim("dead-worker", 60)  # worker dies without reporting
    assert claimed.attempts == 1
    assert store.claim("w2", 60) is None  # lease still valid: nobody else may take it
    store.expire_lease("job-1")
    out = process_one(store, _cfg(mode="test_fixture", worker="w2"))
    assert out.status == "completed"
    assert store.row("job-1").job.attempts == 2


def test_expired_lease_on_final_attempt_marks_failed():
    store = InMemoryJobStore()
    store.add_job(_job(max_attempts=1), video_bytes=b"x")
    store.claim("dead-worker", 60)
    store.expire_lease("job-1")
    assert store.claim("w2", 60) is None
    row = store.row("job-1")
    assert (row.status, row.error_code) == ("failed", "lease_expired")


def test_worker_that_lost_its_lease_cannot_overwrite(monkeypatch):
    store = InMemoryJobStore()
    store.add_job(_job(), video_bytes=b"x")
    real_fixture = runner.test_fixture_result

    def slow_fixture(job):
        # While this worker is "busy", its lease expires and another worker finishes the job.
        store.expire_lease(job.id)
        other = store.claim("w2", 60)
        store.complete(other.id, "w2", {"winner": "w2"})
        return real_fixture(job)

    monkeypatch.setattr(runner, "test_fixture_result", slow_fixture)
    out = process_one(store, _cfg(mode="test_fixture", worker="w1"))
    assert out.status == "lease_lost"
    assert store.row("job-1").result == {"winner": "w2"}


def test_retry_backoff_respects_available_at():
    now = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    store = InMemoryJobStore(clock=lambda: now[0])
    store.RETRY_BACKOFF_S = 30
    store.add_job(_job(), video_bytes=b"x")
    store.claim("w1", 60)
    assert store.fail("job-1", "w1", "download_failed", "net", retryable=True) == "queued"
    assert store.claim("w1", 60) is None
    now[0] += timedelta(seconds=31)
    assert store.claim("w1", 60) is not None


@pytest.mark.parametrize("sel", [{"method": "track_id", "track_id": "3"}, {"method": "nearest"}])
def test_bad_selection_is_rejected(sel):
    with pytest.raises(ValueError):
        runner.options_from_params({"selection": sel}, _cfg(), None)


def test_progress_is_reported_in_stages_and_throttled():
    from picklepro.worker.runner import _Progress

    class Store:
        def __init__(self):
            self.calls = []

        def report_progress(self, job_id, worker_id, progress, stage):
            self.calls.append((round(progress, 3), stage))
            return True

    clock = iter([0.0, 0.5, 1.0, 5.0, 5.5]).__next__
    store = Store()
    cfg = SimpleNamespace(worker_id="w1")
    report = _Progress(store, "j1", cfg, clock=clock)
    report("downloading")                 # t=0: reported
    report.stage("downloading")(0.5)      # t=0.5: same stage, too soon
    report("analyzing")                   # t=1: a new stage is always reported
    report.stage("analyzing")(0.5)        # t=5: reported
    report("finishing")                   # t=5.5
    assert store.calls == [(0.0, "downloading"), (0.05, "analyzing"), (0.5, "analyzing"), (0.95, "finishing")]


def test_progress_failures_never_fail_the_job_and_reporting_stops():
    from picklepro.worker.runner import PROGRESS_MAX_FAILURES, _Progress

    class Broken:
        calls = 0

        def report_progress(self, *args):
            Broken.calls += 1
            raise RuntimeError("update_analysis_progress: HTTP 404 PGRST202")

    report = _Progress(Broken(), "j1", SimpleNamespace(worker_id="w1"), clock=iter(range(0, 100, 10)).__next__)
    for stage in ("downloading", "checking", "analyzing", "finishing", "analyzing"):
        report(stage)
    assert Broken.calls == PROGRESS_MAX_FAILURES


def test_a_stop_request_interrupts_a_running_analysis_and_requeues_it(synthetic_clip, monkeypatch):
    import threading
    stop = threading.Event()
    real = runner.analyze_video

    def analyze_then_stop(video, opts, progress=None):
        stop.set()  # Ctrl+C arrives while the analysis runs
        return real(video, opts, progress=progress)

    monkeypatch.setattr(runner, "analyze_video", analyze_then_stop)
    store = InMemoryJobStore()
    params = {"calibration": synthetic_clip.calibration, "selection": {"method": "court_half", "court_half": "near"}}
    store.add_job(_job(params=params), video_bytes=synthetic_clip.path.read_bytes())
    out = process_one(store, _cfg(), stop)
    assert out.status == "queued" and out.error_code == "worker_interrupted"

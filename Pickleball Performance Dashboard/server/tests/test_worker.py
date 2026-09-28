"""Worker lifecycle against the in-memory store (mirrors the SQL lease semantics)."""

from datetime import datetime, timedelta, timezone

import pytest

import picklepro.worker.runner as runner
from picklepro.worker.runner import WorkerConfig, process_one
from picklepro.worker.store import InMemoryJobStore, Job


def _job(job_id="job-1", max_attempts=3, params=None, path="u1/s1/v1.mp4"):
    return Job(id=job_id, owner_id="u1", video_asset_id="v1", session_id="s1", storage_bucket="session-videos",
               storage_path=path, original_filename="match.mp4", attempts=0, max_attempts=max_attempts,
               params=params or {})


def _cfg(mode="measured", worker="w1"):
    return WorkerConfig(worker_id=worker, mode=mode, lease_seconds=60)


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


def test_measured_mode_without_calibration_completes_as_insufficient(synthetic_clip):
    store = InMemoryJobStore()
    store.add_job(_job(), video_bytes=synthetic_clip.path.read_bytes())
    assert process_one(store, _cfg()).status == "completed"
    assert store.row("job-1").result["status"] == "insufficient_data"


def test_worker_defaults_to_near_player_and_passes_court_model():
    opts = runner.options_from_params({}, WorkerConfig(worker_id="w1", court_weights="court.pt"), "match.mp4")
    assert opts.selection.method == "court_half" and opts.selection.court_half == "near"
    assert opts.court_weights == "court.pt"


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

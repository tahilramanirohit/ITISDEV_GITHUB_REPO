"""Claim → download → analyze → record, one job at a time.

Failure policy (error codes are shown to the user, so they must be actionable):

=====================  =========  ==============================================
error_code             retryable  meaning
=====================  =========  ==============================================
video_missing          no         The uploaded file is not in storage.
unreadable_video       no         The file could not be decoded as video.
invalid_parameters     no         Calibration / player selection is malformed.
detector_unavailable   no         Worker misconfigured (e.g. YOLO weights missing).
download_failed        yes        Transient storage/network error.
pipeline_error         yes        Unexpected exception while analyzing.
worker_interrupted     yes        Worker received SIGINT/SIGTERM mid-job.
=====================  =========  ==============================================

A job interrupted without a chance to report (power loss, kill -9) keeps its
lease until it expires; the next ``claim`` then picks it up again.
"""

from __future__ import annotations

import json
import logging
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from ..contract import AnalysisResultV1
from ..court import CalibrationError, calibration_from_dict
from ..detection import DetectorUnavailable
from ..pipeline import AnalysisOptions, analyze_video
from ..spatial import Selection
from ..video_io import VideoOpenError
from .store import Job, JobStore, LeaseLost, TransientStoreError, VideoMissing

logger = logging.getLogger(__name__)

ResultMode = Literal["measured", "test_fixture"]
FIXTURE_PATH = Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "analysis_result.test_fixture.v1.json"


class Interrupted(RuntimeError):
    pass


@dataclass
class Outcome:
    job_id: str
    status: str  # completed | queued (will retry) | failed | lease_lost
    error_code: Optional[str] = None


@dataclass
class WorkerConfig:
    worker_id: str
    mode: ResultMode = "measured"
    lease_seconds: int = 300
    detector: str = "motion"
    yolo_weights: Optional[str] = None
    court_weights: Optional[str] = None
    ball_weights: Optional[str] = None
    target_fps: float = 10.0


def options_from_params(params: dict, cfg: WorkerConfig, filename: Optional[str]) -> AnalysisOptions:
    """Translate a job's ``params`` JSON into pipeline options. Raises ValueError on bad input."""
    calibration = calibration_from_dict(params["calibration"]) if params.get("calibration") else None
    sel = params.get("selection") or None
    selection = None
    if sel:
        method = sel.get("method")
        if method == "track_id" and isinstance(sel.get("track_id"), int):
            selection = Selection("track_id", track_id=sel["track_id"])
        elif method == "court_half" and sel.get("court_half") in ("near", "far"):
            selection = Selection("court_half", court_half=sel["court_half"])
        else:
            raise ValueError(f"Unsupported player selection: {json.dumps(sel)[:200]}")
    if selection is None:
        selection = Selection("court_half", court_half="near")
    return AnalysisOptions(detector=cfg.detector, yolo_weights=cfg.yolo_weights,
                           court_weights=cfg.court_weights, ball_weights=cfg.ball_weights,
                           target_fps=cfg.target_fps,
                           calibration=calibration, selection=selection,
                           experimental_zones=bool(params.get("experimental_zones")), source_filename=filename)


def test_fixture_result(job: Job) -> AnalysisResultV1:
    """A clearly labelled canned result. It is NOT derived from the uploaded video."""
    data = json.loads(FIXTURE_PATH.read_text())
    data["data_origin"] = "test_fixture"
    data["provenance"]["source"] = {"filename": job.original_filename, "sha256": None}
    return AnalysisResultV1.model_validate(data)


class _Heartbeat:
    def __init__(self, store: JobStore, job_id: str, cfg: WorkerConfig):
        self._store, self._job_id, self._cfg = store, job_id, cfg
        self._stop = threading.Event()
        self.lost = False
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        interval = max(1.0, self._cfg.lease_seconds / 3)
        while not self._stop.wait(interval):
            try:
                if not self._store.heartbeat(self._job_id, self._cfg.worker_id, self._cfg.lease_seconds):
                    self.lost = True
                    return
            except Exception:  # noqa: BLE001 - keep trying until the lease actually lapses
                logger.warning("heartbeat failed for %s", self._job_id, exc_info=True)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=5)


def process_one(store: JobStore, cfg: WorkerConfig, stop: Optional[threading.Event] = None) -> Optional[Outcome]:
    job = store.claim(cfg.worker_id, cfg.lease_seconds)
    if job is None:
        return None
    logger.info("claimed job %s (attempt %d/%d)", job.id, job.attempts, job.max_attempts)

    def fail(code: str, message: str, retryable: bool) -> Outcome:
        logger.warning("job %s failed: %s (%s)", job.id, code, message)
        try:
            new_status = store.fail(job.id, cfg.worker_id, code, message, retryable)
        except LeaseLost:
            return Outcome(job.id, "lease_lost", code)
        return Outcome(job.id, new_status, code)

    with tempfile.TemporaryDirectory(prefix="picklepro-job-") as tmp, _Heartbeat(store, job.id, cfg) as hb:
        video = Path(tmp) / ("input" + (Path(job.storage_path).suffix or ".mp4"))
        try:
            if cfg.mode == "test_fixture":
                result = test_fixture_result(job)
            else:
                try:
                    opts = options_from_params(job.params, cfg, job.original_filename)
                except (CalibrationError, ValueError, KeyError, TypeError) as exc:
                    return fail("invalid_parameters", f"Calibration or player selection is invalid: {exc}", False)
                store.download_video(job, video)
                if stop is not None and stop.is_set():
                    raise Interrupted()
                result = analyze_video(video, opts)
        except VideoMissing as exc:
            return fail("video_missing", f"The uploaded video was not found in storage ({exc}). Upload it again.", False)
        except TransientStoreError as exc:
            return fail("download_failed", f"Could not download the video; will retry. ({exc})", True)
        except VideoOpenError as exc:
            return fail("unreadable_video", f"The file could not be decoded as video. Try MP4 (H.264). ({exc})", False)
        except DetectorUnavailable as exc:
            return fail("detector_unavailable", f"Worker misconfiguration: {exc}", False)
        except Interrupted:
            return fail("worker_interrupted", "The worker was stopped during processing; the job will be retried.", True)
        except Exception as exc:  # noqa: BLE001
            logger.exception("pipeline error on job %s", job.id)
            return fail("pipeline_error", f"Unexpected analysis error: {type(exc).__name__}: {exc}", True)

        if hb.lost:
            logger.warning("lease for job %s was lost during processing; discarding result", job.id)
            return Outcome(job.id, "lease_lost")
        try:
            store.complete(job.id, cfg.worker_id, result.model_dump(mode="json"))
        except LeaseLost:
            logger.warning("lease for job %s lost before completion; discarding result", job.id)
            return Outcome(job.id, "lease_lost")
    logger.info("job %s completed: %s", job.id, result.status)
    return Outcome(job.id, "completed")

"""Job-store interface used by the worker, plus an in-memory implementation.

The lease semantics here intentionally mirror the SQL functions in
``supabase/migrations/*_analysis_jobs.sql`` so the runner can be tested without
a database:

* ``claim`` takes the oldest queued job whose ``available_at`` has passed, or a
  ``processing`` job whose lease expired (the previous worker died). It
  increments ``attempts`` and sets a lease.
* A job whose lease expired after its last allowed attempt is marked failed.
* ``complete``/``fail``/``heartbeat`` only succeed for the worker holding the
  current lease; a worker that lost its lease cannot overwrite newer state.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol


class LeaseLost(RuntimeError):
    """The job is no longer held by this worker (expired lease or already finished)."""


class VideoMissing(RuntimeError):
    """The storage object for the job does not exist (not retryable)."""


class TransientStoreError(RuntimeError):
    """Network or server error talking to the store (retryable)."""


@dataclass
class Job:
    id: str
    owner_id: str
    video_asset_id: str
    session_id: str
    storage_bucket: str
    storage_path: str
    original_filename: Optional[str]
    attempts: int
    max_attempts: int
    params: Dict[str, Any] = field(default_factory=dict)


class JobStore(Protocol):
    def claim(self, worker_id: str, lease_seconds: int) -> Optional[Job]: ...
    def heartbeat(self, job_id: str, worker_id: str, lease_seconds: int) -> bool: ...
    def download_video(self, job: Job, dest: Path) -> None: ...
    def complete(self, job_id: str, worker_id: str, result: Dict[str, Any]) -> None: ...
    def fail(self, job_id: str, worker_id: str, error_code: str, error_message: str, retryable: bool) -> str: ...


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class _Row:
    job: Job
    status: str = "queued"
    locked_by: Optional[str] = None
    lease_expires_at: Optional[datetime] = None
    available_at: datetime = field(default_factory=_now)
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class InMemoryJobStore:
    """Thread-safe reference implementation for tests and offline demos."""

    RETRY_BACKOFF_S = 0  # tests want immediate retries; SQL uses a real backoff

    def __init__(self, clock=_now):
        self._rows: Dict[str, _Row] = {}
        self._videos: Dict[str, bytes] = {}
        self._lock = threading.Lock()
        self._clock = clock

    # -- test helpers -------------------------------------------------------
    def add_job(self, job: Job, video_bytes: Optional[bytes] = None) -> None:
        with self._lock:
            self._rows[job.id] = _Row(job=job, available_at=self._clock())
            if video_bytes is not None:
                self._videos[f"{job.storage_bucket}/{job.storage_path}"] = video_bytes

    def row(self, job_id: str) -> _Row:
        return self._rows[job_id]

    def expire_lease(self, job_id: str) -> None:
        with self._lock:
            self._rows[job_id].lease_expires_at = self._clock() - timedelta(seconds=1)

    # -- JobStore -------------------------------------------------------------
    def claim(self, worker_id: str, lease_seconds: int) -> Optional[Job]:
        with self._lock:
            now = self._clock()
            for row in self._rows.values():
                if (row.status == "processing" and row.lease_expires_at and row.lease_expires_at < now
                        and row.job.attempts >= row.job.max_attempts):
                    row.status, row.locked_by = "failed", None
                    row.error_code = "lease_expired"
                    row.error_message = "The worker stopped responding on the final attempt."
            candidates: List[_Row] = [
                r for r in self._rows.values()
                if (r.status == "queued" and r.available_at <= now)
                or (r.status == "processing" and r.lease_expires_at and r.lease_expires_at < now)
            ]
            if not candidates:
                return None
            row = min(candidates, key=lambda r: r.available_at)
            row.status = "processing"
            row.locked_by = worker_id
            row.lease_expires_at = now + timedelta(seconds=lease_seconds)
            row.job.attempts += 1
            return Job(**{**row.job.__dict__})

    def _held(self, job_id: str, worker_id: str) -> _Row:
        row = self._rows.get(job_id)
        if (row is None or row.status != "processing" or row.locked_by != worker_id
                or row.lease_expires_at is None or row.lease_expires_at < self._clock()):
            raise LeaseLost(job_id)
        return row

    def heartbeat(self, job_id: str, worker_id: str, lease_seconds: int) -> bool:
        with self._lock:
            try:
                row = self._held(job_id, worker_id)
            except LeaseLost:
                return False
            row.lease_expires_at = self._clock() + timedelta(seconds=lease_seconds)
            return True

    def download_video(self, job: Job, dest: Path) -> None:
        data = self._videos.get(f"{job.storage_bucket}/{job.storage_path}")
        if data is None:
            raise VideoMissing(job.storage_path)
        dest.write_bytes(data)

    def complete(self, job_id: str, worker_id: str, result: Dict[str, Any]) -> None:
        with self._lock:
            row = self._held(job_id, worker_id)
            row.status, row.locked_by, row.lease_expires_at = "completed", None, None
            row.result = result

    def fail(self, job_id: str, worker_id: str, error_code: str, error_message: str, retryable: bool) -> str:
        with self._lock:
            row = self._held(job_id, worker_id)
            row.error_code, row.error_message = error_code, error_message
            row.locked_by, row.lease_expires_at = None, None
            if retryable and row.job.attempts < row.job.max_attempts:
                row.status = "queued"
                row.available_at = self._clock() + timedelta(seconds=self.RETRY_BACKOFF_S)
            else:
                row.status = "failed"
            return row.status

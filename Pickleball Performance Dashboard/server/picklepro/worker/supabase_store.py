"""Supabase-backed job store (PostgREST RPC + Storage REST).

Uses the service-role key, which bypasses row-level security. It must only be
configured in the worker's environment — never in the browser bundle.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from urllib.parse import quote

import httpx

from .store import Job, LeaseLost, TransientStoreError, VideoMissing


class SupabaseJobStore:
    def __init__(self, url: str, service_role_key: str, timeout: float = 30.0):
        if not url or not service_role_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Supabase job store.")
        self._url = url.rstrip("/")
        headers = {"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}"}
        self._client = httpx.Client(headers=headers, timeout=timeout)

    @classmethod
    def from_env(cls) -> "SupabaseJobStore":
        return cls(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))

    def _rpc(self, fn: str, args: Dict[str, Any]) -> Any:
        try:
            r = self._client.post(f"{self._url}/rest/v1/rpc/{fn}", json=args)
        except httpx.HTTPError as exc:
            raise TransientStoreError(f"{fn}: {exc}") from exc
        if r.status_code >= 500:
            raise TransientStoreError(f"{fn}: HTTP {r.status_code} {r.text[:300]}")
        if r.status_code >= 400:
            body = r.text
            if "lease_lost" in body:
                raise LeaseLost(body)
            raise RuntimeError(f"{fn}: HTTP {r.status_code} {body[:500]}")
        return r.json() if r.content else None

    def claim(self, worker_id: str, lease_seconds: int) -> Optional[Job]:
        data = self._rpc("claim_analysis_job", {"p_worker_id": worker_id, "p_lease_seconds": lease_seconds})
        if not data:
            return None
        return Job(
            id=data["id"], owner_id=data["owner_id"], video_asset_id=data["video_asset_id"],
            session_id=data["session_id"], storage_bucket=data["storage_bucket"],
            storage_path=data["storage_path"], original_filename=data.get("original_filename"),
            attempts=data["attempts"], max_attempts=data["max_attempts"], params=data.get("params") or {},
        )

    def heartbeat(self, job_id: str, worker_id: str, lease_seconds: int) -> bool:
        return bool(self._rpc("heartbeat_analysis_job",
                              {"p_job_id": job_id, "p_worker_id": worker_id, "p_lease_seconds": lease_seconds}))

    def report_progress(self, job_id: str, worker_id: str, progress: float, stage: str) -> bool:
        return bool(self._rpc("update_analysis_progress", {
            "p_job_id": job_id, "p_worker_id": worker_id, "p_progress": round(progress, 4), "p_stage": stage}))

    def download_video(self, job: Job, dest: Path, progress: Optional[Callable[[float], None]] = None) -> None:
        url = f"{self._url}/storage/v1/object/{quote(job.storage_bucket)}/{quote(job.storage_path)}"
        try:
            with self._client.stream("GET", url, timeout=None) as r:
                if r.status_code in (400, 404):
                    raise VideoMissing(f"{job.storage_path}: HTTP {r.status_code}")
                if r.status_code >= 300:
                    raise TransientStoreError(f"download: HTTP {r.status_code}")
                total = int(r.headers.get("content-length") or 0)
                done = 0
                with open(dest, "wb") as f:
                    for chunk in r.iter_bytes(1 << 20):
                        f.write(chunk)
                        done += len(chunk)
                        if progress and total:
                            progress(min(1.0, done / total))
        except httpx.HTTPError as exc:
            raise TransientStoreError(f"download: {exc}") from exc

    def complete(self, job_id: str, worker_id: str, result: Dict[str, Any]) -> None:
        self._rpc("complete_analysis_job", {"p_job_id": job_id, "p_worker_id": worker_id, "p_result": result})

    def fail(self, job_id: str, worker_id: str, error_code: str, error_message: str, retryable: bool) -> str:
        return self._rpc("fail_analysis_job", {
            "p_job_id": job_id, "p_worker_id": worker_id, "p_error_code": error_code,
            "p_error_message": error_message[:2000], "p_retryable": retryable,
        })

    def delete_one_expired_video(self) -> bool:
        """Delete one claimed raw object through Storage, then record completion.

        A failed Storage call leaves the claim leased for retry by a later sweep.
        """
        rows = self._rpc("claim_expired_raw_video", {})
        if not rows:
            return False
        video = rows[0]
        try:
            response = self._client.request(
                "DELETE", f"{self._url}/storage/v1/object/{quote(video['storage_bucket'])}",
                json={"prefixes": [video["storage_path"]]},
            )
        except httpx.HTTPError as exc:
            raise TransientStoreError(f"raw video deletion: {exc}") from exc
        if response.status_code >= 300:
            raise TransientStoreError(f"raw video deletion: HTTP {response.status_code} {response.text[:300]}")
        self._rpc("complete_raw_video_deletion", {"p_video_id": video["id"]})
        return True

"""Request shapes and error mapping of the Supabase store (mock transport only).

This does not prove the integration works against a live project; it checks
that the worker calls the RPC names/arguments defined in the migrations and
maps PostgREST/Storage errors to the right retry behaviour.
"""

import json

import httpx
import pytest

from picklepro.worker.store import LeaseLost, TransientStoreError, VideoMissing
from picklepro.worker.supabase_store import SupabaseJobStore

JOB = {"id": "j1", "owner_id": "u1", "video_asset_id": "v1", "session_id": "s1", "storage_bucket": "session-videos",
       "storage_path": "u1/s1/v1.mp4", "original_filename": "m.mp4", "attempts": 1, "max_attempts": 3, "params": {}}


def _store(handler):
    s = SupabaseJobStore("https://proj.supabase.co", "service-key")
    s._client = httpx.Client(transport=httpx.MockTransport(handler), headers=s._client.headers)
    return s


def test_requires_configuration():
    with pytest.raises(ValueError):
        SupabaseJobStore("", "")


def test_claim_calls_rpc_with_service_key():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"], seen["body"], seen["auth"] = str(req.url), json.loads(req.content), req.headers["authorization"]
        return httpx.Response(200, json=JOB)

    job = _store(handler).claim("w1", 120)
    assert seen["url"] == "https://proj.supabase.co/rest/v1/rpc/claim_analysis_job"
    assert seen["body"] == {"p_worker_id": "w1", "p_lease_seconds": 120}
    assert seen["auth"] == "Bearer service-key"
    assert job.storage_path == "u1/s1/v1.mp4" and job.attempts == 1


def test_claim_returns_none_when_queue_empty():
    assert _store(lambda r: httpx.Response(200, json=None)).claim("w1", 60) is None


def test_lease_lost_is_mapped():
    body = {"code": "P0001", "message": "lease_lost"}
    with pytest.raises(LeaseLost):
        _store(lambda r: httpx.Response(400, json=body)).complete("j1", "w1", {})


def test_server_errors_are_transient():
    with pytest.raises(TransientStoreError):
        _store(lambda r: httpx.Response(503, text="unavailable")).claim("w1", 60)


def test_download_streams_and_maps_missing(tmp_path):
    from picklepro.worker.store import Job

    job = Job(**JOB)

    def ok(req):
        assert req.url.path == "/storage/v1/object/session-videos/u1/s1/v1.mp4"
        return httpx.Response(200, content=b"video-bytes")

    dest = tmp_path / "v.mp4"
    _store(ok).download_video(job, dest)
    assert dest.read_bytes() == b"video-bytes"
    with pytest.raises(VideoMissing):
        _store(lambda r: httpx.Response(400, json={"statusCode": "404", "error": "not_found"})).download_video(job, dest)


def test_retention_deletes_storage_before_marking_database():
    calls = []

    def handler(req):
        calls.append((req.method, req.url.path))
        if req.url.path.endswith("claim_expired_raw_video"):
            return httpx.Response(200, json=[{"id": "v1", "storage_bucket": "session-videos", "storage_path": "u1/s1/v1.mp4"}])
        if req.url.path == "/storage/v1/object/session-videos":
            assert req.method == "DELETE"
            assert json.loads(req.content) == {"prefixes": ["u1/s1/v1.mp4"]}
            return httpx.Response(200, json=[])
        assert req.url.path.endswith("complete_raw_video_deletion")
        assert json.loads(req.content) == {"p_video_id": "v1"}
        return httpx.Response(204)

    assert _store(handler).delete_one_expired_video()
    assert [path.rsplit("/", 1)[-1] for _, path in calls] == [
        "claim_expired_raw_video", "session-videos", "complete_raw_video_deletion",
    ]


def test_retention_keeps_database_pending_when_storage_fails():
    calls = []

    def handler(req):
        calls.append(req.url.path)
        if req.url.path.endswith("claim_expired_raw_video"):
            return httpx.Response(200, json=[{"id": "v1", "storage_bucket": "session-videos", "storage_path": "u1/s1/v1.mp4"}])
        return httpx.Response(503, text="storage unavailable")

    with pytest.raises(TransientStoreError):
        _store(handler).delete_one_expired_video()
    assert len(calls) == 2

import json
import sys

from conftest import write_constant_video
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_endpoint_reports_pipeline_version():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok" and r.json()["pipeline_version"]


def test_analysis_api_does_not_load_rag_dependencies():
    assert "chromadb" not in sys.modules and "anthropic" not in sys.modules
    assert all(route.path != "/api/v1/rag-coach" for route in app.routes)


def test_blank_video_returns_insufficient_data(tmp_path):
    data = write_constant_video(tmp_path / "black.mp4", frames=10).read_bytes()
    r = client.post("/analyze/video", files={"file": ("black.mp4", data, "video/mp4")})
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == "1.0"
    assert body["status"] == "insufficient_data"
    assert body["data_origin"] == "measured"
    assert body["coverage"]["frames_analyzed"] > 0


def test_calibrated_synthetic_upload(synthetic_clip):
    r = client.post(
        "/analyze/video?court_half=near&max_seconds=600",
        files={"file": ("synthetic.mp4", synthetic_clip.path.read_bytes(), "video/mp4")},
        data={"calibration": json.dumps(synthetic_clip.calibration)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["metrics"]["court_heatmap"]["status"] == "measured"
    assert body["coverage"]["fraction_of_video_analyzed"] == 1.0


def test_rejects_missing_file():
    assert client.post("/analyze/video").status_code == 422


def test_rejects_unsupported_type():
    r = client.post("/analyze/video", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_rejects_bad_calibration(tmp_path):
    data = write_constant_video(tmp_path / "black.mp4", frames=5).read_bytes()
    r = client.post("/analyze/video", files={"file": ("b.mp4", data, "video/mp4")},
                    data={"calibration": json.dumps({"image_width": 10, "image_height": 10, "points": []})})
    assert r.status_code == 422


def test_undecodable_file_is_an_error_not_a_result():
    r = client.post("/analyze/video", files={"file": ("junk.mp4", b"not a video" * 100, "video/mp4")})
    assert r.status_code == 422

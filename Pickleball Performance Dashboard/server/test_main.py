# test_main.py
import io
import os
import numpy as np
import cv2
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def _make_tiny_test_video() -> bytes:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    path = "test_tmp_video.mp4"
    writer = cv2.VideoWriter(path, fourcc, 10, (100, 100))
    for _ in range(10):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        writer.write(frame)
    writer.release()
    with open(path, "rb") as f:
        data = f.read()
    os.remove(path)
    return data


def test_analyze_video_returns_expected_schema():
    video_bytes = _make_tiny_test_video()
    response = client.post(
        "/analyze/video",
        files={"file": ("test.mp4", io.BytesIO(video_bytes), "video/mp4")},
    )
    assert response.status_code == 200
    data = response.json()

    for key in ["duration_seconds", "frame_count", "fps", "event_timeline",
                "heatmap", "player_positions", "message"]:
        assert key in data

    assert isinstance(data["event_timeline"], list)
    assert isinstance(data["heatmap"], list)
    assert isinstance(data["player_positions"], list)
    assert isinstance(data["message"], str)


def test_analyze_video_rejects_missing_file():
    response = client.post("/analyze/video")
    assert response.status_code == 422
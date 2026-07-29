# test_result_validation.py
from result_validation import normalize_analysis_result, _default_heatmap


def _base_result(**overrides):
    result = {
        "duration_seconds": 10.0,
        "frame_count": 5,
        "fps": 30.0,
        "event_timeline": [],
        "heatmap": [[0.0] * 6 for _ in range(4)],
        "player_positions": [],
        "message": "placeholder",
    }
    result.update(overrides)
    return result


def test_weak_detection_zero_frames():
    result = _base_result(frame_count=0)
    normalized = normalize_analysis_result(result)
    assert "No reliable player detections" in normalized["message"]


def test_weak_detection_empty_positions():
    result = _base_result(player_positions=[{"time_seconds": 1.0, "players": []}])
    normalized = normalize_analysis_result(result)
    assert "No reliable player detections" in normalized["message"]


def test_strong_detection_produces_success_message():
    result = _base_result(
        frame_count=5,
        player_positions=[
            {"time_seconds": 1.0, "players": [{"track_id": 1, "label": "player", "bbox": [10, 10, 50, 50]}]}
        ],
        heatmap=[[1.0, 0.0, 0.0, 0.0, 0.0, 0.0]] + [[0.0] * 6 for _ in range(3)],
    )
    normalized = normalize_analysis_result(result)
    assert "Analysis complete" in normalized["message"]
    assert "1 player detection" in normalized["message"]


def test_missing_fields_get_safe_defaults():
    result = {"duration_seconds": 5.0, "frame_count": 0, "fps": 30.0}
    normalized = normalize_analysis_result(result)
    assert normalized["event_timeline"] == []
    assert normalized["player_positions"] == []
    assert normalized["heatmap"] == _default_heatmap()


def test_default_heatmap_shape():
    heatmap = _default_heatmap(rows=4, cols=6)
    assert len(heatmap) == 4
    assert all(len(row) == 6 for row in heatmap)
    assert all(cell == 0.0 for row in heatmap for cell in row)
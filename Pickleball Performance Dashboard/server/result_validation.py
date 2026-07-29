# result_validation.py
from __future__ import annotations
from typing import Any, Dict


def normalize_analysis_result(result: Dict[str, Any]) -> Dict[str, Any]:
    total_detections = sum(
        len(snapshot.get("players", []))
        for snapshot in result.get("player_positions", [])
    )
    frame_count = result.get("frame_count", 0)

    heatmap = result.get("heatmap") or []
    heatmap_has_signal = any(
        cell > 0 for row in heatmap for cell in row
    )

    is_weak_detection = (
        frame_count == 0
        or total_detections == 0
        or not heatmap_has_signal
    )

    if is_weak_detection:
        result["message"] = (
            "No reliable player detections were found in this video. "
            "Results below are placeholders — try a clearer clip or "
            "check that the CV model is configured correctly."
        )
    else:
        result["message"] = (
            f"Analysis complete. Tracked {total_detections} player "
            f"detection(s) across {frame_count} frame(s)."
        )

    result["event_timeline"] = result.get("event_timeline") or []
    result["player_positions"] = result.get("player_positions") or []
    result["heatmap"] = heatmap or _default_heatmap()

    return result


def _default_heatmap(rows: int = 4, cols: int = 6):
    return [[0.0 for _ in range(cols)] for _ in range(rows)]
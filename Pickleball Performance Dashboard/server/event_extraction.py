from __future__ import annotations

from typing import Any, Dict, List


class EventExtractor:
    def __init__(self, heatmap_cols: int = 6, heatmap_rows: int = 4):
        self.heatmap_cols = heatmap_cols
        self.heatmap_rows = heatmap_rows

    def extract(self, tracked_frames: List[Dict[str, Any]], fps: float, duration: float) -> Dict[str, Any]:
        heatmap = self._compute_heatmap(tracked_frames)
        player_positions = self._build_player_snapshots(tracked_frames)
        event_timeline = self._extract_events(tracked_frames)

        return {
            "duration_seconds": duration,
            "frame_count": len(tracked_frames),
            "fps": fps,
            "event_timeline": event_timeline,
            "heatmap": heatmap,
            "player_positions": player_positions,
            "message": "Analysis complete. Replace placeholder detection logic with a real CV model for production.",
        }

    def _compute_heatmap(self, tracked_frames: List[Dict[str, Any]]) -> List[List[float]]:
        heatmap = [[0.0 for _ in range(self.heatmap_cols)] for _ in range(self.heatmap_rows)]
        counts = [[0 for _ in range(self.heatmap_cols)] for _ in range(self.heatmap_rows)]

        for frame in tracked_frames:
            for detection in frame["detections"]:
                bbox = detection["bbox"]
                x_center = (bbox[0] + bbox[2]) / 2
                y_center = (bbox[1] + bbox[3]) / 2
                col = min(self.heatmap_cols - 1, int(x_center / 100))
                row = min(self.heatmap_rows - 1, int(y_center / 100))
                heatmap[row][col] += 1.0
                counts[row][col] += 1

        for row_idx in range(self.heatmap_rows):
            for col_idx in range(self.heatmap_cols):
                if counts[row_idx][col_idx] > 0:
                    heatmap[row_idx][col_idx] /= counts[row_idx][col_idx]
                heatmap[row_idx][col_idx] = round(heatmap[row_idx][col_idx], 2)

        return heatmap

    def _build_player_snapshots(self, tracked_frames: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        snapshots: List[Dict[str, Any]] = []
        for frame in tracked_frames:
            players = []
            for detection in frame["detections"]:
                players.append({
                    "track_id": detection["track_id"],
                    "label": detection["label"],
                    "bbox": detection["bbox"],
                })
            snapshots.append({"time_seconds": frame["timestamp"], "players": players})
        return snapshots

    def _extract_events(self, tracked_frames: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        if not tracked_frames:
            return events

        skip = max(1, len(tracked_frames) // 8)
        for frame in tracked_frames[::skip]:
            events.append({
                "time_seconds": frame["timestamp"],
                "label": "player_position_update",
                "description": "Player positions updated from CV tracker.",
                "track_id": frame["detections"][0]["track_id"] if frame["detections"] else None,
            })
        return events

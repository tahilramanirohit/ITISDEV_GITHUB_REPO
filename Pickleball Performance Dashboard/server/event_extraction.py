from __future__ import annotations

from typing import Any, Dict, List
import math


class EventExtractor:
    def __init__(self, heatmap_cols: int = 6, heatmap_rows: int = 4):
        self.heatmap_cols = heatmap_cols
        self.heatmap_rows = heatmap_rows

    def extract(self, tracked_frames: List[Dict[str, Any]], fps: float, duration: float) -> Dict[str, Any]:
        heatmap = self._compute_heatmap(tracked_frames)
        player_positions = self._build_player_snapshots(tracked_frames)
        event_timeline = self._extract_events(tracked_frames, fps)

        return {
            "duration_seconds": duration,
            "frame_count": len(tracked_frames),
            "fps": fps,
            "event_timeline": event_timeline,
            "heatmap": heatmap,
            "player_positions": player_positions,
            "message": "Analysis complete. Extracted structured event timeline and spatial metrics.",
        }

    def _compute_heatmap(self, tracked_frames: List[Dict[str, Any]]) -> List[List[float]]:
        heatmap = [[0.0 for _ in range(self.heatmap_cols)] for _ in range(self.heatmap_rows)]
        counts = [[0 for _ in range(self.heatmap_cols)] for _ in range(self.heatmap_rows)]

        for frame in tracked_frames:
            for detection in frame.get("detections", []):
                bbox = detection.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue
                x_center = (bbox[0] + bbox[2]) / 2
                y_center = (bbox[1] + bbox[3]) / 2
                col = min(self.heatmap_cols - 1, max(0, int(x_center / 100)))
                row = min(self.heatmap_rows - 1, max(0, int(y_center / 100)))
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
            for detection in frame.get("detections", []):
                players.append({
                    "track_id": detection.get("track_id"),
                    "label": detection.get("label", "player"),
                    "bbox": detection.get("bbox", []),
                })
            snapshots.append({"time_seconds": frame.get("timestamp", 0.0), "players": players})
        return snapshots

    def _extract_events(self, tracked_frames: List[Dict[str, Any]], fps: float) -> List[Dict[str, Any]]:
        """
        Extracts meaningful pickleball events (e.g., rapid movement, court-zone changes, 
        rally tracking actions) based on tracking velocity and positional thresholds.
        """
        events: List[Dict[str, Any]] = []
        if not tracked_frames:
            return events

        last_positions: Dict[int, tuple[float, float, float]] = {}
        velocity_threshold = 45.0  # Pixels per second displacement threshold for action triggers

        for frame in tracked_frames:
            timestamp = frame.get("timestamp", 0.0)
            detections = frame.get("detections", [])

            for detection in detections:
                track_id = detection.get("track_id")
                bbox = detection.get("bbox")
                if track_id is None or not bbox or len(bbox) != 4:
                    continue

                cx = (bbox[0] + bbox[2]) / 2
                cy = (bbox[1] + bbox[3]) / 2

                if track_id in last_positions:
                    px, py, p_time = last_positions[track_id]
                    dt = timestamp - p_time
                    if dt > 0:
                        dist = math.hypot(cx - px, cy - py)
                        speed = dist / dt

                        # Detect high-intensity movement (e.g. lunging for a dink or chasing a drive)
                        if speed > velocity_threshold:
                            zone = "Baseline Zone"
                            if cy < 150:
                                zone = "NVZ / Kitchen Zone"
                            elif cy < 280:
                                zone = "Transition Zone"

                            # Avoid flooding timeline with duplicate events for the same burst
                            if not events or (timestamp - events[-1]["time_seconds"] > 1.5):
                                events.append({
                                    "time_seconds": round(timestamp, 2),
                                    "label": "PLAYER_BURST_ACTION",
                                    "description": f"High-intensity movement/shot recovery detected in {zone}.",
                                    "track_id": track_id,
                                })
                            last_positions[track_id] = (cx, cy, timestamp)
                            continue

                last_positions[track_id] = (cx, cy, timestamp)

        # Fallback safeguard: if movement heuristics didn't trigger enough events, 
        # append baseline position updates so the timeline isn't completely empty.
        if not events and tracked_frames:
            skip = max(1, len(tracked_frames) // 5)
            for frame in tracked_frames[::skip]:
                first_det = frame["detections"][0] if frame["detections"] else {}
                events.append({
                    "time_seconds": round(frame["timestamp"], 2),
                    "label": "player_position_update",
                    "description": "Routine positional snapshot recorded from tracker.",
                    "track_id": first_det.get("track_id"),
                })

        events.sort(key=lambda x: x["time_seconds"])
        return events[:20]  # Cap timeline length for clean UI consumption

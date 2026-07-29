from __future__ import annotations
from typing import Any, Dict, List
import math

class EventExtractor:
    def __init__(self, heatmap_cols: int = 6, heatmap_rows: int = 4):
        self.heatmap_cols = heatmap_cols
        self.heatmap_rows = heatmap_rows
        # Define basic court zones for heuristics (normalized 0.0 to 1.0)
        self.kitchen_y_threshold = 0.4 
        self.baseline_y_threshold = 0.8

    def extract(self, tracked_frames: List[Dict[str, Any]], fps: float, duration: float) -> Dict[str, Any]:
        """
        Analyzes tracked frames to extract heatmaps, player snapshots, and high-level events.
        """
        heatmap = self._compute_heatmap(tracked_frames)
        player_positions = self._build_player_snapshots(tracked_frames)
        event_timeline = self._extract_events(player_positions, fps)

        return {
            "duration_seconds": duration,
            "frame_count": len(tracked_frames),
            "fps": fps,
            "event_timeline": event_timeline,
            "heatmap": heatmap,
            "player_positions": player_positions,
            "message": "Analysis complete. Events extracted via heuristic rules.",
        }

    def _compute_heatmap(self, tracked_frames: List[Dict[str, Any]]) -> List[List[float]]:
        # Initialize an empty heatmap
        heatmap = [[0.0 for _ in range(self.heatmap_cols)] for _ in range(self.heatmap_rows)]
        counts = [[0 for _ in range(self.heatmap_cols)] for _ in range(self.heatmap_rows)]

        for frame in tracked_frames:
            for detection in frame.get("detections", []):
                bbox = detection.get("bbox")
                if not bbox or len(bbox) != 4: continue
                
                # Calculate center point
                x_center = (bbox[0] + bbox[2]) / 2
                y_center = (bbox[1] + bbox[3]) / 2
                
                # Map to grid (assuming an arbitrary 600x400 normalized space for now)
                # In a real app, you'd use a homography matrix here.
                col = min(self.heatmap_cols - 1, max(0, int(x_center / 100)))
                row = min(self.heatmap_rows - 1, max(0, int(y_center / 100)))
                
                heatmap[row][col] += 1.0
                counts[row][col] += 1

        # Normalize heatmap values to 0.0 - 1.0 range based on maximum concentration
        max_val = 0
        for r in range(self.heatmap_rows):
            for c in range(self.heatmap_cols):
                if heatmap[r][c] > max_val:
                    max_val = heatmap[r][c]
                    
        if max_val > 0:
            for r in range(self.heatmap_rows):
                for c in range(self.heatmap_cols):
                    heatmap[r][c] = round(heatmap[r][c] / max_val, 2)

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
            snapshots.append({"time_seconds": frame.get("timestamp", 0), "players": players})
        return snapshots

    def _extract_events(self, player_positions: List[Dict[str, Any]], fps: float) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        if not player_positions:
            return events

        # Heuristic 1: Detect significant movement (potential shot/recovery)
        last_positions = {}
        movement_threshold = 50.0 # Pixels moved to trigger an event

        for snap in player_positions:
            time_sec = snap["time_seconds"]
            for player in snap["players"]:
                tid = player["track_id"]
                bbox = player["bbox"]
                if not tid or not bbox or len(bbox) != 4: continue
                
                cx = (bbox[0] + bbox[2]) / 2
                cy = (bbox[1] + bbox[3]) / 2
                
                if tid in last_positions:
                    prev_x, prev_y, prev_time = last_positions[tid]
                    dist = math.hypot(cx - prev_x, cy - prev_y)
                    
                    # If they moved fast in a short time, call it an action
                    time_diff = time_sec - prev_time
                    if time_diff > 0 and (dist / time_diff) > (movement_threshold * fps):
                        # Determine zone heuristically (assuming y goes down)
                        # Normally requires court homography
                        zone = "Baseline"
                        if cy < 200: zone = "NVZ (Kitchen)"
                        elif cy < 350: zone = "Transition Zone"
                        
                        events.append({
                            "time_seconds": round(time_sec, 2),
                            "label": "RAPID_MOVEMENT",
                            "description": f"Rapid movement detected in {zone}",
                            "track_id": tid,
                        })
                        # Update last position to prevent rapid-fire events
                        last_positions[tid] = (cx, cy, time_sec + 1.0) 
                        continue

                last_positions[tid] = (cx, cy, time_sec)

        # Sort events chronologically
        events.sort(key=lambda x: x["time_seconds"])
        
        # Limit to top 15 events to avoid overwhelming the UI
        return events[:15]

from __future__ import annotations
from typing import Any, Dict, List, Tuple
import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Try to import Ultralytics YOLO. If not installed, gracefully fall back to OpenCV methods.
try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False

def calculate_iou(box1: List[int], box2: List[int]) -> float:
    """Calculate Intersection over Union (IoU) for two bounding boxes (x1, y1, x2, y2)."""
    x1_inter = max(box1[0], box2[0])
    y1_inter = max(box1[1], box2[1])
    x2_inter = min(box1[2], box2[2])
    y2_inter = min(box1[3], box2[3])

    inter_area = max(0, x2_inter - x1_inter) * max(0, y2_inter - y1_inter)
    
    box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])
    
    union_area = box1_area + box2_area - inter_area
    return inter_area / union_area if union_area > 0 else 0.0


class PlayerTracker:
    def __init__(self, model_path: str | None = None):
        self.model_path = model_path
        self.use_yolo = HAS_YOLO
        self.yolo_model = None

        if self.use_yolo:
            try:
                # Load YOLOv8 nano model (fastest). If model_path is None, defaults to weights download.
                self.yolo_model = YOLO(self.model_path or 'yolov8n.pt')
                logger.info("YOLOv8 successfully loaded for Player Tracking.")
            except Exception as e:
                logger.warning(f"Failed to load YOLOv8 model: {e}. Falling back to OpenCV.")
                self.use_yolo = False

        # State for OpenCV fallback tracker
        self.next_id = 1
        self.active_tracks: Dict[int, List[int]] = {}  # { track_id: [x1, y1, x2, y2] }
        # Initialize background subtractor for OpenCV fallback (MOG2 is robust to shadows)
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=16, detectShadows=True)

    def detect_and_track_yolo(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Uses Ultralytics YOLOv8 with built-in persist=True tracking."""
        # classes=[0] filters for 'person' class only
        results = self.yolo_model.track(frame, persist=True, classes=[0], verbose=False)
        
        detections = []
        if results and len(results) > 0 and results[0].boxes:
            boxes = results[0].boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                conf = float(box.conf[0].cpu().numpy())
                
                # YOLOv8 track returns an ID if persist=True was successful
                track_id = int(box.id[0].cpu().numpy()) if box.id is not None else None
                
                detections.append({
                    "track_id": track_id,
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "confidence": round(conf, 2),
                    "label": "player"
                })
        return detections

    def detect_and_track_opencv(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Fallback heuristic tracker using background subtraction + IoU mapping."""
        # 1. Detect moving foreground objects
        fg_mask = self.bg_subtractor.apply(frame)
        
        # Clean up mask (remove noise)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)

        # 2. Find bounding boxes
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        current_detections = []
        
        # Filter for player-sized contours (heuristic: min area)
        min_area = (frame.shape[0] * frame.shape[1]) * 0.01 
        
        for contour in contours:
            if cv2.contourArea(contour) > min_area:
                x, y, w, h = cv2.boundingRect(contour)
                # Aspect ratio check (humans are usually taller than they are wide)
                if h > w * 0.8:  
                    current_detections.append([x, y, x + w, y + h])

        # 3. Simple IoU Tracking (Assign stable IDs to moving boxes)
        new_active_tracks = {}
        tracked_output = []

        for bbox in current_detections:
            best_match_id = None
            best_iou = 0.3  # Minimum IoU threshold to consider it the same object

            for track_id, prev_bbox in self.active_tracks.items():
                iou = calculate_iou(bbox, prev_bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_match_id = track_id

            if best_match_id is not None:
                new_active_tracks[best_match_id] = bbox
                # Remove matched ID from active tracks so it isn't matched twice
                del self.active_tracks[best_match_id]
            else:
                # New object detected
                best_match_id = self.next_id
                self.next_id += 1
                new_active_tracks[best_match_id] = bbox

            tracked_output.append({
                "track_id": best_match_id,
                "bbox": bbox,
                "confidence": 0.75, # Synthetic confidence for OpenCV fallback
                "label": "player"
            })

        self.active_tracks = new_active_tracks
        return tracked_output

    def track(self, frames: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Processes a list of frames and assigns persistent tracking data."""
        tracked_frames: List[Dict[str, Any]] = []
        
        for frame_meta in frames:
            if self.use_yolo and self.yolo_model is not None:
                detections = self.detect_and_track_yolo(frame_meta["frame"])
            else:
                detections = self.detect_and_track_opencv(frame_meta["frame"])

            tracked_frames.append({
                "timestamp": frame_meta["timestamp"],
                "detections": detections,
            })
            
        return tracked_frames

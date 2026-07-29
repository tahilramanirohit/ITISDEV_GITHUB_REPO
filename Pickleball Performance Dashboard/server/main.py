from pathlib import Path
import tempfile
from typing import Any, Dict, List

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from player_tracking import PlayerTracker
from event_extraction import EventExtractor
from video_capture import VideoCaptureService

app = FastAPI(title="Pickleball CV Backend", version="0.1.0")


class EventItem(BaseModel):
    time_seconds: float
    label: str
    description: str
    track_id: int | None = None


class PositionSnapshot(BaseModel):
    time_seconds: float
    players: List[Dict[str, Any]]


class AnalysisResult(BaseModel):
    duration_seconds: float
    frame_count: int
    fps: float
    event_timeline: List[EventItem]
    heatmap: List[List[float]]
    player_positions: List[PositionSnapshot]
    message: str


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze/video", response_model=AnalysisResult)
async def analyze_video(file: UploadFile = File(...), max_frames: int = 300):
    suffix = Path(file.filename).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        tmp.write(await file.read())

    try:
        capture = VideoCaptureService(str(tmp_path))
        frames, fps, duration = capture.read_frames(max_frames=max_frames)
        tracker = PlayerTracker()
        tracked_frames = tracker.track(frames)
        extractor = EventExtractor()
        result = extractor.extract(tracked_frames, fps=fps, duration=duration)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

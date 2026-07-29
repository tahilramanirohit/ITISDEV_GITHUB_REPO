from rag_coach import RAGRequest, RAGResponse as RAGOutput, generate_coach_response
from pathlib import Path
import tempfile
from typing import Any, Dict, List
import logging

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from player_tracking import PlayerTracker
from event_extraction import EventExtractor
from video_capture import VideoCaptureService

logger = logging.getLogger(__name__)

app = FastAPI(title="Pickleball CV Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)

# --- Configuration for Uploads ---
MAX_FILE_SIZE_MB = 50
ALLOWED_MIME_TYPES = ["video/mp4", "video/x-msvideo", "video/quicktime", "video/webm"]
MAX_FRAMES_LIMIT = 500

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

@app.post("/api/v1/rag-coach", response_model=RAGOutput)
async def rag_coach_endpoint(payload: RAGRequest):
    try:
        # Passes the request to our LangChain/ChromaDB pipeline
        return generate_coach_response(payload)
    except Exception as e:
        logger.error(f"RAG Coaching Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/video", response_model=AnalysisResult)
async def analyze_video(file: UploadFile = File(...), max_frames: int = 300):
    # 1. Validation: Mime Type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type}. Allowed: MP4, AVI, MOV, WEBM."
        )

    # 2. Validation: Frame limit bounds
    if max_frames > MAX_FRAMES_LIMIT:
        max_frames = MAX_FRAMES_LIMIT

    suffix = Path(file.filename).suffix or ".mp4"
    
    # 3. Validation: File Size (Read in chunks to prevent memory overload)
    file_size = 0
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        while True:
            chunk = await file.read(1024 * 1024) # read 1MB at a time
            if not chunk:
                break
            file_size += len(chunk)
            if file_size > (MAX_FILE_SIZE_MB * 1024 * 1024):
                tmp_path.unlink() # Clean up
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_MB}MB."
                )
            tmp.write(chunk)

    try:
        # Run CV Pipeline
        capture = VideoCaptureService(str(tmp_path))
        frames, fps, duration = capture.read_frames(max_frames=max_frames)
        
        tracker = PlayerTracker()
        tracked_frames = tracker.track(frames)
        
        extractor = EventExtractor()
        result = extractor.extract(tracked_frames, fps=fps, duration=duration)
        
        return result
    except ValueError as ve:
        # Catch specific VideoCaptureService errors (e.g., bad codec)
        logger.error(f"Video processing ValueError: {ve}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except Exception as exc:
        logger.error(f"Unexpected error during analysis: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An error occurred while processing the video.")
    finally:
        # Always clean up temp file
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

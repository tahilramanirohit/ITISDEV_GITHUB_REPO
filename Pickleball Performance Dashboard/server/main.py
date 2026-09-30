"""Local development API for the CV pipeline.

``POST /analyze/video`` is a *synchronous local prototype*: it analyzes an
uploaded file inside the request. The application flow uses Supabase Storage
plus the job worker (``python -m picklepro.worker``) instead; this endpoint
exists so the pipeline can be exercised from the browser without Supabase.
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import threading
import time
from pathlib import Path
from typing import Dict, Literal, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from picklepro import PIPELINE_VERSION
from picklepro.contract import AnalysisResultV1
from picklepro.court import CalibrationError, calibration_from_dict
from picklepro.court_review import checked_review, proposed_calibration, review_points
from picklepro.detection import DetectorUnavailable
from picklepro.models import load_dotenv, log_setup, resolve_models
from picklepro.pipeline import AnalysisOptions, analyze_video
from picklepro.spatial import Selection
from picklepro.video_io import VideoOpenError

logger = logging.getLogger(__name__)
load_dotenv()
log_setup(resolve_models(), logger)

app = FastAPI(title="PicklePro CV Backend (local prototype)", version=PIPELINE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv(
        "CORS_ALLOW_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# --- Configuration for Uploads ---
MAX_FILE_SIZE_MB = int(os.getenv("LOCAL_API_MAX_FILE_SIZE_MB", "150"))
ALLOWED_MIME_TYPES = ["video/mp4", "video/x-msvideo", "video/quicktime", "video/webm"]
# The request blocks while analyzing, so the prototype caps analyzed time.
MAX_SECONDS_LIMIT = float(os.getenv("LOCAL_API_MAX_SECONDS", "600"))


# Progress of analyses in this process, keyed by an id the browser chooses, so
# the page can show a progress bar while the analysis request is still open.
_PROGRESS: Dict[str, Dict[str, object]] = {}
_PROGRESS_LOCK = threading.Lock()
_PROGRESS_KEEP_S = 600
_PROGRESS_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _set_progress(progress_id: Optional[str], stage: str, fraction: float) -> None:
    if not progress_id:
        return
    now = time.time()
    with _PROGRESS_LOCK:
        for key in [k for k, v in _PROGRESS.items() if now - float(v["updated"]) > _PROGRESS_KEEP_S]:
            del _PROGRESS[key]
        _PROGRESS[progress_id] = {"stage": stage, "progress": round(min(1.0, max(0.0, fraction)), 4), "updated": now}


@app.get("/analyze/progress/{progress_id}")
def analysis_progress(progress_id: str) -> Dict[str, object]:
    with _PROGRESS_LOCK:
        entry = _PROGRESS.get(progress_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="No analysis with this id is running.")
    return {"stage": entry["stage"], "progress": entry["progress"]}


@app.get("/health")
async def health() -> Dict[str, object]:
    # Resolved on each call so newly added model files are picked up without a restart.
    return {"status": "ok", "pipeline_version": PIPELINE_VERSION, "models": resolve_models().describe()}


def _read_still(frame: UploadFile) -> np.ndarray:
    if frame.content_type not in ("image/jpeg", "image/png"):
        raise HTTPException(status_code=415, detail="Court preview needs a JPEG or PNG still frame.")
    data = frame.file.read(5_000_001)
    if len(data) > 5_000_000:
        raise HTTPException(status_code=413, detail="Court preview image is too large.")
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[1] < 320 or image.shape[0] < 240:
        raise HTTPException(status_code=422, detail="Could not read a usable court preview image.")
    return image


@app.post("/court/preview")
def court_preview(frame: UploadFile = File(...)) -> Dict[str, object]:
    """Propose editable painted-court landmarks; never publish measurements."""
    image = _read_still(frame)
    models = resolve_models()
    try:
        cal = proposed_calibration(image, models.court_weights)
    except DetectorUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if cal is None:
        raise HTTPException(status_code=422, detail="Court lines could not be mapped reliably. Place points manually or use a clearer fixed-camera frame.")
    return {"image_width": image.shape[1], "image_height": image.shape[0], "points": review_points(cal),
            "origin": "automatic_proposal"}


@app.post("/court/validate")
def court_validate(frame: UploadFile = File(...), calibration: str = Form(...)) -> Dict[str, object]:
    """Check the player's corrected geometry against the painted lines."""
    image = _read_still(frame)
    try:
        cal = checked_review(json.loads(calibration), image)
    except (CalibrationError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"Court correction: {exc}") from exc
    return {"valid": True, "landmarks_used": cal.landmarks_used}


@app.post("/analyze/video", response_model=AnalysisResultV1)
def analyze_video_endpoint(
    file: UploadFile = File(...),
    max_seconds: float = Query(120.0, gt=0, description="Stop after this many seconds (reported in coverage)."),
    target_fps: float = Query(10.0, gt=0, le=60),
    frame_mode: Literal["standard", "near_players", "every_frame"] = Query(
        "standard", description="standard; near_players (every frame while the ball is near a player); every_frame."),
    court_half: Optional[Literal["near", "far"]] = Query(None),
    track_id: Optional[int] = Query(None),
    calibration: Optional[str] = Form(None, description="Calibration JSON (see `python -m picklepro.cli landmarks`)."),
    calibration_source: Optional[Literal["user_confirmed"]] = Form(None),
    calibration_frame_s: float = Form(0.0),
    progress_id: Optional[str] = Query(None, description="Poll GET /analyze/progress/{progress_id} while this runs."),
):
    if progress_id is not None and not _PROGRESS_ID.match(progress_id):
        raise HTTPException(status_code=422, detail="progress_id must be 8-64 letters, digits, - or _.")
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type}. Allowed: MP4, AVI, MOV, WEBM.",
        )

    try:
        calib = checked_review(json.loads(calibration)) if calibration and calibration_source else (
            calibration_from_dict(json.loads(calibration)) if calibration else None)
    except (CalibrationError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"Calibration: {exc}")

    selection = None
    if track_id is not None:
        selection = Selection("track_id", track_id=track_id)
    elif court_half:
        selection = Selection("court_half", court_half=court_half)
    else:
        selection = Selection("court_half", court_half="near")

    suffix = Path(file.filename or "upload.mp4").suffix or ".mp4"
    # Safely write the file in chunks to prevent Memory (RAM) crashes
    file_size = 0
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)
        while True:
            chunk = file.file.read(1024 * 1024)  # read 1MB at a time
            if not chunk:
                break
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
                tmp.close()
                tmp_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_MB}MB.",
                )
            tmp.write(chunk)

    models = resolve_models()
    _set_progress(progress_id, "analyzing", 0.0)
    try:
        result = analyze_video(tmp_path, AnalysisOptions(
            max_seconds=min(max_seconds, MAX_SECONDS_LIMIT), target_fps=target_fps,
            calibration=calib, selection=selection, source_filename=file.filename,
            calibration_source=calibration_source, calibration_frame_s=calibration_frame_s,
            detector=models.detector, yolo_weights=models.yolo_weights,
            court_weights=models.court_weights, ball_weights=models.ball_weights,
            pose_weights=models.pose_weights, frame_mode=frame_mode,
        ), progress=lambda f: _set_progress(progress_id, "analyzing", f))
        _set_progress(progress_id, "finishing", 1.0)
        return result
    except VideoOpenError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except DetectorUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except CalibrationError as exc:
        raise HTTPException(status_code=422, detail=f"Court correction: {exc}")
    except Exception as exc:  # noqa: BLE001 - surface as a failure, never as a result
        logger.exception("Unexpected error during analysis")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis failed: {exc}")
    finally:
        tmp_path.unlink(missing_ok=True)


# The RAG coaching prototype is outside the first two increments. It is only
# mounted when explicitly enabled, so the analysis API does not depend on
# chromadb/anthropic and never serves coaching text built from sample metrics.
if os.getenv("PICKLEPRO_ENABLE_EXPERIMENTAL_RAG") == "1":  # pragma: no cover
    from rag_coach import RAGRequest, RAGResponse as RAGOutput, generate_coach_response

    @app.post("/api/v1/rag-coach", response_model=RAGOutput)
    async def rag_coach_endpoint(payload: RAGRequest):
        try:
            return generate_coach_response(payload)
        except Exception as e:
            logger.error(f"RAG Coaching Error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

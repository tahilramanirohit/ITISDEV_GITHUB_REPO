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
import tempfile
from pathlib import Path
from typing import Dict, Literal, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from picklepro import PIPELINE_VERSION
from picklepro.contract import AnalysisResultV1
from picklepro.court import CalibrationError, calibration_from_dict
from picklepro.detection import DetectorUnavailable
from picklepro.pipeline import AnalysisOptions, analyze_video
from picklepro.spatial import Selection
from picklepro.video_io import VideoOpenError

logger = logging.getLogger(__name__)

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


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "pipeline_version": PIPELINE_VERSION}


@app.post("/analyze/video", response_model=AnalysisResultV1)
def analyze_video_endpoint(
    file: UploadFile = File(...),
    max_seconds: float = Query(120.0, gt=0, description="Stop after this many seconds (reported in coverage)."),
    target_fps: float = Query(10.0, gt=0, le=60),
    court_half: Optional[Literal["near", "far"]] = Query(None),
    track_id: Optional[int] = Query(None),
    calibration: Optional[str] = Form(None, description="Calibration JSON (see `python -m picklepro.cli landmarks`)."),
):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type}. Allowed: MP4, AVI, MOV, WEBM.",
        )

    try:
        calib = calibration_from_dict(json.loads(calibration)) if calibration else None
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

    try:
        return analyze_video(tmp_path, AnalysisOptions(
            max_seconds=min(max_seconds, MAX_SECONDS_LIMIT), target_fps=target_fps,
            calibration=calib, selection=selection, source_filename=file.filename,
            court_weights=os.getenv("PICKLEPRO_COURT_WEIGHTS"),
            ball_weights=os.getenv("PICKLEPRO_BALL_WEIGHTS"),
        ))
    except VideoOpenError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except DetectorUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
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

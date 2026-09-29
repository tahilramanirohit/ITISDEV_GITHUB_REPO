"""Analysis result contract (schema version 1).

This module is the single source of truth for the result shape. The TypeScript
mirror lives in ``src/lib/analysis/contract.ts`` and both are checked against
``contracts/analysis_result.v1.schema.json`` by the test suites.

Design rules:

* A job that could not run is a *job failure*, not a result. A result only
  exists when the video was read.
* ``status == "insufficient_data"`` is a legitimate outcome and must never be
  rewritten into a success message.
* Every metric carries its own status and validation level so the UI can say
  exactly what is measured, what is missing, and what has not been validated.
* ``confidence`` is ``None`` unless a model actually produced a score.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1.0"

ResultStatus = Literal["ok", "insufficient_data"]
DataOrigin = Literal["measured", "test_fixture"]
MetricStatus = Literal["measured", "insufficient_data", "not_computed", "experimental"]
# How far a metric's accuracy has been checked. Nothing is "validated" until it
# has been compared against labelled real footage.
ValidationLevel = Literal["not_evaluated", "synthetic_only", "evaluated_on_real_footage"]
MetricScope = Literal["whole_clip", "selected_view"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DetectorInfo(_Model):
    name: str
    confidence_is_model_score: bool = Field(
        description="True only when per-detection confidence comes from a model. "
        "Motion-based detection has no confidence and reports null."
    )


class SourceInfo(_Model):
    filename: Optional[str] = None
    sha256: Optional[str] = None


class Provenance(_Model):
    pipeline_version: str
    generated_at: str
    detector: DetectorInfo
    ball_detector: Optional[DetectorInfo] = None
    source: SourceInfo


class VideoInfo(_Model):
    width: int
    height: int
    fps: float
    frame_count_reported: Optional[int] = Field(
        None, description="Frame count from the container header; may be approximate."
    )
    container_duration_s: Optional[float] = Field(
        None, description="frame_count_reported / fps; null when the container does not report it."
    )


class Coverage(_Model):
    analyzed_start_s: float
    analyzed_end_s: float
    analyzed_duration_s: float
    frames_decoded: int
    frames_analyzed: int
    sample_stride: int = Field(description="Every Nth decoded frame was analyzed.")
    decode_failures: int
    stopped_early_reason: Optional[str] = Field(
        None, description="Set when analysis stopped before the end of the video (e.g. max_seconds)."
    )
    fraction_of_video_analyzed: Optional[float] = None
    frames_with_detections: int
    frames_with_ball_detections: int = 0
    selected_view_duration_s: Optional[float] = Field(
        None, description="Duration of the selected camera view when a cut was detected; null for a continuous video."
    )


class CalibrationSummary(_Model):
    method: Literal["manual_landmarks", "auto_model_landmarks"]
    court_model: str
    landmarks_used: List[str]
    reprojection_rmse_px: float
    reprojection_rmse_m: float
    quality: Literal["good", "poor"]


class PlayerSelectionSummary(_Model):
    method: Literal["track_id", "court_half"]
    track_id: Optional[int] = None
    court_half: Optional[Literal["near", "far"]] = None
    tracked_time_s: float
    tracked_fraction: float = Field(description="tracked_time_s / selected view duration, or whole analyzed duration for a continuous video")
    ambiguous_frames: int = Field(0, description="Frames excluded because the selection matched >1 detection.")


class TrackSummary(_Model):
    track_id: int
    first_seen_s: float
    last_seen_s: float
    observed_frames: int


class PlayerBox(_Model):
    track_id: Optional[int] = None
    bbox: List[int] = Field(min_length=4, max_length=4)
    confidence: Optional[float] = None
    selected: bool = Field(False, description="True when this box is the player chosen for court feedback in this frame.")


class PositionSnapshot(_Model):
    time_seconds: float
    players: List[PlayerBox]


class BallSnapshot(_Model):
    time_seconds: float
    bbox: List[int] = Field(min_length=4, max_length=4)
    confidence: float = Field(ge=0, le=1)


class CourtLinesSnapshot(_Model):
    time_seconds: float
    lines: List[List[int]] = Field(description="Court lines as [x1, y1, x2, y2] image pixels, valid until the next snapshot; "
                                               "empty when the court was not mapped from this time on.")


class Metric(_Model):
    status: MetricStatus
    validation: ValidationLevel = "not_evaluated"
    scope: MetricScope = "whole_clip"
    reason: Optional[str] = Field(None, description="Why the metric is missing, partial, or experimental.")


class HeatmapValue(_Model):
    units: Literal["seconds"] = "seconds"
    coordinate_system: str
    cell_size_m: float
    x_edges_m: List[float]
    y_edges_m: List[float]
    dwell_seconds: List[List[float]] = Field(description="rows follow y (near→far), columns follow x (left→right)")
    tracked_time_s: float
    outside_mapped_area_s: float


class CourtHeatmapMetric(Metric):
    value: Optional[HeatmapValue] = None


class ZoneOccupancyValue(_Model):
    zone_definitions: Dict[str, str]
    seconds: Dict[str, float]
    fraction_of_tracked_time: Dict[str, float]


class ZoneOccupancyMetric(Metric):
    value: Optional[ZoneOccupancyValue] = None


class PositioningValue(_Model):
    court_half: Literal["near", "far"] = Field(description="The selected player's side; depths are from this baseline.")
    band_definitions: Dict[str, str]
    seconds: Dict[str, float]
    fraction_of_mapped_time: Dict[str, float]
    mapped_time_s: float
    left_side_fraction: Optional[float] = Field(
        None, description="Share of in-court time on the player's own left half, facing the net.")
    transition_lingers: int = Field(description="Continuous stays of at least 2 s in the transition band.")
    longest_transition_linger_s: Optional[float] = None
    approaches_to_kitchen_line: int = Field(description="Moves from the baseline bands to the kitchen-line bands.")
    median_approach_s: Optional[float] = Field(
        None, description="Median time from last baseline-area sample to first kitchen-line sample.")
    retreats_to_baseline: int
    distance_covered_m: float = Field(description="Path length of the smoothed foot position; includes walking between points.")


class PositioningMetric(Metric):
    value: Optional[PositioningValue] = None


ShotType = Literal["serve", "return", "drive", "drop", "dink", "volley", "lob", "overhead", "unclassified"]
ContactType = Literal["volley", "after_bounce", "unknown"]


class ShotEvent(_Model):
    time_seconds: float
    rally_index: int
    shot_number: int = Field(description="1-based position of the shot within its rally.")
    hitter_track_id: Optional[int] = None
    hitter_side: Optional[Literal["near", "far"]] = None
    by_selected_player: bool = False
    hitter_court_m: Optional[List[float]] = Field(None, min_length=2, max_length=2)
    shot_type: ShotType
    contact: ContactType = "unknown"
    ground_speed_mps: Optional[float] = Field(
        None, description="Horizontal ground distance to the next bounce or hitter divided by the time taken.")
    landing_court_m: Optional[List[float]] = Field(None, min_length=2, max_length=2)
    landed_in: Optional[bool] = Field(None, description="Whether the next observed bounce was inside the opponent's court.")
    evidence: str


class BounceEvent(_Model):
    time_seconds: float
    court_m: Optional[List[float]] = Field(None, min_length=2, max_length=2)
    in_court: Optional[bool] = None


class ShotsValue(_Model):
    type_definitions: Dict[str, str]
    shots: List[ShotEvent]
    bounces: List[BounceEvent]
    counts_by_type: Dict[str, int]
    selected_player_counts_by_type: Dict[str, int]


class ShotClassificationMetric(Metric):
    value: Optional[ShotsValue] = None


class RallySummary(_Model):
    rally_index: int
    start_s: float
    end_s: float
    shots: int


class RallyValue(_Model):
    rallies: List[RallySummary]
    rally_time_s: float


class RallySegmentationMetric(Metric):
    value: Optional[RallyValue] = None


class Metrics(_Model):
    court_heatmap: CourtHeatmapMetric
    zone_occupancy: ZoneOccupancyMetric
    # Defaulted so results stored before this metric existed still validate.
    positioning: PositioningMetric = Field(default_factory=lambda: PositioningMetric(
        status="not_computed", reason=POSITIONING_NOT_COMPUTED))
    rally_segmentation: RallySegmentationMetric
    shot_classification: ShotClassificationMetric


class AnalysisResultV1(_Model):
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    status: ResultStatus
    data_origin: DataOrigin
    message: str
    provenance: Provenance
    video: VideoInfo
    coverage: Coverage
    calibration: Optional[CalibrationSummary] = None
    player_selection: Optional[PlayerSelectionSummary] = None
    tracks: List[TrackSummary]
    player_positions: List[PositionSnapshot]
    ball_positions: List[BallSnapshot] = Field(default_factory=list)
    court_lines: List[CourtLinesSnapshot] = Field(default_factory=list)
    metrics: Metrics
    warnings: List[str]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def not_computed(reason: str) -> Metric:
    return Metric(status="not_computed", reason=reason)


# Reasons for metrics this pipeline deliberately does not produce yet.
POSITIONING_NOT_COMPUTED = "Positioning patterns were not computed for this result."
RALLY_NOT_COMPUTED = (
    "Rallies are found from detected ball hits, which needs a ball model. All other metrics are whole-clip metrics."
)
SHOTS_NOT_COMPUTED = (
    "Shot types need a ball model and a mapped court; one of them was not available for this video."
)


def json_schema() -> dict:
    return AnalysisResultV1.model_json_schema()

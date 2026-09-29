"""End-to-end analysis of one uploaded video → :class:`AnalysisResultV1`."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional

from . import PIPELINE_VERSION
from .auto_court import detect_court
from .ball_detection import BallDetector
from .ball_track import BallObservation, build_ball_track
from .contract import (
    RALLY_NOT_COMPUTED,
    SHOTS_NOT_COMPUTED,
    AnalysisResultV1,
    BallSnapshot,
    CalibrationSummary,
    CourtHeatmapMetric,
    Coverage,
    DetectorInfo,
    HeatmapValue,
    Metrics,
    PositioningMetric,
    PositioningValue,
    PlayerBox,
    PlayerSelectionSummary,
    PositionSnapshot,
    Provenance,
    BounceCandidate,
    RallyMetric,
    RallySummary,
    RallyValue,
    ShotContact,
    ShotMetric,
    ShotValue,
    SourceInfo,
    TrackSummary,
    VideoInfo,
    ZoneOccupancyMetric,
    ZoneOccupancyValue,
    utc_now_iso,
)
from .court import COURT_MODEL, CourtCalibration
from .detection import PlayerTracker
from .positioning import positioning_patterns
from . import shots as shot_rules
from .spatial import Selection, dwell_heatmap, select_player, zone_occupancy
from .video_io import ReadStats, iter_frames, probe, sha256_of

logger = logging.getLogger(__name__)

ProgressFn = Callable[[float], None]


@dataclass
class AnalysisOptions:
    detector: str = "motion"
    yolo_weights: Optional[str] = None
    court_weights: Optional[str] = None
    ball_weights: Optional[str] = None
    target_fps: float = 10.0
    ball_fps: float = 30.0          # ball tracking needs every frame of a 30 fps video
    max_seconds: Optional[float] = None
    calibration: Optional[CourtCalibration] = None
    selection: Optional[Selection] = None
    experimental_zones: bool = False
    min_tracked_seconds: float = 10.0
    min_tracked_fraction: float = 0.25
    include_positions: bool = True
    source_filename: Optional[str] = None
    compute_sha256: bool = True


def analyze_video(path: str | Path, options: AnalysisOptions | None = None,
                  progress: Optional[ProgressFn] = None) -> AnalysisResultV1:
    opts = options or AnalysisOptions()
    props = probe(path)
    stride = max(1, round(props.fps / opts.target_fps)) if opts.target_fps > 0 else 1
    frame_interval_s = stride / props.fps
    warnings: List[str] = []
    if not props.fps_reported:
        warnings.append("The video did not report a frame rate; 30 fps was assumed for timing.")

    calibration = opts.calibration
    calibration_method = "manual_landmarks"
    if calibration is None and opts.court_weights:
        scan_seconds = min(5.0, opts.max_seconds) if opts.max_seconds is not None else 5.0
        calibration = detect_court(path, props, opts.court_weights, seconds_to_scan=scan_seconds)
        if calibration is None:
            warnings.append("The court model could not find enough reliable landmarks in the opening video frames; provide manual calibration or check the camera view.")
        else:
            calibration_method = "auto_model_landmarks"
    if calibration is not None and calibration.image_size != (props.width, props.height):
        warnings.append(
            f"Calibration was made on a {calibration.image_size[0]}x{calibration.image_size[1]} image and "
            f"rescaled to the {props.width}x{props.height} video; this assumes identical framing."
        )
        calibration = calibration.scaled_to(props.width, props.height)

    tracker = PlayerTracker(detector=opts.detector, yolo_weights=opts.yolo_weights)
    ball_detector = BallDetector(opts.ball_weights) if opts.ball_weights else None
    ball_stride = max(1, round(props.fps / opts.ball_fps)) if opts.ball_fps > 0 else stride
    ball_obs: List[BallObservation] = []
    if not tracker.confidence_is_model_score:
        warnings.append(
            "Motion-based detection finds moving objects, not specifically people: stationary players can be "
            "missed and non-players (balls, shadows, passers-by) can be detected. Detection confidence is not available."
        )

    stats = ReadStats()
    per_frame: List[List[dict]] = []
    times: List[float] = []
    snapshots: List[PositionSnapshot] = []
    ball_snapshots: List[BallSnapshot] = []
    tracks: Dict[int, List[float]] = {}  # id -> [first, last, count]
    frames_with_detections = 0
    expected = props.container_duration_s

    for index, ts, frame in iter_frames(path, props.fps, stats, max_seconds=opts.max_seconds):
        if ball_detector is not None and index % ball_stride == 0:
            ball = ball_detector.detect(frame)
            if ball is not None:
                ball_snapshots.append(BallSnapshot(time_seconds=round(ts, 3), **ball))
                x1, y1, x2, y2 = ball["bbox"]
                ball_obs.append(BallObservation(ts, (x1 + x2) / 2, (y1 + y2) / 2, ball["confidence"]))
        if index % stride:
            continue
        detections = tracker.update(frame)
        per_frame.append(detections)
        times.append(ts)
        if detections:
            frames_with_detections += 1
            if opts.include_positions:
                snapshots.append(PositionSnapshot(
                    time_seconds=round(ts, 3),
                    players=[PlayerBox(track_id=d.get("track_id"), bbox=[int(v) for v in d["bbox"]],
                                       confidence=d.get("confidence")) for d in detections],
                ))
        for d in detections:
            tid = d.get("track_id")
            if tid is None:
                continue
            t = tracks.setdefault(tid, [ts, ts, 0])
            t[1] = ts
            t[2] += 1
        if progress and expected:
            progress(min(0.99, ts / expected))

    frames_analyzed = len(per_frame)
    start = times[0] if times else 0.0
    # Each analyzed frame stands for one sample interval; never report beyond
    # the end of the video or the requested cut-off.
    end = (times[-1] + frame_interval_s) if times else 0.0
    for limit in (expected, opts.max_seconds):
        if limit:
            end = min(end, limit)
    analyzed_duration = max(0.0, end - start)
    stopped_early = None
    if opts.max_seconds is not None and not stats.reached_end:
        stopped_early = f"Stopped at max_seconds={opts.max_seconds:g}; the rest of the video was not analyzed."
        warnings.append(stopped_early)
    if stats.decode_failures:
        warnings.append(f"{stats.decode_failures} frame(s) could not be decoded and were skipped.")
    if ball_detector is not None and not ball_snapshots:
        warnings.append("The ball model found no pickleball in the sampled frames; no ball positions are shown.")

    coverage = Coverage(
        analyzed_start_s=round(start, 3),
        analyzed_end_s=round(end, 3),
        analyzed_duration_s=round(analyzed_duration, 3),
        frames_decoded=stats.frames_decoded,
        frames_analyzed=frames_analyzed,
        sample_stride=stride,
        decode_failures=stats.decode_failures,
        stopped_early_reason=stopped_early,
        fraction_of_video_analyzed=round(min(1.0, analyzed_duration / expected), 4) if expected else None,
        frames_with_detections=frames_with_detections,
        frames_with_ball_detections=len(ball_snapshots),
    )

    heatmap_metric, zone_metric, positioning_metric, selection_summary, calib_summary = _court_metrics(
        per_frame, frame_interval_s, analyzed_duration, calibration, calibration_method, opts, warnings
    )

    if ball_detector is None:
        rally_metric = RallyMetric(status="not_computed", reason=RALLY_NOT_COMPUTED)
        shot_metric = ShotMetric(status="not_computed", reason=SHOTS_NOT_COMPUTED)
    else:
        rally_metric, shot_metric = _shot_metrics(
            ball_obs, per_frame, times, calibration, props, ball_stride / props.fps, start, end, opts)

    if frames_analyzed == 0:
        status, message = "insufficient_data", "No frames could be decoded from this video."
    elif frames_with_detections == 0:
        status, message = "insufficient_data", "No moving players were detected in the analyzed frames."
    elif heatmap_metric.status == "measured":
        status = "ok"
        message = (f"Court heatmap measured for the selected player over {selection_summary.tracked_time_s:.1f}s "
                   f"of tracked time ({selection_summary.tracked_fraction:.0%} of the analyzed {analyzed_duration:.1f}s)."
                   + _shot_note(shot_metric, rally_metric))
    elif shot_metric.value is not None:
        status = "ok"
        message = (_shot_note(shot_metric, rally_metric).strip()
                   + f" Court metrics were not produced: {heatmap_metric.reason}")
    else:
        status = "insufficient_data"
        message = f"Detections are available for review, but court metrics were not produced: {heatmap_metric.reason}"

    return AnalysisResultV1(
        status=status,
        data_origin="measured",
        message=message,
        provenance=Provenance(
            pipeline_version=PIPELINE_VERSION,
            generated_at=utc_now_iso(),
            detector=DetectorInfo(name=tracker.detector_name,
                                  confidence_is_model_score=tracker.confidence_is_model_score),
            ball_detector=DetectorInfo(name="ultralytics-yolo-ball", confidence_is_model_score=True)
            if ball_detector is not None else None,
            source=SourceInfo(filename=opts.source_filename or Path(path).name,
                              sha256=sha256_of(path) if opts.compute_sha256 else None),
        ),
        video=VideoInfo(
            width=props.width, height=props.height, fps=round(props.fps, 3),
            frame_count_reported=props.frame_count_reported,
            container_duration_s=round(expected, 3) if expected else None,
        ),
        coverage=coverage,
        calibration=calib_summary,
        player_selection=selection_summary,
        tracks=[TrackSummary(track_id=k, first_seen_s=round(v[0], 3), last_seen_s=round(v[1], 3),
                             observed_frames=int(v[2])) for k, v in sorted(tracks.items())],
        player_positions=snapshots,
        ball_positions=ball_snapshots,
        metrics=Metrics(
            court_heatmap=heatmap_metric,
            zone_occupancy=zone_metric,
            positioning=positioning_metric,
            rally_segmentation=rally_metric,
            shot_classification=shot_metric,
        ),
        warnings=warnings,
    )


def _court_metrics(per_frame, frame_interval_s, analyzed_duration, calibration, calibration_method,
                   opts: AnalysisOptions, warnings):
    zones_off = ZoneOccupancyMetric(
        status="not_computed",
        reason="Zone occupancy is experimental and disabled by default (enable with experimental_zones).",
    )
    calib_summary = None
    if calibration is None:
        reason = "Court not calibrated: at least 4 court landmarks are required."
        return (CourtHeatmapMetric(status="insufficient_data", reason=reason),
                zones_off, PositioningMetric(status="insufficient_data", reason=reason), None, None)

    calib_summary = CalibrationSummary(
        method=calibration_method, court_model=COURT_MODEL, landmarks_used=calibration.landmarks_used,
        reprojection_rmse_px=calibration.reprojection_rmse_px,
        reprojection_rmse_m=calibration.reprojection_rmse_m, quality=calibration.quality,
    )
    if calibration.quality == "poor":
        warnings.append(f"Calibration fit is poor (RMSE {calibration.reprojection_rmse_m:.2f} m); "
                        "check the landmark clicks. Court positions may be displaced.")

    sel = opts.selection
    if sel is None:
        reason = "No player selected: choose a track id or a court half."
        return (CourtHeatmapMetric(status="insufficient_data", reason=reason),
                zones_off, PositioningMetric(status="insufficient_data", reason=reason), None, calib_summary)

    track = select_player(per_frame, calibration, sel)
    tracked_time = track.observed * frame_interval_s
    fraction = tracked_time / analyzed_duration if analyzed_duration else 0.0
    selection_summary = PlayerSelectionSummary(
        method=sel.method, track_id=sel.track_id, court_half=sel.court_half,
        tracked_time_s=round(tracked_time, 3), tracked_fraction=round(fraction, 4),
        ambiguous_frames=track.ambiguous_frames,
    )
    if track.ambiguous_frames:
        warnings.append(f"{track.ambiguous_frames} frame(s) excluded because more than one detection matched the selection.")

    if tracked_time < opts.min_tracked_seconds or fraction < opts.min_tracked_fraction:
        reason = (f"Selected player was tracked for {tracked_time:.1f}s ({fraction:.0%} of analyzed time); "
                  f"at least {opts.min_tracked_seconds:g}s and {opts.min_tracked_fraction:.0%} are required.")
        return (CourtHeatmapMetric(status="insufficient_data", reason=reason), zones_off,
                PositioningMetric(status="insufficient_data", reason=reason), selection_summary, calib_summary)

    heatmap = CourtHeatmapMetric(
        status="measured", validation="not_evaluated",
        reason="Positional accuracy has not been evaluated on real footage. Whole-clip dwell time, including time between rallies.",
        value=HeatmapValue(**dwell_heatmap(track, frame_interval_s)),
    )
    zones = zones_off
    if opts.experimental_zones:
        zones = ZoneOccupancyMetric(
            status="experimental", validation="synthetic_only",
            reason="Zone boundaries are defined but positional error has only been measured on synthetic video. "
                   "Kitchen-line presence is not computed.",
            value=ZoneOccupancyValue(**zone_occupancy(track, frame_interval_s)),
        )
    positions = positioning_patterns(track, frame_interval_s, sel.court_half if sel.method == "court_half" else None)
    positioning = PositioningMetric(
        status="measured", validation="synthetic_only",
        reason="Depth bands, lingers and approaches from the selected player's smoothed foot position. Checked on "
               "synthetic video only; includes time between rallies; describes position, not shot quality.",
        value=PositioningValue(**positions),
    ) if positions else PositioningMetric(
        status="insufficient_data", reason="The selected player was never mapped inside their half of the court.")
    return heatmap, zones, positioning, selection_summary, calib_summary


def _shot_note(shot_metric: ShotMetric, rally_metric: RallyMetric) -> str:
    if shot_metric.value is None or rally_metric.value is None:
        return ""
    n = len(shot_metric.value.contacts)
    classified = n - shot_metric.value.counts.get("unclassified", 0)
    return (f" Experimental shot types: {n} contacts in {len(rally_metric.value.rallies)} rallies, "
            f"{classified} with a shot type.")


RALLY_DEFINITION = (
    "A run of ball activity with no gap longer than {gap:g} s. Complete only when the ball was seen out of play "
    "for at least {edge:g} s inside the clip before and after it; rallies cut by the clip are truncated."
)
SHOT_REASON = (
    "Rule-based shot types ({version}) from a single fixed camera. Speed and arc are image-space proxies. "
    "Not yet compared with hand-labelled footage, so treat every count as unvalidated."
)


def _shot_metrics(ball_obs, per_frame, times, calibration, props, ball_interval_s, start, end,
                  opts: AnalysisOptions):
    track = build_ball_track(ball_obs, props.height, ball_interval_s)
    players = [shot_rules.PlayerFrame(t, dets) for t, dets in zip(times, per_frame)]
    events = shot_rules.detect_events(track, players, calibration)
    rallies = shot_rules.segment_rallies(track, events, start, end)
    if not rallies:
        reason = ("No rally was found: the ball was not tracked in play next to a player. "
                  f"The ball was observed for {track.observed_s:.1f}s of the clip.")
        return (RallyMetric(status="insufficient_data", reason=reason),
                ShotMetric(status="insufficient_data", reason=reason))

    complete = [r for r in rallies if r.complete]
    durations = [r.end_s - r.start_s for r in complete]
    rally_metric = RallyMetric(
        status="experimental", validation="not_evaluated",
        reason="Rally boundaries come from ball visibility and have not been compared with labelled footage.",
        value=RallyValue(
            definition=RALLY_DEFINITION.format(gap=shot_rules.RULES["rally_gap_s"],
                                               edge=shot_rules.RULES["rally_edge_margin_s"]),
            rallies=[RallySummary(index=r.index, start_s=round(r.start_s, 3), end_s=round(r.end_s, 3),
                                  complete=r.complete, contact_count=len(r.contacts),
                                  ball_observed_fraction=round(r.observed_fraction, 3)) for r in rallies],
            complete_count=len(complete), truncated_count=len(rallies) - len(complete),
            mean_complete_duration_s=round(sum(durations) / len(durations), 3) if durations else None,
            max_complete_duration_s=round(max(durations), 3) if durations else None,
        ),
    )

    shots = shot_rules.classify_shots(track, rallies, events)
    sel = opts.selection
    if sel is not None and sel.method == "track_id":
        label = f"track #{sel.track_id}"
        mine = [s for s in shots if s.contact.track_id == sel.track_id]
    elif sel is not None and sel.method == "court_half":
        label = f"{sel.court_half} side (includes a doubles partner)"
        mine = [s for s in shots if s.contact.side == sel.court_half]
    else:
        label, mine = None, []
    summary = shot_rules.summarize(shots)
    shot_metric = ShotMetric(
        status="experimental", validation="not_evaluated",
        reason=SHOT_REASON.format(version=shot_rules.RULE_VERSION),
        value=ShotValue(
            rule_version=shot_rules.RULE_VERSION,
            class_definitions=dict(shot_rules.CLASS_DEFINITIONS),
            precedence=list(shot_rules.SHOT_CLASSES),
            counts=summary["counts"], shares=summary["shares"],
            selected_player=label,
            selected_player_counts=shot_rules.summarize(mine)["counts"] if label else None,
            contacts=[ShotContact(
                time_seconds=round(s.contact.t, 3), rally_index=s.rally_index, shot_class=s.shot_class,
                evidence=s.evidence, reason=s.reason, side=s.contact.side, side_source=s.contact.side_source,
                track_id=s.contact.track_id, ball_px=[round(s.contact.x, 1), round(s.contact.y, 1)],
                ball_hidden_at_contact=s.contact.occluded,
                speed_player_heights_per_s=s.speed_ph, arc_ratio=s.arc) for s in shots],
            bounce_candidates=[BounceCandidate(
                time_seconds=round(e.t, 3), ball_px=[round(e.x, 1), round(e.y, 1)],
                court_xy_m=[round(v, 2) for v in e.court_xy_m] if e.court_xy_m else None)
                for e in events if e.kind == "bounce"],
            ball_observed_s=round(track.observed_s, 3),
            ball_interpolated_s=round(track.interpolated_s, 3),
            ball_detections_rejected=track.rejected + track.stationary,
        ),
    )
    return rally_metric, shot_metric

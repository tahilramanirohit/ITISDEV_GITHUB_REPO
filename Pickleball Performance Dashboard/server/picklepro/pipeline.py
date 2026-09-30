"""End-to-end analysis of one uploaded video → :class:`AnalysisResultV1`."""

from __future__ import annotations

import bisect
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

import numpy as np

from . import PIPELINE_VERSION
from .auto_court import CourtPoseDetector
from .court_lines import CourtTracker
from .court_review import validate_confirmed_frame
from .ball_detection import BallDetector
from .ball_tracking import BallCandidate, track_ball
from .camera_view import likely_scene_cut, view_changed
from .contract import (
    RALLY_NOT_COMPUTED,
    SHOTS_NOT_COMPUTED,
    AnalysisResultV1,
    BallSnapshot,
    CalibrationSummary,
    CourtHeatmapMetric,
    CourtLinesSnapshot,
    Coverage,
    DetectorInfo,
    HeatmapValue,
    Metrics,
    PositioningMetric,
    PositioningValue,
    PlayerBox,
    PlayerSelectionSummary,
    PlayerSummary,
    PositionSnapshot,
    Provenance,
    RallySegmentationMetric,
    RallyValue,
    ShotClassificationMetric,
    ShotsValue,
    SourceInfo,
    TrackSummary,
    VideoInfo,
    ZoneOccupancyMetric,
    ZoneOccupancyValue,
    utc_now_iso,
)
from .court import COURT_LENGTH_M, COURT_MODEL, COURT_WIDTH_M, CalibrationError, CourtCalibration
from .detection import PlayerTracker
from .players import PlayerCollector
from .positioning import positioning_patterns
from .shots import BALL_DIAMETER_M, CORE_TYPES, FrameObs, analyze_shots, court_line_segments
from .spatial import Selection, dwell_heatmap, select_player, zone_occupancy
from .video_io import ReadStats, iter_frames, probe, sha256_of

logger = logging.getLogger(__name__)

ProgressFn = Callable[[float], None]


# How densely frames are searched (see AnalysisOptions.frame_mode).
FRAME_MODES = ("standard", "near_players")
NEAR_PLAYER_HOLD_S = 0.25      # keep searching every frame this long after the ball was near a player
NEAR_REACH_WIDTHS = 1.0        # region around a player, in box widths to each side ...
NEAR_REACH_HEIGHTS = 0.6       # ... and box heights above the head
ON_COURT_MARGIN_M = (1.0, 3.5)  # beside a sideline, behind a baseline


@dataclass
class AnalysisOptions:
    detector: str = "motion"
    yolo_weights: Optional[str] = None
    pose_weights: Optional[str] = None  # body joints for the people found (swings)
    court_weights: Optional[str] = None
    ball_weights: Optional[str] = None
    target_fps: float = 10.0
    # The ball moves much faster than players, so it is sampled more often.
    ball_fps: float = 15.0
    # "standard": players ``target_fps`` and ball ``ball_fps`` times a second.
    # "near_players": the same, plus the ball on every frame while it is near a
    # player on the court, where hits happen. Analysing every frame of the
    # video was dropped: far too slow on a laptop CPU (team decision, 30 Sep 2026).
    frame_mode: str = "standard"
    # Find the court from its painted lines when no manual calibration is given.
    auto_court: bool = True
    # Off by default: on the test clip no neighbouring court was in view and the
    # check cost two real shots. Turn on for videos that show other courts.
    drop_floor_balls_off_court: bool = False
    max_seconds: Optional[float] = None
    calibration: Optional[CourtCalibration] = None
    calibration_source: Optional[str] = None
    calibration_frame_s: float = 0.0
    selection: Optional[Selection] = None
    selection_time_s: Optional[float] = None
    experimental_zones: bool = False
    min_tracked_seconds: float = 10.0
    min_tracked_fraction: float = 0.25
    include_positions: bool = True
    source_filename: Optional[str] = None
    compute_sha256: bool = True


def analyze_video(path: str | Path, options: AnalysisOptions | None = None,
                  progress: Optional[ProgressFn] = None) -> AnalysisResultV1:
    opts = options or AnalysisOptions()
    if opts.frame_mode not in FRAME_MODES:
        raise ValueError(f"frame_mode must be one of {', '.join(FRAME_MODES)}")
    props = probe(path)
    stride = max(1, round(props.fps / opts.target_fps)) if opts.target_fps > 0 else 1
    frame_interval_s = stride / props.fps
    warnings: List[str] = []
    if not props.fps_reported:
        warnings.append("The video did not report a frame rate; 30 fps was assumed for timing.")

    calibration = opts.calibration
    court_detector = CourtPoseDetector(opts.court_weights) if calibration is None and opts.court_weights else None
    # Without a manual calibration the court is found automatically: from the
    # painted lines (no model needed) and, when configured, the court model.
    # Every map is confirmed against the painted lines before it is used.
    court_tracker = CourtTracker(court_detector) if calibration is None and opts.auto_court else None
    calibration_method = "auto_painted_lines" if court_tracker else (
        "user_confirmed_landmarks" if opts.calibration_source == "user_confirmed" else "manual_landmarks")
    correction_checked = opts.calibration_source != "user_confirmed"
    if calibration is not None and calibration.image_size != (props.width, props.height):
        warnings.append(
            f"Calibration was made on a {calibration.image_size[0]}x{calibration.image_size[1]} image and "
            f"rescaled to the {props.width}x{props.height} video; this assumes identical framing."
        )
        calibration = calibration.scaled_to(props.width, props.height)

    tracker = PlayerTracker(detector=opts.detector, yolo_weights=opts.yolo_weights, pose_weights=opts.pose_weights)
    ball_detector = BallDetector(opts.ball_weights) if opts.ball_weights else None
    ball_stride = max(1, round(props.fps / opts.ball_fps)) if ball_detector and opts.ball_fps > 0 else stride
    near_players_mode = opts.frame_mode == "near_players" and ball_detector is not None
    dense_until = -1.0
    extra_ball_frames = 0
    last_people: List[dict] = []
    last_people_cal: Optional[CourtCalibration] = None
    collector = PlayerCollector()
    if not tracker.confidence_is_model_score:
        warnings.append(
            "Motion-based detection finds moving objects, not specifically people: stationary players can be "
            "missed and non-players (balls, shadows, passers-by) can be detected. Detection confidence is not available."
        )

    stats = ReadStats()
    per_frame: List[List[dict]] = []
    per_frame_calibration: List[Optional[CourtCalibration]] = []
    segments: List[int] = []
    segment = 0
    previous_sample = None
    manual_reference = None
    manual_view_lost = False
    times: List[float] = []
    ball_frames: List[tuple[float, List[BallCandidate]]] = []
    view_track_ids: Dict[tuple[int, int], int] = {}
    next_view_track_id = 1
    expected = props.container_duration_s
    progress_total = min(expected, opts.max_seconds) if expected and opts.max_seconds else expected

    for index, ts, frame in iter_frames(path, props.fps, stats, max_seconds=opts.max_seconds):
        player_frame = index % stride == 0
        on_ball_stride = ball_detector is not None and index % ball_stride == 0
        ball_frame = on_ball_stride or (near_players_mode and ts <= dense_until)
        if not (player_frame or ball_frame):
            continue
        if ball_frame:
            extra_ball_frames += not on_ball_stride
            found_balls = [BallCandidate(round(ts, 3), tuple(c["bbox"]), c["confidence"])
                           for c in ball_detector.candidates(frame)]
            ball_frames.append((ts, found_balls))
            if near_players_mode and _ball_near_court_players(found_balls, last_people, last_people_cal):
                dense_until = ts + NEAR_PLAYER_HOLD_S
        if not player_frame:
            continue
        if not correction_checked and ts + frame_interval_s / 2 >= opts.calibration_frame_s:
            if calibration is None:
                raise CalibrationError("A confirmed court correction needs calibration points.")
            validate_confirmed_frame(calibration, frame)
            correction_checked = True
        if previous_sample is not None and likely_scene_cut(previous_sample, frame):
            segment += 1
            if court_tracker is not None:
                court_tracker.reset()  # a new view cannot reuse the old map
        previous_sample = frame.copy()
        segments.append(segment)
        detections = tracker.update(frame)
        if court_tracker is not None:
            frame_calibration = court_tracker.update(ts, frame, [d["bbox"] for d in detections])
        else:
            if calibration is not None and correction_checked and manual_reference is None:
                manual_reference = frame.copy()
            if calibration is not None and correction_checked and manual_reference is not None and not manual_view_lost:
                manual_view_lost = view_changed(manual_reference, frame)
            frame_calibration = calibration if correction_checked and not manual_view_lost else None
        per_frame_calibration.append(frame_calibration)
        # Tracker IDs are local to a camera view. A cut cannot establish that
        # a person in the new view is the same player as before the cut.
        for detection in detections:
            raw_id = detection.get("track_id")
            if raw_id is None:
                continue
            key = (segment, raw_id)
            if key not in view_track_ids:
                view_track_ids[key] = next_view_track_id
                next_view_track_id += 1
            detection["track_id"] = view_track_ids[key]
        collector.observe(len(per_frame), ts, frame, detections, frame_calibration, segment)
        last_people, last_people_cal = detections, frame_calibration
        per_frame.append(detections)
        times.append(ts)
        if progress and progress_total:
            progress(min(0.99, ts / progress_total))

    frames_analyzed = len(per_frame)
    if not correction_checked:
        raise CalibrationError("The court correction's chosen frame was not reached in this video.")
    players, per_frame = _identify_players(collector, per_frame, opts.selection)
    frames_with_detections = sum(1 for dets in per_frame if dets)
    tracks: Dict[int, List[float]] = {}  # player id -> [first, last, count]
    for ts, dets in zip(times, per_frame):
        for d in dets:
            if d.get("track_id") is not None:
                t = tracks.setdefault(d["track_id"], [ts, ts, 0])
                t[1] = ts
                t[2] += 1
    ball_frames, off_court_balls = (_drop_balls_on_floor_off_court(ball_frames, times, per_frame_calibration)
                                    if opts.drop_floor_balls_off_court else (ball_frames, 0))
    ball_path, ball_stats = (track_ball(ball_frames, props.width, _near_player_test(times, per_frame))
                             if ball_detector is not None else ([], {}))
    if ball_detector is not None:
        ball_stats["on_floor_off_court_removed"] = off_court_balls
        ball_stats["frames_searched"] = len(ball_frames)
        ball_stats["extra_frames_near_players"] = extra_ball_frames
    if near_players_mode:
        warnings.append(f"The ball was also searched on every frame while it was near a player: "
                        f"{extra_ball_frames} extra frames (detailed-near-players mode).")
    ball_snapshots = [BallSnapshot(time_seconds=c.time_s, bbox=list(c.bbox), confidence=c.confidence)
                      for c in ball_path]
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
        warnings.append("The ball model found no pickleball in flight in the sampled frames; no ball positions are shown.")
    if ball_stats.get("static_removed"):
        warnings.append(f"{ball_stats['static_removed']} ball-like detections that never moved (for example a ball "
                        "printed on a banner) were ignored.")
    off_court = [p for p in players if not p.on_court]
    if off_court:
        warnings.append(f"{len(off_court)} person(s) stood mostly off the court (for example a referee or spectators) "
                        "and are not counted as players.")
    if court_tracker is not None and court_tracker.sources["tracked"]:
        warnings.append(f"The court was followed through {court_tracker.sources['tracked']} sampled frames from the "
                        "camera's movement; every court map was checked against the painted lines.")
    if manual_view_lost:
        warnings.append("Camera movement or a changed view was detected. The manual court map was discarded from that point onward; re-run with a compatible court model for moving footage.")

    selected_view_duration = None
    if segment > 0 and times:
        selected_index = min(range(len(times)), key=lambda i: abs(times[i] - opts.selection_time_s)) if opts.selection_time_s is not None else 0
        selected_segment = segments[selected_index]
        selected_view_duration = segments.count(selected_segment) * frame_interval_s
        per_frame_calibration = [c if segments[i] == selected_segment else None
                                 for i, c in enumerate(per_frame_calibration)]
        warnings.append(f"Detected {segment + 1} camera views. Court feedback uses only the view containing the selected player frame; select yourself in another view and re-run to inspect it.")
    mapped_frames = sum(c is not None for c in per_frame_calibration)
    if court_tracker is not None and mapped_frames < frames_analyzed:
        warnings.append(f"Court landmarks were usable in {mapped_frames} of {frames_analyzed} sampled frames for this analysis. Other frames were excluded from court-position measures.")

    # The result contract keeps one representative calibration for provenance;
    # actual player positions use only the calibration measured for each frame.
    representative_calibration = next((c for c in per_frame_calibration if c is not None), None)

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
        ball_sample_stride=ball_stride if ball_detector is not None else None,
        frames_with_carried_court_map=court_tracker.sources["tracked"] if court_tracker is not None else None,
        selected_view_duration_s=round(selected_view_duration, 3) if selected_view_duration is not None else None,
    )

    heatmap_metric, zone_metric, positioning_metric, selection_summary, calib_summary, selected = _court_metrics(
        per_frame, frame_interval_s, analyzed_duration, per_frame_calibration,
        representative_calibration, calibration_method, opts, warnings,
        selected_view=segment > 0, selected_view_duration=selected_view_duration
    )

    selected_indices = selected.indices if selected is not None else [None] * frames_analyzed
    snapshots: List[PositionSnapshot] = []
    if opts.include_positions:
        for ts, detections, chosen in zip(times, per_frame, selected_indices):
            if detections:
                snapshots.append(PositionSnapshot(
                    time_seconds=round(ts, 3),
                    players=[PlayerBox(track_id=d.get("track_id"), bbox=[int(v) for v in d["bbox"]],
                                       confidence=d.get("confidence"), selected=i == chosen)
                             for i, d in enumerate(detections)],
                ))
    court_lines = _court_line_snapshots(times, per_frame_calibration) if opts.include_positions else []
    shot_metric, rally_metric = _shot_metrics(
        ball_detector is not None, ball_snapshots, times, per_frame, per_frame_calibration, selected_indices,
        props.height, frame_interval_s, "selected_view" if segment > 0 else "whole_clip")

    if frames_analyzed == 0:
        status, message = "insufficient_data", "No frames could be decoded from this video."
    elif frames_with_detections == 0:
        status, message = "insufficient_data", ("No players were detected in the analyzed frames."
                                                if tracker.confidence_is_model_score else
                                                "No moving players were detected in the analyzed frames.")
    elif heatmap_metric.status == "measured":
        status = "ok"
        reference = selected_view_duration if selected_view_duration is not None else analyzed_duration
        message = (f"PicklePro followed the selected player for {selection_summary.tracked_time_s:.0f} seconds "
                   f"({selection_summary.tracked_fraction:.0%} of the {reference:.0f}-second "
                   f"{'camera view' if selected_view_duration is not None else 'video'}) and mapped where they stood on the court.")
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
            ball_tracking=ball_stats if ball_detector is not None else None,
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
        players=[PlayerSummary(player_id=p.player_id, label=p.label, on_court=p.on_court, side=p.side,
                               first_seen_s=p.first_seen_s, last_seen_s=p.last_seen_s,
                               observed_frames=p.observed_frames, median_court_m=list(p.median_court_m) if p.median_court_m else None,
                               thumbnail=p.thumbnail) for p in players],
        tracks=[TrackSummary(track_id=k, first_seen_s=round(v[0], 3), last_seen_s=round(v[1], 3),
                             observed_frames=int(v[2])) for k, v in sorted(tracks.items())],
        player_positions=snapshots,
        ball_positions=ball_snapshots,
        court_lines=court_lines,
        metrics=Metrics(
            court_heatmap=heatmap_metric,
            zone_occupancy=zone_metric,
            positioning=positioning_metric,
            rally_segmentation=rally_metric,
            shot_classification=shot_metric,
        ),
        warnings=warnings,
    )


OFF_COURT_SIDE_MARGIN_M = 2.0   # wide balls stay in play this far outside a sideline
OFF_COURT_END_MARGIN_M = 3.0    # ... and this far behind a baseline
FLOOR_SIZE_RATIO = (0.5, 1.8)   # observed / expected size of a ball lying at that floor spot


PLAYER_REACH_GAP_S = 0.15


def _ball_near_court_players(balls: Sequence[BallCandidate], people: Sequence[dict],
                             cal: Optional[CourtCalibration]) -> bool:
    """Is any ball candidate close to a person standing on (or just beside) the court?

    Used while the video is read, before players are identified, so "on the
    court" comes from the latest court map. Without a map, anyone counts.
    """
    if not balls or not people:
        return False
    for d in people:
        x1, y1, x2, y2 = d["bbox"]
        if cal is not None:
            cx, cy = cal.image_to_court([((x1 + x2) / 2, y2)])[0]
            side, end = ON_COURT_MARGIN_M
            if not (-side <= cx <= COURT_WIDTH_M + side and -end <= cy <= COURT_LENGTH_M + end):
                continue
        w, h = x2 - x1, y2 - y1
        for b in balls:
            x, y = b.center
            if x1 - NEAR_REACH_WIDTHS * w <= x <= x2 + NEAR_REACH_WIDTHS * w and y1 - NEAR_REACH_HEIGHTS * h <= y <= y2:
                return True
    return False


def _near_player_test(times: Sequence[float], per_frame: Sequence[Sequence[dict]]):
    """A test for "this ball candidate is within reach of a player on this court".

    ``per_frame`` holds only on-court players at this point. The reach region
    is the one the shot detector uses: beside the body and a little above the
    head, down to the feet.
    """
    def near(c: BallCandidate) -> bool:
        i = bisect.bisect_left(times, c.time_s)
        near_frames = [j for j in (i - 1, i) if 0 <= j < len(times) and abs(times[j] - c.time_s) <= PLAYER_REACH_GAP_S]
        x, y = c.center
        for j in near_frames:
            for d in per_frame[j]:
                x1, y1, x2, y2 = d["bbox"]
                w, h = x2 - x1, y2 - y1
                if x1 - 0.6 * w <= x <= x2 + 0.6 * w and y1 - 0.4 * h <= y <= y2:
                    return True
        return False
    return near


def _drop_balls_on_floor_off_court(ball_frames, times, calibrations):
    """Drop candidates that are balls on the floor outside the court.

    A detection is mapped to the floor with the nearest court map. If that
    floor spot is well outside the court, and the box is about as big as a
    ball lying there would look, it is a ball on a neighbouring court or
    one rolling away between points. A ball in the air maps to a floor spot
    much further away, where a ball would look far smaller, so it is kept.
    Points above the horizon cannot be on the floor and are kept too.
    """
    kept, removed = [], 0
    for ts, cands in ball_frames:
        i = bisect.bisect_left(times, ts)
        near = [j for j in (i - 1, i) if 0 <= j < len(times) and calibrations[j] is not None
                and abs(times[j] - ts) <= 0.25]
        if not near:
            kept.append((ts, cands))
            continue
        h = calibrations[min(near, key=lambda j: abs(times[j] - ts))].homography
        width, height = calibrations[near[0]].image_size
        ground_side = (h @ np.array([width / 2, height, 1.0]))[2]
        out = []
        for c in cands:
            x1, y1, x2, y2 = c.bbox
            v = h @ np.array([(x1 + x2) / 2, y2, 1.0])
            if v[2] * ground_side <= 0:
                out.append(c)
                continue
            gx, gy = v[0] / v[2], v[1] / v[2]
            if (-OFF_COURT_SIDE_MARGIN_M <= gx <= COURT_WIDTH_M + OFF_COURT_SIDE_MARGIN_M
                    and -OFF_COURT_END_MARGIN_M <= gy <= COURT_LENGTH_M + OFF_COURT_END_MARGIN_M):
                out.append(c)
                continue
            inv = np.linalg.inv(h)
            a = inv @ np.array([gx, gy, 1.0])
            b = inv @ np.array([gx + 1.0, gy, 1.0])
            px_per_m = float(np.hypot(b[0] / b[2] - a[0] / a[2], b[1] / b[2] - a[1] / a[2]))
            ratio = ((x2 - x1) + (y2 - y1)) / 2 / max(BALL_DIAMETER_M * px_per_m, 1.0)
            if FLOOR_SIZE_RATIO[0] <= ratio <= FLOOR_SIZE_RATIO[1]:
                removed += 1
            else:
                out.append(c)
        kept.append((ts, out))
    return kept, removed


def _identify_players(collector: PlayerCollector, per_frame: List[List[dict]], selection: Optional[Selection]):
    """Replace tracker IDs with player IDs and drop people who are not on the court.

    A person the user explicitly selected is kept even when they stood off court.
    """
    players, mapping = collector.group()
    keep = {p.player_id for p in players if p.on_court}
    if selection is not None and selection.method == "track_id" and selection.track_id is not None:
        keep.add(selection.track_id)
    relabelled = []
    for dets in per_frame:
        out = []
        for d in dets:
            if d.get("track_id") is not None:
                d = {**d, "track_id": mapping.get(d["track_id"], d["track_id"])}
                if d["track_id"] not in keep:
                    continue
            out.append(d)
        relabelled.append(out)
    return players, relabelled


def _court_metrics(per_frame, frame_interval_s, analyzed_duration, per_frame_calibration,
                   calibration, calibration_method,
                   opts: AnalysisOptions, warnings, selected_view=False, selected_view_duration=None):
    scope = "selected_view" if selected_view else "whole_clip"
    zones_off = ZoneOccupancyMetric(
        status="not_computed", scope=scope,
        reason="Zone occupancy is experimental and disabled by default (enable with experimental_zones).",
    )
    calib_summary = None
    if calibration is None:
        reason = "Court not calibrated: at least 4 court landmarks are required."
        return (CourtHeatmapMetric(status="insufficient_data", scope=scope, reason=reason),
                zones_off, PositioningMetric(status="insufficient_data", scope=scope, reason=reason), None, None, None)

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
        return (CourtHeatmapMetric(status="insufficient_data", scope=scope, reason=reason),
                zones_off, PositioningMetric(status="insufficient_data", scope=scope, reason=reason), None, calib_summary, None)

    track = select_player(per_frame, per_frame_calibration, sel)
    tracked_time = track.observed * frame_interval_s
    reference_duration = selected_view_duration if selected_view_duration is not None else analyzed_duration
    fraction = tracked_time / reference_duration if reference_duration else 0.0
    selection_summary = PlayerSelectionSummary(
        method=sel.method, track_id=sel.track_id, court_half=sel.court_half,
        tracked_time_s=round(tracked_time, 3), tracked_fraction=round(fraction, 4),
        ambiguous_frames=track.ambiguous_frames,
    )
    if track.ambiguous_frames:
        warnings.append(f"{track.ambiguous_frames} frame(s) excluded because more than one detection matched the selection.")

    if tracked_time < opts.min_tracked_seconds or fraction < opts.min_tracked_fraction:
        reason = (f"Selected player was tracked for {tracked_time:.1f}s ({fraction:.0%} of the applicable view); "
                  f"at least {opts.min_tracked_seconds:g}s and {opts.min_tracked_fraction:.0%} are required.")
        return (CourtHeatmapMetric(status="insufficient_data", scope=scope, reason=reason), zones_off,
                PositioningMetric(status="insufficient_data", scope=scope, reason=reason), selection_summary, calib_summary, track)

    heatmap = CourtHeatmapMetric(
        status="measured", scope=scope, validation="not_evaluated",
        reason="Positional accuracy has not been evaluated on real footage. Dwell time covers the selected view when the upload has cuts, and includes time between rallies.",
        value=HeatmapValue(**dwell_heatmap(track, frame_interval_s)),
    )
    zones = zones_off
    if opts.experimental_zones:
        zones = ZoneOccupancyMetric(
            status="experimental", scope=scope, validation="synthetic_only",
            reason="Zone boundaries are defined but positional error has only been measured on synthetic video. "
                   "Kitchen-line presence is not computed.",
            value=ZoneOccupancyValue(**zone_occupancy(track, frame_interval_s)),
        )
    positions = positioning_patterns(track, frame_interval_s, sel.court_half if sel.method == "court_half" else None)
    positioning = PositioningMetric(
        status="measured", scope=scope, validation="synthetic_only",
        reason="Depth bands, lingers and approaches from the selected player's smoothed foot position. Checked on "
               "synthetic video only; includes time between rallies; describes position, not shot quality.",
        value=PositioningValue(**positions),
    ) if positions else PositioningMetric(
        status="insufficient_data", scope=scope, reason="The selected player was never mapped inside their half of the court.")
    return heatmap, zones, positioning, selection_summary, calib_summary, track


def _court_line_snapshots(times, calibrations) -> List[CourtLinesSnapshot]:
    """Court lines per sampled frame, stored only when they move by more than a few pixels."""
    out: List[CourtLinesSnapshot] = []
    previous = None
    for ts, cal in zip(times, calibrations):
        lines = court_line_segments(cal) if cal is not None else []
        if previous is not None and len(lines) == len(previous) and (
                not lines or max(abs(a - b) for la, lb in zip(lines, previous) for a, b in zip(la, lb)) <= 3):
            continue
        out.append(CourtLinesSnapshot(time_seconds=round(ts, 3), lines=lines))
        previous = lines
    return out


SHOTS_REASON = ("Estimated from observed ball direction changes near players and the mapped court. Rule-based and "
                "not yet evaluated on labelled real footage: treat each label as a suggestion to check in the video.")
MIN_BALL_FRAMES_FOR_SHOTS = 15


def _shot_metrics(ball_model: bool, ball_snapshots, times, per_frame, calibrations, selected_indices,
                  frame_h: int, frame_interval_s: float, scope: str):
    if not ball_model:
        return (ShotClassificationMetric(status="not_computed", scope=scope,
                                         reason="No ball model is set up, so hits and shot types cannot be found."),
                RallySegmentationMetric(status="not_computed", scope=scope, reason=RALLY_NOT_COMPUTED))
    if len(ball_snapshots) < MIN_BALL_FRAMES_FOR_SHOTS:
        reason = (f"The ball was seen in only {len(ball_snapshots)} sampled frames; at least "
                  f"{MIN_BALL_FRAMES_FOR_SHOTS} are needed to follow its flight.")
        return (ShotClassificationMetric(status="insufficient_data", scope=scope, reason=reason),
                RallySegmentationMetric(status="insufficient_data", scope=scope, reason=reason))
    if not any(c is not None for c in calibrations):
        return (ShotClassificationMetric(status="insufficient_data", scope=scope, reason=SHOTS_NOT_COMPUTED),
                RallySegmentationMetric(status="insufficient_data", scope=scope, reason=SHOTS_NOT_COMPUTED))
    frames = [FrameObs(t, dets, cal, idx) for t, dets, cal, idx in zip(times, per_frame, calibrations, selected_indices)]
    found = analyze_shots([(b.time_seconds, b.bbox) for b in ball_snapshots], frames, frame_h, frame_interval_s)
    for shot in found["shots"]:
        shot["public_shot_type"] = shot["shot_type"] if shot["shot_type"] in CORE_TYPES else "unclassified"
    if not found["shots"]:
        reason = "The ball was seen, but no hits near a player were detected."
        return (ShotClassificationMetric(status="insufficient_data", scope=scope, reason=reason),
                RallySegmentationMetric(status="insufficient_data", scope=scope, reason=reason))
    shots = ShotClassificationMetric(
        status="experimental", scope=scope, validation="not_evaluated", reason=SHOTS_REASON,
        value=ShotsValue(type_definitions=found["type_definitions"], shots=found["shots"], bounces=found["bounces"],
                         counts_by_type=found["counts_by_type"],
                         selected_player_counts_by_type=found["selected_player_counts_by_type"]))
    rallies = RallySegmentationMetric(
        status="experimental", scope=scope, validation="not_evaluated",
        reason="A rally is a run of detected hits less than 3.5 s apart. Missed hits can split or merge rallies.",
        value=RallyValue(rallies=found["rallies"],
                         rally_time_s=round(sum(r["end_s"] - r["start_s"] for r in found["rallies"]), 3)))
    return shots, rallies

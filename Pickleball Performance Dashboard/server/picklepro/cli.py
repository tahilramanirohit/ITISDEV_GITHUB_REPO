"""Command-line entry point for local, permitted footage.

    python -m picklepro.cli landmarks
    python -m picklepro.cli extract-frame match.mp4 --at 5 --out frame.png
    python -m picklepro.cli analyze match.mp4 --calibration calib.json --court-half near --out result.json
    python -m picklepro.cli make-synthetic demo.mp4 --calibration-out demo_calibration.json
    python -m picklepro.cli schema

``analyze`` exits 0 when the result status is "ok", 3 when it is
"insufficient_data" (a valid outcome, not a crash), 2 for bad input, 1 on errors.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import cv2

from .contract import json_schema
from .court import LANDMARKS_M, CalibrationError, load_calibration
from .detection import DetectorUnavailable
from .pipeline import AnalysisOptions, analyze_video
from .spatial import Selection
from .video_io import VideoOpenError

EXIT_OK, EXIT_ERROR, EXIT_USAGE, EXIT_INSUFFICIENT = 0, 1, 2, 3


def _cmd_landmarks(_args) -> int:
    print("Court landmarks (x across from near-left sideline, y from near baseline, metres):")
    for name, (x, y) in LANDMARKS_M.items():
        print(f"  {name:22s} x={x:6.3f}  y={y:7.3f}")
    print("\nCalibration file format:")
    print(json.dumps({"image_width": 1920, "image_height": 1080,
                      "points": [{"landmark": "near_left_baseline", "pixel": [412.0, 988.5]}, "..."]}, indent=2))
    return EXIT_OK


def _cmd_extract_frame(args) -> int:
    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        print(f"error: cannot open {args.video}", file=sys.stderr)
        return EXIT_USAGE
    cap.set(cv2.CAP_PROP_POS_MSEC, args.at * 1000.0)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        print(f"error: no frame at {args.at}s", file=sys.stderr)
        return EXIT_USAGE
    cv2.imwrite(str(args.out), frame)
    h, w = frame.shape[:2]
    print(f"Wrote {args.out} ({w}x{h}). Read landmark pixel positions from this image for the calibration file.")
    return EXIT_OK


def _cmd_analyze(args) -> int:
    try:
        calibration = load_calibration(args.calibration) if args.calibration else None
    except (CalibrationError, OSError, json.JSONDecodeError) as exc:
        print(f"error: calibration: {exc}", file=sys.stderr)
        return EXIT_USAGE
    selection = None
    if args.track_id is not None:
        selection = Selection("track_id", track_id=args.track_id)
    elif args.court_half:
        selection = Selection("court_half", court_half=args.court_half)

    opts = AnalysisOptions(
        detector=args.detector, yolo_weights=args.yolo_weights, court_weights=args.court_weights,
        ball_weights=args.ball_weights,
        target_fps=args.target_fps,
        max_seconds=args.max_seconds, calibration=calibration, selection=selection,
        experimental_zones=args.experimental_zones, include_positions=not args.no_positions,
        min_tracked_seconds=args.min_tracked_seconds, min_tracked_fraction=args.min_tracked_fraction,
    )
    try:
        result = analyze_video(args.video, opts, progress=_stderr_progress if args.progress else None)
    except (VideoOpenError, DetectorUnavailable) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_USAGE

    payload = result.model_dump_json(indent=2)
    if args.out:
        Path(args.out).write_text(payload)
    else:
        print(payload)

    c = result.coverage
    print(f"\nstatus: {result.status} (data_origin={result.data_origin})", file=sys.stderr)
    print(f"message: {result.message}", file=sys.stderr)
    print(f"analyzed {c.analyzed_duration_s:.1f}s of "
          f"{result.video.container_duration_s if result.video.container_duration_s is not None else '?'}s "
          f"({c.frames_analyzed} frames, stride {c.sample_stride}); frames with detections: {c.frames_with_detections}",
          file=sys.stderr)
    if result.tracks:
        top = sorted(result.tracks, key=lambda t: -t.observed_frames)[:8]
        print("longest tracks (use --track-id): " +
              ", ".join(f"#{t.track_id} {t.first_seen_s:.1f}-{t.last_seen_s:.1f}s ({t.observed_frames}f)" for t in top),
              file=sys.stderr)
    for w in result.warnings:
        print(f"warning: {w}", file=sys.stderr)
    return EXIT_OK if result.status == "ok" else EXIT_INSUFFICIENT


def _cmd_make_synthetic(args) -> int:
    from .fixtures import write_calibration, write_synthetic_clip

    clip = write_synthetic_clip(Path(args.out), duration_s=args.duration, fps=args.fps, codec=args.codec)
    print(f"Wrote SYNTHETIC test clip {clip.path} ({clip.duration_s:.1f}s @ {clip.fps:g} fps).")
    if args.calibration_out:
        write_calibration(clip, Path(args.calibration_out))
        print(f"Wrote matching calibration {args.calibration_out}.")
    return EXIT_OK


def _cmd_schema(_args) -> int:
    print(json.dumps(json_schema(), indent=2))
    return EXIT_OK


def _stderr_progress(fraction: float) -> None:
    print(f"\r{fraction:5.1%}", end="", file=sys.stderr, flush=True)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="picklepro", description="PicklePro local video analysis")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("landmarks", help="List court landmark names for calibration").set_defaults(func=_cmd_landmarks)

    ef = sub.add_parser("extract-frame", help="Save one frame to read landmark pixel positions from")
    ef.add_argument("video", type=Path)
    ef.add_argument("--at", type=float, default=0.0, help="Time in seconds")
    ef.add_argument("--out", type=Path, required=True)
    ef.set_defaults(func=_cmd_extract_frame)

    an = sub.add_parser("analyze", help="Analyze a local video file")
    an.add_argument("video", type=Path)
    an.add_argument("--calibration", type=Path, help="Manual court calibration JSON")
    sel = an.add_mutually_exclusive_group()
    sel.add_argument("--track-id", type=int, help="Analyze this track id")
    sel.add_argument("--court-half", choices=["near", "far"],
                     help="Analyze the single player on this half (frames with >1 candidate are excluded)")
    an.add_argument("--detector", choices=["motion", "yolo"], default="motion")
    an.add_argument("--yolo-weights", help="Local YOLO weights file (detector=yolo)")
    an.add_argument("--court-weights", help="Local 14-keypoint YOLO court pose weights for automatic calibration")
    an.add_argument("--ball-weights", help="Local YOLO weights with a pickleball/ball class for observed ball boxes")
    an.add_argument("--target-fps", type=float, default=10.0, help="Analysis sample rate (default 10)")
    an.add_argument("--max-seconds", type=float, help="Stop after this many seconds (reported in coverage)")
    an.add_argument("--min-tracked-seconds", type=float, default=10.0)
    an.add_argument("--min-tracked-fraction", type=float, default=0.25)
    an.add_argument("--experimental-zones", action="store_true", help="Also compute unvalidated zone occupancy")
    an.add_argument("--no-positions", action="store_true", help="Omit per-frame boxes from the output")
    an.add_argument("--progress", action="store_true")
    an.add_argument("--out", type=Path, help="Write result JSON here (default: stdout)")
    an.set_defaults(func=_cmd_analyze)

    ms = sub.add_parser("make-synthetic", help="Write a SYNTHETIC fixed-camera test clip (not real footage)")
    ms.add_argument("out", type=Path)
    ms.add_argument("--duration", type=float, default=20.0)
    ms.add_argument("--fps", type=float, default=15.0)
    ms.add_argument("--codec", choices=["avc1", "mp4v"], default="avc1",
                    help="avc1 (H.264) plays in browsers; falls back to mp4v if unavailable")
    ms.add_argument("--calibration-out", type=Path)
    ms.set_defaults(func=_cmd_make_synthetic)

    sub.add_parser("schema", help="Print the result JSON schema").set_defaults(func=_cmd_schema)
    return p


def main(argv=None) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

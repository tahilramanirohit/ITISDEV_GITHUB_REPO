"""Evaluate observed ball positions against frame-precise human labels.

Usage: python -m picklepro.evaluate_ball result.json ball_labels.json

Only labelled frames enter the denominator. A visible ball at the wrong place
counts as both a missed ball and a false detection. A label with ``visible``
false is a useful explicit negative. No position is interpolated.
"""

from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path


def evaluate_ball(result: dict, labels: dict, tolerance_fraction: float = 0.01) -> dict:
    video = result["video"]
    width, height = int(video["width"]), int(video["height"])
    if width <= 0 or height <= 0 or tolerance_fraction <= 0:
        raise ValueError("Video dimensions and spatial tolerance must be positive")
    label_width = int(labels.get("image_width", width))
    label_height = int(labels.get("image_height", height))
    if label_width <= 0 or label_height <= 0:
        raise ValueError("Label image dimensions must be positive")
    marked = sorted(labels.get("frames", []), key=lambda row: row["time_seconds"])
    if not marked:
        raise ValueError("At least one labelled frame is required")
    times = [float(row["time_seconds"]) for row in marked]
    if any(not math.isfinite(t) or t < 0 for t in times) or len(times) != len(set(times)):
        raise ValueError("Label times must be finite, nonnegative, and unique")

    fps = float(video["fps"])
    stride = result.get("coverage", {}).get("ball_sample_stride") or 1
    time_tolerance_s = 0.5 * float(stride) / fps + 0.01 if fps > 0 else 0.05
    tolerance_px = tolerance_fraction * width
    predicted = sorted(result.get("ball_positions", []), key=lambda row: row["time_seconds"])
    used: set[int] = set()
    tp = fp = fn = 0
    errors: list[float] = []
    rows = []
    for label in marked:
        t = float(label["time_seconds"])
        visible = label.get("visible")
        if not isinstance(visible, bool):
            raise ValueError("Every labelled frame needs a boolean visible field")
        options = [i for i, p in enumerate(predicted) if i not in used
                   and abs(float(p["time_seconds"]) - t) <= time_tolerance_s]
        match = min(options, key=lambda i: abs(float(predicted[i]["time_seconds"]) - t)) if options else None
        det = predicted[match] if match is not None else None
        if match is not None:
            used.add(match)
        distance = None
        if visible:
            if "x" not in label or "y" not in label:
                raise ValueError("A visible ball label needs x and y")
            x = float(label["x"]) * width / label_width
            y = float(label["y"]) * height / label_height
            if not (math.isfinite(x) and math.isfinite(y) and 0 <= x <= width and 0 <= y <= height):
                raise ValueError("Ball label coordinates must be inside the image")
            if det is not None:
                bx = (det["bbox"][0] + det["bbox"][2]) / 2
                by = (det["bbox"][1] + det["bbox"][3]) / 2
                distance = math.hypot(bx - x, by - y)
            if distance is not None and distance <= tolerance_px:
                tp += 1
                errors.append(distance)
                outcome = "matched"
            else:
                fn += 1
                if det is not None:
                    fp += 1
                outcome = "wrong_location" if det is not None else "missed"
        else:
            if det is not None:
                fp += 1
            outcome = "false_detection" if det is not None else "correct_absence"
        rows.append({"time_seconds": t, "outcome": outcome,
                     "error_px": round(distance, 2) if distance is not None else None})
    return {
        "labelled_frames": len(marked),
        "visible_frames": sum(bool(row["visible"]) for row in marked),
        "time_tolerance_s": round(time_tolerance_s, 4),
        "spatial_tolerance_px": round(tolerance_px, 2),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": round(tp / (tp + fp), 3) if tp + fp else None,
        "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "median_error_px": round(statistics.median(errors), 2) if errors else None,
        "rows": rows,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    try:
        result = json.loads(Path(argv[0]).read_text())
        labels = json.loads(Path(argv[1]).read_text())
        print(json.dumps(evaluate_ball(result, labels), indent=2))
    except (OSError, KeyError, TypeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

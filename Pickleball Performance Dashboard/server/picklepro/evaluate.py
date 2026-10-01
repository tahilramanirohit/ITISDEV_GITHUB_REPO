"""Score a result's shots against hand labels.

    python -m picklepro.evaluate result.json ../eval/TestVideoKirk_REAL.labels.json

A frame-precise label (made on the app's Label shots page, ``#/label``)
matches a detected shot within ``MARGIN_S`` of it. An older whole-second label
("18" meaning 18.0-18.99 s, ``time_resolution_s`` or a shot's
``resolution_s`` of 1) matches anywhere in that second, with the same margin.
Matching keeps time order and prefers the labelled player. Reported:

* hits found (recall) and detected hits that match a label (precision);
* hitter accuracy and shot-type accuracy on matched shots;
* a confusion list of wrong types, and detections at "not a shot" moments.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from typing import Dict, List

MARGIN_S = 0.35
# Older results used these names for what is now one type.
ALIASES = {"third_shot_drop": "drop"}


def _window(label: dict, file_resolution: float) -> tuple[float, float]:
    res = float(label.get("resolution_s", file_resolution))
    if res >= 0.5:
        return label["t"] - MARGIN_S, label["t"] + res + MARGIN_S
    return label["t"] - MARGIN_S, label["t"] + MARGIN_S


def evaluate(result: dict, labels: dict) -> Dict[str, object]:
    shots = (result.get("metrics", {}).get("shot_classification", {}).get("value") or {}).get("shots", [])
    detected = sorted(shots, key=lambda s: s["time_seconds"])
    res = float(labels.get("time_resolution_s", 1.0))
    real = [l for l in labels["shots"] if l["type"] != "not_a_shot"]
    negatives = [l for l in labels["shots"] if l["type"] == "not_a_shot"]
    used = set()
    matches = []
    for lab in real:
        lo, hi = _window(lab, res)
        options = [i for i, s in enumerate(detected) if i not in used and lo <= s["time_seconds"] < hi]
        if not options:
            matches.append((lab, None))
            continue
        same = [i for i in options if detected[i].get("hitter_track_id") == lab["player"]]
        i = (same or options)[0]
        used.add(i)
        matches.append((lab, detected[i]))
    found = [(l, d) for l, d in matches if d is not None]
    hitter_ok = sum(1 for l, d in found if d.get("hitter_track_id") == l["player"])
    type_ok = sum(1 for l, d in found if ALIASES.get(d["shot_type"], d["shot_type"]) == l["type"])
    confusion = Counter((l["type"], ALIASES.get(d["shot_type"], d["shot_type"])) for l, d in found
                        if ALIASES.get(d["shot_type"], d["shot_type"]) != l["type"])
    false_at_negatives = sum(1 for n in negatives
                             if any(_window(n, res)[0] <= s["time_seconds"] < _window(n, res)[1]
                                    for j, s in enumerate(detected) if j not in used))
    return {
        "labelled_shots": len(real),
        "detected_shots": len(detected),
        "matched": len(found),
        "recall": round(len(found) / len(real), 3) if real else None,
        "precision": round(len(found) / len(detected), 3) if detected else None,
        "hitter_accuracy": round(hitter_ok / len(found), 3) if found else None,
        "type_accuracy": round(type_ok / len(found), 3) if found else None,
        "type_and_hitter_correct": sum(1 for l, d in found if d.get("hitter_track_id") == l["player"]
                                       and ALIASES.get(d["shot_type"], d["shot_type"]) == l["type"]),
        "detections_at_not_a_shot_moments": false_at_negatives,
        "wrong_types": {f"{a} -> {b}": n for (a, b), n in confusion.most_common()},
        "rows": [{"t": l["t"], "player": l["player"], "label": l["type"],
                  "detected": None if d is None else {"t": d["time_seconds"], "player": d.get("hitter_track_id"),
                                                       "type": ALIASES.get(d["shot_type"], d["shot_type"])}}
                 for l, d in matches],
    }


def main(argv: List[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    report = evaluate(json.load(open(argv[0])), json.load(open(argv[1])))
    rows = report.pop("rows")
    for key, value in report.items():
        print(f"{key}: {value}")
    print()
    for r in rows:
        d = r["detected"]
        got = "MISSED" if d is None else f"{d['t']:6.2f}s P{d['player']} {d['type']}"
        mark = "" if d is None else ("  ok" if d["player"] == r["player"] and d["type"] == r["label"] else "  <-")
        print(f"{r['t']:7.2f}s P{r['player']} {r['label']:10s} | {got}{mark}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

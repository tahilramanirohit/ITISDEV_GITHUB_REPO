"""Score a result's shots against hand labels.

    python -m picklepro.evaluate result.json ../eval/TestVideoKirk_REAL.labels.json

A frame-precise label (made on the app's Label shots page, ``#/label``)
matches a detected shot within ``MARGIN_S`` of it. An older whole-second label
("18" meaning 18.0-18.99 s, ``time_resolution_s`` or a shot's
``resolution_s`` of 1) matches anywhere in that second, with the same margin.
Matching uses contact time, independently of the predicted hitter. Reported:

* hits found (recall) and detected hits that match a label (precision);
* hitter accuracy and shot-type accuracy on matched shots;
* a confusion list of wrong types, and detections at "not a shot" moments.

Labels may use the finer names (speed-up, counter, reset, erne). PicklePro
reports each as the core type it is a kind of, so such a label is correct when
the detection names one of those core types (``LABEL_ACCEPTS``).
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from typing import Dict, List

MARGIN_S = 0.35
# Older results used these names for what is now one type.
ALIASES = {"third_shot_drop": "drop"}
# Finer label -> core types that count as correct (see shots.core_type).
LABEL_ACCEPTS = {"speed_up": {"drive", "volley"}, "counter": {"volley"}, "erne": {"volley"},
                 "reset": {"dink", "drop"}}


def _type_ok(label_type: str, detected_type: str) -> bool:
    detected_type = ALIASES.get(detected_type, detected_type)
    return detected_type == label_type or detected_type in LABEL_ACCEPTS.get(label_type, ())


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
    mapping = labels.get("tracker_mapping") or {}
    human_ids = labels.get("identity_scheme") == "human"
    if human_ids and len(set(mapping.values())) != len(mapping):
        raise ValueError("Each human player must map to a different tracker ID")

    def expected_track(label: dict):
        person = label.get("player")
        if person is None:
            return None
        if human_ids:
            return mapping.get(str(person))
        return person  # Legacy files used tracker IDs directly.

    for lab in real:
        lo, hi = _window(lab, res)
        options = [i for i, s in enumerate(detected) if i not in used and lo <= s["time_seconds"] < hi]
        if not options:
            matches.append((lab, None))
            continue
        centre = lab["t"] + (float(lab.get("resolution_s", res)) / 2 if float(lab.get("resolution_s", res)) >= 0.5 else 0)
        i = min(options, key=lambda index: abs(detected[index]["time_seconds"] - centre))
        used.add(i)
        matches.append((lab, detected[i]))
    found = [(l, d) for l, d in matches if d is not None]
    hitter_scored = [(l, d) for l, d in found if expected_track(l) is not None]
    hitter_ok = sum(1 for l, d in hitter_scored if d.get("hitter_track_id") == expected_track(l))
    type_ok = sum(1 for l, d in found if _type_ok(l["type"], d["shot_type"]))
    confusion = Counter((l["type"], ALIASES.get(d["shot_type"], d["shot_type"])) for l, d in found
                        if not _type_ok(l["type"], d["shot_type"]))
    false_at_negatives = sum(1 for n in negatives
                             if any(_window(n, res)[0] <= s["time_seconds"] < _window(n, res)[1]
                                    for j, s in enumerate(detected) if j not in used))
    return {
        "labelled_shots": len(real),
        "detected_shots": len(detected),
        "matched": len(found),
        "recall": round(len(found) / len(real), 3) if real else None,
        "precision": round(len(found) / len(detected), 3) if detected else None,
        "hitter_accuracy": round(hitter_ok / len(hitter_scored), 3) if hitter_scored else None,
        "hitter_labels_scored": len(hitter_scored),
        "type_accuracy": round(type_ok / len(found), 3) if found else None,
        "type_and_hitter_correct": sum(1 for l, d in hitter_scored if d.get("hitter_track_id") == expected_track(l)
                                       and _type_ok(l["type"], d["shot_type"])),
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
        mark = "" if d is None else ("  ok" if d["player"] == r["player"] and _type_ok(r["label"], d["type"]) else "  <-")
        print(f"{r['t']:7.2f}s P{r['player']} {r['label']:10s} | {got}{mark}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

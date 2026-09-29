"""Compare detected contacts and shot classes with hand labels (requirements F10, Q03, Q04).

Labels are a CSV with one row per *real* contact, written by someone watching
the video:

    time_seconds,side,shot_class,notes
    12.40,near,serve,
    13.55,far,return,

``side`` is near/far (camera behind the near baseline) and may be blank.
``shot_class`` is one of the classes in :mod:`picklepro.shots`; use
``unclassified`` only when the labeller cannot tell either.

Contacts are matched one-to-one within ``window_s`` (0.2 s, the pilot gate's
window). Class metrics use matched contacts only. Following Q03, a class with
fewer than ``min_support`` labelled contacts is reported as insufficient
evidence and left out of macro F1.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import cv2

from .shots import SHOT_CLASSES

LABEL_FIELDS = ("time_seconds", "side", "shot_class", "notes")


def read_labels(path: Path) -> List[dict]:
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for i, row in enumerate(csv.DictReader(f), start=2):
            if not (row.get("time_seconds") or "").strip():
                continue
            cls = (row.get("shot_class") or "").strip().lower()
            if cls not in SHOT_CLASSES:
                raise ValueError(f"{path}:{i}: shot_class {cls!r} is not one of {', '.join(SHOT_CLASSES)}")
            side = (row.get("side") or "").strip().lower() or None
            if side not in (None, "near", "far"):
                raise ValueError(f"{path}:{i}: side must be near, far or blank")
            rows.append({"t": float(row["time_seconds"]), "side": side, "cls": cls})
    return sorted(rows, key=lambda r: r["t"])


def match(pred: Sequence[dict], truth: Sequence[dict], window_s: float) -> List[tuple]:
    """Greedy one-to-one matching by smallest time difference."""
    pairs = sorted(((abs(p["t"] - t["t"]), i, j) for i, p in enumerate(pred) for j, t in enumerate(truth)
                    if abs(p["t"] - t["t"]) <= window_s))
    used_p, used_t, out = set(), set(), []
    for _, i, j in pairs:
        if i in used_p or j in used_t:
            continue
        used_p.add(i)
        used_t.add(j)
        out.append((i, j))
    return out


def evaluate(result: dict, labels: Sequence[dict], window_s: float = 0.2, min_support: int = 20) -> Dict:
    value = (result.get("metrics", {}).get("shot_classification") or {}).get("value")
    if not value:
        raise ValueError("The result has no shot contacts (shot_classification.value is empty).")
    pred = [{"t": c["time_seconds"], "side": c.get("side"), "cls": c["shot_class"]} for c in value["contacts"]]
    pairs = match(pred, labels, window_s)
    n_pred, n_true, n_match = len(pred), len(labels), len(pairs)
    side_known = [(pred[i]["side"], labels[j]["side"]) for i, j in pairs
                  if pred[i]["side"] and labels[j]["side"]]

    confusion = {t: {p: 0 for p in SHOT_CLASSES} for t in SHOT_CLASSES}
    for i, j in pairs:
        confusion[labels[j]["cls"]][pred[i]["cls"]] += 1
    per_class, f1s, insufficient = {}, [], []
    for c in SHOT_CLASSES:
        if c == "unclassified":
            continue
        tp = confusion[c][c]
        support = sum(confusion[c].values())
        predicted = sum(confusion[t][c] for t in SHOT_CLASSES)
        precision = tp / predicted if predicted else None
        recall = tp / support if support else None
        f1 = (2 * precision * recall / (precision + recall)
              if precision is not None and recall is not None and precision + recall > 0 else 0.0)
        per_class[c] = {"support": support, "predicted": predicted, "precision": precision, "recall": recall, "f1": f1}
        if support >= min_support:
            f1s.append(f1)
        elif support:
            insufficient.append(c)
    matched_pred = [pred[i]["cls"] for i, _ in pairs]
    return {
        "window_s": window_s,
        "contacts": {
            "detected": n_pred, "labelled": n_true, "matched": n_match,
            "precision": n_match / n_pred if n_pred else None,
            "recall": n_match / n_true if n_true else None,
        },
        "side_accuracy": (sum(a == b for a, b in side_known) / len(side_known)) if side_known else None,
        "unclassified_share": (matched_pred.count("unclassified") / len(matched_pred)) if matched_pred else None,
        "per_class": per_class,
        "macro_f1": sum(f1s) / len(f1s) if f1s else None,
        "classes_in_macro_f1": [c for c in per_class if per_class[c]["support"] >= min_support],
        "insufficient_evidence": insufficient,
        "confusion": confusion,
    }


def format_report(report: Dict) -> str:
    def pct(v: Optional[float]) -> str:
        return "n/a" if v is None else f"{v:.0%}"

    c = report["contacts"]
    lines = [
        f"Contacts (matched within {report['window_s']:g} s): detected {c['detected']}, labelled {c['labelled']}, "
        f"matched {c['matched']}  precision {pct(c['precision'])}  recall {pct(c['recall'])}",
        f"Hitter side correct: {pct(report['side_accuracy'])}   Unclassified among matched: {pct(report['unclassified_share'])}",
        "",
        f"{'class':10s} {'labelled':>8s} {'predicted':>9s} {'precision':>9s} {'recall':>7s} {'F1':>5s}",
    ]
    for cls, m in report["per_class"].items():
        lines.append(f"{cls:10s} {m['support']:8d} {m['predicted']:9d} {pct(m['precision']):>9s} "
                     f"{pct(m['recall']):>7s} {m['f1']:5.2f}")
    lines.append("")
    lines.append(f"Macro F1 over classes with enough labels ({', '.join(report['classes_in_macro_f1']) or 'none'}): "
                 f"{'n/a' if report['macro_f1'] is None else round(report['macro_f1'], 3)}")
    if report["insufficient_evidence"]:
        lines.append("Insufficient evidence (fewer than the minimum labelled contacts): "
                     + ", ".join(report["insufficient_evidence"]))
    lines.append("Pilot gate (revision 4): contact precision and recall >= 80%, macro F1 >= 0.70, unclassified <= 30%.")
    return "\n".join(lines)


def export_review(video: Path, result: dict, out_dir: Path, trail_s: float = 0.4) -> int:
    """Write one annotated image per detected contact and a label template CSV."""
    value = (result.get("metrics", {}).get("shot_classification") or {}).get("value")
    if not value:
        raise ValueError("The result has no shot contacts to review.")
    out_dir.mkdir(parents=True, exist_ok=True)
    balls = result.get("ball_positions") or []
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise ValueError(f"cannot open {video}")
    rows = []
    try:
        for n, c in enumerate(value["contacts"], start=1):
            t = c["time_seconds"]
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
            ok, frame = cap.read()
            if not ok:
                continue
            for b in balls:
                if abs(b["time_seconds"] - t) <= trail_s:
                    x1, y1, x2, y2 = b["bbox"]
                    color = (0, 200, 0) if b["time_seconds"] < t else (0, 0, 255)
                    cv2.circle(frame, (int((x1 + x2) / 2), int((y1 + y2) / 2)), 4, color, -1)
            x, y = c["ball_px"]
            cv2.circle(frame, (int(x), int(y)), 14, (0, 255, 255), 2)
            text = f"#{n} t={t:.2f}s {c.get('side') or '?'} {c['shot_class']} ({c['evidence']})"
            cv2.putText(frame, text, (12, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 4)
            cv2.putText(frame, text, (12, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            cv2.imwrite(str(out_dir / f"contact_{n:03d}_{t:07.2f}s.jpg"), frame)
            rows.append({"time_seconds": f"{t:.2f}", "side": c.get("side") or "", "shot_class": c["shot_class"],
                         "notes": f"detected #{n}; check class, delete if no hit, add missed hits"})
    finally:
        cap.release()
    with open(out_dir / "labels_template.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=LABEL_FIELDS)
        w.writeheader()
        w.writerows(rows)
    return len(rows)

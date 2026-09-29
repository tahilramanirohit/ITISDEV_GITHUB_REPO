"""Group short tracker IDs into players, and set aside people who are not playing.

A person tracker assigns a new ID whenever it loses someone for a moment:
behind a partner, at the edge of the frame, or when two players cross. A
51-second doubles clip can produce twenty IDs for four players. This module
joins those pieces into one ID per player so a player can be picked once.

Two pieces are joined only when all of these hold:

* they are never seen at the same time (one person cannot be in two boxes);
* they are on the same side of the net, when the court is mapped;
* the second piece starts close to where the first ended, at running speed;
* their clothing colours match (a hue/saturation/brightness histogram of the
  shirt and shorts).

People whose feet are mostly off the court (a referee by the net post,
spectators behind the fence) are kept apart as ``on_court = False`` so they
cannot be counted as hitters.

This is a heuristic grouping, not face or identity recognition. Players who
wear the same colours on the same side can still be confused.
"""

from __future__ import annotations

import base64
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from .court import COURT_LENGTH_M, COURT_WIDTH_M, CourtCalibration, court_half, foot_point

# Hue, saturation and brightness: black and white shirts differ only in brightness.
HIST_BINS = (8, 4, 6)
MAX_APPEARANCE_SAMPLES = 24
MAX_COLOUR_DISTANCE = 0.42      # Bhattacharyya distance between torso histograms
MAX_RUN_SPEED_MPS = 7.0
POSITION_SLACK_M = 1.8
MAX_JOIN_GAP_S = 15.0   # players leave the frame between points
MAX_SHARED_FRAMES = 1
ON_COURT_SIDE_MARGIN_M = 1.2
ON_COURT_END_MARGIN_M = 3.5
MIN_ON_COURT_SHARE = 0.5
THUMB_HEIGHT = 128
SLIVER_FRAMES = 30               # about 3 s at 10 samples per second
SLIVER_MAX_COLOUR_DISTANCE = 0.6
SLIVER_MAX_DISTANCE_M = 3.0
SLIVER_WINDOW_S = 3.0


@dataclass
class _Piece:
    raw_id: int
    segment: int = 0
    frames: List[int] = field(default_factory=list)
    times: List[float] = field(default_factory=list)
    boxes: List[List[int]] = field(default_factory=list)
    court: List[Optional[Tuple[float, float]]] = field(default_factory=list)
    hists: List[np.ndarray] = field(default_factory=list)
    thumb: Optional[bytes] = None
    thumb_score: float = 0.0

    @property
    def start(self) -> float:
        return self.times[0]

    @property
    def end(self) -> float:
        return self.times[-1]

    def mean_hist(self) -> Optional[np.ndarray]:
        if not self.hists:
            return None
        h = np.mean(self.hists, axis=0).astype(np.float32)
        return h / max(1e-9, float(h.sum()))

    def mapped(self) -> List[Tuple[float, float]]:
        return [c for c in self.court if c is not None]


@dataclass
class PlayerGroup:
    player_id: int
    raw_ids: List[int]
    on_court: bool
    side: Optional[str]
    observed_frames: int
    first_seen_s: float
    last_seen_s: float
    median_court_m: Optional[Tuple[float, float]]
    label: str
    thumbnail: Optional[str]


def _torso_hist(frame: np.ndarray, box: Sequence[int]) -> Optional[np.ndarray]:
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    if w < 6 or h < 12:
        return None
    crop = frame[max(0, int(y1 + 0.15 * h)):max(0, int(y1 + 0.75 * h)),
                 max(0, int(x1 + 0.2 * w)):max(0, int(x2 - 0.2 * w))]
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, list(HIST_BINS), [0, 180, 0, 256, 0, 256]).ravel()
    return hist / max(1e-9, float(hist.sum()))


def _overlap_share(box: Sequence[int], others: Sequence[Sequence[int]]) -> float:
    x1, y1, x2, y2 = box
    area = max(1, (x2 - x1) * (y2 - y1))
    worst = 0.0
    for o in others:
        ix = max(0, min(x2, o[2]) - max(x1, o[0]))
        iy = max(0, min(y2, o[3]) - max(y1, o[1]))
        worst = max(worst, ix * iy / area)
    return worst


class PlayerCollector:
    """Collect per-ID evidence while frames are analyzed, then group it."""

    def __init__(self):
        self.pieces: Dict[int, _Piece] = {}

    def observe(self, frame_index: int, time_s: float, frame: np.ndarray, detections: Sequence[dict],
                calibration: Optional[CourtCalibration], segment: int = 0) -> None:
        boxes = [d["bbox"] for d in detections]
        for i, d in enumerate(detections):
            tid = d.get("track_id")
            if tid is None:
                continue
            p = self.pieces.setdefault(tid, _Piece(tid, segment))
            box = [int(v) for v in d["bbox"]]
            p.frames.append(frame_index)
            p.times.append(time_s)
            p.boxes.append(box)
            court = None
            if calibration is not None:
                xy = calibration.image_to_court([foot_point(box)])[0]
                if np.all(np.isfinite(xy)):
                    court = (float(xy[0]), float(xy[1]))
            p.court.append(court)
            others = boxes[:i] + boxes[i + 1:]
            clear = 1.0 - _overlap_share(box, others)
            if len(p.hists) < MAX_APPEARANCE_SAMPLES and len(p.frames) % 3 == 1 and clear > 0.8:
                h = _torso_hist(frame, box)
                if h is not None:
                    p.hists.append(h)
            # Thumbnail: the largest, least covered, most confident view.
            score = (box[2] - box[0]) * (box[3] - box[1]) * clear * (d.get("confidence") or 0.5)
            if score > 1.15 * p.thumb_score:
                crop = _crop(frame, box)
                if crop is not None:
                    p.thumb, p.thumb_score = crop, score

    def group(self) -> Tuple[List[PlayerGroup], Dict[int, int]]:
        """Return players (on-court first) and a raw-ID → player-ID map."""
        pieces = sorted((p for p in self.pieces.values() if p.frames), key=lambda p: p.start)
        groups: List[List[_Piece]] = [[p] for p in pieces]
        while True:
            best = None
            for i in range(len(groups)):
                for j in range(i + 1, len(groups)):
                    d = _join_cost(groups[i], groups[j])
                    if d is not None and (best is None or d < best[0]):
                        best = (d, i, j)
            if best is None:
                break
            _d, i, j = best
            groups[i] = sorted(groups[i] + groups[j], key=lambda p: p.start)
            del groups[j]
        groups = _absorb_slivers(groups)

        summaries = [_summary(g) for g in groups]
        # Stable, readable numbering: players on court by side and position, then everyone else.
        def order(s):
            on, side, pos, g = s
            x = pos[0] if pos else 0.0
            return (0 if on else 1, {"near": 0, "far": 1}.get(side, 2), x, g[0].start)
        summaries.sort(key=order)
        players: List[PlayerGroup] = []
        mapping: Dict[int, int] = {}
        for n, (on, side, pos, g) in enumerate(summaries, start=1):
            for p in g:
                mapping[p.raw_id] = n
            frames = sum(len(p.frames) for p in g)
            thumb = max(g, key=lambda p: p.thumb_score).thumb
            players.append(PlayerGroup(
                player_id=n, raw_ids=[p.raw_id for p in g], on_court=on, side=side,
                observed_frames=frames, first_seen_s=round(g[0].start, 3),
                last_seen_s=round(max(p.end for p in g), 3),
                median_court_m=(round(pos[0], 2), round(pos[1], 2)) if pos else None,
                label=_label(on, side, pos),
                thumbnail=("data:image/jpeg;base64," + base64.b64encode(thumb).decode()) if thumb else None,
            ))
        return players, mapping


def _crop(frame: np.ndarray, box: Sequence[int]) -> Optional[bytes]:
    x1, y1, x2, y2 = box
    h, w = frame.shape[:2]
    pad_x, pad_y = int(0.15 * (x2 - x1)), int(0.08 * (y2 - y1))
    crop = frame[max(0, y1 - pad_y):min(h, y2 + pad_y), max(0, x1 - pad_x):min(w, x2 + pad_x)]
    if crop.size == 0 or crop.shape[0] < 16:
        return None
    scale = THUMB_HEIGHT / crop.shape[0]
    crop = cv2.resize(crop, (max(1, int(crop.shape[1] * scale)), THUMB_HEIGHT), interpolation=cv2.INTER_AREA)
    ok, jpg = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 72])
    return jpg.tobytes() if ok else None


def _side(pieces: Sequence[_Piece]) -> Optional[str]:
    votes = [court_half(c[1]) for p in pieces for c in p.mapped()]
    votes = [v for v in votes if v]
    if not votes:
        return None
    near = votes.count("near")
    return "near" if near >= len(votes) - near else "far"


def _median_pos(pieces: Sequence[_Piece]) -> Optional[Tuple[float, float]]:
    pts = [c for p in pieces for c in p.mapped()]
    if not pts:
        return None
    arr = np.asarray(pts)
    return float(np.median(arr[:, 0])), float(np.median(arr[:, 1]))


def _on_court(pieces: Sequence[_Piece]) -> bool:
    pts = [c for p in pieces for c in p.mapped()]
    if not pts:
        return True  # cannot tell without a court map; keep them
    inside = sum(1 for x, y in pts
                 if -ON_COURT_SIDE_MARGIN_M <= x <= COURT_WIDTH_M + ON_COURT_SIDE_MARGIN_M
                 and -ON_COURT_END_MARGIN_M <= y <= COURT_LENGTH_M + ON_COURT_END_MARGIN_M)
    return inside / len(pts) >= MIN_ON_COURT_SHARE


def _summary(g: List[_Piece]):
    return (_on_court(g), _side(g), _median_pos(g), g)


def _label(on: bool, side: Optional[str], pos: Optional[Tuple[float, float]]) -> str:
    if not on:
        return "Off court (not counted as a player)"
    if side is None or pos is None:
        return "Player"
    # Court x runs left to right as seen from the camera behind the near baseline.
    where = "left" if pos[0] < COURT_WIDTH_M / 2 else "right"
    return f"{'Near' if side == 'near' else 'Far'} side, {where}"


def _frames(g: List[_Piece]) -> int:
    return sum(len(p.frames) for p in g)


def _colour(a: List[_Piece], b: List[_Piece]) -> Optional[float]:
    ha = [h for p in a for h in [p.mean_hist()] if h is not None]
    hb = [h for p in b for h in [p.mean_hist()] if h is not None]
    if not ha or not hb:
        return None
    return float(cv2.compareHist(np.mean(ha, axis=0).astype(np.float32), np.mean(hb, axis=0).astype(np.float32),
                                 cv2.HISTCMP_BHATTACHARYYA))


def _absorb_slivers(groups: List[List[_Piece]]) -> List[List[_Piece]]:
    """Fold short sightings into the established player they most resemble.

    A sliver (under ``SLIVER_FRAMES``) is usually one player partly hidden or
    at the frame edge. It joins the player on the same side of the net who is
    not visible at the same time, stood nearby at that moment, and whose
    colours are the closest (with a looser limit than for full pieces).
    """
    big = [g for g in groups if _frames(g) >= SLIVER_FRAMES]
    out = [g for g in big]
    for g in groups:
        if _frames(g) >= SLIVER_FRAMES:
            continue
        side, frames = _side(g), {f for p in g for f in p.frames}
        pos = _median_pos(g)
        best = None
        for target in out:
            if _frames(target) < SLIVER_FRAMES or {p.segment for p in target} != {p.segment for p in g}:
                continue
            if len(frames & {f for p in target for f in p.frames}) > MAX_SHARED_FRAMES:
                continue
            if side and _side(target) and side != _side(target):
                continue
            colour = _colour(g, target)
            if colour is not None and colour > SLIVER_MAX_COLOUR_DISTANCE:
                continue
            near_pos = _position_near(target, g[0].start, g[-1].end)
            if pos and near_pos and math.hypot(pos[0] - near_pos[0], pos[1] - near_pos[1]) > SLIVER_MAX_DISTANCE_M:
                continue
            score = (colour if colour is not None else SLIVER_MAX_COLOUR_DISTANCE)
            if best is None or score < best[0]:
                best = (score, target)
        if best is None:
            out.append(g)
        else:
            best[1].extend(g)
            best[1].sort(key=lambda p: p.start)
    return out


def _position_near(g: List[_Piece], start: float, end: float) -> Optional[Tuple[float, float]]:
    pts = [c for p in g for t, c in zip(p.times, p.court)
           if c is not None and start - SLIVER_WINDOW_S <= t <= end + SLIVER_WINDOW_S]
    if not pts:
        return None
    arr = np.asarray(pts)
    return float(np.median(arr[:, 0])), float(np.median(arr[:, 1]))


def _join_cost(a: List[_Piece], b: List[_Piece]) -> Optional[float]:
    # A camera cut cannot establish that two people are the same player.
    if {p.segment for p in a} != {p.segment for p in b}:
        return None
    frames_a = {f for p in a for f in p.frames}
    frames_b = {f for p in b for f in p.frames}
    if len(frames_a & frames_b) > MAX_SHARED_FRAMES:
        return None
    side_a, side_b = _side(a), _side(b)
    if side_a and side_b and side_a != side_b:
        return None
    ha = np.mean([h for p in a for h in ([p.mean_hist()] if p.mean_hist() is not None else [])] or [np.zeros(1)], axis=0)
    hb = np.mean([h for p in b for h in ([p.mean_hist()] if p.mean_hist() is not None else [])] or [np.zeros(1)], axis=0)
    if ha.size != hb.size or ha.size == 1:
        return None
    colour = float(cv2.compareHist(ha.astype(np.float32), hb.astype(np.float32), cv2.HISTCMP_BHATTACHARYYA))
    if colour > MAX_COLOUR_DISTANCE:
        return None
    # Continuity at the closest hand-over between the two groups.
    first, second = (a, b) if a[0].start <= b[0].start else (b, a)
    end_piece = max(first, key=lambda p: p.end)
    start_piece = min(second, key=lambda p: p.start)
    gap = start_piece.start - end_piece.end
    if gap > MAX_JOIN_GAP_S:
        return None
    end_court = next((c for c in reversed(end_piece.court) if c is not None), None)
    start_court = next((c for c in start_piece.court if c is not None), None)
    if end_court and start_court:
        dist = math.hypot(end_court[0] - start_court[0], end_court[1] - start_court[1])
        if dist > POSITION_SLACK_M + MAX_RUN_SPEED_MPS * max(0.0, gap):
            return None
        place = dist / (POSITION_SLACK_M + MAX_RUN_SPEED_MPS * max(0.0, gap))
    else:
        eb, sb = end_piece.boxes[-1], start_piece.boxes[0]
        height = max(1, eb[3] - eb[1], sb[3] - sb[1])
        dist = math.hypot((eb[0] + eb[2] - sb[0] - sb[2]) / 2, eb[3] - sb[3]) / height
        if dist > 1.0 + 3.0 * max(0.0, gap):
            return None
        place = dist / (1.0 + 3.0 * max(0.0, gap))
    return colour + 0.3 * place + 0.02 * max(0.0, gap)

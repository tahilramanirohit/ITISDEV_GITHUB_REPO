import type { AnalysisResultV1, CourtLinesSnapshot } from "./contract";
import { courtPlayers } from "./shotLabels";
import { COURT_LENGTH_M as L, COURT_WIDTH_M as W } from "../coaching/lastGameReview";

/**
 * Where every on-court player stood, for one top-view court (all players at once).
 *
 * The analysis stores each player's box in the video frame and the court lines in pixels.
 * The first four court lines are the near baseline, far baseline, left and right sideline
 * (picklepro/shots.py court_line_segments), so their ends are the four court corners. From
 * those corners a homography maps each player's feet (bottom middle of the box) onto the
 * court in metres: x from the near-left sideline, y from the near baseline.
 * Frames where a corner is cut off by the edge of the picture are skipped.
 */
export const HEAT_CELL_M = 0.6096; // 2 ft, as in court_heatmap
export const HEAT_X0 = -1.2192;    // 4 ft beyond the sidelines
export const HEAT_Y0 = -2.4384;    // 8 ft behind the baselines
export const HEAT_COLS = 14;
export const HEAT_ROWS = 30;

type Pt = [number, number];
export type Homography = number[]; // 3x3, row-major

/** The 3x3 matrix taking 4 source points to 4 destination points (direct linear solve). Null if degenerate. */
export function homographyFrom4(src: Pt[], dst: Pt[]): Homography | null {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-9) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 9; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [...Array.from({ length: 8 }, (_, i) => a[i][8] / a[i][i]), 1];
}

export function applyHomography(h: Homography, [x, y]: Pt): Pt | null {
  const w = h[6] * x + h[7] * y + h[8];
  if (Math.abs(w) < 1e-9) return null;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

const close = (a: Pt, b: Pt, tol = 8) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

/** Image → court mapping from one court-lines snapshot, or null when the four corners are not all in the picture. */
export function courtMappingFrom(snap: CourtLinesSnapshot | undefined): Homography | null {
  const ln = snap?.lines;
  if (!ln || ln.length < 4) return null;
  const [near, far, left, right] = ln;
  const nl: Pt = [near[0], near[1]], nr: Pt = [near[2], near[3]], fl: Pt = [far[0], far[1]], fr: Pt = [far[2], far[3]];
  // Unclipped lines share their end points at the corners.
  if (!close(nl, [left[0], left[1]]) || !close(fl, [left[2], left[3]]) || !close(nr, [right[0], right[1]]) || !close(fr, [right[2], right[3]])) return null;
  return homographyFrom4([nl, nr, fl, fr], [[0, 0], [W, 0], [0, L], [W, L]]);
}

export type PlayerHeat = {
  playerId: number;
  side: "near" | "far" | null;
  /** Seconds per cell, HEAT_ROWS x HEAT_COLS (row 0 = 8 ft behind the near baseline). */
  seconds: number[][];
  totalS: number;
  /** The busiest cell's centre, in court metres. */
  hotSpot: Pt | null;
};

/** One heat grid per on-court player, from the stored boxes and court lines. Empty when the court could not be mapped. */
export function playerHeat(result: AnalysisResultV1): PlayerHeat[] {
  const snaps = result.player_positions ?? [];
  const lines = [...(result.court_lines ?? [])].sort((a, b) => a.time_seconds - b.time_seconds);
  if (!snaps.length || !lines.length) return [];
  const onCourt = new Map(courtPlayers(result).map((p) => [p.player_id, p]));
  // Same window as the zone bars (metrics.zone_time): only during detected rallies when there are any,
  // so standing behind the baseline between points does not count.
  const rallies = result.metrics.rally_segmentation?.value?.rallies ?? [];
  const inWindow = (s: number) => !rallies.length || rallies.some((r) => s >= r.start_s - 1e-6 && s <= r.end_s + 1e-6);
  if (!onCourt.size) return [];
  const grids = new Map<number, PlayerHeat>();
  let li = -1;
  let h: Homography | null = null;
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    // Court lines are stored only when they move: use the latest one at or before this frame.
    while (li + 1 < lines.length && lines[li + 1].time_seconds <= s.time_seconds + 1e-6) { li++; h = courtMappingFrom(lines[li]); }
    if (li < 0) { h = courtMappingFrom(lines[0]); }
    if (!h || !inWindow(s.time_seconds)) continue;
    const dt = Math.min(1, Math.max(0, (snaps[i + 1]?.time_seconds ?? s.time_seconds + 0.2) - s.time_seconds));
    if (dt <= 0) continue;
    for (const box of s.players) {
      if (box.track_id == null || !onCourt.has(box.track_id)) continue;
      const [x1, , x2, y2] = box.bbox;
      const p = applyHomography(h, [(x1 + x2) / 2, y2]);
      if (!p) continue;
      const col = Math.floor((p[0] - HEAT_X0) / HEAT_CELL_M), row = Math.floor((p[1] - HEAT_Y0) / HEAT_CELL_M);
      if (col < 0 || col >= HEAT_COLS || row < 0 || row >= HEAT_ROWS) continue;
      let g = grids.get(box.track_id);
      if (!g) {
        g = { playerId: box.track_id, side: onCourt.get(box.track_id)!.side, seconds: Array.from({ length: HEAT_ROWS }, () => Array(HEAT_COLS).fill(0)), totalS: 0, hotSpot: null };
        grids.set(box.track_id, g);
      }
      g.seconds[row][col] += dt;
      g.totalS += dt;
    }
  }
  for (const g of grids.values()) {
    let best = -1;
    g.seconds.forEach((r, ri) => r.forEach((v, ci) => {
      if (v > best) { best = v; g.hotSpot = [HEAT_X0 + (ci + 0.5) * HEAT_CELL_M, HEAT_Y0 + (ri + 0.5) * HEAT_CELL_M]; }
    }));
    for (const r of g.seconds) for (let c = 0; c < r.length; c++) r[c] = Math.round(r[c] * 1000) / 1000;
  }
  // At least a second on court to be worth drawing.
  return [...grids.values()].filter((g) => g.totalS >= 1).sort((a, b) => a.playerId - b.playerId);
}

export type HeatZone = "kitchen" | "transition" | "baseline" | "behind" | "outside";
export const HEAT_ZONE_WORDS: Record<HeatZone, string> = {
  kitchen: "at the kitchen", transition: "in no-man's land", baseline: "near the baseline",
  behind: "behind the baseline", outside: "off the side of the court",
};
/** The zone bars' definitions (metrics.zone_time): kitchen to 2.13 m from the net, no-man's land to 5.2 m, then the baseline area. */
const KITCHEN_FROM_NET_M = 2.1336;
const TRANSITION_TO_M = 5.2;

/** The zone a court point (metres) is in, judged from that player's own side of the net. */
export function heatZoneAt(x: number, y: number): HeatZone {
  if (y < 0 || y > L) return "behind";
  if (x < 0 || x > W) return "outside";
  const fromNet = Math.abs(y - L / 2);
  return fromNet <= KITCHEN_FROM_NET_M ? "kitchen" : fromNet <= TRANSITION_TO_M ? "transition" : "baseline";
}

/** Where a player spent most of their time: the zone and its share (0-1). */
export function mainZone(h: PlayerHeat): { zone: HeatZone; share: number } | null {
  if (h.totalS <= 0) return null;
  const sums: Record<HeatZone, number> = { kitchen: 0, transition: 0, baseline: 0, behind: 0, outside: 0 };
  h.seconds.forEach((row, ri) => row.forEach((s, ci) => {
    if (s > 0) sums[heatZoneAt(HEAT_X0 + (ci + 0.5) * HEAT_CELL_M, HEAT_Y0 + (ri + 0.5) * HEAT_CELL_M)] += s;
  }));
  const [zone, s] = (Object.entries(sums) as [HeatZone, number][]).sort((a, b) => b[1] - a[1])[0];
  return { zone, share: s / h.totalS };
}

export type TrackPoint = { t: number; x: number; y: number };

/**
 * Every on-court player's path on the court (metres), frame by frame, over the whole video,
 * for the moving dots. Uses the same corner mapping as playerHeat; frames without a full court are skipped.
 */
export function playerTracks(result: AnalysisResultV1): Map<number, TrackPoint[]> {
  const out = new Map<number, TrackPoint[]>();
  const snaps = result.player_positions ?? [];
  const lines = [...(result.court_lines ?? [])].sort((a, b) => a.time_seconds - b.time_seconds);
  const onCourt = new Set(courtPlayers(result).map((p) => p.player_id));
  if (!snaps.length || !lines.length || !onCourt.size) return out;
  let li = -1;
  let h: Homography | null = courtMappingFrom(lines[0]);
  for (const s of snaps) {
    while (li + 1 < lines.length && lines[li + 1].time_seconds <= s.time_seconds + 1e-6) { li++; h = courtMappingFrom(lines[li]); }
    if (!h) continue;
    for (const box of s.players) {
      if (box.track_id == null || !onCourt.has(box.track_id)) continue;
      const [x1, , x2, y2] = box.bbox;
      const p = applyHomography(h, [(x1 + x2) / 2, y2]);
      if (!p || p[0] < HEAT_X0 || p[0] > HEAT_X0 + HEAT_COLS * HEAT_CELL_M || p[1] < HEAT_Y0 || p[1] > HEAT_Y0 + HEAT_ROWS * HEAT_CELL_M) continue;
      const list = out.get(box.track_id) ?? [];
      list.push({ t: s.time_seconds, x: p[0], y: p[1] });
      out.set(box.track_id, list);
    }
  }
  return out;
}

/** Where a player is at time t: between the two nearest samples (up to 1 s apart), else the nearest within 0.6 s, else null. */
export function positionAt(track: TrackPoint[], t: number): TrackPoint | null {
  if (!track.length) return null;
  let lo = 0, hi = track.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (track[mid].t <= t) lo = mid; else hi = mid - 1; }
  const a = track[lo], b = track[lo + 1];
  if (a.t > t) return t >= a.t - 0.6 ? a : null;
  if (b && b.t - a.t <= 1) {
    const f = (t - a.t) / (b.t - a.t);
    return { t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  if (t - a.t <= 0.6) return a;
  return b && b.t - t <= 0.6 ? b : null;
}

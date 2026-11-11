import type { AnalysisResultV1, HeatmapValue } from "./contract";
import { COURT_LENGTH_M as L, COURT_WIDTH_M as W, KITCHEN_M, NET_M } from "../coaching/lastGameReview";

/**
 * The court map on the Position tab: the analysed player's heatmap turned into a few plain
 * numbers and a light game layer (a level, badges and one challenge for the next game).
 *
 * All positions here are on the player's own half, seen as if they stand at the bottom:
 * y is metres from their baseline (the net is at NET_M), x is metres from their left sideline.
 */

export type CourtZone = "kitchen" | "transition" | "baseline";
/** "Within 1.5 m of the baseline or behind it", as in the zone-time metric. */
export const BASELINE_BAND_M = 1.5;
export const KITCHEN_LINE_M = NET_M - KITCHEN_M;

// The game layer. These are starting values for doubles and are meant to be tuned by a coach.
export const LEVELS = [
  { level: 1, name: "Baseliner", minKitchen: 0 },
  { level: 2, name: "Climber", minKitchen: 0.25 },
  { level: 3, name: "Net player", minKitchen: 0.45 },
  { level: 4, name: "Kitchen boss", minKitchen: 0.6 },
] as const;
/** The no-man's-land share to get under in the next game. */
export const NO_MANS_LAND_GOAL = 0.35;
/** Below this much tracked time the map is too thin to grade. */
export const MIN_TRACKED_S = 10;

export type CourtLevel = { level: number; name: string; minKitchen: number };
export type CourtBadge = { id: "line_holder" | "net_player" | "kitchen_boss"; name: string; earned: boolean; progress?: string };
export type CourtChallenge = { title: string; how: string; now: number; goal: number; lowerIsBetter: boolean; done: boolean };

export type CourtMap = {
  heatmap: HeatmapValue;
  /** True when the player stood on the near half, so the grid is already in their own view. */
  nearSide: boolean;
  trackedS: number;
  share: Record<CourtZone, number> & { outside: number };
  /** Centre of the busiest 60 cm square, in the player's own view. */
  hotSpot: { x: number; y: number };
  /** Metres behind the kitchen line of the average spot (negative: inside the kitchen). */
  averageBehindLineM: number;
  /** True when the busiest square touches the kitchen line. */
  hotSpotOnLine: boolean;
  /** Enough tracked time for the level, badges and challenge. */
  graded: boolean;
  level: CourtLevel;
  nextLevel: CourtLevel | null;
  badges: CourtBadge[];
  challenge: CourtChallenge | null;
};

/** A point on the grid's court (near baseline at y = 0) seen from the player's own side. */
export function toOwnView(x: number, y: number, nearSide: boolean): { x: number; y: number } {
  return nearSide ? { x, y } : { x: W - x, y: L - y };
}

export function zoneAt(y: number): CourtZone {
  if (y >= KITCHEN_LINE_M) return "kitchen";
  return y < BASELINE_BAND_M ? "baseline" : "transition";
}

function sideOf(result: AnalysisResultV1, heatmap: HeatmapValue): boolean {
  const sel = result.player_selection;
  const analysed = sel?.method === "track_id" ? sel.track_id : null;
  const row = analysed != null ? result.metrics.zone_time?.value?.players.find((p) => p.player_id === analysed) : null;
  if (row) return row.side === "near";
  const positioning = result.metrics.positioning?.value;
  if (positioning) return positioning.court_half === "near";
  let total = 0, weighted = 0;
  heatmap.dwell_seconds.forEach((r, ri) => r.forEach((s) => {
    total += s; weighted += s * (heatmap.y_edges_m[ri] + heatmap.y_edges_m[ri + 1]) / 2;
  }));
  return total === 0 || weighted / total < NET_M;
}

export function levelFor(kitchenShare: number): CourtLevel {
  return [...LEVELS].reverse().find((l) => kitchenShare >= l.minKitchen) ?? LEVELS[0];
}

/** The court map for the analysed player, or null when the result has no usable heatmap. */
export function buildCourtMap(result: AnalysisResultV1): CourtMap | null {
  if (result.data_origin !== "measured") return null;
  const heatmap = result.metrics.court_heatmap?.value;
  if (!heatmap?.dwell_seconds.length) return null;
  const nearSide = sideOf(result, heatmap);

  const seconds = { kitchen: 0, transition: 0, baseline: 0, outside: 0 };
  let total = 0, sumY = 0, peak = -1;
  let hotSpot = { x: W / 2, y: KITCHEN_LINE_M };
  heatmap.dwell_seconds.forEach((row, ri) => row.forEach((s, ci) => {
    if (s <= 0) return;
    const p = toOwnView((heatmap.x_edges_m[ci] + heatmap.x_edges_m[ci + 1]) / 2,
      (heatmap.y_edges_m[ri] + heatmap.y_edges_m[ri + 1]) / 2, nearSide);
    total += s; sumY += s * p.y;
    if (p.x < 0 || p.x > W) seconds.outside += s;
    else seconds[zoneAt(p.y)] += s;
    if (s > peak) { peak = s; hotSpot = p; }
  }));
  if (total <= 0) return null;

  const share = {
    kitchen: seconds.kitchen / total, transition: seconds.transition / total,
    baseline: seconds.baseline / total, outside: seconds.outside / total,
  };
  const trackedS = heatmap.tracked_time_s || total;
  const level = levelFor(share.kitchen);
  const nextLevel = LEVELS.find((l) => l.level === level.level + 1) ?? null;
  const hotSpotOnLine = Math.abs(hotSpot.y - KITCHEN_LINE_M) <= heatmap.cell_size_m / 2 + 1e-6;
  const pct = (f: number) => Math.round(f * 100);
  const badges: CourtBadge[] = [
    { id: "line_holder", name: "Line holder", earned: hotSpotOnLine },
    { id: "net_player", name: "Net player", earned: share.kitchen >= LEVELS[2].minKitchen, progress: `${pct(share.kitchen)}/${pct(LEVELS[2].minKitchen)}` },
    { id: "kitchen_boss", name: "Kitchen boss", earned: share.kitchen >= LEVELS[3].minKitchen, progress: `${pct(share.kitchen)}/${pct(LEVELS[3].minKitchen)}` },
  ];
  const challenge: CourtChallenge | null = share.transition > NO_MANS_LAND_GOAL
    ? { title: `Under ${pct(NO_MANS_LAND_GOAL)}% in no-man's land`, how: "After your return, keep walking until your toes touch the kitchen line.",
        now: share.transition, goal: NO_MANS_LAND_GOAL, lowerIsBetter: true, done: false }
    : share.kitchen < LEVELS[3].minKitchen
      ? { title: `${pct(LEVELS[3].minKitchen)}% at the kitchen`, how: "Get to the line together with your partner and stay there through the dinks.",
          now: share.kitchen, goal: LEVELS[3].minKitchen, lowerIsBetter: false, done: false }
      : null;

  const graded = trackedS >= MIN_TRACKED_S;
  return {
    heatmap, nearSide, trackedS, share, hotSpot, hotSpotOnLine,
    averageBehindLineM: KITCHEN_LINE_M - sumY / total,
    graded, level, nextLevel, badges, challenge: graded ? challenge : null,
  };
}

/** Plain-words explanation of one zone, using the player's own numbers. `name` is set when the map is someone else's. */
export function zoneTip(map: CourtMap, zone: CourtZone, name?: string): string {
  const p = Math.round(map.share[zone] * 100);
  const who = name ?? "You";
  if (zone === "kitchen") {
    return `The best place to be in doubles. ${who} spent ${p}% of rally time here`
      + (map.hotSpotOnLine ? `, and ${name ? `${name}'s` : "your"} busiest spot was right on the kitchen line.` : ".");
  }
  if (zone === "transition") {
    const back = map.averageBehindLineM;
    return `Balls land at your feet here, so it's the hardest spot to defend. ${who} spent ${p}% here`
      + (back > 0.3 && back < 4 ? `, standing ${back.toFixed(1)} m behind the kitchen line on average.` : ".");
  }
  return p <= 15
    ? `Good for serves and returns. Only ${p}% here, so ${name ? `${name} is` : "you're"} leaving it quickly.`
    : `Good for serves and returns, then move up. ${who} spent ${p}% here, which leaves the net open.`;
}

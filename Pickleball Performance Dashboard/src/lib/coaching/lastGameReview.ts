import { publicShotResult, type AnalysisResultV1, type ErrorKind, type HeatmapValue, type ZoneName } from "../analysis/contract";
import { SHOT_INFO, isMine } from "../analysis/shotLabels";

/** Court length and the net position (metres), matching server/picklepro/court.py. */
export const COURT_LENGTH_M = 13.4112;
export const COURT_WIDTH_M = 6.096;
export const NET_M = COURT_LENGTH_M / 2;
export const KITCHEN_M = 2.1336;

/** Short, singular names for one moment on the Home tile. */
const ERROR_MOMENT: Record<ErrorKind, string> = {
  serve_fault: "Serve fault",
  out: "Ball out",
  kitchen_fault: "Kitchen fault",
  no_mans_land: "Hit from mid-court",
  stayed_back: "Stayed back",
};

export type ReviewMoment = { time: number; label: string; tone: "good" | "error" };

/** What the Home "Last game" switch shows for a game with an analyzed video. */
export type LastGameReview = {
  heatmap: HeatmapValue;
  /** True when the player was on the camera's side of the net (court y below the net). */
  nearSide: boolean;
  /** Share of time in the metre behind the kitchen line, 0–1, when zone time was measured for this player. */
  kitchenLineShare: number | null;
  zoneShare: Record<ZoneName, number> | null;
  /** "rallies" when only detected rallies were counted, otherwise the whole video. */
  window: "rallies" | "video";
  /** Up to three moments, in video order: the player's good soft shots and errors. */
  moments: ReviewMoment[];
};

/** The player the user said they are, else the analysed track. Mirrors ResultView's choice. */
export function chosenPlayer(result: AnalysisResultV1, saved: number | null): number | null {
  if (saved != null) return saved;
  return result.player_selection?.method === "track_id" ? result.player_selection.track_id ?? null : null;
}

function heatmapCentreY(value: HeatmapValue): number | null {
  let total = 0, weighted = 0;
  value.dwell_seconds.forEach((row, ri) => row.forEach((sec) => {
    const y = (value.y_edges_m[ri] + value.y_edges_m[ri + 1]) / 2;
    total += sec; weighted += sec * y;
  }));
  return total > 0 ? weighted / total : null;
}

/**
 * Real numbers only: measured results with a court heatmap. Test fixtures, failed runs
 * and results without a heatmap return null, so Home keeps the plain drawn court.
 */
export function lastGameReview(result: AnalysisResultV1, myPlayerId: number | null): LastGameReview | null {
  if (result.data_origin !== "measured") return null;
  const heatmap = result.metrics.court_heatmap?.value;
  if (!heatmap || !heatmap.dwell_seconds.length) return null;

  const zoneValue = result.metrics.zone_time?.value ?? null;
  const row = myPlayerId != null ? zoneValue?.players.find((p) => p.player_id === myPlayerId) ?? null : null;
  // Positioning is measured for the same analysed player as the heatmap, so it can stand in
  // when the user hasn't picked themselves yet.
  const positioning = result.metrics.positioning?.value ?? null;
  const centre = heatmapCentreY(heatmap);
  const nearSide = row ? row.side === "near" : positioning ? positioning.court_half === "near" : centre == null || centre < NET_M;

  const moments: ReviewMoment[] = [];
  const errors = (result.metrics.error_counts?.value?.events ?? [])
    .filter((e) => myPlayerId != null && e.player_id === myPlayerId);
  const shots = (publicShotResult(result).metrics.shot_classification.value?.shots ?? [])
    .filter((s) => isMine(s, myPlayerId) && ["drop", "dink", "reset"].includes(s.shot_type) && s.landed_in !== false);
  shots.slice(0, 2).forEach((s) => moments.push({ time: s.time_seconds, label: SHOT_INFO[s.shot_type].name, tone: "good" }));
  errors.slice(0, 2).forEach((e) => moments.push({ time: e.time_seconds, label: ERROR_MOMENT[e.kind], tone: "error" }));
  moments.sort((a, b) => a.time - b.time);

  return {
    heatmap,
    nearSide,
    kitchenLineShare: row ? row.kitchen_line_share : positioning?.fraction_of_mapped_time.kitchen_line ?? null,
    zoneShare: row ? row.zone_share : null,
    window: row && zoneValue?.window === "detected_rallies" ? "rallies" : "video",
    moments: moments.slice(0, 3),
  };
}

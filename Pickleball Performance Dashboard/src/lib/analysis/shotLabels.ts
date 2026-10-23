import type { AnalysisResultV1, PlayerSummary, ShotEvent, ShotType } from "./contract";

/** Plain names and one-line meanings, written for players of any age or level. */
export const SHOT_INFO: Record<ShotType, { name: string; meaning: string; color: string }> = {
  serve: { name: "Serve", meaning: "The underhand first hit, from behind the baseline, diagonally past the kitchen.", color: "#293df2" },
  return: { name: "Return", meaning: "The reply to the serve, after it bounces.", color: "#4f5fd6" },
  drive: { name: "Drive", meaning: "A hard, flat shot.", color: "#a94318" },
  drop: { name: "Drop", meaning: "A soft shot from the back that lands near the net.", color: "#2c8a5a" },
  dink: { name: "Dink", meaning: "A soft, short shot from the kitchen line.", color: "#2f8f5b" },
  reset: { name: "Reset", meaning: "A soft reply that takes the pace off a hard ball.", color: "#0f766e" },
  speed_up: { name: "Speed-up", meaning: "A sudden fast attack out of a soft exchange.", color: "#c2410c" },
  counter: { name: "Counter", meaning: "A fast volley straight back at a fast ball.", color: "#9f1239" },
  volley: { name: "Volley", meaning: "Hit out of the air before it bounces.", color: "#6543a4" },
  lob: { name: "Lob", meaning: "A high shot over the other player.", color: "#b5651d" },
  overhead: { name: "Overhead smash", meaning: "Hit from above your head, downward.", color: "#ad2545" },
  erne: { name: "Erne", meaning: "A volley near the net from outside the sideline.", color: "#7c3aed" },
  unclassified: { name: "Hit", meaning: "A hit was seen, but the type was unclear.", color: "#66707c" },
};

export const SOFT_SHOTS: ShotType[] = ["dink", "drop", "reset"];
export const HARD_SHOTS: ShotType[] = ["drive", "speed_up", "counter", "volley", "overhead"];

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function shotsOf(result: AnalysisResultV1): ShotEvent[] {
  return result.metrics.shot_classification.value?.shots ?? [];
}

/** Is this shot by the player the user said they are (or, without a choice, the analysed player)? */
export function isMine(shot: ShotEvent, myPlayerId: number | null | undefined): boolean {
  return myPlayerId != null ? shot.hitter_track_id === myPlayerId : shot.by_selected_player;
}

/** Never substitute everyone's shots when a chosen player has no detected shots. */
export function focusShots(result: AnalysisResultV1, myPlayerId?: number | null): { shots: ShotEvent[]; mine: boolean } {
  const all = shotsOf(result);
  if (myPlayerId == null) return { shots: all, mine: false };
  const mine = all.filter((s) => isMine(s, myPlayerId));
  return { shots: mine, mine: true };
}

/** Players who can be chosen: people on the court, in the analysis's order. */
export function courtPlayers(result: AnalysisResultV1): PlayerSummary[] {
  return (result.players ?? []).filter((p) => p.on_court);
}

/** Shots per player, for the "All players" table. Players without shots are kept. */
export function shotsByPlayer(result: AnalysisResultV1): { player: PlayerSummary | null; shots: ShotEvent[] }[] {
  const all = shotsOf(result);
  const rows: { player: PlayerSummary | null; shots: ShotEvent[] }[] = courtPlayers(result)
    .map((player) => ({ player, shots: all.filter((s) => s.hitter_track_id === player.player_id) }));
  const known = new Set(rows.map((r) => r.player?.player_id));
  const unknown = all.filter((s) => s.hitter_track_id == null || !known.has(s.hitter_track_id));
  if (unknown.length) rows.push({ player: null, shots: unknown });
  return rows;
}

export function playerName(result: AnalysisResultV1, id: number | null, myPlayerId?: number | null): string {
  if (id == null) return "Unknown player";
  if (myPlayerId != null && id === myPlayerId) return "You";
  const p = (result.players ?? []).find((x) => x.player_id === id);
  return p ? `Player ${id} (${p.label.toLowerCase()})` : `Player ${id}`;
}

export function countByType(shots: ShotEvent[]): [ShotType, number][] {
  const counts = new Map<ShotType, number>();
  for (const s of shots) counts.set(s.shot_type, (counts.get(s.shot_type) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export type ShotTip = { title: string; text: string };

/**
 * One gentle practice idea from the shot mix. Needs enough shots to say
 * anything; the labels are estimates, so the wording stays tentative.
 */
export function shotTip(shots: ShotEvent[]): ShotTip | null {
  const known = shots.filter((s) => s.shot_type !== "unclassified" && s.shot_type !== "serve" && s.shot_type !== "return");
  if (known.length < 8) return null;
  const share = (types: ShotType[]) => known.filter((s) => types.includes(s.shot_type)).length / known.length;
  const landed = shots.filter((s) => s.landed_in !== null);
  const out = landed.filter((s) => s.landed_in === false).length;
  if (landed.length >= 6 && out / landed.length >= 0.3) {
    return {
      title: "Keep more balls in",
      text: `About ${out} of ${landed.length} shots we could follow landed out. Aim a little further inside the lines and take some pace off.`,
    };
  }
  if (share(SOFT_SHOTS) < 0.2 && share(HARD_SHOTS) > 0.5) {
    return {
      title: "Add soft shots",
      text: "Most of your shots looked hard and fast. Mixing in dinks and drops makes it harder for the other player to attack.",
    };
  }
  if (share(["lob"]) > 0.25) {
    return {
      title: "Use the lob as a surprise",
      text: "Many shots looked like lobs. Lobs work best now and then; too many give the other player easy overheads.",
    };
  }
  if (share(SOFT_SHOTS) > 0.6) {
    return {
      title: "Nice soft game",
      text: "Many of your shots were soft dinks or drops. When the other player hits a high ball, try attacking it.",
    };
  }
  return null;
}

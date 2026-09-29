import type { AnalysisResultV1, ShotEvent, ShotType } from "./contract";

/** Plain names and one-line meanings, written for players of any age or level. */
export const SHOT_INFO: Record<ShotType, { name: string; meaning: string; color: string }> = {
  serve: { name: "Serve", meaning: "The first hit that starts the point.", color: "#293df2" },
  return: { name: "Return", meaning: "The reply to the serve.", color: "#4f5fd6" },
  drive: { name: "Drive", meaning: "A hard, flat shot.", color: "#a94318" },
  drop: { name: "Drop", meaning: "A soft shot from the back that lands near the net.", color: "#1f7a4d" },
  dink: { name: "Dink", meaning: "A soft, short shot from the kitchen line.", color: "#2f8f5b" },
  volley: { name: "Volley", meaning: "Hit out of the air before it bounces.", color: "#6543a4" },
  lob: { name: "Lob", meaning: "A high shot over the other player.", color: "#b5651d" },
  overhead: { name: "Overhead", meaning: "Hit from above your head, like a smash.", color: "#ad2545" },
  unclassified: { name: "Hit", meaning: "A hit was seen, but the type was unclear.", color: "#66707c" },
};

export const SOFT_SHOTS: ShotType[] = ["dink", "drop"];
export const HARD_SHOTS: ShotType[] = ["drive", "volley", "overhead"];

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function shotsOf(result: AnalysisResultV1): ShotEvent[] {
  return result.metrics.shot_classification.value?.shots ?? [];
}

/** Whose shots to summarise: the selected player's when the video identified them. */
export function focusShots(result: AnalysisResultV1): { shots: ShotEvent[]; mine: boolean } {
  const all = shotsOf(result);
  const mine = all.filter((s) => s.by_selected_player);
  return mine.length > 0 ? { shots: mine, mine: true } : { shots: all, mine: false };
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

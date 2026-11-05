import { SKILL_INFO, type SelfSkill } from "./selfAssessment";
import type { BuddyDetails, BuddyLevel, BuddyPlayer, BuddyPurpose } from "../api/buddy";

// Kept out of lib/api/buddy.ts so the always-loaded Buddy badge does not pull in the skill texts.

export type BuddySuggestion = { player: BuddyPlayer; details: BuddyDetails; reason: string };

/**
 * Up to 3 suggested buddies: players with no open request who look for something
 * you look for, at a similar game rating (within 0.5), or the same level when a
 * rating is missing. Players strong at one of your focus skills come first.
 */
export function suggestBuddies(players: readonly BuddyPlayer[], details: ReadonlyMap<string, BuddyDetails>, me: {
  gameRating: number | null; lookingFor: readonly BuddyPurpose[]; focusSkills: readonly SelfSkill[]; level: BuddyLevel | null;
}, max = 3): BuddySuggestion[] {
  if (!me.lookingFor.length) return [];
  const scored = players.flatMap((player) => {
    const d = details.get(player.player_id);
    if (!d || player.request_status || !d.looking_for.some((l) => me.lookingFor.includes(l))) return [];
    const bothRated = me.gameRating != null && d.game_rating != null;
    const gap = bothRated ? Math.abs(me.gameRating! - d.game_rating!) : null;
    if (gap != null ? gap > 0.5 : !(me.level && player.level === me.level)) return [];
    const strong = d.strong_skills.find((s) => me.focusSkills.includes(s));
    const reason = strong ? `Strong at ${SKILL_INFO[strong].label.toLowerCase()}, your focus` : bothRated ? "Similar game rating" : "Same level";
    return [{ player, details: d, reason, rank: [strong ? 0 : 1, gap ?? 0.25] as const }];
  });
  return scored
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.player.display_name.localeCompare(b.player.display_name))
    .slice(0, max)
    .map(({ player, details: d, reason }) => ({ player, details: d, reason }));
}


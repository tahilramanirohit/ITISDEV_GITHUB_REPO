import type { MatchResult } from "../api/types";

/** Our score comes first. Ignore unfinished entries; never guess from free text. */
export function parseGameScore(score: string): { games_played: number; games_won: number; match_result: MatchResult | null } | null {
  const games = score.split(",").flatMap((entry) => {
    const match = entry.trim().match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
    if (!match || Number(match[1]) === Number(match[2])) return [];
    return [[Number(match[1]), Number(match[2])]];
  });
  if (!games.length || games.length > 50) return null;
  const won = games.filter(([ours, theirs]) => ours > theirs).length;
  const lost = games.length - won;
  return { games_played: games.length, games_won: won, match_result: won === lost ? null : won > lost ? "win" : "loss" };
}

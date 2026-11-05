import { sessionKind, type MatchResult, type SessionKind, type SessionRow } from "../api/types";
import type { SelfAssessment } from "../api/selfAssessment";
import { MIN_RATED_SKILLS, SELF_SKILLS, type ErrorLevel, type SelfRatings, type SelfSkill } from "./selfAssessment";

export const PROGRESS_MODES = ["games", "practice", "all"] as const;
export type ProgressMode = (typeof PROGRESS_MODES)[number];
export const MODE_LABELS: Record<ProgressMode, string> = { games: "Games", practice: "Practice", all: "All" };

/** How many recent games the results card looks at. */
export const RESULTS_WINDOW = 8;

/** One logged session, with its self-assessment when there is one. */
export type SessionPoint = {
  sessionId: string;
  date: string;
  title: string;
  kind: SessionKind;
  /** Average of the rated skills, or null with fewer than MIN_RATED_SKILLS ratings. */
  overall: number | null;
  ratings: SelfRatings;
  matchResult: MatchResult | null;
  gamesPlayed: number | null;
  gamesWon: number | null;
  errors: ErrorLevel | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Average of the rated skills, or null when too few are rated to mean anything. */
export function averageRating(ratings: SelfRatings | null | undefined): number | null {
  if (!ratings) return null;
  const values = SELF_SKILLS.flatMap((s) => (ratings[s] != null ? [ratings[s]!] : []));
  return values.length >= MIN_RATED_SKILLS ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Every session as a point, oldest first. */
export function buildPoints(sessions: SessionRow[], assessments: SelfAssessment[]): SessionPoint[] {
  const byId = new Map(assessments.map((a) => [a.session_id, a]));
  return [...sessions]
    .sort((a, b) => a.session_date.localeCompare(b.session_date) || a.created_at.localeCompare(b.created_at))
    .map((s) => {
      const a = byId.get(s.id);
      return {
        sessionId: s.id, date: s.session_date, title: s.title, kind: sessionKind(s),
        overall: averageRating(a?.ratings), ratings: a?.ratings ?? {},
        matchResult: s.match_result ?? null, gamesPlayed: a?.games_played ?? null, gamesWon: a?.games_won ?? null,
        errors: a?.unforced_errors ?? null,
      };
    });
}

/** Games are matches and tournaments; practice is solo work. */
export function inMode(kind: SessionKind, mode: ProgressMode): boolean {
  return mode === "all" || (mode === "practice" ? kind === "solo" : kind !== "solo");
}

export type BaselineSummary = { overall: number; ratings: SelfRatings; setAt: string | null };

/** The onboarding baseline, when it has enough ratings to average. */
export function baselineSummary(ratings: SelfRatings | null | undefined, setAt?: string | null): BaselineSummary | null {
  const overall = averageRating(ratings);
  return overall == null || !ratings ? null : { overall, ratings, setAt: setAt ?? null };
}

export type GameResults = {
  /** Wins and losses in the last games with a result; null with fewer than 2. */
  record: { won: number; lost: number; rate: number } | null;
  /** Games won out of played, recent window vs the window before; null with fewer than 2 sessions counted. */
  gamesWon: { won: number; played: number; before: { won: number; played: number } | null } | null;
  /** Unforced errors, oldest to newest, for the recent window; null with fewer than 2. */
  errors: { levels: ErrorLevel[]; latest: ErrorLevel; first: ErrorLevel } | null;
};

/** Results from the most recent games. Expects points oldest first; solo practice is ignored. */
export function gameResults(points: SessionPoint[], window = RESULTS_WINDOW): GameResults {
  const games = points.filter((p) => p.kind !== "solo");

  const decided = games.filter((p) => p.matchResult).slice(-window);
  const won = decided.filter((p) => p.matchResult === "win").length;
  const record = decided.length >= 2 ? { won, lost: decided.length - won, rate: Math.round((won / decided.length) * 100) } : null;

  const counted = games.filter((p) => p.gamesPlayed);
  const sum = (list: SessionPoint[]) => list.reduce((acc, p) => ({ won: acc.won + (p.gamesWon ?? 0), played: acc.played + (p.gamesPlayed ?? 0) }), { won: 0, played: 0 });
  const recent = counted.slice(-window);
  const earlier = counted.slice(-window * 2, -window);
  const gamesWon = recent.length >= 2 ? { ...sum(recent), before: earlier.length >= 2 ? sum(earlier) : null } : null;

  const levels = games.flatMap((p) => (p.errors ? [p.errors] : [])).slice(-window);
  const errors = levels.length >= 2 ? { levels, latest: levels[levels.length - 1], first: levels[0] } : null;

  return { record, gamesWon, errors };
}

/** The most recent rating of one skill, or null if it was never rated. */
export function latestRating(points: SessionPoint[], skill: SelfSkill): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i].ratings[skill];
    if (v != null) return v;
  }
  return null;
}

export type SkillRow = { skill: SelfSkill; base: number; now: number; change: number };

/**
 * Each rated skill from its starting value to its latest. The start is the
 * baseline rating when there is one, else the first session that rated it.
 */
export function skillRows(points: SessionPoint[], baseline?: SelfRatings | null): SkillRow[] {
  return SELF_SKILLS.flatMap((skill) => {
    const values = points.flatMap((p) => (p.ratings[skill] != null ? [p.ratings[skill]!] : []));
    if (!values.length) return [];
    const base = baseline?.[skill] ?? values[0];
    const now = values[values.length - 1];
    return [{ skill, base, now, change: round1(now - base) }];
  });
}

/** Weeks covered by the points, counting the first week. */
export function weeksCovered(points: Pick<SessionPoint, "date">[]): number {
  if (!points.length) return 0;
  const first = Date.parse(points[0].date);
  const last = Date.parse(points[points.length - 1].date);
  return Math.max(1, Math.round((last - first) / 604_800_000) + 1);
}

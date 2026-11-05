import { describe, expect, it } from "vitest";
import type { SelfAssessment } from "../api/selfAssessment";
import type { SessionRow } from "../api/types";
import {
  averageRating, baselineSummary, buildPoints, gameResults, inMode, latestRating, skillRows, weeksCovered, type SessionPoint,
} from "./progressStats";

const session = (id: string, date: string, extra: Partial<SessionRow> = {}) =>
  ({ id, title: id, session_date: date, created_at: `${date}T10:00:00Z`, session_context: "casual_match", play_format: "doubles", ...extra }) as SessionRow;
const assessment = (id: string, extra: Partial<SelfAssessment> = {}) =>
  ({ session_id: id, ratings: { serve: 3, dinking: 2, consistency: 4 }, games_played: null, games_won: null, unforced_errors: null, biggest_struggle: null, updated_at: "", ...extra }) as SelfAssessment;
const point = (extra: Partial<SessionPoint>): SessionPoint => ({
  sessionId: "s", date: "2026-10-01", title: "", kind: "match", overall: null, ratings: {},
  matchResult: null, gamesPlayed: null, gamesWon: null, errors: null, ...extra,
});

describe("progress points", () => {
  it("joins sessions to ratings, oldest first, and averages only with 3+ ratings", () => {
    const points = buildPoints(
      [session("b", "2026-10-08", { match_result: "win" }), session("a", "2026-10-01", { play_format: "wall_practice", session_context: "practice" })],
      [assessment("a"), assessment("b", { ratings: { serve: 4 } })],
    );
    expect(points.map((p) => [p.sessionId, p.kind, p.overall, p.matchResult])).toEqual([["a", "solo", 3, null], ["b", "match", null, "win"]]);
    expect(averageRating({ serve: 3, dinking: 2 })).toBeNull();
  });

  it("splits games from practice", () => {
    expect(inMode("match", "games")).toBe(true);
    expect(inMode("tournament", "games")).toBe(true);
    expect(inMode("solo", "games")).toBe(false);
    expect(inMode("solo", "practice")).toBe(true);
    expect(inMode("match", "all")).toBe(true);
  });

  it("uses the baseline only when it has enough ratings", () => {
    expect(baselineSummary({ serve: 3, dinking: 2, consistency: 2 }, "2026-09-12")?.overall).toBe(2.3);
    expect(baselineSummary({ serve: 3 })).toBeNull();
    expect(baselineSummary(undefined)).toBeNull();
  });
});

describe("game results", () => {
  it("needs two games before showing a number", () => {
    const r = gameResults([point({ matchResult: "win", gamesPlayed: 3, gamesWon: 2, errors: "few" })]);
    expect(r).toEqual({ record: null, gamesWon: null, errors: null });
  });

  it("counts recent wins, games won against the window before, and the error trend", () => {
    const pts = [
      ...Array.from({ length: 8 }, () => point({ gamesPlayed: 3, gamesWon: 1 })),
      point({ matchResult: "loss", gamesPlayed: 3, gamesWon: 1, errors: "many" }),
      point({ kind: "solo", matchResult: "win", errors: "few" }), // practice is ignored
      point({ matchResult: "win", gamesPlayed: 3, gamesWon: 2, errors: "some" }),
      point({ matchResult: "win", gamesPlayed: 3, gamesWon: 3, errors: "few" }),
    ];
    const r = gameResults(pts);
    expect(r.record).toEqual({ won: 2, lost: 1, rate: 67 });
    expect(r.gamesWon).toEqual({ won: 5 * 1 + 1 + 2 + 3, played: 24, before: { won: 3, played: 9 } });
    expect(r.errors).toEqual({ levels: ["many", "some", "few"], latest: "few", first: "many" });
  });
});

describe("skills over time", () => {
  const pts = [point({ ratings: { serve: 2, dinking: 2 } }), point({ ratings: { serve: 4 } })];

  it("starts from the baseline when there is one, else the first rating", () => {
    expect(skillRows(pts, { serve: 3 })).toEqual([
      { skill: "serve", base: 3, now: 4, change: 1 },
      { skill: "dinking", base: 2, now: 2, change: 0 },
    ]);
    expect(skillRows(pts)[0]).toMatchObject({ base: 2, now: 4 });
  });

  it("finds the latest rating and the weeks covered", () => {
    expect(latestRating(pts, "dinking")).toBe(2);
    expect(latestRating(pts, "volleys")).toBeNull();
    expect(weeksCovered([{ date: "2026-10-01" }, { date: "2026-10-15" }])).toBe(3);
    expect(weeksCovered([])).toBe(0);
  });
});

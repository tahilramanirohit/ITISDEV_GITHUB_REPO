import { describe, expect, it } from "vitest";
import type { SessionPoint } from "./progressStats";
import { isHeavyRecovery, readinessInsights, type JournalEntry } from "./readinessInsights";

const point = (id: string, overall: number | null): SessionPoint => ({
  sessionId: id, date: "2026-10-01", title: id, kind: "match", overall, ratings: {},
  matchResult: null, gamesPlayed: null, gamesWon: null, errors: null,
});
const entry = (extra: Partial<JournalEntry>): JournalEntry => ({
  sleepHours: null, readiness: null, warmupDone: null, preGame: true, soreness: null, exertion: null, ...extra,
});

describe("before and after your games", () => {
  it("compares sleep groups only when both have 3 or more sessions", () => {
    const points = ["a", "b", "c", "d", "e", "f"].map((id, i) => point(id, i < 3 ? 3.6 : 3));
    const journal = new Map(points.map((p, i) => [p.sessionId, entry({ sleepHours: i < 3 ? 8 : 6 })]));
    const { lines } = readinessInsights(points, journal);
    expect(lines.map((l) => [l.label, l.count, l.value, l.better])).toEqual([
      ["Slept 7 h or more", 3, "3.6", true],
      ["Slept under 7 h", 3, "3.0", false],
    ]);

    journal.delete("f");
    expect(readinessInsights(points, journal).lines).toEqual([]);
  });

  it("ignores sessions without a rating", () => {
    const points = ["a", "b", "c", "d", "e", "f"].map((id) => point(id, null));
    const journal = new Map(points.map((p) => [p.sessionId, entry({ warmupDone: true })]));
    expect(readinessInsights(points, journal).lines).toEqual([]);
  });

  it("notes heavy recovery from the last two logged sessions", () => {
    const points = [point("a", 3), point("b", 3), point("c", 3)];
    const journal = new Map([["a", entry({ soreness: 1 })], ["b", entry({ soreness: 4 })], ["c", entry({ exertion: 9 })]]);
    expect(readinessInsights(points, journal).recoveryNote).toMatch(/last 2 sessions/);
    journal.set("b", entry({ soreness: 2 }));
    expect(readinessInsights(points, journal).recoveryNote).toMatch(/last session/);
    journal.set("c", entry({ exertion: 5 }));
    expect(readinessInsights(points, journal).recoveryNote).toBeNull();
  });

  it("calls soreness 4+ or effort 8+ heavy", () => {
    expect(isHeavyRecovery({ soreness: 4, exertion: null })).toBe(true);
    expect(isHeavyRecovery({ soreness: 3, exertion: 8 })).toBe(true);
    expect(isHeavyRecovery({ soreness: 3, exertion: 7 })).toBe(false);
    expect(isHeavyRecovery(null)).toBe(false);
  });
});

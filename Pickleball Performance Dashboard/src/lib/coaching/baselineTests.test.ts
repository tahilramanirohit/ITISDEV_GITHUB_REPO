import { describe, expect, it } from "vitest";
import { COURT_TEST_BY_KEY, COURT_TEST_KEYS, COURT_TESTS, courtTestGoals, formatResult, lastTestedOn, latestResults, testTarget,
  type CourtTestRow } from "./baselineTests";
import { SELF_SKILLS } from "./selfAssessment";

const migrations = import.meta.glob<string>("../../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true });
const sql = Object.entries(migrations).find(([file]) => file.endsWith("_baseline_tests.sql"))?.[1] ?? "";

let n = 0;
const row = (test_key: CourtTestRow["test_key"], value: number, tested_on: string): CourtTestRow => ({
  id: String(++n), test_key, value, out_of: COURT_TEST_BY_KEY[test_key].outOf, tested_on, created_at: `${tested_on}T10:00:${String(n).padStart(2, "0")}Z`,
});

describe("court test definitions", () => {
  it("match the database checks: same keys and the same number of tries", () => {
    expect(sql).not.toBe("");
    const keys = [...sql.match(/test_key in \(([^)]+)\)/)![1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...COURT_TEST_KEYS]);
    for (const [, key, rule] of sql.matchAll(/when '([a-z_0-9]+)' then out_of (= \d+|is null)/g)) {
      expect(rule === "is null" ? null : Number(rule.slice(2)), key).toBe(COURT_TEST_BY_KEY[key as keyof typeof COURT_TEST_BY_KEY].outOf);
    }
  });
  it("each measure one of the rated skills", () => {
    expect(COURT_TESTS).toHaveLength(5);
    for (const t of COURT_TESTS) expect(SELF_SKILLS).toContain(t.skill);
  });
});

describe("court test goals", () => {
  it("aim for half as many again, at least one more, never above the tries", () => {
    expect(testTarget(COURT_TEST_BY_KEY.dinks_in_a_row, 8)).toBe(12);
    expect(testTarget(COURT_TEST_BY_KEY.dinks_in_a_row, 0)).toBe(1);
    expect(testTarget(COURT_TEST_BY_KEY.deep_serves, 1)).toBe(2);
    expect(testTarget(COURT_TEST_BY_KEY.deep_serves, 16)).toBe(20);
    expect(testTarget(COURT_TEST_BY_KEY.deep_serves, 20)).toBe(20);
  });

  it("use the first result as the baseline and the best later one as now", () => {
    const rows = [row("deep_serves", 14, "2026-10-20"), row("deep_serves", 8, "2026-09-10"), row("deep_serves", 11, "2026-10-01"),
      row("dinks_in_a_row", 6, "2026-09-10")];
    const [serves, dinks] = courtTestGoals(rows);
    expect(serves).toMatchObject({ base: 8, target: 12, best: 14, reached: true, fraction: 1, baseDate: "2026-09-10" });
    expect(dinks).toMatchObject({ base: 6, target: 9, best: null, reached: false, fraction: 0 });
    expect(formatResult(serves.test, 8)).toBe("8/20");
    expect(formatResult(dinks.test, 6)).toBe("6");
  });

  it("show part of the way and treat a perfect baseline as reached", () => {
    const [returns, rally] = courtTestGoals([row("deep_returns", 4, "2026-09-01"), row("deep_returns", 5, "2026-10-01"),
      row("rally_to_20", 20, "2026-09-01")]);
    expect(returns.fraction).toBeCloseTo(0.5);
    expect(returns.reached).toBe(false);
    expect(rally).toMatchObject({ target: 20, reached: true, fraction: 1 });
  });

  it("find the latest result of each test and the last test date", () => {
    const rows = [row("deep_serves", 8, "2026-09-10"), row("deep_serves", 11, "2026-10-01")];
    expect(latestResults(rows).get("deep_serves")?.value).toBe(11);
    expect(lastTestedOn(rows)).toBe("2026-10-01");
    expect(lastTestedOn([])).toBeNull();
  });
});

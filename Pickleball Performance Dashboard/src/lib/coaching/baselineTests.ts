import type { SelfSkill } from "./selfAssessment";

// Keys and limits must match the checks in
// supabase/migrations/20261105090000_baseline_tests.sql (compared by the tests).
export const COURT_TEST_KEYS = ["deep_serves", "dinks_in_a_row", "third_shot_drops", "deep_returns", "rally_to_20"] as const;
export type CourtTestKey = (typeof COURT_TEST_KEYS)[number];

export type CourtTest = {
  key: CourtTestKey;
  label: string;
  /** The self-rated skill this test measures. */
  skill: SelfSkill;
  /** Number of tries the count is out of; null for a "best run" test. */
  outOf: number | null;
  /** What to do and what to count, in one or two short sentences. */
  how: string;
  /** What the number means, under the counter. */
  unit: string;
};

export const COURT_TESTS: CourtTest[] = [
  { key: "deep_serves", label: "Deep serves", skill: "serve", outOf: 20,
    how: "Serve 20 balls, 10 from each side. Count the ones that land in the back half of the service box.",
    unit: "deep serves out of 20" },
  { key: "dinks_in_a_row", label: "Dinks in a row", skill: "dinking", outOf: null,
    how: "Dink cross-court with a partner, both at the kitchen line. Take 3 tries and count your longest run without a miss.",
    unit: "dinks in your best run" },
  { key: "third_shot_drops", label: "Third-shot drops", skill: "third_shot", outOf: 10,
    how: "From the baseline, have a partner at the kitchen line feed you 10 balls. Count drops that land in the kitchen.",
    unit: "drops in the kitchen out of 10" },
  { key: "deep_returns", label: "Deep returns", skill: "return", outOf: 10,
    how: "Return 10 serves. Count the ones that land in the back third of the court.",
    unit: "deep returns out of 10" },
  { key: "rally_to_20", label: "Rally to 20", skill: "consistency", outOf: 20,
    how: "Rally with a partner, any shots, keeping the ball in. Take 3 tries and count your longest rally, up to 20.",
    unit: "shots in your best rally, up to 20" },
];

export const COURT_TEST_BY_KEY = Object.fromEntries(COURT_TESTS.map((t) => [t.key, t])) as Record<CourtTestKey, CourtTest>;

/** The highest value the counter allows: the tries, or a generous cap for best-run tests. */
export const maxValue = (test: CourtTest) => test.outOf ?? 200;

export type CourtTestRow = {
  id: string;
  test_key: CourtTestKey;
  value: number;
  out_of: number | null;
  tested_on: string;
  created_at: string;
};

export function formatResult(test: CourtTest, value: number): string {
  return test.outOf ? `${value}/${test.outOf}` : String(value);
}

const byDate = (a: CourtTestRow, b: CourtTestRow) => a.tested_on.localeCompare(b.tested_on) || a.created_at.localeCompare(b.created_at);

/** Each test's results, oldest first. */
export function testHistory(rows: readonly CourtTestRow[]): Map<CourtTestKey, CourtTestRow[]> {
  const out = new Map<CourtTestKey, CourtTestRow[]>();
  for (const row of [...rows].sort(byDate)) {
    if (!COURT_TEST_BY_KEY[row.test_key]) continue;
    out.set(row.test_key, [...(out.get(row.test_key) ?? []), row]);
  }
  return out;
}

/** The most recent result of each test, for "Last 9/20" on the tests page. */
export function latestResults(rows: readonly CourtTestRow[]): Map<CourtTestKey, CourtTestRow> {
  const out = new Map<CourtTestKey, CourtTestRow>();
  for (const [key, list] of testHistory(rows)) out.set(key, list[list.length - 1]);
  return out;
}

/** The goal for a measured test: half as many again as the baseline, at least one more, never above the tries. */
export function testTarget(test: CourtTest, base: number): number {
  const target = Math.max(base + 1, Math.ceil(base * 1.5));
  return test.outOf == null ? target : Math.min(test.outOf, target);
}

export type CourtTestGoal = {
  test: CourtTest;
  /** The first result: the measured baseline. */
  base: number;
  baseDate: string;
  target: number;
  /** The best result since the baseline, or null before the first re-test. */
  best: number | null;
  fraction: number;
  reached: boolean;
};

/** Measured goals for Progress: the first result is the baseline, the best later result is "now". */
export function courtTestGoals(rows: readonly CourtTestRow[]): CourtTestGoal[] {
  const goals: CourtTestGoal[] = [];
  const history = testHistory(rows);
  for (const test of COURT_TESTS) {
    const list = history.get(test.key);
    if (!list?.length) continue;
    const base = list[0].value;
    const target = testTarget(test, base);
    const later = list.slice(1).map((r) => r.value);
    const best = later.length ? Math.max(...later) : null;
    // A perfect baseline (e.g. 20/20) has nowhere to go: it counts as reached.
    const now = best ?? base;
    const reached = now >= target;
    const fraction = reached ? 1 : Math.max(0, (now - base) / (target - base));
    goals.push({ test, base, baseDate: list[0].tested_on, target, best, fraction, reached });
  }
  return goals;
}

/** The date of the most recent test of any kind, or null. */
export function lastTestedOn(rows: readonly CourtTestRow[]): string | null {
  return rows.reduce<string | null>((latest, r) => (latest == null || r.tested_on > latest ? r.tested_on : latest), null);
}

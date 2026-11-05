import type { SessionPoint } from "./progressStats";
import { isHeavyRecovery } from "./selfAssessment";

export { isHeavyRecovery };

/** Pre-game check-in and post-game recovery answers for one session. Every field is optional. */
export type JournalEntry = {
  sleepHours: number | null;
  readiness: number | null;
  warmupDone: boolean | null;
  /** True when the check-in was saved before play started. */
  preGame: boolean;
  soreness: number | null;
  exertion: number | null;
};

/** Each side of a comparison needs this many sessions before we show it. */
export const MIN_GROUP = 3;
const GOOD_SLEEP_HOURS = 7;

export type InsightLine = { id: string; label: string; count: number; value: string; better: boolean };
export type ReadinessInsights = { lines: InsightLine[]; recoveryNote: string | null };

const avg = (values: number[]) => Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

/** Two groups' average rating, shown only when both groups are big enough. */
function compare(
  id: string, points: SessionPoint[], journal: Map<string, JournalEntry>,
  test: (e: JournalEntry) => boolean | null, labels: [string, string],
): InsightLine[] {
  const yes: number[] = [];
  const no: number[] = [];
  for (const p of points) {
    const entry = journal.get(p.sessionId);
    if (p.overall == null || !entry) continue;
    const verdict = test(entry);
    if (verdict === true) yes.push(p.overall);
    else if (verdict === false) no.push(p.overall);
  }
  if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return [];
  const a = avg(yes);
  const b = avg(no);
  return [
    { id: `${id}-yes`, label: labels[0], count: yes.length, value: a.toFixed(1), better: a > b },
    { id: `${id}-no`, label: labels[1], count: no.length, value: b.toFixed(1), better: b > a },
  ];
}

/**
 * Plain patterns between how a player came into their games and how they
 * rated them. Descriptive only: small groups are hidden, nothing is diagnosed.
 * Expects points oldest first.
 */
export function readinessInsights(points: SessionPoint[], journal: Map<string, JournalEntry>): ReadinessInsights {
  const lines = [
    ...compare("sleep", points, journal, (e) => (e.sleepHours == null ? null : e.sleepHours >= GOOD_SLEEP_HOURS),
      [`Slept ${GOOD_SLEEP_HOURS} h or more`, `Slept under ${GOOD_SLEEP_HOURS} h`]),
    ...compare("ready", points, journal, (e) => (e.readiness == null ? null : e.readiness >= 4),
      ["Felt ready (4–5)", "Felt less ready (1–3)"]),
    ...compare("warmup", points, journal, (e) => e.warmupDone,
      ["Warmed up first", "No warm-up"]),
  ];

  const recent = points.flatMap((p) => {
    const e = journal.get(p.sessionId);
    return e && (e.soreness != null || e.exertion != null) ? [e] : [];
  }).slice(-2);
  const heavy = recent.filter(isHeavyRecovery).length;
  const recoveryNote = heavy === 0 ? null : heavy === 2
    ? "You logged high soreness or effort after your last 2 sessions. Your plan is lighter this week."
    : "You logged high soreness or effort after your last session. Ease in next time.";

  return { lines, recoveryNote };
}

/** Sessions grouped by week (Monday to Sunday) for the Sessions list. */

const DAY_MS = 86_400_000;
const toDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The Monday that starts the week of a YYYY-MM-DD date. */
export function weekStart(date: string): string {
  const d = toDay(date);
  const back = (d.getDay() + 6) % 7; // Monday = 0
  return iso(new Date(d.getTime() - back * DAY_MS));
}

/** "This week", "Last week", or "Nov 3 – 9" ("Oct 27 – Nov 2" across months). */
export function weekLabel(start: string, today: string): string {
  const thisWeek = weekStart(today);
  if (start === thisWeek) return "This week";
  if (start === weekStart(iso(new Date(toDay(thisWeek).getTime() - 7 * DAY_MS)))) return "Last week";
  const a = toDay(start);
  const b = new Date(a.getTime() + 6 * DAY_MS);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return a.getMonth() === b.getMonth() ? `${month(a)} ${a.getDate()} – ${b.getDate()}` : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

export type WeekGroup<T> = { start: string; label: string; items: T[]; won: number; lost: number; practice: number };

/**
 * Groups rows (already newest first) into weeks, newest week first, with each week's record.
 * `info` reads a row's date, whether it was practice, and its result.
 */
export function groupByWeek<T>(rows: readonly T[], info: (row: T) => { date: string; practice: boolean; won: boolean | null }, today: string): WeekGroup<T>[] {
  const groups = new Map<string, WeekGroup<T>>();
  for (const row of rows) {
    const { date, practice, won } = info(row);
    const start = weekStart(date);
    const g = groups.get(start) ?? { start, label: weekLabel(start, today), items: [], won: 0, lost: 0, practice: 0 };
    g.items.push(row);
    if (practice) g.practice += 1;
    else if (won === true) g.won += 1;
    else if (won === false) g.lost += 1;
    groups.set(start, g);
  }
  return [...groups.values()].sort((a, b) => b.start.localeCompare(a.start));
}

/** "2–1 · 1 practice", or "" for a week with nothing to count. */
export function weekRecord(g: Pick<WeekGroup<unknown>, "won" | "lost" | "practice">): string {
  const parts = [g.won + g.lost ? `${g.won}–${g.lost}` : "", g.practice ? `${g.practice} practice` : ""].filter(Boolean);
  return parts.join(" · ");
}

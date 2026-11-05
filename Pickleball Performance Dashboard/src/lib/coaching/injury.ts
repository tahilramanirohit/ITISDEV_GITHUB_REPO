// "I'm injured" (adviser note: what if the user is injured?). While an injury is
// open, the plan becomes a rest plan, goal deadlines pause and the player is
// hidden from Buddy (supabase/migrations/20261105120000_injury.sql).
// Not medical advice: the app never asks for a diagnosis.

/** Keys must match the body_area check in the injury migration (checked by the tests). */
export const INJURY_AREAS = ["shoulder", "elbow", "wrist", "back", "hip", "knee", "ankle", "foot", "other"] as const;
export type InjuryArea = (typeof INJURY_AREAS)[number];

export const INJURY_AREA_LABELS: Record<InjuryArea, string> = {
  shoulder: "Shoulder", elbow: "Elbow", wrist: "Wrist", back: "Back", hip: "Hip",
  knee: "Knee", ankle: "Ankle", foot: "Foot", other: "Somewhere else",
};

export type InjuryPeriod = {
  id: string;
  body_area: InjuryArea | null;
  note: string | null;
  /** YYYY-MM-DD */
  started_on: string;
  /** YYYY-MM-DD, or null while the player is still injured. */
  ended_on: string | null;
};

export const INJURY_DISCLAIMER =
  "PicklePro is not medical advice. If the pain is sharp, there is swelling, or it is not getting better after a few days, see a doctor or physiotherapist.";

/** The rest plan shown instead of drills while a player is injured. */
export const RECOVERY_PLAN: { day: string; title: string; detail: string }[] = [
  { day: "Now", title: "Rest the injured area", detail: "Skip games and any drill that hurts. Your goals are paused, so nothing is falling behind." },
  { day: "When it eases", title: "Pain-free touch only", detail: "Short, easy sessions: shadow swings or soft dinks against a wall, stopping at the first twinge." },
  { day: "Coming back", title: "Ease back into play", detail: "Start with dinks and drops at an easy pace, then add one game. Warm up and cool down every time." },
  { day: "Then", title: "Tap \"I'm back\"", detail: "Your goals restart where they paused and Buddy lists you again if you were listed." },
];

/** The open injury (still injured), if any. */
export function openInjury(periods: readonly InjuryPeriod[]): InjuryPeriod | null {
  return periods.find((p) => p.ended_on == null) ?? null;
}

const DAY_MS = 86_400_000;
const dayNumber = (isoDate: string) => Math.floor(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** Today as YYYY-MM-DD in the player's time zone. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Days spent injured since `since` (a date or timestamp), up to `today`: how long goal
 * deadlines are pushed back. Overlapping periods are counted once.
 */
export function pausedDays(periods: readonly InjuryPeriod[], since: string | null | undefined, today = localToday()): number {
  if (!since || Number.isNaN(Date.parse(since))) return 0;
  const from = dayNumber(since);
  const end = dayNumber(today);
  const days = new Set<number>();
  for (const p of periods) {
    const start = Math.max(from, dayNumber(p.started_on));
    const stop = Math.min(end, p.ended_on ? dayNumber(p.ended_on) : end);
    for (let d = start; d < stop; d++) days.add(d);
  }
  return days.size;
}

/** Whole days since an injury started. */
export function daysInjured(period: Pick<InjuryPeriod, "started_on">, today = localToday()): number {
  return Math.max(0, dayNumber(today) - dayNumber(period.started_on));
}

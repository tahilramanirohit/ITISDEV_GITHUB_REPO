import type { SessionKind } from "../api/types";

/** Today as YYYY-MM-DD in the player's own time zone (not UTC). */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function partOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const h = now.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/**
 * A session's automatic name, so players don't have to type one:
 * "Saturday evening game", "Tuesday morning practice", or the tournament's name.
 */
export function autoSessionTitle(now: Date, kind: SessionKind, tournamentName?: string | null): string {
  if (kind === "tournament" && tournamentName?.trim()) return tournamentName.trim();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const what = kind === "solo" ? "practice" : kind === "tournament" ? "tournament" : "game";
  return `${weekday} ${partOfDay(now)} ${what}`;
}

/** "6:30 PM" from a saved start time, or null. */
export function startTimeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

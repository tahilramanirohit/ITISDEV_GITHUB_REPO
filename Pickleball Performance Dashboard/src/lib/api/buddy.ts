// Buddy finder: opt-in player list, buddy requests with free times, accept or decline.
// Every rule is enforced by the database (supabase/migrations/20261022090000_buddy_finder.sql);
// these helpers call its functions and turn its errors into plain messages.
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUDDY_LEVELS = ["beginner", "novice", "intermediate", "advanced"] as const;
export type BuddyLevel = (typeof BUDDY_LEVELS)[number];
export const LEVEL_LABELS: Record<BuddyLevel, string> = {
  beginner: "Beginner", novice: "Novice", intermediate: "Intermediate", advanced: "Advanced",
};
export const LEVEL_HINTS: Record<BuddyLevel, string> = {
  beginner: "New to the game, learning the rules",
  novice: "Can rally, still learning the kitchen and the third shot",
  intermediate: "Steady dinks and drives, about 3.0–3.5",
  advanced: "Strong at the kitchen line and in fast exchanges, about 4.0+",
};
/** The choices offered in onboarding and Edit profile; stored as the profile's level text. */
export const PROFILE_LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Not sure"] as const;

/** Same mapping as public.buddy_level: older answers such as "Beginner (2.0–2.5)" still count. */
export function buddyLevel(text: string | null | undefined): BuddyLevel | null {
  const t = (text ?? "").toLowerCase();
  if (t.includes("advanced")) return "advanced";
  if (t.includes("intermediate")) return "intermediate";
  if (t.includes("novice")) return "novice";
  if (t.includes("beginner") || t.includes("new to")) return "beginner";
  return null;
}

export const PURPOSES = ["practice", "casual_game", "competition"] as const;
export type BuddyPurpose = (typeof PURPOSES)[number];
export const PURPOSE_LABELS: Record<BuddyPurpose, string> = {
  practice: "Practice / drills", casual_game: "Casual game", competition: "Competition prep",
};
export const FORMATS = ["singles", "doubles", "either"] as const;
export type BuddyFormat = (typeof FORMATS)[number];
export const FORMAT_LABELS: Record<BuddyFormat, string> = { singles: "Singles", doubles: "Doubles", either: "Either" };

export type FreeTime = { date: string; start: string; end: string };
export type RequestStatus = "pending" | "accepted" | "declined";

export type BuddyPlayer = {
  player_id: string;
  display_name: string;
  level: BuddyLevel | null;
  usual_format: "singles" | "doubles" | "both" | null;
  request_id: string | null;
  request_status: "pending" | "accepted" | null;
  request_direction: "incoming" | "outgoing" | null;
};

export type BuddyRequest = {
  id: string;
  direction: "incoming" | "outgoing";
  other_player_id: string;
  other_name: string;
  other_level: BuddyLevel | null;
  purpose: BuddyPurpose;
  play_format: BuddyFormat;
  slots: FreeTime[];
  status: RequestStatus;
  created_at: string;
  responded_at: string | null;
};

export const MAX_FREE_TIMES = 10;
export const MAX_DAYS_AHEAD = 90;

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the player's clock). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The same checks as public.buddy_slots_valid, so the form can explain a problem before sending. */
export function freeTimeProblem(slots: FreeTime[], today = new Date()): string | null {
  if (slots.length === 0) return "Add at least one date and time you are free.";
  if (slots.length > MAX_FREE_TIMES) return `Add at most ${MAX_FREE_TIMES} free times.`;
  const first = isoDate(today);
  const last = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + MAX_DAYS_AHEAD));
  for (const [i, s] of slots.entries()) {
    const n = slots.length > 1 ? ` (time ${i + 1})` : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return `Pick a date${n}.`;
    if (!/^\d{2}:\d{2}$/.test(s.start) || !/^\d{2}:\d{2}$/.test(s.end)) return `Pick a start and an end time${n}.`;
    if (s.date < first) return `That date has already passed${n}.`;
    if (s.date > last) return `Pick a date within the next ${MAX_DAYS_AHEAD} days${n}.`;
    if (s.start >= s.end) return `The start time must be before the end time${n}.`;
  }
  return null;
}

/** Players listed by level closeness to yours, then by name. Unknown levels go last. */
export function sortByLevel(players: BuddyPlayer[], mine: BuddyLevel | null): BuddyPlayer[] {
  const rank = (l: BuddyLevel | null) => (l ? BUDDY_LEVELS.indexOf(l) : null);
  const me = rank(mine);
  const distance = (p: BuddyPlayer) => {
    const r = rank(p.level);
    if (r == null) return 99;
    return me == null ? r : Math.abs(r - me);
  };
  return [...players].sort((a, b) => distance(a) - distance(b) || a.display_name.localeCompare(b.display_name));
}

export function formatFreeTime(s: FreeTime): string {
  const [y, m, d] = s.date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = (t: string) => {
    const [h, min] = t.split(":").map(Number);
    return new Date(2000, 0, 1, h, min).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };
  return `${day}, ${time(s.start)}–${time(s.end)}`;
}

/** Turns database errors into the messages shown on screen. */
export function buddyErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/buddy_players|my_buddy_requests|send_buddy_request|buddy_visible|buddy_requests|schema cache|PGRST20[02]/i.test(message)
      && !/^buddy:/.test(message)) {
    return "Buddy needs a database update. Run supabase/scripts/pickleproapp_upgrade_4.sql in the Supabase SQL Editor, then reload.";
  }
  return message.replace(/^buddy:\s*/, "").replace(/^./, (c) => c.toUpperCase());
}

async function rpc<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || error.code);
  return data as T;
}

export async function listBuddyPlayers(sb: SupabaseClient): Promise<BuddyPlayer[]> {
  return (await rpc<BuddyPlayer[] | null>(sb, "buddy_players")) ?? [];
}

export async function listMyRequests(sb: SupabaseClient): Promise<BuddyRequest[]> {
  return (await rpc<BuddyRequest[] | null>(sb, "my_buddy_requests")) ?? [];
}

export async function sendBuddyRequest(sb: SupabaseClient, to: string, purpose: BuddyPurpose, format: BuddyFormat,
  slots: FreeTime[]): Promise<string> {
  return rpc<string>(sb, "send_buddy_request", { p_to: to, p_purpose: purpose, p_format: format, p_slots: slots });
}

export async function respondToRequest(sb: SupabaseClient, id: string, accept: boolean): Promise<void> {
  await rpc<null>(sb, "respond_buddy_request", { p_request_id: id, p_accept: accept });
}

export async function cancelRequest(sb: SupabaseClient, id: string): Promise<void> {
  await rpc<null>(sb, "cancel_buddy_request", { p_request_id: id });
}

export async function setBuddyVisible(sb: SupabaseClient, userId: string, visible: boolean): Promise<void> {
  const { error } = await sb.from("profiles").update({ buddy_visible: visible }).eq("id", userId);
  if (error) throw new Error(error.message);
}

/** Requests waiting for this player's answer: the number on the Buddy tab. */
export async function countWaitingRequests(sb: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await sb.from("buddy_requests").select("id", { count: "exact", head: true })
    .eq("to_player_id", userId).eq("status", "pending");
  if (error) return 0; // Before the database update the badge simply stays hidden.
  return count ?? 0;
}

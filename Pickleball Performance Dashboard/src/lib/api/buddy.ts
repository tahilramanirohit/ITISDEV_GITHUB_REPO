// Buddy finder: opt-in player list, buddy requests with free times, accept or decline.
// Every rule is enforced by the database (supabase/migrations/20261022090000_buddy_finder.sql);
// these helpers call its functions and turn its errors into plain messages.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SelfSkill } from "../coaching/selfAssessment";

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
/** "called_off": an accepted session one of the two players cancelled. */
export type RequestStatus = "pending" | "accepted" | "declined" | "called_off";

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
  /** Where to meet; null on requests sent before the meetup update. */
  city: string | null;
  location: string | null;
  status: RequestStatus;
  created_at: string;
  responded_at: string | null;
  /** Set when a session is called off; missing before the cancel update (upgrade 6). */
  cancelled_by_me?: boolean | null;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
};

export const MAX_CANCEL_REASON = 200;
/** Quick picks for the cancel reason; the player can also type their own. */
export const CANCEL_REASONS = ["Schedule changed", "Not feeling well", "Bad weather", "Court not available"] as const;

export type Meetup = { city: string; location: string };
export const MAX_CITY = 60;
export const MAX_LOCATION = 120;

/** The same checks as send_buddy_request: both are needed, within their length limits. */
export function meetupProblem(m: Meetup): string | null {
  if (!m.city.trim()) return "Enter the city.";
  if (m.city.trim().length > MAX_CITY) return `Keep the city under ${MAX_CITY} characters.`;
  if (!m.location.trim()) return "Enter where to meet, such as a court name.";
  if (m.location.trim().length > MAX_LOCATION) return `Keep the location under ${MAX_LOCATION} characters.`;
  return null;
}

export const MAX_FREE_TIMES = 10;
export const MAX_DAYS_AHEAD = 90;

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the player's clock). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const slotKey = (s: FreeTime) => `${s.date} ${s.start}`;

/** The first free time from today on, or null when every one has passed. */
export function nextFreeTime(r: Pick<BuddyRequest, "slots">, today = new Date()): FreeTime | null {
  const day = isoDate(today);
  return [...r.slots].filter((s) => s.date >= day).sort((a, b) => slotKey(a).localeCompare(slotKey(b)))[0] ?? null;
}

/** Accepted buddy sessions that still have a free time ahead, soonest first. */
export function upcomingBuddySessions(requests: BuddyRequest[], today = new Date()): { request: BuddyRequest; when: FreeTime }[] {
  return requests
    .filter((r) => r.status === "accepted")
    .flatMap((request) => { const when = nextFreeTime(request, today); return when ? [{ request, when }] : []; })
    .sort((a, b) => slotKey(a.when).localeCompare(slotKey(b.when)));
}

/**
 * A link to New session with the buddy, purpose, format and date filled in.
 * The date is the next free time, or the latest one once they have all passed
 * (logging after playing). Competition prep is still a casual game, not a tournament.
 */
export function logBuddySessionHref(r: Pick<BuddyRequest, "other_name" | "purpose" | "play_format" | "slots"> & { id?: string }, today = new Date()): string {
  const sorted = [...r.slots].sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  const date = nextFreeTime(r, today)?.date ?? sorted[sorted.length - 1]?.date ?? isoDate(today);
  const params = new URLSearchParams({ mode: "self", with: r.other_name, date, context: r.purpose === "practice" ? "practice" : "casual_match" });
  if (r.play_format !== "either") params.set("format", r.play_format);
  // Links the logged session to this buddy session, so Progress can count games with buddies.
  if (r.id) params.set("buddy", r.id);
  return `#/new?${params.toString()}`;
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
  if (/hide_cancelled_session/i.test(message) && !/^buddy:/.test(message)) {
    return "Removing cancelled sessions needs a database update. Run supabase/scripts/pickleproapp_upgrade_14.sql in the Supabase SQL Editor, then reload.";
  }
  if (/add_buddy|respond_buddy\b|cancel_buddy_add|remove_buddy|my_buddies|public\.buddies/i.test(message) && !/^buddy:/.test(message)) {
    return "Buddies need a database update. Run supabase/scripts/pickleproapp_upgrade_12.sql in the Supabase SQL Editor, then reload.";
  }
  if (/cancel_buddy_session|called_off|cancel_reason|cancelled_by/i.test(message) && !/^buddy:/.test(message)) {
    return "Buddy needs a database update. Run supabase/scripts/pickleproapp_upgrade_6.sql in the Supabase SQL Editor, then reload.";
  }
  if (/p_city|p_location|column [^ ]*\.?(city|location) does not exist/i.test(message) && !/^buddy:/.test(message)) {
    return "Buddy needs a database update. Run supabase/scripts/pickleproapp_upgrade_5.sql in the Supabase SQL Editor, then reload.";
  }
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
  const [all, hidden] = await Promise.all([
    rpc<BuddyRequest[] | null>(sb, "my_buddy_requests"),
    // Cancelled sessions you removed from your list (update 14); nothing is hidden before it.
    Promise.resolve(sb.from("hidden_buddy_sessions").select("request_id").limit(1000)).then((r) => r.error ? [] : (r.data ?? []) as { request_id: string }[], () => []),
  ]);
  const gone = new Set(hidden.map((h) => h.request_id));
  return (all ?? []).filter((r) => !gone.has(r.id));
}

/** Removes a cancelled buddy session from your own list (the other player still sees it). */
export async function hideCancelledSession(sb: SupabaseClient, id: string): Promise<void> {
  await rpc<null>(sb, "hide_cancelled_session", { p_request_id: id });
}

export async function sendBuddyRequest(sb: SupabaseClient, to: string, purpose: BuddyPurpose, format: BuddyFormat,
  slots: FreeTime[], meetup: Meetup): Promise<string> {
  return rpc<string>(sb, "send_buddy_request", { p_to: to, p_purpose: purpose, p_format: format, p_slots: slots,
    p_city: meetup.city.trim(), p_location: meetup.location.trim() });
}

export async function respondToRequest(sb: SupabaseClient, id: string, accept: boolean): Promise<void> {
  await rpc<null>(sb, "respond_buddy_request", { p_request_id: id, p_accept: accept });
}

export async function cancelRequest(sb: SupabaseClient, id: string): Promise<void> {
  await rpc<null>(sb, "cancel_buddy_request", { p_request_id: id });
}

/** Either player calls off an accepted session; a blank reason is saved as none. */
export async function cancelBuddySession(sb: SupabaseClient, id: string, reason: string): Promise<void> {
  await rpc<null>(sb, "cancel_buddy_session", { p_request_id: id, p_reason: reason.trim() || null });
}

export async function setBuddyVisible(sb: SupabaseClient, userId: string, visible: boolean): Promise<void> {
  const { error } = await sb.from("profiles").update({ buddy_visible: visible }).eq("id", userId);
  if (error) throw new Error(error.message);
}

/** Play requests and buddy requests waiting for this player's answer: part of the number on the Players tab. */
export async function countWaitingRequests(sb: SupabaseClient, userId: string): Promise<number> {
  const [play, adds] = await Promise.all([
    sb.from("buddy_requests").select("id", { count: "exact", head: true }).eq("to_player_id", userId).eq("status", "pending"),
    sb.from("buddies").select("id", { count: "exact", head: true }).eq("addressee_id", userId).eq("status", "pending"),
  ]);
  // Before a database update, that part of the badge simply stays hidden.
  return (play.error ? 0 : play.count ?? 0) + (adds.error ? 0 : adds.count ?? 0);
}

// ── Buddies as a friend list (buddy-friends update, upgrade 12) ───────────
/** A buddy, or a buddy request waiting for an answer. */
export type BuddyLink = {
  id: string;
  status: "pending" | "active";
  /** "sent": you asked; "received": they asked you. */
  direction: "sent" | "received";
  other_id: string;
  other_name: string;
  other_level: BuddyLevel | null;
  created_at: string;
  responded_at: string | null;
};

/** Your buddies and buddy requests; null before the buddy-friends update (the app then works as before). */
export async function listMyBuddies(sb: SupabaseClient): Promise<BuddyLink[] | null> {
  const { data, error } = await sb.rpc("my_buddies");
  if (error) return null;
  return (data ?? []) as BuddyLink[];
}

/** Ask a listed player to be your buddy (accepts their request if they already asked you). */
export async function addBuddy(sb: SupabaseClient, playerId: string): Promise<void> {
  await rpc<string>(sb, "add_buddy", { p_player: playerId });
}

export async function respondBuddy(sb: SupabaseClient, id: string, accept: boolean): Promise<void> {
  await rpc<null>(sb, "respond_buddy", { p_id: id, p_accept: accept });
}

export async function cancelBuddyAdd(sb: SupabaseClient, id: string): Promise<void> {
  await rpc<null>(sb, "cancel_buddy_add", { p_id: id });
}

/** Stop being buddies: also ends a video partnership and withdraws requests still waiting. */
export async function removeBuddy(sb: SupabaseClient, playerId: string): Promise<void> {
  await rpc<null>(sb, "remove_buddy", { p_player: playerId });
}

// ── Matching on performance (buddy-match update) ──────────────────────────
/** What players can be looking for, in the order shown on the listing. */
export const LOOKING_FOR: BuddyPurpose[] = ["practice", "competition", "casual_game"];

export type BuddyDetails = {
  player_id: string;
  looking_for: BuddyPurpose[];
  /** Average self-rating over their last 5 rated games, rounded to 0.5; null without rated games. */
  game_rating: number | null;
  /** Up to 2 skills they rate 4+ on average. */
  strong_skills: SelfSkill[];
};
export type MyListing = Omit<BuddyDetails, "player_id">;

const numberOrNull = (v: unknown) => (v == null ? null : Number(v));

/** Looking-for, coarse rating and strong skills of listed players. Empty before the buddy-match update. */
export async function listBuddyDetails(sb: SupabaseClient): Promise<Map<string, BuddyDetails>> {
  const rows = (await rpc<BuddyDetails[] | null>(sb, "buddy_player_details")) ?? [];
  return new Map(rows.map((r) => [r.player_id, { ...r, game_rating: numberOrNull(r.game_rating) }]));
}

/** The caller's own listing as others see it; null before the buddy-match update. */
export async function getMyListing(sb: SupabaseClient): Promise<MyListing | null> {
  const rows = await rpc<MyListing[] | null>(sb, "my_buddy_listing");
  const row = rows?.[0];
  return row ? { ...row, game_rating: numberOrNull(row.game_rating) } : null;
}

export async function setLookingFor(sb: SupabaseClient, userId: string, lookingFor: BuddyPurpose[]): Promise<void> {
  const { error } = await sb.from("profiles").update({ buddy_looking_for: lookingFor }).eq("id", userId);
  if (error) throw new Error(error.message);
}

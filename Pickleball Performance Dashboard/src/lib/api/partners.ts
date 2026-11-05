// Partners and peer coaching: link with a player you trust, share chosen sessions,
// and read or leave notes pinned to moments in the video. Every rule is enforced
// by the database (supabase/migrations/20261024090000_partners.sql); these helpers
// call its functions and turn its errors into plain messages.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuddyLevel } from "./buddy";
import type { PlayFormat, SessionContext } from "./types";
import type { SelfSkill } from "../coaching/selfAssessment";
import type { PeerRating } from "../coaching/peerFeedback";

export type PartnerLink = {
  id: string;
  status: "pending" | "active";
  /** "sent": you made the code or invite; "received": someone invited you. */
  direction: "sent" | "received";
  /** Empty for an invite code nobody has used yet. */
  other_id: string | null;
  other_name: string | null;
  other_level: BuddyLevel | null;
  /** Only on your own unused codes. */
  invite_code: string | null;
  created_at: string;
  expires_at: string;
  linked_at: string | null;
};

export type SharedSession = {
  session_id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  session_date: string;
  session_context: SessionContext;
  play_format: PlayFormat;
  has_report: boolean;
  my_notes: number;
  shared_at: string;
  /** Skills the owner asked about (peer-feedback update; empty before it). */
  focus_skills?: SelfSkill[];
  /** False for a "ratings only" share: no video or video report. */
  with_video?: boolean;
  my_ratings?: number;
};

export type SharedReport = {
  session: { id: string; title: string; session_date: string; session_context: SessionContext; play_format: PlayFormat;
    owner_id: string; owner_name: string };
  result: unknown | null;
  video_path: string | null;
  focus_skills?: SelfSkill[];
  with_video?: boolean;
  /** The caller's own ratings of the asked skills. */
  my_ratings?: Partial<Record<SelfSkill, number>>;
};

/** One partner's share of a session, as the owner sees it. */
export type SessionShare = { partner_id: string; focus_skills: SelfSkill[]; with_video: boolean };

export type PeerNote = {
  id: string;
  author_id: string;
  author_name: string;
  mine: boolean;
  /** Seconds into the video; null for a note about the whole session. */
  video_time_s: number | null;
  body: string;
  created_at: string;
  updated_at: string;
  /** One of the skills the owner asked about, or null. */
  skill?: SelfSkill | null;
};

export const MAX_NOTE = 500;
export const CODE_LENGTH = 8;

/** What a player typed, as the database compares it: letters and digits only, upper case. */
export function normalizeCode(text: string): string {
  return text.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** "K7P4QX9M" → "K7P4-QX9M", easier to read aloud or type. */
export function formatCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** 42.5 → "0:42"; 3725 → "1:02:05". */
export function formatVideoTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Turns database errors into the messages shown on screen. */
export function partnerErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/p_focus_skills|p_with_video|rate_shared_skill|session_peer_ratings|peer_ratings|focus_skills|with_video|p_skill/i.test(message)
      && !/^partners:/.test(message)) {
    return "Peer feedback needs a database update. Run supabase/scripts/pickleproapp_upgrade_9.sql in the Supabase SQL Editor, then reload.";
  }
  if (/my_partners|shared_with_me|shared_report|session_peer_notes|create_partner_invite|redeem_partner_code|share_session|peer_note|partners|report_shares|schema cache|PGRST20[02]/i.test(message)
      && !/^partners:/.test(message)) {
    return "Partners needs a database update. Run supabase/scripts/pickleproapp_upgrade_7.sql in the Supabase SQL Editor, then reload.";
  }
  return message.replace(/^partners:\s*/, "").replace(/^./, (c) => c.toUpperCase());
}

async function rpc<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || error.code);
  return data as T;
}

export async function listPartners(sb: SupabaseClient): Promise<PartnerLink[]> {
  return (await rpc<PartnerLink[] | null>(sb, "my_partners")) ?? [];
}

export async function createInviteCode(sb: SupabaseClient): Promise<{ id: string; invite_code: string; expires_at: string }> {
  const rows = await rpc<{ id: string; invite_code: string; expires_at: string }[]>(sb, "create_partner_invite");
  if (!rows?.[0]) throw new Error("The invite code could not be created. Try again.");
  return rows[0];
}

export async function redeemCode(sb: SupabaseClient, code: string): Promise<void> {
  await rpc<string>(sb, "redeem_partner_code", { p_code: normalizeCode(code) });
}

export async function inviteBuddyAsPartner(sb: SupabaseClient, playerId: string): Promise<void> {
  await rpc<string>(sb, "invite_buddy_as_partner", { p_player: playerId });
}

export async function respondToInvite(sb: SupabaseClient, id: string, accept: boolean): Promise<void> {
  await rpc<null>(sb, "respond_partner_invite", { p_id: id, p_accept: accept });
}

export async function cancelInvite(sb: SupabaseClient, id: string): Promise<void> {
  await rpc<null>(sb, "cancel_partner_invite", { p_id: id });
}

export async function unlinkPartner(sb: SupabaseClient, id: string): Promise<void> {
  await rpc<null>(sb, "end_partnership", { p_id: id });
}

/** Who this session is shared with, and what each was asked about (the owner's view). */
export async function listSessionShares(sb: SupabaseClient, sessionId: string): Promise<SessionShare[]> {
  const { data, error } = await sb.from("report_shares").select("partner_id, focus_skills, with_video").eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionShare[];
}

/** Share a session with a partner, asking about up to 3 skills, with or without the video. Sharing again updates the ask. */
export async function shareSession(sb: SupabaseClient, sessionId: string, partnerId: string, focusSkills: SelfSkill[], withVideo: boolean): Promise<void> {
  await rpc<null>(sb, "share_session", { p_session_id: sessionId, p_partner_id: partnerId, p_focus_skills: focusSkills, p_with_video: withVideo });
}

export async function unshareSession(sb: SupabaseClient, sessionId: string, partnerId: string): Promise<void> {
  await rpc<null>(sb, "unshare_session", { p_session_id: sessionId, p_partner_id: partnerId });
}

/** Ratings of this session by partners (owner: everyone's; partner: their own). */
export async function listPeerRatings(sb: SupabaseClient, sessionId: string): Promise<PeerRating[]> {
  return (await rpc<PeerRating[] | null>(sb, "session_peer_ratings", { p_session_id: sessionId })) ?? [];
}

/** A partner rates one asked skill; null removes the rating. */
export async function rateSharedSkill(sb: SupabaseClient, sessionId: string, skill: SelfSkill, rating: number | null): Promise<void> {
  await rpc<null>(sb, "rate_shared_skill", { p_session_id: sessionId, p_skill: skill, p_rating: rating });
}

/** Every peer rating of the player's sessions, for Progress (read straight from the table: owners can). */
export async function listMyPeerRatings(sb: SupabaseClient, userId: string): Promise<{ skill: string; rating: number; updated_at: string }[]> {
  const { data, error } = await sb.from("peer_ratings").select("skill, rating, updated_at").eq("owner_id", userId)
    .order("updated_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSharedWithMe(sb: SupabaseClient): Promise<SharedSession[]> {
  return (await rpc<SharedSession[] | null>(sb, "shared_with_me")) ?? [];
}

export async function getSharedReport(sb: SupabaseClient, sessionId: string): Promise<SharedReport> {
  return rpc<SharedReport>(sb, "shared_report", { p_session_id: sessionId });
}

export async function listNotes(sb: SupabaseClient, sessionId: string): Promise<PeerNote[]> {
  const rows = (await rpc<PeerNote[] | null>(sb, "session_peer_notes", { p_session_id: sessionId })) ?? [];
  // numeric arrives as a string or number depending on the client; keep it a number.
  return rows.map((n) => ({ ...n, video_time_s: n.video_time_s == null ? null : Number(n.video_time_s) }));
}

export async function addNote(sb: SupabaseClient, sessionId: string, timeSeconds: number | null, body: string,
  skill: SelfSkill | null = null): Promise<void> {
  await rpc<string>(sb, "add_peer_note", { p_session_id: sessionId,
    p_video_time_s: timeSeconds == null ? null : Math.round(timeSeconds * 100) / 100, p_body: body.trim(),
    // Sent only when set, so notes still work before the peer-feedback update.
    ...(skill ? { p_skill: skill } : {}) });
}

export async function editNote(sb: SupabaseClient, id: string, body: string, skill: SelfSkill | null = null): Promise<void> {
  await rpc<null>(sb, "edit_peer_note", { p_id: id, p_body: body.trim(), ...(skill ? { p_skill: skill } : {}) });
}

export async function deleteNote(sb: SupabaseClient, id: string): Promise<void> {
  await rpc<null>(sb, "delete_peer_note", { p_id: id });
}

/** Partner invites waiting for this player's answer: the number on the Partners tab. */
export async function countWaitingInvites(sb: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await sb.from("partners").select("id", { count: "exact", head: true })
    .eq("invitee_id", userId).eq("status", "pending").gt("expires_at", new Date().toISOString());
  if (error) return 0; // Before the database update the badge simply stays hidden.
  return count ?? 0;
}

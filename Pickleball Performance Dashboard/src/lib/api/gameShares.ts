import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuddyLink } from "./buddy";

/** A game a buddy named you in: waiting for your answer, or accepted and in your Sessions. */
export type GameShare = {
  id: string;
  session_id: string;
  status: "pending" | "accepted";
  owner_id: string;
  owner_name: string;
  title: string;
  session_date: string;
  session_context: string;
  play_format: string;
  match_result: "win" | "loss" | null;
  match_score: string | null;
  has_video: boolean;
  created_at: string;
};

export type SharedGame = {
  session: {
    id: string; title: string; session_date: string; session_context: string; play_format: string;
    match_result: "win" | "loss" | null; match_score: string | null; owner_id: string; owner_name: string;
  };
  players: { role: "partner" | "opponent"; display_name: string }[];
  result: unknown | null;
  video_path: string | null;
};

export type GameShareMode = "ask" | "auto";

/** Null when the database doesn't have game shares yet, so screens can simply hide them. */
export async function listGameShares(sb: SupabaseClient): Promise<GameShare[] | null> {
  const { data, error } = await sb.rpc("my_game_shares");
  if (error) return null;
  return (data ?? []) as GameShare[];
}

/** Games waiting for this player's answer (0 when the database doesn't have game shares yet). */
export async function countPendingGameShares(sb: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await sb.from("game_tags").select("id", { count: "exact", head: true })
    .eq("tagged_id", userId).eq("status", "pending");
  return error ? 0 : count ?? 0;
}

export async function tagBuddiesInGame(sb: SupabaseClient, sessionId: string, playerIds: string[]): Promise<number> {
  if (!playerIds.length) return 0;
  const { data, error } = await sb.rpc("tag_buddies_in_game", { p_session_id: sessionId, p_players: playerIds });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function respondGameShare(sb: SupabaseClient, id: string, accept: boolean, always = false): Promise<void> {
  const { error } = await sb.rpc("respond_game_tag", { p_id: id, p_accept: accept, p_always: always });
  if (error) throw new Error(error.message);
}

export async function hideSharedGame(sb: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await sb.rpc("hide_shared_game", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

export async function getSharedGame(sb: SupabaseClient, sessionId: string): Promise<SharedGame> {
  const { data, error } = await sb.rpc("shared_game", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  return data as SharedGame;
}

export async function setGameShareMode(sb: SupabaseClient, userId: string, mode: GameShareMode): Promise<void> {
  const { error } = await sb.from("profiles").update({ game_share_mode: mode }).eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function clearGameShareTrust(sb: SupabaseClient): Promise<void> {
  const { error } = await sb.rpc("clear_game_tag_trust");
  if (error) throw new Error(error.message);
}

/**
 * The active buddy a typed name refers to: the same full name, or a first name only one
 * buddy has. Case and extra spaces don't matter. Null when there's no single clear match.
 */
export function matchBuddy(name: string, buddies: Pick<BuddyLink, "other_id" | "other_name" | "status">[]): { id: string; name: string } | null {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const typed = norm(name);
  if (!typed) return null;
  const active = buddies.filter((b) => b.status === "active" && b.other_name);
  const full = active.filter((b) => norm(b.other_name) === typed);
  const pick = full.length === 1 ? full : active.filter((b) => norm(b.other_name).split(" ")[0] === typed);
  return pick.length === 1 ? { id: pick[0].other_id, name: pick[0].other_name } : null;
}

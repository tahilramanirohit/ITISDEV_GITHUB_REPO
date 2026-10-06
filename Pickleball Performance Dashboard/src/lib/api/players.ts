import type { SupabaseClient } from "@supabase/supabase-js";

export type OtherPlayer = { role: "partner" | "opponent"; display_name: string };

/** Partners and opponents the owner named for a session (not linked to accounts). */
export async function listOtherPlayers(sb: SupabaseClient, sessionId: string): Promise<OtherPlayer[]> {
  const { data, error } = await sb.from("session_participants").select("role,display_name")
    .eq("session_id", sessionId).in("role", ["partner", "opponent"]);
  if (error) throw new Error(error.message);
  return ((Array.isArray(data) ? data : []) as OtherPlayer[]).filter((p) => p.display_name);
}

/** Replaces the named players of a session. Blank names are dropped. */
export async function saveOtherPlayers(sb: SupabaseClient, sessionId: string, players: OtherPlayer[]): Promise<void> {
  const rows = players.map((p) => ({ ...p, display_name: p.display_name.trim().slice(0, 80) })).filter((p) => p.display_name);
  const del = await sb.from("session_participants").delete().eq("session_id", sessionId).in("role", ["partner", "opponent"]);
  if (del.error) throw new Error(del.error.message);
  if (!rows.length) return;
  const { error } = await sb.from("session_participants").insert(rows.map((p) => ({ session_id: sessionId, ...p })));
  if (error) throw new Error(error.message);
}

/** A short, readable player ID derived from the account id, e.g. PP-3F9A2C. */
export function playerCode(userId: string): string {
  return `PP-${userId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** First 8 characters of an internal id, enough to quote in a support message. */
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();

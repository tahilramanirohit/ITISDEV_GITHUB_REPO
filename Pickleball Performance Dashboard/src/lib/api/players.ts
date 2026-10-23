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

/** Named partners and opponents for all of the player's sessions, grouped by session. */
export async function listAllOtherPlayers(sb: SupabaseClient): Promise<Map<string, OtherPlayer[]>> {
  const { data, error } = await sb.from("session_participants").select("session_id,role,display_name").in("role", ["partner", "opponent"]);
  if (error) throw new Error(error.message);
  const map = new Map<string, OtherPlayer[]>();
  for (const row of (Array.isArray(data) ? data : []) as (OtherPlayer & { session_id: string })[]) {
    if (!row.display_name) continue;
    map.set(row.session_id, [...(map.get(row.session_id) ?? []), { role: row.role, display_name: row.display_name }]);
  }
  return map;
}

/** Up to two initials for an avatar, e.g. "Ana M." → "AM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}

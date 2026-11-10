import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Profile photo paths for the players on screen (update 14: every signed-in player sees
 * every player's photo). Players without a photo are left out. Before the update, or for
 * guests, there are no photos and everyone shows initials.
 */
export async function listPlayerPhotos(sb: SupabaseClient, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 500);
  if (!unique.length) return new Map();
  const { data, error } = await sb.rpc("player_photos", { p_ids: unique });
  if (error || !Array.isArray(data)) return new Map();
  return new Map((data as { player_id: string; avatar_path: string | null }[])
    .filter((r) => r.avatar_path).map((r) => [r.player_id, r.avatar_path!]));
}

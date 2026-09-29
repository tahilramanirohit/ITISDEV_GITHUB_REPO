import type { SupabaseClient } from "@supabase/supabase-js";

export type PlayerProfile = {
  id: string;
  display_name: string;
  dominant_hand: "right" | "left" | "ambidextrous" | null;
  years_playing: number | null;
  usual_format: "singles" | "doubles" | "both" | null;
  self_level: string | null;
  is_adult_confirmed: boolean;
};

export type ProfileInput = Omit<PlayerProfile, "id">;

export async function getProfile(sb: SupabaseClient, userId: string): Promise<PlayerProfile | null> {
  const { data, error } = await sb.from("profiles").select("id,display_name,dominant_hand,years_playing,usual_format,self_level,is_adult_confirmed")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as PlayerProfile | null;
}

export async function saveProfile(sb: SupabaseClient, userId: string, input: ProfileInput): Promise<void> {
  const { error } = await sb.from("profiles").upsert({ id: userId, ...input }, { onConflict: "id" });
  if (error) throw error;
}

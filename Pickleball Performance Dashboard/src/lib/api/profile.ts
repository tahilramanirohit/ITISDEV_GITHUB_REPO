import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImprovementGoal } from "./types";
import { parseRatings, type SelfRatings } from "../coaching/selfAssessment";

export const PLAY_FREQUENCIES = ["first_time", "monthly", "weekly", "few_per_week", "daily"] as const;
export const PLAY_REASONS = ["fun", "fitness", "social", "compete", "tournaments"] as const;
export type PlayFrequency = (typeof PLAY_FREQUENCIES)[number];
export type PlayReason = (typeof PLAY_REASONS)[number];

export type PlayerProfile = {
  id: string;
  display_name: string;
  dominant_hand: "right" | "left" | "ambidextrous" | null;
  years_playing: number | null;
  usual_format: "singles" | "doubles" | "both" | null;
  self_level: string | null;
  is_adult_confirmed: boolean;
  // Onboarding answers; missing until the onboarding migration is applied.
  play_frequency?: PlayFrequency | null;
  play_reasons?: PlayReason[];
  main_goals?: ImprovementGoal[];
  baseline_ratings?: SelfRatings;
  onboarding_completed_at?: string | null;
};

export type ProfileInput = Pick<PlayerProfile,
  "display_name" | "dominant_hand" | "years_playing" | "usual_format" | "self_level" | "is_adult_confirmed">;
export type OnboardingInput = ProfileInput &
  Required<Pick<PlayerProfile, "play_frequency" | "play_reasons" | "main_goals" | "baseline_ratings">>;

export async function getProfile(sb: SupabaseClient, userId: string): Promise<PlayerProfile | null> {
  // "*" keeps this working on databases without the onboarding columns yet.
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data || Array.isArray(data)) return null;
  return { ...(data as PlayerProfile), baseline_ratings: parseRatings((data as { baseline_ratings?: unknown }).baseline_ratings) };
}

export async function saveProfile(sb: SupabaseClient, userId: string, input: ProfileInput): Promise<void> {
  const { error } = await sb.from("profiles").upsert({ id: userId, ...input }, { onConflict: "id" });
  if (error) throw error;
}

export async function completeOnboarding(sb: SupabaseClient, userId: string, input: OnboardingInput): Promise<void> {
  const { error } = await sb.from("profiles")
    .upsert({ id: userId, ...input, onboarding_completed_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}

export function needsOnboarding(profile: PlayerProfile | null): boolean {
  return !profile?.onboarding_completed_at;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImprovementGoal, PlayFormat, ReviewMode, SessionKind } from "./types";
import { parseRatings, type SelfRatings } from "../coaching/selfAssessment";

export const PLAY_FREQUENCIES = ["first_time", "monthly", "weekly", "few_per_week", "daily"] as const;
export const PLAY_REASONS = ["fun", "fitness", "social", "compete", "tournaments"] as const;
export type PlayFrequency = (typeof PLAY_FREQUENCIES)[number];
export type PlayReason = (typeof PLAY_REASONS)[number];

export type PlayerProfile = {
  id: string;
  data_consent_version?: string | null;
  data_consent_at?: string | null;
  analytics_opt_in?: boolean;
  research_opt_in?: boolean;
  /** Games buddies share with this player: "ask" each time (default) or "auto". Missing before the game-shares migration. */
  game_share_mode?: "ask" | "auto";
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
  // Default settings for new sessions; missing until the adviser-notes migration.
  default_review_mode?: ReviewMode | null;
  default_session_kind?: SessionKind | null;
  default_play_format?: PlayFormat | null;
  // Edit-profile extras; missing until the profile-photo migration.
  avatar_path?: string | null;
  bio?: string | null;
  home_court?: string | null;
  paddle?: string | null;
  // Listed in Buddy; missing until the buddy migration.
  buddy_visible?: boolean;
  /** How many weeks each set of goals runs (1-52); missing before update 13, which means 4. */
  goal_weeks?: number;
};

export type SessionDefaults = Required<Pick<PlayerProfile, "default_review_mode" | "default_session_kind" | "default_play_format">>;

export type ProfileInput = Pick<PlayerProfile,
  "display_name" | "dominant_hand" | "years_playing" | "usual_format" | "self_level" | "is_adult_confirmed"> &
  Partial<Pick<PlayerProfile, "bio" | "home_court" | "paddle">>;

/** True once the database has the edit-profile columns (photo, bio, home court, paddle). */
export function supportsProfileExtras(profile: PlayerProfile | null): boolean {
  return !!profile && "avatar_path" in profile;
}
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

export async function saveSessionDefaults(sb: SupabaseClient, userId: string, defaults: SessionDefaults): Promise<void> {
  const { error } = await sb.from("profiles").update(defaults).eq("id", userId);
  if (error) throw error;
}

export const DATA_CONSENT_VERSION = "2026-11-08-v1";
export function needsConsent(profile: PlayerProfile | null): boolean {
  return profile?.data_consent_version !== DATA_CONSENT_VERSION || !profile.data_consent_at;
}
export type DataPreferences = { analytics_opt_in: boolean; research_opt_in: boolean };

export async function saveDataConsent(sb: SupabaseClient, userId: string, preferences: DataPreferences, profile: PlayerProfile | null): Promise<void> {
  // The original schema requires a nonempty display_name even before onboarding.
  // Do not resend other profile fields, so onboarding answers remain intact.
  const { error } = await sb.from("profiles").upsert({ id: userId,
    display_name: profile?.display_name || "Player", ...preferences,
    data_consent_version: DATA_CONSENT_VERSION, data_consent_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}
/** The goal length in weeks (update 13). */
export async function saveGoalWeeks(sb: SupabaseClient, userId: string, weeks: number): Promise<void> {
  const { error } = await sb.from("profiles").update({ goal_weeks: weeks }).eq("id", userId);
  if (error) {
    if (/goal_weeks/.test(error.message ?? "") && !/profiles_goal_weeks/.test(error.message ?? "")) {
      throw new Error("Goal length needs a database update. Run supabase/scripts/pickleproapp_upgrade_13.sql in the Supabase SQL Editor, then reload.");
    }
    throw new Error(/profiles_goal_weeks/.test(error.message ?? "") ? "Pick between 1 and 52 weeks." : error.message);
  }
}

export async function saveDataPreferences(sb: SupabaseClient, userId: string, preferences: DataPreferences): Promise<void> {
  const { error } = await sb.from("profiles").update(preferences).eq("id", userId);
  if (error) throw error;
}

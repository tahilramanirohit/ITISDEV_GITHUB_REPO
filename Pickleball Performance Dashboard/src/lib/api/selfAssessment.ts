import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRatings, type ErrorLevel, type SelfRatings } from "../coaching/selfAssessment";
import type { SessionRow } from "./types";

export type SelfAssessment = {
  session_id: string;
  ratings: SelfRatings;
  games_played: number | null;
  games_won: number | null;
  unforced_errors: ErrorLevel | null;
  biggest_struggle: string | null;
  updated_at: string;
};

export type SelfAssessmentInput = Omit<SelfAssessment, "session_id" | "updated_at">;

const COLUMNS = "session_id,ratings,games_played,games_won,unforced_errors,biggest_struggle,updated_at";

function toAssessment(row: Record<string, unknown>): SelfAssessment {
  return { ...(row as SelfAssessment), ratings: parseRatings(row.ratings) };
}

export async function getSelfAssessment(sb: SupabaseClient, sessionId: string): Promise<SelfAssessment | null> {
  const { data, error } = await sb.from("self_assessments").select(COLUMNS).eq("session_id", sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toAssessment(data) : null;
}

export async function saveSelfAssessment(sb: SupabaseClient, sessionId: string, input: SelfAssessmentInput): Promise<SelfAssessment> {
  const { data, error } = await sb.from("self_assessments")
    .upsert({ session_id: sessionId, ...input }, { onConflict: "session_id" }).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return toAssessment(data);
}

/** All of the player's self-assessments, oldest session first, for progress charts. */
export async function listSelfAssessments(sb: SupabaseClient): Promise<SelfAssessment[]> {
  const { data, error } = await sb.from("self_assessments").select(COLUMNS);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toAssessment);
}

/** The most recent earlier session's self-assessment, to show what changed. */
export function previousAssessment(
  current: SessionRow, sessions: SessionRow[], assessments: SelfAssessment[],
): { session: SessionRow; assessment: SelfAssessment } | null {
  const byId = new Map(assessments.map((a) => [a.session_id, a]));
  const earlier = sessions
    .filter((s) => s.id !== current.id && byId.has(s.id) &&
      (s.session_date < current.session_date || (s.session_date === current.session_date && s.created_at < current.created_at)))
    .sort((a, b) => b.session_date.localeCompare(a.session_date) || b.created_at.localeCompare(a.created_at));
  return earlier[0] ? { session: earlier[0], assessment: byId.get(earlier[0].id)! } : null;
}

/** Explains a missing database migration instead of showing a raw PostgREST error. */
export function friendlyDbError(message: string): string {
  if (/review_mode|self_assessments/.test(message))
    return "The database is missing the self-assessment update. Apply supabase/migrations/20261006090000_self_assessment.sql, then try again.";
  if (/play_frequency|play_reasons|main_goals|baseline_ratings|onboarding_completed_at/.test(message))
    return "The database is missing the onboarding update. Apply supabase/migrations/20261006100000_player_onboarding.sql, then try again.";
  if (/default_review_mode|default_session_kind|default_play_format|tournament_|match_result|match_score|display_name.*session_participants|duration_s/.test(message))
    return "The database is missing the latest update. Apply supabase/migrations/20261006110000_adviser_notes.sql, then try again.";
  return message;
}

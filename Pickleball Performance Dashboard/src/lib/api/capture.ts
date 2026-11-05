import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalEntry } from "../coaching/readinessInsights";

// Must equal the policy_version required in supabase/migrations (see capture.test.ts).
export const UPLOAD_POLICY_VERSION = "2026-09-29-v4";

export type Checkin = {
  participant_id: string;
  captured_at: string;
  timing_status: "pre_game" | "retrospective" | "unverified";
  warmup_done: boolean | null;
  sleep_hours: number | null;
  readiness: number | null;
  focus: string | null;
};
export type Recovery = {
  participant_id: string;
  captured_at: string;
  exertion: number | null;
  soreness: number | null;
  cooldown_done: boolean | null;
};
export type Reflection = {
  participant_id: string;
  captured_at: string;
  went_well: string | null;
  change_next: string | null;
};
export type Capture = {
  participantId: string;
  checkin: Checkin | null;
  recovery: Recovery | null;
  reflection: Reflection | null;
};

function value<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function loadCapture(sb: SupabaseClient, sessionId: string): Promise<Capture> {
  const participant = value<{ id: string }>(await sb.from("session_participants")
    .select("id").eq("session_id", sessionId).eq("role", "uploader").single());
  const [checkin, recovery, reflection] = await Promise.all([
    sb.from("checkins").select("*").eq("participant_id", participant.id).maybeSingle(),
    sb.from("recovery_logs").select("*").eq("participant_id", participant.id).maybeSingle(),
    sb.from("reflections").select("*").eq("participant_id", participant.id).maybeSingle(),
  ]);
  return {
    participantId: participant.id,
    checkin: value<Checkin | null>(checkin),
    recovery: value<Recovery | null>(recovery),
    reflection: value<Reflection | null>(reflection),
  };
}

/**
 * Pre-game and recovery answers for every session, keyed by session id, for
 * the Progress page. Three small queries in parallel; RLS keeps them to the
 * player's own rows.
 */
export async function listJournalSummaries(sb: SupabaseClient): Promise<Map<string, JournalEntry>> {
  const [participants, checkins, recovery] = await Promise.all([
    sb.from("session_participants").select("id,session_id").eq("role", "uploader"),
    sb.from("checkins").select("participant_id,sleep_hours,readiness,warmup_done,timing_status"),
    sb.from("recovery_logs").select("participant_id,soreness,exertion"),
  ]);
  const sessionOf = new Map(value<{ id: string; session_id: string }[]>(participants).map((p) => [p.id, p.session_id]));
  const out = new Map<string, JournalEntry>();
  const entry = (participantId: string) => {
    const sessionId = sessionOf.get(participantId);
    if (!sessionId) return null;
    let e = out.get(sessionId);
    if (!e) {
      e = { sleepHours: null, readiness: null, warmupDone: null, preGame: false, soreness: null, exertion: null };
      out.set(sessionId, e);
    }
    return e;
  };
  for (const c of value<Pick<Checkin, "participant_id" | "sleep_hours" | "readiness" | "warmup_done" | "timing_status">[]>(checkins)) {
    const e = entry(c.participant_id);
    if (!e) continue;
    // numeric columns can arrive as strings from PostgREST.
    e.sleepHours = c.sleep_hours == null ? null : Number(c.sleep_hours);
    e.readiness = c.readiness;
    e.warmupDone = c.warmup_done;
    e.preGame = c.timing_status === "pre_game";
  }
  for (const r of value<Pick<Recovery, "participant_id" | "soreness" | "exertion">[]>(recovery)) {
    const e = entry(r.participant_id);
    if (!e) continue;
    e.soreness = r.soreness;
    e.exertion = r.exertion;
  }
  return out;
}

export async function saveCheckin(sb: SupabaseClient, participantId: string,
  input: Pick<Checkin, "warmup_done" | "sleep_hours" | "readiness" | "focus">): Promise<void> {
  value(await sb.from("checkins").upsert({ participant_id: participantId, ...input }));
}

export async function saveRecovery(sb: SupabaseClient, participantId: string,
  input: Pick<Recovery, "exertion" | "soreness" | "cooldown_done">): Promise<void> {
  value(await sb.from("recovery_logs").upsert({ participant_id: participantId, ...input }));
}

export async function saveReflection(sb: SupabaseClient, participantId: string,
  input: Pick<Reflection, "went_well" | "change_next">): Promise<void> {
  value(await sb.from("reflections").upsert({ participant_id: participantId, ...input }));
}

export async function hasUploadConsent(sb: SupabaseClient): Promise<boolean> {
  const records = value<{ id: string }[]>(await sb.from("consent_records")
    .select("id").eq("policy_version", UPLOAD_POLICY_VERSION).limit(1));
  return records.length > 0;
}

export async function recordUploadConsent(sb: SupabaseClient, playerId: string): Promise<void> {
  value(await sb.from("consent_records").insert({
    player_id: playerId,
    policy_version: UPLOAD_POLICY_VERSION,
    scope: "recording_upload",
    retention_days: 30,
  }));
}

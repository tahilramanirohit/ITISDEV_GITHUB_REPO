import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisJobRow,
  AnalysisResultRow,
  GoalValues,
  ImprovementGoal,
  PerformanceScope,
  PlayFormat,
  SessionContext,
  SessionRow,
  SelfRating,
  VideoAssetRow,
} from "./types";
import { buildStoragePath } from "../upload/validate";
import { parseAnalysisResult, type AnalysisResultV1 } from "../analysis/contract";
import { coachingBlocker } from "../analysis/coaching";

export const VIDEO_BUCKET = "session-videos";

export type SessionBundle = {
  session: SessionRow;
  video: VideoAssetRow | null;
  job: AnalysisJobRow | null;
  result: AnalysisResultRow | null;
};

type ResultSummary = Pick<AnalysisResultRow, "id" | "job_id" | "result_status" | "data_origin">;
export type SessionListItem = SessionBundle & { result: ResultSummary | null };

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listSessions(sb: SupabaseClient): Promise<SessionListItem[]> {
  // RLS limits every query to the signed-in player's rows.
  const [sessions, videos, jobs, results] = await Promise.all([
    sb.from("sessions").select("*").order("session_date", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("video_assets").select("*"),
    sb.from("analysis_jobs").select("*"),
    sb.from("analysis_results").select("id, job_id, result_status, data_origin"),
  ]);
  const vs = check<VideoAssetRow[]>(videos);
  const js = check<AnalysisJobRow[]>(jobs);
  const rs = check<ResultSummary[]>(results);
  return check<SessionRow[]>(sessions).map((session) => {
    const video = vs.find((v) => v.session_id === session.id) ?? null;
    const job = video ? js.find((j) => j.video_asset_id === video.id) ?? null : null;
    const result = job ? rs.find((r) => r.job_id === job.id) ?? null : null;
    return { session, video, job, result: result as SessionListItem["result"] };
  });
}

export async function getSessionBundle(sb: SupabaseClient, sessionId: string): Promise<SessionBundle | null> {
  const session = check<SessionRow | null>(await sb.from("sessions").select("*").eq("id", sessionId).maybeSingle());
  if (!session) return null;
  const video = check<VideoAssetRow | null>(
    await sb.from("video_assets").select("*").eq("session_id", sessionId).maybeSingle(),
  );
  const job = video
    ? check<AnalysisJobRow | null>(await sb.from("analysis_jobs").select("*").eq("video_asset_id", video.id).maybeSingle())
    : null;
  const result = job
    ? check<AnalysisResultRow | null>(await sb.from("analysis_results").select("*").eq("job_id", job.id).maybeSingle())
    : null;
  return { session, video, job, result };
}

export type PreviousResult = { session: SessionRow; result: AnalysisResultV1 };

/**
 * The most recent earlier session whose result supports coaching, used to show
 * progress. Checks at most `limit` earlier sessions to keep page loads cheap.
 */
export async function findPreviousCoachableResult(
  sb: SupabaseClient, current: SessionRow, limit = 5,
): Promise<PreviousResult | null> {
  const sessions = await listSessions(sb);
  const earlier = sessions
    .filter(({ session, result }) => session.id !== current.id && result?.data_origin === "measured" &&
      session.session_context === current.session_context && session.play_format === current.play_format &&
      (session.session_date < current.session_date ||
        (session.session_date === current.session_date && session.created_at < current.created_at)))
    .slice(0, limit);
  for (const { session } of earlier) {
    const bundle = await getSessionBundle(sb, session.id);
    if (!bundle?.result) continue;
    try {
      const result = parseAnalysisResult(bundle.result.result);
      if (!coachingBlocker(result) && result.metrics.positioning.status === "measured") return { session, result };
    } catch {
      // Unreadable older results are skipped, never compared.
    }
  }
  return null;
}

export type NewSession = {
  title: string;
  session_date: string;
  session_context: SessionContext;
  play_format: PlayFormat;
  performance_scope: PerformanceScope;
  notes: string | null;
  improvement_goals: ImprovementGoal[];
  positioning_rating: SelfRating | null;
  shot_outcomes_rating: SelfRating | null;
  shot_technique_rating: SelfRating | null;
};

export async function createSession(sb: SupabaseClient, input: NewSession): Promise<SessionRow> {
  return check<SessionRow>(await sb.from("sessions").insert(input).select("*").single());
}

export async function updateSessionGoals(sb: SupabaseClient, sessionId: string, goals: GoalValues): Promise<SessionRow> {
  return check<SessionRow>(await sb.from("sessions").update(goals).eq("id", sessionId).select("*").single());
}

export async function deleteSession(sb: SupabaseClient, bundle: SessionBundle): Promise<void> {
  if (bundle.video) {
    const { error } = await sb.storage.from(VIDEO_BUCKET).remove([bundle.video.storage_path]);
    if (error) throw new Error(error.message);
  }
  check(await sb.from("sessions").delete().eq("id", bundle.session.id));
}

export async function registerVideo(
  sb: SupabaseClient,
  args: { ownerId: string; sessionId: string; file: File; mimeType: string; extension: string },
): Promise<VideoAssetRow> {
  const id = crypto.randomUUID();
  const row = {
    id,
    session_id: args.sessionId,
    storage_path: buildStoragePath(args.ownerId, args.sessionId, id, args.extension),
    original_filename: args.file.name.slice(0, 255),
    mime_type: args.mimeType,
    byte_size: args.file.size,
  };
  return check<VideoAssetRow>(await sb.from("video_assets").insert(row).select("*").single());
}

export async function removeVideo(sb: SupabaseClient, video: VideoAssetRow): Promise<void> {
  await sb.storage.from(VIDEO_BUCKET).remove([video.storage_path]);
  check(await sb.from("video_assets").delete().eq("id", video.id));
}

/**
 * Idempotent on the server: repeated calls (double clicks, retries, two tabs)
 * return the same job. `params` only apply when the job is first created.
 */
export async function finalizeUpload(
  sb: SupabaseClient,
  videoId: string,
  params: Record<string, unknown> = {},
): Promise<AnalysisJobRow> {
  return check<AnalysisJobRow>(await sb.rpc("finalize_video_upload", { p_video_id: videoId, p_params: params }));
}

export async function requestReanalysis(
  sb: SupabaseClient,
  jobId: string,
  params: Record<string, unknown> | null,
): Promise<AnalysisJobRow> {
  return check<AnalysisJobRow>(await sb.rpc("request_reanalysis", { p_job_id: jobId, p_params: params }));
}

export async function signedVideoUrl(sb: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await sb.storage.from(VIDEO_BUCKET).createSignedUrl(path, 5 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

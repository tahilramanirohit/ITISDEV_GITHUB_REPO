// Row types for the tables in supabase/migrations. Hand-written until the team
// can run `supabase gen types typescript` against a real project.

export const SESSION_CONTEXTS = ["practice", "casual_match", "tournament", "leveling_game"] as const;
export const PLAY_FORMATS = ["singles", "doubles", "wall_practice", "ball_machine", "drill_other"] as const;
export const PERFORMANCE_SCOPES = ["individual", "pair"] as const;

export type SessionContext = (typeof SESSION_CONTEXTS)[number];
export type PlayFormat = (typeof PLAY_FORMATS)[number];
export type PerformanceScope = (typeof PERFORMANCE_SCOPES)[number];

export const CONTEXT_LABELS: Record<SessionContext, string> = {
  practice: "Practice",
  casual_match: "Casual match",
  tournament: "Tournament",
  leveling_game: "Leveling game",
};
export const FORMAT_LABELS: Record<PlayFormat, string> = {
  singles: "Singles",
  doubles: "Doubles",
  wall_practice: "Wall practice",
  ball_machine: "Ball machine",
  drill_other: "Other drill",
};

export type SessionRow = {
  id: string;
  owner_id: string;
  title: string;
  session_date: string;
  session_context: SessionContext;
  play_format: PlayFormat;
  performance_scope: PerformanceScope;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoAssetRow = {
  id: string;
  owner_id: string;
  session_id: string;
  storage_bucket: "session-videos";
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  upload_status: "pending" | "uploaded";
  created_at: string;
  uploaded_at: string | null;
};

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type AnalysisJobRow = {
  id: string;
  owner_id: string;
  video_asset_id: string;
  session_id: string;
  status: JobStatus;
  params: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  available_at: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type AnalysisResultRow = {
  id: string;
  job_id: string;
  session_id: string;
  video_asset_id: string;
  schema_version: string;
  result_status: "ok" | "insufficient_data";
  data_origin: "measured" | "test_fixture";
  pipeline_version: string;
  analyzed_duration_s: number | null;
  video_duration_s: number | null;
  fraction_analyzed: number | null;
  result: unknown;
  created_at: string;
};

// TypeScript mirror of server/picklepro/contract.py (schema version 1.0).
// contract.test.ts checks these lists against contracts/analysis_result.v1.schema.json
// so the two sides cannot drift silently.

export const RESULT_STATUSES = ["ok", "insufficient_data"] as const;
export const DATA_ORIGINS = ["measured", "test_fixture"] as const;
export const METRIC_STATUSES = ["measured", "insufficient_data", "not_computed", "experimental"] as const;
export const VALIDATION_LEVELS = ["not_evaluated", "synthetic_only", "evaluated_on_real_footage"] as const;
export const METRIC_KEYS = ["court_heatmap", "zone_occupancy", "positioning", "rally_segmentation", "shot_classification"] as const;
export const RESULT_KEYS = [
  "schema_version", "status", "data_origin", "message", "provenance", "video", "coverage", "calibration",
  "player_selection", "players", "tracks", "player_positions", "ball_positions", "court_lines", "metrics", "warnings",
] as const;
export const SHOT_TYPES = [
  "serve", "return", "drive", "drop", "dink", "reset",
  "speed_up", "counter", "volley", "lob", "overhead", "erne", "unclassified",
] as const;
export const PUBLIC_SHOT_TYPES = ["serve", "volley", "dink", "drive", "lob", "unclassified"] as const;

const LEGACY_SHOT_TYPES: Record<string, string> = { third_shot_drop: "drop", third_shot_drive: "drive" };

export type ResultStatus = (typeof RESULT_STATUSES)[number];
export type DataOrigin = (typeof DATA_ORIGINS)[number];
export type MetricStatus = (typeof METRIC_STATUSES)[number];
export type ValidationLevel = (typeof VALIDATION_LEVELS)[number];
export type MetricKey = (typeof METRIC_KEYS)[number];

export type Metric = {
  status: MetricStatus;
  validation: ValidationLevel;
  scope: "whole_clip" | "selected_view";
  reason: string | null;
};

export type HeatmapValue = {
  units: "seconds";
  coordinate_system: string;
  cell_size_m: number;
  x_edges_m: number[];
  y_edges_m: number[];
  dwell_seconds: number[][];
  tracked_time_s: number;
  outside_mapped_area_s: number;
};

export type ZoneOccupancyValue = {
  zone_definitions: Record<string, string>;
  seconds: Record<string, number>;
  fraction_of_tracked_time: Record<string, number>;
};

export const POSITION_BANDS = ["behind_baseline", "baseline_area", "transition", "kitchen_line", "inside_kitchen"] as const;
export type PositionBand = (typeof POSITION_BANDS)[number];

export type PositioningValue = {
  court_half: "near" | "far";
  band_definitions: Record<string, string>;
  seconds: Record<PositionBand, number>;
  fraction_of_mapped_time: Record<PositionBand, number>;
  mapped_time_s: number;
  left_side_fraction: number | null;
  transition_lingers: number;
  longest_transition_linger_s: number | null;
  approaches_to_kitchen_line: number;
  median_approach_s: number | null;
  retreats_to_baseline: number;
  distance_covered_m: number;
};

export type PlayerBox = {
  track_id: number | null; bbox: [number, number, number, number]; confidence: number | null;
  /** The player chosen for court feedback in this frame. Missing in older results. */
  selected?: boolean;
};
/** Court lines in image pixels, valid from this time until the next snapshot. */
export type CourtLinesSnapshot = { time_seconds: number; lines: [number, number, number, number][] };

export type ShotType = (typeof SHOT_TYPES)[number];
export type PublicShotType = (typeof PUBLIC_SHOT_TYPES)[number];
export const publicShotType = (type: ShotType): PublicShotType =>
  (PUBLIC_SHOT_TYPES as readonly string[]).includes(type) ? type as PublicShotType : "unclassified";

/** Use the revision-4 vocabulary when an evaluated result is shown to players. */
export function publicShotResult(result: AnalysisResultV1): AnalysisResultV1 {
  const value = result.metrics.shot_classification.value;
  if (!value) return result;
  const shots = value.shots.map((shot) => ({ ...shot, shot_type: shot.public_shot_type ?? publicShotType(shot.shot_type) }));
  return { ...result, metrics: { ...result.metrics, shot_classification: {
    ...result.metrics.shot_classification, value: { ...value, shots },
  } } };
}
export type ShotEvent = {
  time_seconds: number;
  rally_index: number;
  shot_number: number;
  hitter_track_id: number | null;
  hitter_side: "near" | "far" | null;
  by_selected_player: boolean;
  hitter_court_m: [number, number] | null;
  shot_type: ShotType;
  public_shot_type?: PublicShotType | null;
  contact: "volley" | "after_bounce" | "unknown";
  ground_speed_mps: number | null;
  landing_court_m: [number, number] | null;
  landed_in: boolean | null;
  evidence: string;
};
export type BounceEvent = { time_seconds: number; court_m: [number, number] | null; in_court: boolean | null };
export type ShotsValue = {
  type_definitions: Record<string, string>;
  shots: ShotEvent[];
  bounces: BounceEvent[];
  counts_by_type: Record<ShotType, number>;
  selected_player_counts_by_type: Record<ShotType, number>;
};
export type RallyValue = {
  rallies: { rally_index: number; start_s: number; end_s: number; shots: number }[];
  rally_time_s: number;
};
export type PositionSnapshot = { time_seconds: number; players: PlayerBox[] };
/** One person found in the video. `player_id` matches `track_id` in boxes and `hitter_track_id` in shots. */
export type PlayerSummary = {
  player_id: number;
  label: string;
  /** False for people standing mostly off the court, such as a referee. */
  on_court: boolean;
  side: "near" | "far" | null;
  first_seen_s: number;
  last_seen_s: number;
  observed_frames: number;
  median_court_m: [number, number] | null;
  /** Small JPEG data URI. */
  thumbnail: string | null;
};
export type BallSnapshot = { time_seconds: number; bbox: [number, number, number, number]; confidence: number; observation_kind?: "observed" };

export type AnalysisResultV1 = {
  schema_version: "1.0";
  status: ResultStatus;
  data_origin: DataOrigin;
  message: string;
  provenance: {
    pipeline_version: string;
    generated_at: string;
    detector: { name: string; confidence_is_model_score: boolean };
    ball_detector?: { name: string; confidence_is_model_score: boolean } | null;
    ball_tracking?: Record<string, number> | null;
    source: { filename: string | null; sha256: string | null };
  };
  video: {
    width: number;
    height: number;
    fps: number;
    frame_count_reported: number | null;
    container_duration_s: number | null;
  };
  coverage: {
    analyzed_start_s: number;
    analyzed_end_s: number;
    analyzed_duration_s: number;
    frames_decoded: number;
    frames_analyzed: number;
    sample_stride: number;
    decode_failures: number;
    stopped_early_reason: string | null;
    fraction_of_video_analyzed: number | null;
    frames_with_detections: number;
    frames_with_ball_detections?: number;
    ball_sample_stride?: number | null;
    frames_with_carried_court_map?: number | null;
    selected_view_duration_s?: number | null;
  };
  calibration: {
    method: "manual_landmarks" | "user_confirmed_landmarks" | "auto_model_landmarks" | "auto_painted_lines";
    court_model: string;
    landmarks_used: string[];
    reprojection_rmse_px: number;
    reprojection_rmse_m: number;
    quality: "good" | "poor";
  } | null;
  player_selection: {
    method: "track_id" | "court_half";
    track_id: number | null;
    court_half: "near" | "far" | null;
    tracked_time_s: number;
    tracked_fraction: number;
    ambiguous_frames: number;
  } | null;
  /** Missing in results made before players were grouped. */
  players?: PlayerSummary[];
  tracks: { track_id: number; first_seen_s: number; last_seen_s: number; observed_frames: number }[];
  player_positions: PositionSnapshot[];
  ball_positions?: BallSnapshot[];
  court_lines?: CourtLinesSnapshot[];
  metrics: {
    court_heatmap: Metric & { value: HeatmapValue | null };
    zone_occupancy: Metric & { value: ZoneOccupancyValue | null };
    positioning: Metric & { value: PositioningValue | null };
    rally_segmentation: Metric & { value?: RallyValue | null };
    shot_classification: Metric & { value?: ShotsValue | null };
  };
  warnings: string[];
};

export class ContractError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new ContractError(`${path}: expected one of ${allowed.join(", ")}, got ${JSON.stringify(v)}`);
  }
  return v as T;
}

function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ContractError(`${path}: expected a number`);
  return v;
}

/**
 * Validate the parts of a result the UI relies on to describe it truthfully.
 * Unknown or malformed results are rejected rather than rendered as if valid.
 */
const POSITIONING_NOT_COMPUTED = {
  status: "not_computed", validation: "not_evaluated", scope: "whole_clip",
  reason: "Positioning patterns were not computed for this result. Re-run analysis to add them.", value: null,
};

export function parseAnalysisResult(input: unknown): AnalysisResultV1 {
  if (!isObj(input)) throw new ContractError("result: expected an object");
  if (input.schema_version !== "1.0") {
    throw new ContractError(`schema_version: unsupported ${JSON.stringify(input.schema_version)}`);
  }
  oneOf(input.status, RESULT_STATUSES, "status");
  oneOf(input.data_origin, DATA_ORIGINS, "data_origin");
  if (typeof input.message !== "string") throw new ContractError("message: expected a string");
  const prov = input.provenance;
  if (!isObj(prov) || typeof prov.pipeline_version !== "string" || !isObj(prov.detector)) {
    throw new ContractError("provenance: missing pipeline_version or detector");
  }
  if (prov.ball_detector != null && (!isObj(prov.ball_detector) || typeof prov.ball_detector.name !== "string")) {
    throw new ContractError("provenance.ball_detector: expected a detector or null");
  }
  const cov = input.coverage;
  if (!isObj(cov)) throw new ContractError("coverage: expected an object");
  num(cov.analyzed_duration_s, "coverage.analyzed_duration_s");
  num(cov.frames_analyzed, "coverage.frames_analyzed");
  if (cov.frames_with_ball_detections !== undefined) num(cov.frames_with_ball_detections, "coverage.frames_with_ball_detections");
  if (cov.selected_view_duration_s != null) num(cov.selected_view_duration_s, "coverage.selected_view_duration_s");
  if (input.calibration !== null) {
    if (!isObj(input.calibration)) throw new ContractError("calibration: expected an object or null");
    oneOf(input.calibration.method, ["manual_landmarks", "auto_model_landmarks", "auto_painted_lines"] as const, "calibration.method");
  }
  if (!isObj(input.metrics)) throw new ContractError("metrics: expected an object");
  // Results saved before positioning existed are still valid; show them as not computed.
  const metrics = input.metrics.positioning === undefined
    ? { ...input.metrics, positioning: POSITIONING_NOT_COMPUTED }
    : input.metrics;
  for (const key of METRIC_KEYS) {
    const m = (metrics as Record<string, unknown>)[key];
    if (!isObj(m)) throw new ContractError(`metrics.${key}: missing`);
    oneOf(m.status, METRIC_STATUSES, `metrics.${key}.status`);
    oneOf(m.validation, VALIDATION_LEVELS, `metrics.${key}.validation`);
    oneOf(m.scope, ["whole_clip", "selected_view"] as const, `metrics.${key}.scope`);
  }
  const heat = (metrics as Record<string, Record<string, unknown>>).court_heatmap;
  if (heat.status === "measured" && !isObj(heat.value)) {
    throw new ContractError("metrics.court_heatmap: measured without a value");
  }
  const positioning = (metrics as Record<string, Record<string, unknown>>).positioning;
  if (positioning.status === "measured") {
    const v = positioning.value;
    if (!isObj(v) || !isObj(v.fraction_of_mapped_time) || !isObj(v.seconds)) {
      throw new ContractError("metrics.positioning: measured without a value");
    }
    oneOf(v.court_half, ["near", "far"] as const, "metrics.positioning.value.court_half");
    for (const band of POSITION_BANDS) {
      num((v.fraction_of_mapped_time as Record<string, unknown>)[band], `metrics.positioning.value.fraction_of_mapped_time.${band}`);
    }
    num(v.mapped_time_s, "metrics.positioning.value.mapped_time_s");
    num(v.transition_lingers, "metrics.positioning.value.transition_lingers");
    num(v.approaches_to_kitchen_line, "metrics.positioning.value.approaches_to_kitchen_line");
  }
  if (!Array.isArray(input.player_positions) || !Array.isArray(input.tracks) || !Array.isArray(input.warnings)) {
    throw new ContractError("player_positions/tracks/warnings: expected arrays");
  }
  if (input.players !== undefined) {
    if (!Array.isArray(input.players)) throw new ContractError("players: expected an array");
    for (const player of input.players) {
      if (!isObj(player) || typeof player.label !== "string" || typeof player.on_court !== "boolean") {
        throw new ContractError("players: invalid player");
      }
      num(player.player_id, "players.player_id");
      if (player.thumbnail != null && (typeof player.thumbnail !== "string" || !player.thumbnail.startsWith("data:image/jpeg;base64,"))) {
        throw new ContractError("players.thumbnail: expected a JPEG data URI");
      }
    }
  }
  if (input.ball_positions !== undefined && !Array.isArray(input.ball_positions)) {
    throw new ContractError("ball_positions: expected an array");
  }
  if (Array.isArray(input.ball_positions)) {
    for (const ball of input.ball_positions) {
      if (!isObj(ball) || !Array.isArray(ball.bbox) || ball.bbox.length !== 4) {
        throw new ContractError("ball_positions: invalid ball box");
      }
      num(ball.time_seconds, "ball_positions.time_seconds");
      num(ball.confidence, "ball_positions.confidence");
      if (ball.observation_kind !== undefined) oneOf(ball.observation_kind, ["observed"] as const, "ball_positions.observation_kind");
      ball.bbox.forEach((value) => num(value, "ball_positions.bbox"));
    }
  }
  if (input.court_lines !== undefined) {
    if (!Array.isArray(input.court_lines)) throw new ContractError("court_lines: expected an array");
    for (const snap of input.court_lines) {
      if (!isObj(snap) || !Array.isArray(snap.lines)) throw new ContractError("court_lines: invalid snapshot");
      num(snap.time_seconds, "court_lines.time_seconds");
      for (const line of snap.lines) {
        if (!Array.isArray(line) || line.length !== 4) throw new ContractError("court_lines: invalid line");
        line.forEach((v) => num(v, "court_lines.lines"));
      }
    }
  }
  const shots = (metrics as Record<string, Record<string, unknown>>).shot_classification;
  if (shots.value != null) {
    const v = shots.value;
    if (!isObj(v) || !Array.isArray(v.shots) || !Array.isArray(v.bounces) || !isObj(v.counts_by_type)) {
      throw new ContractError("metrics.shot_classification: invalid value");
    }
    for (const shot of v.shots) {
      if (!isObj(shot)) throw new ContractError("metrics.shot_classification: invalid shot");
      // Results saved before "third-shot drop/drive" were folded into drop and drive.
      if (typeof shot.shot_type === "string" && Object.hasOwn(LEGACY_SHOT_TYPES, shot.shot_type)) {
        shot.shot_type = LEGACY_SHOT_TYPES[shot.shot_type];
      }
      num(shot.time_seconds, "metrics.shot_classification.shots.time_seconds");
      oneOf(shot.shot_type, SHOT_TYPES, "metrics.shot_classification.shots.shot_type");
      if (shot.public_shot_type === undefined || shot.public_shot_type === null) {
        shot.public_shot_type = publicShotType(shot.shot_type as ShotType);
      } else {
        oneOf(shot.public_shot_type, PUBLIC_SHOT_TYPES, "metrics.shot_classification.shots.public_shot_type");
      }
    }
  }
  return { ...input, metrics } as unknown as AnalysisResultV1;
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  court_heatmap: "Court heatmap (dwell time)",
  zone_occupancy: "Zone occupancy",
  positioning: "Court positioning patterns",
  rally_segmentation: "Rallies (estimated)",
  shot_classification: "Shot types (estimated)",
};

export const VALIDATION_LABELS: Record<ValidationLevel, string> = {
  not_evaluated: "Accuracy not yet evaluated",
  synthetic_only: "Checked on synthetic video only",
  evaluated_on_real_footage: "Evaluated on real footage",
};

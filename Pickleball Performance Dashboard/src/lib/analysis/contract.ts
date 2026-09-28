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
  "player_selection", "tracks", "player_positions", "ball_positions", "metrics", "warnings",
] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];
export type DataOrigin = (typeof DATA_ORIGINS)[number];
export type MetricStatus = (typeof METRIC_STATUSES)[number];
export type ValidationLevel = (typeof VALIDATION_LEVELS)[number];
export type MetricKey = (typeof METRIC_KEYS)[number];

export type Metric = {
  status: MetricStatus;
  validation: ValidationLevel;
  scope: "whole_clip";
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

export type PlayerBox = { track_id: number | null; bbox: [number, number, number, number]; confidence: number | null };
export type PositionSnapshot = { time_seconds: number; players: PlayerBox[] };
export type BallSnapshot = { time_seconds: number; bbox: [number, number, number, number]; confidence: number };

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
  };
  calibration: {
    method: "manual_landmarks" | "auto_model_landmarks";
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
  tracks: { track_id: number; first_seen_s: number; last_seen_s: number; observed_frames: number }[];
  player_positions: PositionSnapshot[];
  ball_positions?: BallSnapshot[];
  metrics: {
    court_heatmap: Metric & { value: HeatmapValue | null };
    zone_occupancy: Metric & { value: ZoneOccupancyValue | null };
    positioning: Metric & { value: PositioningValue | null };
    rally_segmentation: Metric;
    shot_classification: Metric;
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
  if (input.calibration !== null) {
    if (!isObj(input.calibration)) throw new ContractError("calibration: expected an object or null");
    oneOf(input.calibration.method, ["manual_landmarks", "auto_model_landmarks"] as const, "calibration.method");
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
      ball.bbox.forEach((value) => num(value, "ball_positions.bbox"));
    }
  }
  return { ...input, metrics } as unknown as AnalysisResultV1;
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  court_heatmap: "Court heatmap (dwell time)",
  zone_occupancy: "Zone occupancy",
  positioning: "Court positioning patterns",
  rally_segmentation: "Rally segmentation",
  shot_classification: "Shot classification",
};

export const VALIDATION_LABELS: Record<ValidationLevel, string> = {
  not_evaluated: "Accuracy not yet evaluated",
  synthetic_only: "Checked on synthetic video only",
  evaluated_on_real_footage: "Evaluated on real footage",
};

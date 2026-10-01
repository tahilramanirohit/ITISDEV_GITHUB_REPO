// Mock sessions for the development-only "Dev mode" button. Loaded lazily, so
// none of this is in the main bundle. Results are built from the shared
// contract fixtures (so they always match the v1 schema) and are marked with
// provenance.pipeline_version = "dev-mock", which the database requires and
// the UI turns into a DEV MOCK DATA warning.
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import insufficientFixture from "../../../contracts/fixtures/analysis_result.insufficient.v1.json";
import type { PositionBand } from "../../lib/analysis/contract";
import type { PlayFormat, SessionContext } from "../../lib/api/types";

export const DEV_MOCK_PIPELINE = "dev-mock";
const MOCK_MESSAGE = "DEV MOCK DATA: generated for testing. This is not an analysis of a real video.";

export type MockSession = {
  title: string;
  session_date: string;
  session_context: SessionContext;
  play_format: PlayFormat;
  result: unknown;
};

type Pattern = {
  bands: Record<PositionBand, number>;
  lingers: number;
  approachS: number;
  approaches: number;
  leftSide: number;
};

function daysAgo(days: number, today: Date): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function markAsMock(result: Record<string, any>) {
  result.data_origin = "measured";
  result.message = MOCK_MESSAGE;
  result.warnings = [MOCK_MESSAGE];
  result.provenance = {
    ...result.provenance,
    pipeline_version: DEV_MOCK_PIPELINE,
    generated_at: new Date().toISOString(),
    detector: { name: "dev-mock-person", confidence_is_model_score: true },
    ball_detector: null,
    source: { filename: "dev_mock.mp4", sha256: null },
  };
  return result;
}

function coachableResult(p: Pattern) {
  const result = markAsMock(structuredClone(fixture) as Record<string, any>);
  const v = result.metrics.positioning.value;
  v.fraction_of_mapped_time = { ...p.bands };
  v.seconds = Object.fromEntries(Object.entries(p.bands).map(([band, f]) => [band, Math.round(f * v.mapped_time_s * 1000) / 1000]));
  v.transition_lingers = p.lingers;
  v.longest_transition_linger_s = p.lingers ? Math.round((2 + p.lingers * 0.4) * 10) / 10 : null;
  v.approaches_to_kitchen_line = p.approaches;
  v.median_approach_s = p.approaches ? p.approachS : null;
  v.retreats_to_baseline = Math.max(0, p.approaches - 1);
  v.left_side_fraction = p.leftSide;
  return result;
}

/** A practice history that improves over three weeks, plus one unusable clip. */
export function buildMockSessions(today = new Date()): MockSession[] {
  return [
    {
      title: "Blurry phone clip",
      session_date: daysAgo(28, today),
      session_context: "casual_match",
      play_format: "singles",
      result: markAsMock(structuredClone(insufficientFixture) as Record<string, any>),
    },
    {
      title: "Baseline habits",
      session_date: daysAgo(21, today),
      session_context: "practice",
      play_format: "singles",
      result: coachableResult({
        bands: { behind_baseline: 0.1, baseline_area: 0.3, transition: 0.4, kitchen_line: 0.15, inside_kitchen: 0.05 },
        lingers: 7, approachS: 4.2, approaches: 3, leftSide: 0.52,
      }),
    },
    {
      title: "Working on drops",
      session_date: daysAgo(14, today),
      session_context: "practice",
      play_format: "singles",
      result: coachableResult({
        bands: { behind_baseline: 0.08, baseline_area: 0.3, transition: 0.3, kitchen_line: 0.24, inside_kitchen: 0.08 },
        lingers: 4, approachS: 3.4, approaches: 4, leftSide: 0.48,
      }),
    },
    {
      title: "Open play",
      session_date: daysAgo(7, today),
      session_context: "casual_match",
      play_format: "doubles",
      result: coachableResult({
        bands: { behind_baseline: 0.08, baseline_area: 0.28, transition: 0.16, kitchen_line: 0.36, inside_kitchen: 0.12 },
        lingers: 2, approachS: 2.6, approaches: 5, leftSide: 0.78,
      }),
    },
  ];
}

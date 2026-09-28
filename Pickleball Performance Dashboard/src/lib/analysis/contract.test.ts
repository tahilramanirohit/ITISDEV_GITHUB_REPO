import { describe, expect, it } from "vitest";
import schema from "../../../contracts/analysis_result.v1.schema.json";
import testFixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import insufficient from "../../../contracts/fixtures/analysis_result.insufficient.v1.json";
import {
  ContractError, DATA_ORIGINS, METRIC_KEYS, METRIC_STATUSES, RESULT_KEYS, RESULT_STATUSES, VALIDATION_LEVELS,
  parseAnalysisResult,
} from "./contract";

type Json = Record<string, any>;
const s = schema as Json;
const enumOf = (prop: Json): string[] => prop.enum ?? prop.anyOf?.find((x: Json) => x.enum)?.enum;

describe("TypeScript contract mirrors the Python schema", () => {
  it("has the same top-level keys", () => {
    expect([...RESULT_KEYS].sort()).toEqual(Object.keys(s.properties).sort());
  });
  it("has the same enums", () => {
    expect([...RESULT_STATUSES]).toEqual(enumOf(s.properties.status));
    expect([...DATA_ORIGINS]).toEqual(enumOf(s.properties.data_origin));
    expect([...METRIC_STATUSES]).toEqual(enumOf(s.$defs.Metric.properties.status));
    expect([...VALIDATION_LEVELS]).toEqual(enumOf(s.$defs.Metric.properties.validation));
    expect([...METRIC_KEYS].sort()).toEqual(Object.keys(s.$defs.Metrics.properties).sort());
  });
});

describe("parseAnalysisResult", () => {
  it("accepts the shared fixtures and keeps their origin", () => {
    expect(parseAnalysisResult(testFixture).data_origin).toBe("test_fixture");
    const r = parseAnalysisResult(insufficient);
    expect(r.status).toBe("insufficient_data");
    expect(r.metrics.court_heatmap.value).toBeNull();
  });

  it("rejects results it cannot describe truthfully", () => {
    const bad = (patch: Json) => () => parseAnalysisResult({ ...structuredClone(testFixture), ...patch });
    expect(bad({ schema_version: "2.0" })).toThrow(ContractError);
    expect(bad({ status: "success" })).toThrow(ContractError);
    expect(bad({ data_origin: undefined })).toThrow(ContractError);
    const measuredWithoutValue = structuredClone(testFixture) as Json;
    measuredWithoutValue.metrics.court_heatmap.value = null;
    expect(() => parseAnalysisResult(measuredWithoutValue)).toThrow(/measured without a value/);
    const badBall = structuredClone(testFixture) as Json;
    badBall.ball_positions = [{ time_seconds: 1, bbox: [1, 2], confidence: 0.8 }];
    expect(() => parseAnalysisResult(badBall)).toThrow(/invalid ball box/);
    // The legacy /analyze/video payload is not a v1 result.
    expect(() => parseAnalysisResult({ duration_seconds: 6, frame_count: 180, heatmap: [], message: "Analysis complete" }))
      .toThrow(ContractError);
  });
});

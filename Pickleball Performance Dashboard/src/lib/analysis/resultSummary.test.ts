import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import insufficient from "../../../contracts/fixtures/analysis_result.insufficient.v1.json";
import { parseAnalysisResult } from "./contract";
import { resultSummary } from "./resultSummary";

describe("plain-language result summary", () => {
  it("does not present sample data as video findings", () => {
    expect(resultSummary(parseAnalysisResult(structuredClone(fixture)))).toBeNull();
    const demo = parseAnalysisResult(structuredClone(fixture)); demo.data_origin = "measured";
    demo.provenance.pipeline_version = "dev-mock";
    expect(resultSummary(demo)).toBeNull();
  });
  it("explains limited footage without inferring poor play", () => {
    const report = resultSummary(parseAnalysisResult(structuredClone(insufficient)))!;
    expect(report.unavailable.join(" ")).toMatch(/personalized practice|Personalized practice/);
    expect(report.nextStep).toBeTruthy();
    expect(report.needsReview).toContain("Player identity and the court overlay: check them against the video.");
  });
  it("keeps unvalidated shots and coaching distinct from observed detections", () => {
    const result = parseAnalysisResult(structuredClone(fixture)); result.data_origin = "measured";
    result.coverage.frames_with_ball_detections = 10;
    const report = resultSummary(result)!;
    expect(report.found.join(" ")).toMatch(/10 sampled frames/);
    expect(report.found.join(" ")).not.toMatch(/ball followed|accurate/i);
    expect(report.unavailable.join(" ")).toMatch(/Personalized practice/);
    expect(report.unavailable.join(" ")).toMatch(/technique/i);
  });
});

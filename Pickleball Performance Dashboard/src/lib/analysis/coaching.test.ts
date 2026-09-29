import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import { parseAnalysisResult, type AnalysisResultV1, type PositioningValue } from "./contract";
import { buildCoachingReport, coachingSpeechText, compareProgress, THRESHOLDS } from "./coaching";

function measured(patch?: (v: PositioningValue) => void): AnalysisResultV1 {
  const result = structuredClone(fixture);
  result.data_origin = "measured";
  result.provenance.detector = { name: "ultralytics-yolov8-person", confidence_is_model_score: true };
  const parsed = parseAnalysisResult(result);
  parsed.metrics.positioning.validation = "evaluated_on_real_footage";
  parsed.metrics.court_heatmap.validation = "evaluated_on_real_footage";
  if (patch && parsed.metrics.positioning.value) patch(parsed.metrics.positioning.value);
  return parsed;
}

function setBands(v: PositioningValue, bands: Partial<PositioningValue["fraction_of_mapped_time"]>) {
  const all = { behind_baseline: 0, baseline_area: 0, transition: 0, kitchen_line: 0, inside_kitchen: 0, ...bands };
  v.fraction_of_mapped_time = all;
  for (const [band, f] of Object.entries(all)) v.seconds[band as keyof typeof all] = f * v.mapped_time_s;
}

const titles = (r: AnalysisResultV1) => buildCoachingReport(r).focus.map((item) => item.title);

describe("gameplay feedback", () => {
  it("does not turn sample or motion detections into personalized coaching", () => {
    const sample = buildCoachingReport(parseAnalysisResult(fixture));
    expect(sample.available).toBe(false);
    expect(coachingSpeechText(sample)).toBe("");
    const motion = structuredClone(fixture);
    motion.data_origin = "measured";
    expect(buildCoachingReport(parseAnalysisResult(motion)).available).toBe(false);
  });

  it("withholds advice and speech for positioning evaluated only on synthetic footage", () => {
    const candidate = measured();
    candidate.metrics.positioning.validation = "synthetic_only";
    const report = buildCoachingReport(candidate);
    expect(report.available).toBe(false);
    expect(report.introduction).toMatch(/labelled real footage/);
    expect(coachingSpeechText(report)).toBe("");
  });

  it("withholds coaching when court calibration is poor", () => {
    const result = measured();
    if (result.calibration) result.calibration.quality = "poor";
    expect(buildCoachingReport(result).available).toBe(false);
  });

  it("withholds coaching when doubles make the selected player ambiguous", () => {
    const result = measured();
    if (result.player_selection) result.player_selection.ambiguous_frames = 60;
    expect(buildCoachingReport(result).available).toBe(false);
  });

  it("gives each focus area a drill, a measurable target and evidence", () => {
    const report = buildCoachingReport(measured());
    expect(report.available).toBe(true);
    expect(report.focus.length).toBeGreaterThan(0);
    expect(report.focus.length).toBeLessThanOrEqual(THRESHOLDS.maxFocusItems);
    for (const item of report.focus) {
      expect(item.drill?.how).toBeTruthy();
      expect(item.target).toMatch(/Next session/);
      expect(item.evidence).toMatch(/\d/);
    }
    expect(report.limitation).toMatch(/not from shots/);
  });

  it("flags time stuck in the transition area and praises a strong kitchen-line presence", () => {
    const r = measured((v) => {
      setBands(v, { baseline_area: 0.2, transition: 0.4, kitchen_line: 0.4 });
      v.median_approach_s = 1.5;
      v.approaches_to_kitchen_line = 3;
    });
    const report = buildCoachingReport(r);
    expect(report.focus.map((i) => i.title)).toEqual(["Move through the transition area"]);
    expect(report.strengths.map((i) => i.title)).toEqual(["Strong kitchen-line presence", "Quick approaches"]);
  });

  it("flags low kitchen-line time, slow approaches and standing inside the kitchen", () => {
    const r = measured((v) => {
      setBands(v, { baseline_area: 0.6, transition: 0.1, kitchen_line: 0.1, inside_kitchen: 0.2 });
      v.transition_lingers = 0;
      v.median_approach_s = 4;
      v.left_side_fraction = 0.5;
    });
    expect(titles(r)).toEqual([
      "Spend more time at the kitchen line", "Get to the kitchen line faster", "Recover behind the kitchen line",
    ]);
    expect(buildCoachingReport(r).strengths.map((i) => i.title)).toContain("Little time stuck mid-court");
  });

  it("says so when nothing stands out", () => {
    const r = measured((v) => {
      setBands(v, { baseline_area: 0.5, transition: 0.1, kitchen_line: 0.4 });
      v.transition_lingers = 0;
      v.median_approach_s = 2.5;
      v.left_side_fraction = 0.5;
    });
    const report = buildCoachingReport(r);
    expect(report.focus).toEqual([]);
    expect(report.introduction).toMatch(/No positioning issues/);
  });

  it("falls back to basic feedback for results saved before positioning existed", () => {
    const old = structuredClone(fixture) as Record<string, any>;
    old.data_origin = "measured";
    old.provenance.detector = { name: "ultralytics-yolov8-person", confidence_is_model_score: true };
    delete old.metrics.positioning;
    const result = parseAnalysisResult(old);
    expect(result.metrics.positioning.status).toBe("not_computed");
    const report = buildCoachingReport(result);
    expect(report.available).toBe(false);
    expect(report.introduction).toMatch(/labelled real footage/);
  });

  it("reads the drills and targets aloud", () => {
    const report = buildCoachingReport(measured());
    const speech = coachingSpeechText(report);
    expect(speech).toContain(report.focus[0].drill!.how);
    expect(speech).toContain(report.focus[0].target!);
  });
});

describe("progress between sessions", () => {
  it("reports better, worse and unchanged measures", () => {
    const before = measured((v) => {
      setBands(v, { baseline_area: 0.4, transition: 0.4, kitchen_line: 0.2 });
      v.median_approach_s = 4;
    });
    const after = measured((v) => {
      setBands(v, { baseline_area: 0.3, transition: 0.2, kitchen_line: 0.5 });
      v.median_approach_s = 4.1;
    });
    const rows = compareProgress(after, before)!;
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel["Time at the kitchen line"]).toMatchObject({ before: "20%", after: "50%", change: "better" });
    expect(byLabel["Time in the transition area"].change).toBe("better");
    expect(byLabel["Time inside the kitchen"].change).toBe("same");
    expect(byLabel["Median approach to the kitchen line"].change).toBe("same");
  });

  it("does not compare against a session that could not be coached", () => {
    const sample = parseAnalysisResult(fixture);
    expect(compareProgress(measured(), sample)).toBeNull();
  });
});

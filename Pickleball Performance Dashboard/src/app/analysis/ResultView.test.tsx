import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import testFixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import insufficient from "../../../contracts/fixtures/analysis_result.insufficient.v1.json";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { ResultView } from "./ResultView";
import type { SessionRow } from "../../lib/api/types";

afterEach(cleanup);

describe("ResultView", () => {
  it("labels test-fixture results so they cannot be mistaken for the player's data", () => {
    render(<ResultView result={parseAnalysisResult(testFixture)} videoUrl={null} />);
    expect(screen.getByText(/TEST DATA — NOT FROM YOUR VIDEO/)).toBeTruthy();
    expect(screen.getByText(/None\s+of the numbers below describe your video/)).toBeTruthy();
    expect(screen.getByText(/Coaching is unavailable for sample results/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play audio coaching" })).toBeNull();
  });

  it("shows provenance, coverage and per-metric status", () => {
    const measured = { ...structuredClone(testFixture), data_origin: "measured" };
    render(<ResultView result={parseAnalysisResult(measured)} videoUrl={null} />);
    expect(screen.getByText("MEASURED FROM THIS VIDEO")).toBeTruthy();
    expect(screen.getByText(testFixture.provenance.pipeline_version)).toBeTruthy();
    expect(screen.getByText("Share of video analyzed")).toBeTruthy();
    expect(screen.getByText("Player track IDs")).toBeTruthy();
    expect(screen.getByText("not available")).toBeTruthy(); // motion detector: no confidence
    expect(screen.getAllByText("Accuracy not yet evaluated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NOT COMPUTED").length).toBe(2); // rallies and shots
    expect(screen.getByText("WHOLE-CLIP METRICS")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Court heatmap/ })).toBeTruthy();
  });

  it("explains insufficient data instead of showing a heatmap", () => {
    render(<ResultView result={parseAnalysisResult(insufficient)} videoUrl={null} />);
    expect(screen.getAllByText("INSUFFICIENT DATA").length).toBe(3); // overall status + heatmap + positioning
    expect(screen.getAllByText(/Court not calibrated/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("img", { name: /Court heatmap/ })).toBeNull();
  });

  it("shows player goals separately from video findings", () => {
    const session = {
      improvement_goals: ["positioning", "shot_outcomes", "shot_technique"],
      positioning_rating: 3, shot_outcomes_rating: 2, shot_technique_rating: null,
    } as SessionRow;
    render(<ResultView result={parseAnalysisResult(insufficient)} videoUrl={null} session={session} />);
    expect(screen.getByText("Your goals and video evidence")).toBeTruthy();
    expect(screen.getByText("Court positioning · cannot assess from this analysis")).toBeTruthy();
    expect(screen.getByText("Shot outcomes · cannot assess from this analysis")).toBeTruthy();
    expect(screen.getByText(/Ball observations alone do not establish contact/)).toBeTruthy();
  });

  it("plays and stops the same evidence-based advice shown on screen", () => {
    const result = structuredClone(testFixture);
    result.data_origin = "measured";
    result.provenance.detector = { name: "ultralytics-yolov8-person", confidence_is_model_score: true };
    const speak = vi.fn();
    const cancel = vi.fn();
    class Utterance {
      text: string;
      lang = "";
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    const originalSpeech = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
    const originalUtterance = Object.getOwnPropertyDescriptor(window, "SpeechSynthesisUtterance");
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak, cancel } });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    try {
      render(<ResultView result={parseAnalysisResult(result)} videoUrl={null} />);
      expect(screen.getByText(/focus areas? for your next practice/)).toBeTruthy();
      expect(screen.getByText("Focus for your next session")).toBeTruthy();
      expect(screen.getAllByText(/^Drill:/).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "Play audio coaching" }));
      expect(speak).toHaveBeenCalledOnce();
      const utterance = speak.mock.calls[0][0] as Utterance;
      expect(utterance.text).toContain("Focus 1:");
      expect(utterance.text).toContain("Next session:");
      expect(utterance.text).toContain("Position estimates have not been validated");
      expect(screen.getByText(/Record and analyze another session/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Stop audio coaching" }));
      expect(cancel).toHaveBeenCalled();
    } finally {
      cleanup();
      if (originalSpeech) Object.defineProperty(window, "speechSynthesis", originalSpeech);
      else Reflect.deleteProperty(window, "speechSynthesis");
      if (originalUtterance) Object.defineProperty(window, "SpeechSynthesisUtterance", originalUtterance);
      else Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
    }
  });

  it("shows progress against an earlier coachable session", () => {
    const coachable = (kitchenLine: number) => {
      const r = structuredClone(testFixture);
      r.data_origin = "measured";
      r.provenance.detector = { name: "ultralytics-yolov8-person", confidence_is_model_score: true };
      const parsed = parseAnalysisResult(r);
      const v = parsed.metrics.positioning.value!;
      v.fraction_of_mapped_time = { ...v.fraction_of_mapped_time, kitchen_line: kitchenLine };
      return parsed;
    };
    render(<ResultView result={coachable(0.45)} videoUrl={null}
      previous={{ label: "Tuesday drills (2026-09-01)", result: coachable(0.2) }} />);
    expect(screen.getByText("Progress since Tuesday drills (2026-09-01)")).toBeTruthy();
    const row = screen.getByText("Time at the kitchen line").closest("tr")!;
    expect(row.textContent).toContain("20%");
    expect(row.textContent).toContain("45%");
    expect(row.textContent).toContain("Improved");
  });
});

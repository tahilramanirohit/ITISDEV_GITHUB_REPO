import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { CoachingPanel } from "./CoachingPanel";

afterEach(cleanup);

it("offers general practice without claiming personalized feedback or enabling coaching audio", () => {
  const result = parseAnalysisResult(structuredClone(fixture));result.data_origin = "measured";
  render(<CoachingPanel result={result} />);
  expect(screen.getByText("Personalized coaching is not ready yet")).toBeTruthy();
  expect(screen.getByText(/not a finding about your play/i)).toBeTruthy();
  fireEvent.click(screen.getByText("Optional general practice"));
  expect(screen.getByText("Drop-and-step")).toBeTruthy();
  expect(screen.queryByRole("button", { name:"Play audio coaching" })).toBeNull();
});

it("leads with one supported practice priority and keeps other ideas expandable", () => {
  const result = parseAnalysisResult(structuredClone(fixture));result.data_origin = "measured";
  result.provenance.detector = { name:"ultralytics-yolov8-person",confidence_is_model_score:true };
  result.metrics.positioning.validation = "evaluated_on_real_footage";
  result.metrics.court_heatmap.validation = "evaluated_on_real_footage";
  render(<CoachingPanel result={result} />);
  expect(screen.getByText("Start with this practice focus")).toBeTruthy();
  const more = screen.getByText(/More practice ideas/).closest("details")!;
  expect(more.open).toBe(false);
  fireEvent.click(screen.getByText(/More practice ideas/));
  expect(screen.getAllByText(/^Drill:/).length).toBeGreaterThan(1);
});

it("never turns fixture results into a personal or general practice report", () => {
  render(<CoachingPanel result={parseAnalysisResult(structuredClone(fixture))} />);
  expect(screen.queryByText("Optional general practice")).toBeNull();
  expect(screen.queryByText("Start with this practice focus")).toBeNull();
});

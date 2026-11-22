import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildSelfReport, type SelfProgressRow } from "../../lib/coaching/selfAssessment";
import { SelfReportView } from "./SelfReportView";

afterEach(() => { cleanup(); window.localStorage.clear(); });

const report = buildSelfReport({ ratings: { serve: 4, return: 3, third_shot: 2, dinking: 2, volleys: 4, kitchen_line: 3, consistency: 3, strategy: 3 }, goals: [] });

describe("Practice plan (less text)", () => {
  it("writes each drill out once, keeps the reasons behind Why? and shows only skills that changed", () => {
    const progress: SelfProgressRow[] = [
      { skill: "serve", label: "Serve", before: 3, after: 4, change: "better" },
      { skill: "dinking", label: "Dinking", before: 2, after: 2, change: "same" },
    ];
    const { container } = render(<SelfReportView report={report} progress={progress} onEdit={vi.fn()} planKey="s1" />);
    const drill = report.focus[0].drill;
    // The drill's steps appear once (under "Your next week"), not again in the focus card.
    expect(container.textContent!.split(drill.how).length - 1).toBe(1);
    expect(screen.getByText(`Drill: ${drill.name}`)).toBeTruthy();
    expect(screen.getByText(`${report.focus.length} things to practice before your next game.`)).toBeTruthy();
    expect(screen.getAllByText("Why?").length).toBeGreaterThan(0);
    expect(screen.getAllByText("How").length).toBeGreaterThan(0);
    expect(screen.queryByText(/This plan comes from your own ratings/)).toBeNull();
    expect(screen.getByText("From your own ratings, not measured.")).toBeTruthy();
    expect(screen.getByText("Serve")).toBeTruthy();
    expect(screen.queryByText("Dinking", { selector: "li span" })).toBeNull();
  });

  it("fills the week's checklist bar as steps are ticked", () => {
    render(<SelfReportView report={report} progress={null} onEdit={vi.fn()} planKey="s2" />);
    const bar = screen.getByRole("progressbar", { name: "Plan steps done" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuetext")).toBe(`1 of ${report.plan.length} done`);
  });
});

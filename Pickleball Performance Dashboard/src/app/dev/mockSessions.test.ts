import { describe, expect, it } from "vitest";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { buildCoachingReport, compareProgress } from "../../lib/analysis/coaching";
import { buildMockSessions, DEV_MOCK_PIPELINE } from "./mockSessions";

describe("dev mode mock sessions", () => {
  const sessions = buildMockSessions(new Date(2026, 8, 28));
  const results = sessions.map((s) => parseAnalysisResult(s.result));

  it("are valid v1 results, all marked as dev mock", () => {
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    for (const r of results) {
      expect(r.provenance.pipeline_version).toBe(DEV_MOCK_PIPELINE);
      expect(r.message).toMatch(/DEV MOCK DATA/);
    }
  });

  it("cover both an unusable clip and coachable sessions, oldest first", () => {
    expect(results[0].status).toBe("insufficient_data");
    expect(buildCoachingReport(results[0]).available).toBe(false);
    for (const r of results.slice(1)) expect(buildCoachingReport(r).available).toBe(true);
    const dates = sessions.map((s) => s.session_date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.at(-1)).toBe("2026-09-21");
  });

  it("show improvement from one practice session to the next", () => {
    const rows = compareProgress(results[3], results[2])!;
    const kitchen = rows.find((r) => r.label === "Time at the kitchen line")!;
    expect(kitchen.change).toBe("better");
  });
});

import { describe, expect, it } from "vitest";
import type { AnalysisJobRow, VideoAssetRow } from "../api/types";
import { analysisProgress, deriveAnalysisState, shouldPoll, stateDescription } from "./state";

const video = (upload_status: VideoAssetRow["upload_status"]) => ({ upload_status }) as VideoAssetRow;
const job = (status: AnalysisJobRow["status"], extra: Partial<AnalysisJobRow> = {}) =>
  ({ status, attempts: 0, max_attempts: 3, error_code: null, error_message: null, ...extra }) as AnalysisJobRow;

describe("deriveAnalysisState", () => {
  it.each([
    [{ video: null, job: null, result: null }, "not_uploaded"],
    [{ video: null, job: null, result: null, localUpload: { phase: "uploading" as const, progress: 0.3 } }, "uploading"],
    [{ video: video("pending"), job: null, result: null }, "upload_incomplete"],
    [{ video: video("uploaded"), job: job("queued"), result: null }, "queued"],
    [{ video: video("uploaded"), job: job("processing"), result: null }, "processing"],
    [{ video: video("uploaded"), job: job("failed"), result: null }, "failed"],
    [{ video: video("uploaded"), job: job("completed"), result: { result_status: "ok" as const } }, "completed"],
    [{ video: video("uploaded"), job: job("completed"), result: { result_status: "insufficient_data" as const } }, "insufficient_data"],
  ])("%j → %s", (input, expected) => {
    expect(deriveAnalysisState(input)).toBe(expected);
  });

  it("never reports completion without a result row", () => {
    expect(deriveAnalysisState({ video: video("uploaded"), job: job("completed"), result: null })).toBe("processing");
  });

  it("polls only while the worker owns the job", () => {
    expect(shouldPoll("queued")).toBe(true);
    expect(shouldPoll("processing")).toBe(true);
    for (const s of ["not_uploaded", "uploading", "upload_incomplete", "completed", "insufficient_data", "failed"] as const) {
      expect(shouldPoll(s)).toBe(false);
    }
  });

  it("explains retries and failures with the stored error", () => {
    expect(stateDescription("queued", job("queued", { attempts: 1, error_code: "download_failed" })))
      .toContain("attempt 2 of 3");
    // Players see a plain next step, not an error code.
    expect(stateDescription("failed", job("failed", { error_code: "unreadable_video", error_message: "codec" })))
      .toBe("Try saving or exporting it as an MP4 file, then upload it again.");
    expect(stateDescription("failed", job("failed", { error_code: "something_new" }))).toMatch(/Try re-running/);
  });
});

describe("analysisProgress", () => {
  const t0 = Date.parse("2026-09-30T10:00:00Z");
  const at = (s: number) => new Date(t0 + s * 1000).toISOString();

  it("shows a moving bar before the analyzer reports, or on a database without progress columns", () => {
    const p = analysisProgress(job("processing", { started_at: at(0) }), t0 + 600_000);
    expect(p).toEqual({ fraction: null, text: "Starting the analysis…", stale: false });
  });

  it("names the stage, the percentage and the time left from the pace so far", () => {
    const p = analysisProgress(job("processing", {
      started_at: at(0), progress: 0.25, progress_stage: "analyzing", progress_updated_at: at(120),
    }), t0 + 120_000);
    // A quarter done in 2 minutes: about 6 minutes to go.
    expect(p.fraction).toBe(0.25);
    expect(p.text).toBe("Finding the players, the court and the ball · 25% · about 6 min left");
    expect(p.stale).toBe(false);
  });

  it("does not guess the time left from too little progress", () => {
    const p = analysisProgress(job("processing", {
      started_at: at(0), progress: 0.03, progress_stage: "downloading", progress_updated_at: at(5),
    }), t0 + 5000);
    expect(p.text).toBe("Downloading your video to the analyzer · 3%");
  });

  it("warns when a reporting analyzer has gone quiet", () => {
    const p = analysisProgress(job("processing", {
      started_at: at(0), progress: 0.5, progress_stage: "analyzing", progress_updated_at: at(60),
    }), t0 + 60_000 + 4 * 60_000);
    expect(p.stale).toBe(true);
  });
});

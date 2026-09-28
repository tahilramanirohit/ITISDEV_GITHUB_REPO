import { describe, expect, it } from "vitest";
import type { AnalysisJobRow, VideoAssetRow } from "../api/types";
import { deriveAnalysisState, shouldPoll, stateDescription } from "./state";

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
    expect(stateDescription("failed", job("failed", { error_message: "The uploaded video was not found" })))
      .toBe("The uploaded video was not found");
  });
});

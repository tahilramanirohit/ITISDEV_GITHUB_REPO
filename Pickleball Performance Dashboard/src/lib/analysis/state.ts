import type { AnalysisJobRow, AnalysisResultRow, VideoAssetRow } from "../api/types";

export type AnalysisUiState =
  | "not_uploaded"
  | "uploading"
  | "upload_incomplete"
  | "queued"
  | "processing"
  | "completed"
  | "insufficient_data"
  | "failed";

export type LocalUpload = { phase: "uploading" | "finalizing"; progress: number } | null;

type Inputs = {
  video: VideoAssetRow | null;
  job: AnalysisJobRow | null;
  result: Pick<AnalysisResultRow, "result_status"> | null;
  localUpload?: LocalUpload;
};

/** Single place that turns stored rows into what the player is told. */
export function deriveAnalysisState({ video, job, result, localUpload }: Inputs): AnalysisUiState {
  if (localUpload) return "uploading";
  if (!video) return "not_uploaded";
  if (video.upload_status === "pending" || !job) return "upload_incomplete";
  switch (job.status) {
    case "queued":
      return "queued";
    case "processing":
      return "processing";
    case "failed":
      return "failed";
    case "completed":
      // The result row is written in the same transaction; if it is not visible
      // yet, keep polling rather than claiming completion without a result.
      if (!result) return "processing";
      return result.result_status === "insufficient_data" ? "insufficient_data" : "completed";
  }
}

export const shouldPoll = (s: AnalysisUiState) => s === "queued" || s === "processing";

export const STATE_LABELS: Record<AnalysisUiState, string> = {
  not_uploaded: "Needs video",
  uploading: "Uploading",
  upload_incomplete: "Upload incomplete",
  queued: "Waiting",
  processing: "Analyzing",
  completed: "Feedback ready",
  insufficient_data: "Limited result",
  failed: "Needs attention",
};

export function stateDescription(state: AnalysisUiState, job: AnalysisJobRow | null): string {
  switch (state) {
    case "not_uploaded":
      return "Choose a video of your play. Handheld and fixed-camera recordings are welcome.";
    case "uploading":
      return "Uploading directly to private storage. You can keep this tab open; an interrupted upload resumes if you select the same file again.";
    case "upload_incomplete":
      return "The upload did not finish. Select the same file to resume, or remove it and start over.";
    case "queued":
      return job && job.attempts > 0 && job.error_code
        ? `Waiting to retry (attempt ${job.attempts + 1} of ${job.max_attempts}). Last error: ${job.error_code}.`
        : "Your video is waiting for analysis. During development, keep the analyzer running on your computer.";
    case "processing":
      return "PicklePro is checking the video now. This page will update when the result is ready.";
    case "completed":
      return "Your result is ready. Review what the video shows and what to practice next.";
    case "insufficient_data":
      return "PicklePro checked the video, but could not reliably measure every skill. See what it could and could not assess below.";
    case "failed":
      return job?.error_message ?? "Analysis failed.";
  }
}

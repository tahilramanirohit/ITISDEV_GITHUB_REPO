import type { AnalysisResultV1 } from "./contract";
import { coachingBlocker, coachingNextStep } from "./coaching";

/** Observations are not claims that the detector or estimates are accurate. */
export function resultSummary(result: AnalysisResultV1) {
  if (result.data_origin !== "measured" || result.provenance.pipeline_version === "dev-mock") return null;
  const found: string[] = [];
  const needsReview = ["Player identity and the court overlay: check them against the video."];
  const unavailable = ["Shot success, in/out calls and technique are not assessed."];
  if (result.coverage.frames_with_detections > 0) {
    found.push(result.provenance.detector.confidence_is_model_score
      ? "Player detections are available to review." : "Movement was detected; it may not always be a player.");
  } else unavailable.push("No players were detected in the analyzed frames.");
  if (result.calibration) found.push("A court map was produced; check that its lines match your court.");
  else unavailable.push("The court could not be mapped.");
  const ballFrames = result.coverage.frames_with_ball_detections ?? 0;
  if (ballFrames > 0) found.push(`Ball positions were detected in ${ballFrames} sampled frames. This does not mean every contact was seen.`);
  else unavailable.push("Ball positions are not available for this result.");
  const shot = result.metrics.shot_classification;
  if (shot.value?.shots.length) needsReview.push(shot.validation === "evaluated_on_real_footage"
    ? "Named hits are estimates: use Watch to check the timing, hitter and type."
    : "Named hits are experimental: use Watch to check the timing, hitter and type.");
  else unavailable.push("No named hits are available. This does not mean no hits occurred.");
  if (coachingBlocker(result)) unavailable.push("Personalized practice feedback is not available yet.");
  if (result.coverage.fraction_of_video_analyzed != null && result.coverage.fraction_of_video_analyzed < .99)
    needsReview.push("Only part of this recording was analyzed; the findings do not cover the full video.");
  return { found, needsReview, unavailable, nextStep: coachingNextStep(result) };
}

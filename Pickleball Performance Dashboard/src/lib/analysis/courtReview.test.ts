import { describe, expect, it } from "vitest";
import { analysisJobParams, parseCourtProposal, updatedJobParams, validateCourtDraft, type CourtDraft } from "./courtReview";

const draft: CourtDraft = { image_width: 960, image_height: 540, points: [
  { landmark: "near_left_baseline", pixel: [130, 500] },
  { landmark: "near_right_baseline", pixel: [830, 500] },
  { landmark: "far_left_baseline", pixel: [370, 90] },
  { landmark: "far_right_baseline", pixel: [590, 90] },
] };

describe("court correction", () => {
  it("accepts spread, named points and rejects invalid corrections", () => {
    expect(validateCourtDraft(draft)).toBeNull();
    expect(parseCourtProposal(draft)).toEqual(draft);
    expect(validateCourtDraft({ ...draft, points: draft.points.slice(0, 3) })).toMatch(/four/);
    expect(validateCourtDraft({ ...draft, points: [...draft.points, draft.points[0]] })).toMatch(/different name/);
    expect(validateCourtDraft({ ...draft, points: draft.points.map((point) => ({ ...point, pixel: [20, 20] })) })).toMatch(/spread/);
    expect(validateCourtDraft({ ...draft, points: [{ ...draft.points[0], pixel: [-1, 20] }, ...draft.points.slice(1)] })).toMatch(/visible image/);
  });

  it("saves correction with a job and preserves or replaces it on reanalysis", () => {
    const correction = { calibration: draft, calibration_source: "user_confirmed" as const, calibration_frame_s: 2.4 };
    const saved = analysisJobParams({ selection: { method: "court_half", court_half: "near" } }, correction);
    expect(saved.calibration).toEqual(draft);
    expect(saved.calibration_frame_s).toBe(2.4);
    expect(updatedJobParams(saved, { selection: { method: "track_id", track_id: 5 } }, null, false))
      .toMatchObject({ calibration: draft, calibration_source: "user_confirmed", selection: { track_id: 5 } });
    expect(updatedJobParams(saved, {}, null, true).calibration).toBeUndefined();
  });
});

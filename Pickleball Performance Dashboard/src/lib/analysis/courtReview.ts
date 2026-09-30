/** Editable fixed-camera court map, stored in analysis job parameters. */
export const COURT_LANDMARKS = [
  "near_left_baseline", "near_center_baseline", "near_right_baseline",
  "near_left_kitchen", "near_center_kitchen", "near_right_kitchen",
  "far_left_kitchen", "far_center_kitchen", "far_right_kitchen",
  "far_left_baseline", "far_center_baseline", "far_right_baseline",
] as const;
export type CourtLandmark = (typeof COURT_LANDMARKS)[number];
export type CourtPoint = { landmark: CourtLandmark; pixel: [number, number] };
export type CourtDraft = { image_width: number; image_height: number; points: CourtPoint[] };
export type CourtConfirmation = {
  calibration: CourtDraft;
  calibration_source: "user_confirmed";
  calibration_frame_s: number;
};

export function analysisJobParams(options: object, court: CourtConfirmation): Record<string, unknown> {
  return { ...options, ...court };
}

export function updatedJobParams(saved: Record<string, unknown>, options: object,
  court: CourtConfirmation | null, automaticCourt: boolean): Record<string, unknown> {
  const next: Record<string, unknown> = { ...saved, ...options };
  if (automaticCourt) {
    delete next.calibration;
    delete next.calibration_source;
    delete next.calibration_frame_s;
  } else if (court) Object.assign(next, court);
  return next;
}

const world = (name: CourtLandmark): [number, number] => {
  const x = name.includes("_left_") ? 0 : name.includes("_right_") ? 6.096 : 3.048;
  const y = name.startsWith("near_") ? (name.endsWith("baseline") ? 0 : 4.572)
    : name.endsWith("baseline") ? 13.4112 : 8.8392;
  return [x, y];
};

function spread(points: [number, number][]): number {
  let best = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    for (let k = j + 1; k < points.length; k++) {
      const a = points[i], b = points[j], c = points[k];
      best = Math.max(best, Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2);
    }
  }
  return best;
}

export function validateCourtDraft(draft: CourtDraft): string | null {
  const { image_width: width, image_height: height, points } = draft;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 240) return "Choose a readable video frame first.";
  if (points.length < 4) return "Mark at least four named court points.";
  if (new Set(points.map((p) => p.landmark)).size !== points.length) return "Each court point needs a different name.";
  if (points.some((p) => !COURT_LANDMARKS.includes(p.landmark) || p.pixel.some((v) => !Number.isFinite(v)) ||
    p.pixel[0] < 0 || p.pixel[0] >= width || p.pixel[1] < 0 || p.pixel[1] >= height)) {
    return "Move every point onto the visible image.";
  }
  if (spread(points.map((p) => p.pixel)) < width * height * 0.005 ||
      spread(points.map((p) => world(p.landmark))) < 0.5) {
    return "Choose points spread across at least two court lines, not points along one line.";
  }
  return null;
}

export function parseCourtProposal(input: unknown): CourtDraft {
  if (!input || typeof input !== "object") throw new Error("Court preview was invalid.");
  const raw = input as Record<string, unknown>;
  const points = Array.isArray(raw.points) ? raw.points.filter((p): p is CourtPoint => {
    if (!p || typeof p !== "object") return false;
    const point = p as CourtPoint;
    return COURT_LANDMARKS.includes(point.landmark) && Array.isArray(point.pixel) && point.pixel.length === 2 &&
      point.pixel.every((v) => typeof v === "number" && Number.isFinite(v));
  }) : [];
  const draft = { image_width: Number(raw.image_width), image_height: Number(raw.image_height), points };
  const error = validateCourtDraft(draft);
  if (error) throw new Error(error);
  return draft;
}

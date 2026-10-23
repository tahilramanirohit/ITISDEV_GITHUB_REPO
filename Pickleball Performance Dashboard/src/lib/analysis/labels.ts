// Hand labels for scoring shot detection (server/picklepro/evaluate.py).
//
// File format (eval/*.labels.json):
//   { video, labelled_by, time_resolution_s, notes, players?, shots: [{ t, player, type, outcome?, note?, resolution_s? }] }
// `t` is the moment of contact in seconds. Labels made on the labelling page
// are frame-precise (time_resolution_s 0.1). Older files use whole seconds
// (time_resolution_s 1.0, "18" meaning 18.0-18.99 s); such shots keep
// `resolution_s: 1` until they are moved to an exact frame.

import { SHOT_TYPES, type AnalysisResultV1 } from "./contract";

export const LABEL_TYPES = [...SHOT_TYPES, "not_a_shot"] as const;
export type LabelType = (typeof LABEL_TYPES)[number];
export const OUTCOMES = ["fault", "error", "winner"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const PRECISE_RESOLUTION_S = 0.1;

export type ShotLabel = {
  id: string;
  t: number;
  player: number | null;
  type: LabelType;
  outcome?: Outcome;
  note?: string;
  /** Seconds covered by `t`; 1 for whole-second labels from older files. */
  resolution_s: number;
  /** A suggestion copied from PicklePro's detections, not yet confirmed by a person. */
  draft?: boolean;
};

export type LabelFile = {
  video: string;
  identity_scheme?: "human";
  labelled_by: string;
  time_resolution_s: number;
  notes: string;
  players?: Record<string, string>;
  /** Human player ID (1-9) to tracker ID in this one result. Missing means unverified. */
  tracker_mapping?: Record<string, number>;
  shots: { t: number; player: number | null; type: LabelType; outcome?: Outcome; note?: string; resolution_s?: number }[];
};

/** One key per shot type. Letters avoid the digits, which pick the player. */
export const TYPE_KEYS: Record<LabelType, string> = {
  serve: "s", return: "r", drive: "i", drop: "p", dink: "d", reset: "e", speed_up: "u", counter: "c",
  volley: "v", lob: "l", overhead: "o", erne: "n", not_a_shot: "x",
  unclassified: "h",
};

export const TYPE_NAMES: Record<LabelType, string> = {
  serve: "Serve", return: "Return", drive: "Drive", drop: "Drop", dink: "Dink", reset: "Reset", speed_up: "Speed-up",
  counter: "Counter", volley: "Volley", lob: "Lob", overhead: "Overhead", erne: "Erne", unclassified: "Unclassified", not_a_shot: "Not a shot",
};

export function typeForKey(key: string): LabelType | null {
  const k = key.toLowerCase();
  return (Object.keys(TYPE_KEYS) as LabelType[]).find((t) => TYPE_KEYS[t] === k) ?? null;
}

let counter = 0;
export const newId = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

export const sortLabels = (labels: ShotLabel[]) => [...labels].sort((a, b) => a.t - b.t || (a.player ?? 0) - (b.player ?? 0));

/** Snap a time to the nearest frame, so labels match what was on screen. */
export function snapToFrame(t: number, fps: number): number {
  if (!(fps > 0)) return Math.round(t * 1000) / 1000;
  return Math.round(Math.round(t * fps) / fps * 1000) / 1000;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export class LabelFileError extends Error {}

/** Read a labels file, accepting the older whole-second files. */
export function parseLabelFile(input: unknown): { labels: ShotLabel[]; meta: Omit<LabelFile, "shots"> } {
  if (!isObj(input) || !Array.isArray(input.shots)) throw new LabelFileError("Not a labels file: expected a \"shots\" list.");
  const fileRes = typeof input.time_resolution_s === "number" && input.time_resolution_s > 0 ? input.time_resolution_s : 1;
  const labels = input.shots.map((raw, i): ShotLabel => {
    if (!isObj(raw)) throw new LabelFileError(`Shot ${i + 1}: expected an object.`);
    const t = raw.t;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) throw new LabelFileError(`Shot ${i + 1}: "t" must be a time in seconds.`);
    const type = raw.type === "third_shot_drop" ? "drop" : raw.type === "third_shot_drive" ? "drive" : raw.type;
    if (!(LABEL_TYPES as readonly unknown[]).includes(type)) throw new LabelFileError(`Shot ${i + 1}: unknown type "${String(raw.type)}".`);
    const player = raw.player == null ? null : raw.player;
    if (player !== null && (typeof player !== "number" || !Number.isInteger(player))) {
      throw new LabelFileError(`Shot ${i + 1}: "player" must be a number or null.`);
    }
    const outcome = (OUTCOMES as readonly unknown[]).includes(raw.outcome) ? (raw.outcome as Outcome) : undefined;
    const res = typeof raw.resolution_s === "number" && raw.resolution_s > 0 ? raw.resolution_s : fileRes;
    return {
      id: newId(), t, player, type: type as LabelType, outcome,
      note: typeof raw.note === "string" && raw.note ? raw.note : undefined,
      resolution_s: res,
    };
  });
  const players = isObj(input.players)
    ? Object.fromEntries(Object.entries(input.players).filter(([, v]) => typeof v === "string")) as Record<string, string>
    : undefined;
  const tracker_mapping = isObj(input.tracker_mapping)
    ? Object.fromEntries(Object.entries(input.tracker_mapping).filter(([k, v]) => /^[1-9]$/.test(k) && typeof v === "number" && Number.isInteger(v))) as Record<string, number>
    : undefined;
  return {
    labels: sortLabels(labels),
    meta: {
      video: typeof input.video === "string" ? input.video : "",
      labelled_by: typeof input.labelled_by === "string" ? input.labelled_by : "",
      time_resolution_s: PRECISE_RESOLUTION_S,
      notes: typeof input.notes === "string" ? input.notes : "",
      identity_scheme: input.identity_scheme === "human" ? "human" : undefined,
      players,
      tracker_mapping,
    },
  };
}

/** The file to save. Unconfirmed suggestions are left out. */
export function toLabelFile(labels: ShotLabel[], meta: Omit<LabelFile, "shots" | "time_resolution_s">): LabelFile {
  const shots = sortLabels(labels.filter((l) => !l.draft)).map((l) => {
    const out: LabelFile["shots"][number] = { t: Math.round(l.t * 1000) / 1000, player: l.player, type: l.type };
    if (l.outcome) out.outcome = l.outcome;
    if (l.note) out.note = l.note;
    if (l.resolution_s > PRECISE_RESOLUTION_S + 1e-9) out.resolution_s = l.resolution_s;
    return out;
  });
  const players = meta.players && Object.keys(meta.players).length ? meta.players : undefined;
  const tracker_mapping = meta.tracker_mapping && Object.keys(meta.tracker_mapping).length ? meta.tracker_mapping : undefined;
  return { video: meta.video, labelled_by: meta.labelled_by, time_resolution_s: PRECISE_RESOLUTION_S, notes: meta.notes,
    ...(meta.identity_scheme === "human" ? { identity_scheme: "human" as const } : {}),
    ...(players ? { players } : {}), ...(tracker_mapping ? { tracker_mapping } : {}), shots };
}

/** PicklePro's detected shots as unconfirmed suggestions, so labelling starts from something. */
export function draftsFromResult(result: AnalysisResultV1, existing: ShotLabel[], fps: number,
  trackerMapping: Record<string, number> = {}): ShotLabel[] {
  const shots = result.metrics.shot_classification.value?.shots ?? [];
  return shots
    .filter((s) => !existing.some((l) => Math.abs(l.t - s.time_seconds) < 0.3))
    .map((s) => ({
      id: newId(), t: snapToFrame(s.time_seconds, fps),
      player: Number(Object.entries(trackerMapping).find(([, trackId]) => trackId === s.hitter_track_id)?.[0]) || null,
      type: s.shot_type,
      resolution_s: PRECISE_RESOLUTION_S, draft: true,
    }));
}

/** Player boxes (and IDs) nearest to a time, from a PicklePro result. */
export function boxesAt(result: AnalysisResultV1 | null, t: number, tolerance = 0.25) {
  const snaps = result?.player_positions ?? [];
  if (!snaps.length) return [];
  let lo = 0, hi = snaps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (snaps[mid].time_seconds < t) lo = mid + 1; else hi = mid;
  }
  const best = [snaps[lo], snaps[lo - 1]].filter(Boolean).sort((a, b) => Math.abs(a.time_seconds - t) - Math.abs(b.time_seconds - t))[0];
  return best && Math.abs(best.time_seconds - t) <= tolerance ? best.players : [];
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

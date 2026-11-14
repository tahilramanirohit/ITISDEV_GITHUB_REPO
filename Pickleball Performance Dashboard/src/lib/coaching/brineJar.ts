/**
 * The brine jar on Progress. Pickle grows one size when a rated session beats the one
 * before (as in pickleGrowth), and the jar adds a second way to grow: every session fills
 * it with brine (rating it, filming it, ticking plan steps), and a full jar grows Pickle
 * one size and starts empty again. A rough game shrinks Pickle but never drains the jar.
 */
import { PICKLE_SIZES, SAME_WITHIN, START_SIZE, scaleFor, type GrowthStep } from "./pickleGrowth";
import { weekStart } from "./sessionWeeks";

/** Brine (percent of a jar) each thing adds. */
export const BRINE = { rated: 20, video: 30, planStep: 5 } as const;
/** Plan steps count up to this many per session (3 × 5% = the 15% quest). */
export const PLAN_STEPS_COUNTED = 3;

export type JarSession = {
  date: string;
  /** Average self-rating, or null when the session isn't rated. */
  overall: number | null;
  /** The video for this session was analyzed. */
  analyzed: boolean;
  /** Practice plan steps ticked off for this session. */
  planSteps: number;
};

export type JarEvent = { step: GrowthStep; from: number; to: number } | { step: "jar" };

export type PickleJar = {
  size: number;
  name: string;
  /** The next size's name, or null when Pickle is fully grown. */
  nextName: string | null;
  previousSize: number;
  /** Brine in the jar now, 0–100. */
  brine: number;
  previousBrine: number;
  /** What the latest session did; "jar" means a full jar grew Pickle. Null before anything happened. */
  last: JarEvent | null;
  scale: number;
  previousScale: number;
};

const clamp = (n: number) => Math.max(1, Math.min(PICKLE_SIZES.length, n));
export const brineFor = (s: JarSession) =>
  (s.overall != null ? BRINE.rated : 0) + (s.analyzed ? BRINE.video : 0) + Math.min(s.planSteps, PLAN_STEPS_COUNTED) * BRINE.planStep;

/** Pickle's size and jar from the sessions, oldest first. Ratings compare as in pickleGrowth. */
export function pickleJar(sessions: readonly JarSession[], baseline: number | null = null): PickleJar {
  const max = PICKLE_SIZES.length;
  let size = START_SIZE, brine = 0, previousSize = START_SIZE, previousBrine = 0;
  let before = baseline;
  let last: JarEvent | null = null;
  for (const s of sessions) {
    previousSize = size;
    previousBrine = brine;
    let event: JarEvent | null = null;
    if (s.overall != null) {
      if (before != null) {
        const diff = Math.round((s.overall - before) * 10) / 10;
        const step: GrowthStep = diff >= SAME_WITHIN ? "grew" : diff <= -SAME_WITHIN ? "shrank" : "same";
        size = clamp(size + (step === "grew" ? 1 : step === "shrank" ? -1 : 0));
        event = { step, from: before, to: s.overall };
      }
      before = s.overall;
    }
    brine += brineFor(s);
    if (brine >= 100 && size < max) {
      size += 1;
      brine -= 100;
      event = { step: "jar" };
    }
    if (size === max) brine = Math.min(brine, 100);
    if (event) last = event;
  }
  return {
    size, name: PICKLE_SIZES[size - 1].name, nextName: size < max ? PICKLE_SIZES[size].name : null,
    previousSize, brine, previousBrine, last, scale: scaleFor(size), previousScale: scaleFor(previousSize),
  };
}

export type Quest = { id: "rate" | "video" | "plan"; brine: number; done: boolean; progress?: { now: number; of: number } };

/** This week's three quests, from sessions dated this week (Monday to Sunday). */
export function weeklyQuests(sessions: readonly JarSession[], today: string): Quest[] {
  const week = weekStart(today);
  const thisWeek = sessions.filter((s) => weekStart(s.date) === week);
  const steps = Math.min(PLAN_STEPS_COUNTED, thisWeek.reduce((n, s) => n + s.planSteps, 0));
  return [
    { id: "rate", brine: BRINE.rated, done: thisWeek.some((s) => s.overall != null) },
    { id: "video", brine: BRINE.video, done: thisWeek.some((s) => s.analyzed) },
    { id: "plan", brine: BRINE.planStep * PLAN_STEPS_COUNTED, done: steps >= PLAN_STEPS_COUNTED, progress: { now: steps, of: PLAN_STEPS_COUNTED } },
  ];
}

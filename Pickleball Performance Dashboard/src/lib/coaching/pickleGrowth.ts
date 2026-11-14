/**
 * The growing pickle on Progress: Pickle gets one size bigger each time a rated session
 * beats the one before it, and one size smaller when it drops. Ratings within ±0.1
 * count as the same, so Pickle keeps its size.
 */

export const PICKLE_SIZES = [
  { size: 1, name: "Tiny gherkin" },
  { size: 2, name: "Gherkin" },
  { size: 3, name: "Baby dill" },
  { size: 4, name: "Dill" },
  { size: 5, name: "Big dill" },
  { size: 6, name: "Mega pickle" },
  { size: 7, name: "Giant pickle" },
] as const;
export const START_SIZE = 3;
/** A change smaller than this is "the same". */
export const SAME_WITHIN = 0.1;

export type GrowthStep = "grew" | "shrank" | "same";
export type PickleGrowth = {
  size: number;
  name: string;
  /** The size before the latest session, for the grow or shrink animation. */
  previousSize: number;
  /** What the latest session did, or null before there are two ratings to compare. */
  last: { step: GrowthStep; from: number; to: number } | null;
  /** Every session's step, oldest first. */
  history: GrowthStep[];
  /** Picture scale for a size: 0.55 at the smallest, 1.15 at the biggest. */
  scale: number;
  previousScale: number;
};

const clamp = (n: number) => Math.max(1, Math.min(PICKLE_SIZES.length, n));
export const scaleFor = (size: number) => Math.round((0.55 + (clamp(size) - 1) * 0.1) * 100) / 100;

/**
 * Pickle's size from the session ratings, oldest first. The first session is compared
 * with the baseline when there is one; without a baseline it just sets the starting point.
 */
export function pickleGrowth(ratings: readonly number[], baseline: number | null = null): PickleGrowth {
  let size = START_SIZE;
  let previousSize = START_SIZE;
  let last: PickleGrowth["last"] = null;
  const history: GrowthStep[] = [];
  let before = baseline;
  for (const rating of ratings) {
    if (before != null) {
      const diff = Math.round((rating - before) * 10) / 10;
      const step: GrowthStep = diff >= SAME_WITHIN ? "grew" : diff <= -SAME_WITHIN ? "shrank" : "same";
      previousSize = size;
      size = clamp(size + (step === "grew" ? 1 : step === "shrank" ? -1 : 0));
      history.push(step);
      last = { step, from: before, to: rating };
    }
    before = rating;
  }
  return {
    size, name: PICKLE_SIZES[size - 1].name, previousSize, last, history,
    scale: scaleFor(size), previousScale: scaleFor(previousSize),
  };
}

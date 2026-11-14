import { describe, expect, it } from "vitest";
import { PICKLE_SIZES, START_SIZE, pickleGrowth, scaleFor } from "./pickleGrowth";

describe("growing pickle", () => {
  it("grows when a session beats the one before and shrinks when it drops", () => {
    const g = pickleGrowth([2.8, 3.1, 3.4, 3.0], 2.6);
    expect(g.history).toEqual(["grew", "grew", "grew", "shrank"]);
    expect(g.size).toBe(START_SIZE + 2);
    expect(g.previousSize).toBe(START_SIZE + 3);
    expect(g.last).toEqual({ step: "shrank", from: 3.4, to: 3.0 });
    expect(g.name).toBe("Big dill");
  });

  it("keeps its size for the same rating, within 0.1", () => {
    const g = pickleGrowth([3.0, 3.05, 3.0]);
    expect(g.history).toEqual(["same", "same"]);
    expect(g.size).toBe(START_SIZE);
  });

  it("starts at Baby dill and compares the first session only with a baseline", () => {
    expect(pickleGrowth([]).name).toBe("Baby dill");
    expect(pickleGrowth([3.2]).last).toBeNull();
    expect(pickleGrowth([3.2], 3.0).last?.step).toBe("grew");
  });

  it("never grows past the biggest size or shrinks below the smallest", () => {
    expect(pickleGrowth([1, 2, 3, 4, 5, 5.5, 6, 7, 8]).size).toBe(PICKLE_SIZES.length);
    expect(pickleGrowth([5, 4, 3, 2, 1, 0.5, 0]).size).toBe(1);
    expect(scaleFor(1)).toBe(0.55);
    expect(scaleFor(7)).toBe(1.15);
  });
});

import { describe, expect, it } from "vitest";
import { START_SIZE } from "./pickleGrowth";
import { brineFor, pickleJar, weeklyQuests, type JarSession } from "./brineJar";

const s = (date: string, overall: number | null, analyzed = false, planSteps = 0): JarSession => ({ date, overall, analyzed, planSteps });

describe("brine jar", () => {
  it("adds 20% for a rating, 30% for a video and 5% per plan step (up to 3)", () => {
    expect(brineFor(s("2026-11-10", 3.5))).toBe(20);
    expect(brineFor(s("2026-11-10", 3.5, true))).toBe(50);
    expect(brineFor(s("2026-11-10", null, false, 9))).toBe(15);
  });

  it("grows Pickle a size when the jar fills, and keeps the extra brine", () => {
    // Same rating both times, so only the jar can grow Pickle: 50 + 65 = 115.
    const j = pickleJar([s("2026-11-03", 3.5, true), s("2026-11-05", 3.5, true, 3)]);
    expect(j.size).toBe(START_SIZE + 1);
    expect(j.brine).toBe(15);
    expect(j.last).toEqual({ step: "jar" });
    expect(j.nextName).toBe("Big dill");
  });

  it("still grows and shrinks with the rating, and a rough game doesn't drain the jar", () => {
    const j = pickleJar([s("2026-11-03", 3.0), s("2026-11-05", 3.4), s("2026-11-07", 3.0)], 2.8);
    expect(j.size).toBe(START_SIZE + 1); // grew, grew, shrank
    expect(j.brine).toBe(60);
    expect(j.last).toEqual({ step: "shrank", from: 3.4, to: 3.0 });
    expect(j.previousBrine).toBe(40);
  });

  it("stops at the biggest size with a full jar", () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`2026-10-${String(i + 1).padStart(2, "0")}`, 3, true, 3));
    const j = pickleJar(many);
    expect(j.size).toBe(7);
    expect(j.brine).toBe(100);
    expect(j.nextName).toBeNull();
  });

  it("lists this week's quests from sessions since Monday", () => {
    const q = weeklyQuests([s("2026-11-07", 3.2, true, 3), s("2026-11-10", 3.4, false, 2)], "2026-11-12");
    expect(q.map((x) => [x.id, x.done])).toEqual([["rate", true], ["video", false], ["plan", false]]);
    expect(q[2].progress).toEqual({ now: 2, of: 3 });
  });
});

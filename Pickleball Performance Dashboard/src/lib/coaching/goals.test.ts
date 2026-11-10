import { describe, expect, it } from "vitest";
import { daysSince, goalDueDate, goalProgress, goalTargets, goalWeeks, weeksLabel } from "./goals";

describe("goal targets from the baseline", () => {
  it("picks the two lowest skills and aims one point higher", () => {
    const goals = goalTargets({ serve: 3, dinking: 2, third_shot: 2, consistency: 4 }, [], "2026-09-12T10:00:00Z");
    expect(goals.map((g) => [g.skill, g.from, g.target])).toEqual([["third_shot", 2, 3], ["dinking", 2, 3]]);
    expect(goals[0].due).toBe("2026-10-10");
  });

  it("breaks ties with the player's chosen focus", () => {
    const goals = goalTargets({ serve: 2, kitchen_line: 2, consistency: 2 }, ["positioning"]);
    expect(goals[0].skill).toBe("kitchen_line");
    expect(goals[0].due).toBeNull();
  });

  it("skips skills already at 5 and handles no baseline", () => {
    expect(goalTargets({ serve: 5, dinking: 5 })).toEqual([]);
    expect(goalTargets(undefined)).toEqual([]);
  });
});

describe("goal progress", () => {
  it("measures from the baseline to the target", () => {
    expect(goalProgress({ from: 2, target: 3 }, 2.5)).toEqual({ fraction: 0.5, reached: false });
    expect(goalProgress({ from: 2, target: 3 }, 3)).toEqual({ fraction: 1, reached: true });
    expect(goalProgress({ from: 2, target: 3 }, 1)).toEqual({ fraction: 0, reached: false });
    expect(goalProgress({ from: 2, target: 3 }, null)).toEqual({ fraction: 0, reached: false });
  });

  it("dates goals four weeks out and counts days since", () => {
    expect(goalDueDate("bad")).toBeNull();
    expect(goalDueDate("2026-10-01T00:00:00Z", 9)).toBe("2026-11-07");
    expect(goalTargets({ serve: 2 }, [], "2026-10-01T00:00:00Z", 9)[0].due).toBe("2026-11-07");
    expect(daysSince("2026-10-01T00:00:00Z", Date.parse("2026-10-29T12:00:00Z"))).toBe(28);
  });
});

describe("goal length", () => {
  it("is the player's number of weeks, 4 by default", () => {
    expect(goalDueDate("2026-10-01T00:00:00Z", 0, 1)).toBe("2026-10-08");
    expect(goalDueDate("2026-10-01T00:00:00Z", 2, 2)).toBe("2026-10-17");
    expect(goalTargets({ serve: 2 }, [], "2026-10-01T00:00:00Z", 0, 6)[0].due).toBe("2026-11-12");
    expect([goalWeeks(2), goalWeeks(undefined), goalWeeks(0), goalWeeks(53), goalWeeks(1.5)]).toEqual([2, 4, 4, 4, 4]);
    expect([weeksLabel(1), weeksLabel(3)]).toEqual(["1 week", "3 weeks"]);
  });
});

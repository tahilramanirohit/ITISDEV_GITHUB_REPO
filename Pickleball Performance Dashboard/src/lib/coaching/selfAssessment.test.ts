import { describe, expect, it } from "vitest";
import { buildSelfReport, compareSelfRatings, levelLabel, parseRatings, skillsMentioned } from "./selfAssessment";

describe("self-assessment report", () => {
  it("needs a few rated skills before giving a plan", () => {
    const report = buildSelfReport({ ratings: { serve: 3, dinking: 2 }, goals: [] });
    expect(report.available).toBe(false);
    expect(report.focus).toEqual([]);
  });

  it("focuses on the lowest-rated skills and lists strengths separately", () => {
    const report = buildSelfReport({ ratings: { serve: 5, return: 4, dinking: 1, volleys: 3, footwork: 2 }, goals: [] });
    expect(report.available).toBe(true);
    expect(report.focus.map((f) => f.skill)).toEqual(["dinking", "footwork", "volleys"]);
    expect(report.focus[0].target).toContain("2/5");
    expect(report.strengths.map((s) => s.skill)).toEqual(["serve", "return"]);
    expect(report.overall).toBe(3);
    expect(report.level).toBe("Developing");
    expect(report.plan.at(-1)?.title).toBe("Rate yourself again");
  });

  it("raises skills that match the chosen goals, the player's words, and many errors", () => {
    const base = { serve: 3, dinking: 3, kitchen_line: 3, consistency: 3, strategy: 3 } as const;
    expect(buildSelfReport({ ratings: base, goals: ["positioning"] }).focus[0].skill).toBe("kitchen_line");
    expect(buildSelfReport({ ratings: base, goals: [], biggestStruggle: "My dinks kept popping up" }).focus[0].skill).toBe("dinking");
    const errors = buildSelfReport({ ratings: base, goals: [], unforcedErrors: "many" });
    expect(errors.focus[0].skill).toBe("consistency");
    expect(errors.focus[0].reasons).toContain("you made many unforced errors");
  });

  it("never picks a 5/5 skill as a focus", () => {
    const report = buildSelfReport({ ratings: { serve: 5, return: 5, dinking: 5 }, goals: ["shot_technique"] });
    expect(report.focus).toEqual([]);
    expect(report.plan).toEqual([]);
    expect(report.introduction).toContain("5/5");
  });

  it("mentions the games record when given", () => {
    const report = buildSelfReport({ ratings: { serve: 3, dinking: 2, volleys: 4 }, goals: [], gamesPlayed: 5, gamesWon: 3 });
    expect(report.introduction).toContain("3 of 5 games");
  });
});

describe("helpers", () => {
  it("matches keywords at word starts only", () => {
    expect(skillsMentioned("my third shot drop and returns")).toEqual(expect.arrayContaining(["third_shot", "return"]));
    expect(skillsMentioned("I was undinkable")).not.toContain("dinking");
    expect(skillsMentioned(null)).toEqual([]);
  });

  it("compares skills rated in both sessions", () => {
    expect(compareSelfRatings({ serve: 4, dinking: 2, volleys: 3 }, { serve: 3, dinking: 2, footwork: 1 })).toEqual([
      { skill: "serve", label: "Serve", before: 3, after: 4, change: "better" },
      { skill: "dinking", label: "Dinking", before: 2, after: 2, change: "same" },
    ]);
  });

  it("drops invalid stored ratings", () => {
    expect(parseRatings({ serve: 3, dinking: 7, volleys: 2.5, unknown: 3, footwork: "4" })).toEqual({ serve: 3 });
    expect(parseRatings(null)).toEqual({});
    expect(parseRatings([1, 2])).toEqual({});
  });

  it("labels levels", () => {
    expect(levelLabel(1.8)).toBe("Building foundations");
    expect(levelLabel(4.5)).toBe("Advanced");
  });
});

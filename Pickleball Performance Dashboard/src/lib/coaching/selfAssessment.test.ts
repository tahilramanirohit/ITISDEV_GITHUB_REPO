import { describe, expect, it } from "vitest";
import { SELF_SKILLS, SKILL_INFO, buildSelfReport, compareSelfRatings, levelLabel, parseRatings, parseShotResults, skillsMentioned, successToRating } from "./selfAssessment";
import { RECOVERY_PLAN } from "./injury";

describe("plan after a hard session", () => {
  it("is shorter and starts at an easy pace when soreness or effort was high", () => {
    const ratings = { serve: 3, dinking: 2, consistency: 4 } as const;
    const normal = buildSelfReport({ ratings, goals: [] });
    const light = buildSelfReport({ ratings, goals: [], recovery: { soreness: 4, exertion: null } });
    expect(normal.plan[0].detail).toMatch(/^15 minutes/);
    expect(light.plan[0].detail).toMatch(/^Easy pace, 10 minutes/);
    expect(light.introduction).toMatch(/plan is lighter/);
    expect(buildSelfReport({ ratings, goals: [], recovery: { soreness: 2, exertion: 5 } }).plan[0].detail).toMatch(/^15 minutes/);
  });
});

describe("plan while injured", () => {
  it("is a rest plan, keeps the skills for later and says why", () => {
    const report = buildSelfReport({ ratings: { serve: 3, dinking: 2, consistency: 4 }, goals: [], injured: true });
    expect(report.plan.map((p) => p.title)).toEqual(RECOVERY_PLAN.map((p) => p.title));
    expect(report.focus.length).toBeGreaterThan(0);
    expect(report.introduction).toMatch(/rest plan/);
  });
});

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

describe("shots as successes out of 10", () => {
  it("map to the 1-5 scale in pairs: 0-2 → 1, 3-4 → 2, 5-6 → 3, 7-8 → 4, 9-10 → 5", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(successToRating)).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(successToRating(14)).toBe(5);
    expect(successToRating(-2)).toBe(1);
  });

  it("keep only counted shots with whole numbers from 0 to 10", () => {
    expect(parseShotResults({ serve: 7, dinking: 11, volleys: 2.5, strategy: 3, nope: 4, return: 0 })).toEqual({ serve: 7, return: 0 });
    expect(parseShotResults(null)).toEqual({});
  });

  it("every skill explains itself, and only shots are counted", () => {
    for (const skill of SELF_SKILLS) expect(SKILL_INFO[skill].meaning.length).toBeGreaterThan(20);
    expect(SELF_SKILLS.filter((s) => SKILL_INFO[s].success)).toEqual(SELF_SKILLS.filter((s) => SKILL_INFO[s].group === "Shots"));
  });

  it("quotes the count in the plan", () => {
    const report = buildSelfReport({ ratings: { serve: 2, dinking: 4, consistency: 4 }, goals: [], shotResults: { serve: 3 } });
    expect(report.focus.find((f) => f.skill === "serve")?.observation).toBe("You got 3 of 10 serves in.");
  });
});

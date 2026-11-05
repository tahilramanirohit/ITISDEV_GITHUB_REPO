import { describe, expect, it } from "vitest";
import { aboutPlayer, askSkillOrder, comparePeer, latestPeerBySkill, peerLowerSkills, type PeerRating } from "./peerFeedback";
import { buildSelfReport, SELF_SKILLS } from "./selfAssessment";

const r = (author: string, skill: PeerRating["skill"], rating: number, updated_at = "2026-11-01"): PeerRating =>
  ({ author_id: author.toLowerCase(), author_name: author, skill, rating, updated_at });

describe("peer feedback", () => {
  it("words the skill questions about the other player", () => {
    expect(aboutPlayer("How reliable and deep were your serves?", "Sam")).toBe("How reliable and deep were Sam's serves?");
    expect(aboutPlayer("Were your returns deep, and did you get forward after them?", "Sam"))
      .toBe("Were Sam's returns deep, and did Sam get forward after them?");
  });

  it("offers goal skills first when asking", () => {
    const order = askSkillOrder(["dinking", "third_shot"]);
    expect(order.slice(0, 2)).toEqual(["dinking", "third_shot"]);
    expect(order).toHaveLength(SELF_SKILLS.length);
  });

  it("compares self and peer ratings skill by skill", () => {
    const rows = comparePeer({ dinking: 4, serve: 3 }, [r("Kyle", "dinking", 2), r("Kyle", "serve", 4), r("Kyle", "volleys", 3)], "kyle");
    expect(rows.map((x) => [x.skill, x.tone, x.line])).toEqual([
      ["dinking", "lower", "Kyle rated this 2 lower than you"],
      ["serve", "higher", "Kyle rated this 1 higher than you"],
      ["volleys", "none", "You did not rate this skill for this session"],
    ]);
  });

  it("finds skills a partner rated at least 1 lower, biggest gap first", () => {
    const lower = peerLowerSkills({ dinking: 4, serve: 3, volleys: 4 },
      [r("Kyle", "dinking", 3), r("Kyle", "serve", 3), r("Ana", "volleys", 1), r("Ana", "dinking", 2)]);
    expect(lower).toEqual([
      { skill: "volleys", by: "Ana", peer: 1, self: 4 },
      { skill: "dinking", by: "Ana", peer: 2, self: 4 },
    ]);
  });

  it("makes a skill the partner rated lower the plan's first focus, and says why", () => {
    const ratings = { serve: 2, dinking: 4, volleys: 3, consistency: 3 } as const;
    expect(buildSelfReport({ ratings, goals: [] }).focus[0].skill).toBe("serve");
    const report = buildSelfReport({ ratings, goals: [], peerLower: [{ skill: "dinking", by: "Kyle", peer: 2 }] });
    expect(report.focus[0].skill).toBe("dinking");
    expect(report.focus[0].reasons[0]).toBe("Kyle rated it 2/5, lower than you did");
    expect(report.peerNote).toBe("Kyle rated your dinking 2/5, lower than your 4/5, so it stays your first focus.");
    expect(buildSelfReport({ ratings, goals: [] }).peerNote).toBeNull();
  });

  it("keeps the latest peer rating of each skill for Progress", () => {
    expect(latestPeerBySkill([
      { skill: "dinking", rating: 2, updated_at: "2026-10-01" }, { skill: "dinking", rating: 3, updated_at: "2026-11-01" },
      { skill: "lobs", rating: 5, updated_at: "2026-11-01" },
    ])).toEqual({ dinking: 3 });
  });
});

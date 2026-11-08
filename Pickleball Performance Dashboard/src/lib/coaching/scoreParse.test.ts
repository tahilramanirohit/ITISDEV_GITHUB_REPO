import { describe, expect, it } from "vitest";
import { parseGameScore } from "./scoreParse";
describe("parseGameScore", () => {
  it("counts games from our perspective", () => {
    expect(parseGameScore("11-7, 9-11, 11-5")).toEqual({ games_played: 3, games_won: 2, match_result: "win" });
    expect(parseGameScore("7–11, 8:11")).toEqual({ games_played: 2, games_won: 0, match_result: "loss" });
  });
  it("does not invent a result for a split series", () => {
    expect(parseGameScore("11-7, 7-11")).toEqual({ games_played: 2, games_won: 1, match_result: null });
  });
  it.each(["", "won", "11-11", "-1-11", "11-7 junk", "111-2", "11.5-2"])("rejects unreadable scores %s", (score) => expect(parseGameScore(score)).toBeNull());
  it("counts only valid entries in a comma separated series", () => expect(parseGameScore("11-7, unfinished, 9-11")).toEqual({ games_played: 2, games_won: 1, match_result: null }));
});

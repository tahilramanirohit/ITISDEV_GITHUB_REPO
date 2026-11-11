import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import { parseAnalysisResult } from "./contract";
import { focusShots, playerNamesFor } from "./shotLabels";

describe("selected player shots", () => {
  it("does not replace zero shots by the selected player with every player's shots", () => {
    const data = structuredClone(fixture) as any;
    data.metrics.shot_classification = { status: "experimental", validation: "not_evaluated", scope: "whole_clip", reason: null,
      value: { type_definitions: {}, shots: [{ time_seconds: 1, shot_type: "dink", hitter_track_id: 2 }],
        bounces: [], counts_by_type: {}, selected_player_counts_by_type: {} } };
    const result = parseAnalysisResult(data);
    expect(focusShots(result, 1).shots).toHaveLength(0);
    expect(focusShots(result, 2).shots).toHaveLength(1);
  });
});

describe("player names on the video", () => {
  const withPlayers = (sides: ("near" | "far")[]) => ({
    players: sides.map((side, i) => ({ player_id: i + 1, label: "", on_court: true, side, first_seen_s: 0, last_seen_s: 1,
      observed_frames: 1, median_court_m: null, thumbnail: null })),
  }) as any;

  it("names the chosen player, their partner and a lone opponent by first name", () => {
    expect(playerNamesFor(withPlayers(["near", "far"]), 1, { me: "Kirk Orino", opponents: ["Rafa"] })).toEqual({ 1: "Kirk", 2: "Rafa" });
  });

  it("labels two opponents neutrally, because the video cannot tell them apart", () => {
    const names = playerNamesFor(withPlayers(["near", "near", "far", "far"]), 2, { me: "Kirk", partner: "Kyle", opponents: ["Rafa", "Alec"] });
    expect(names).toEqual({ 2: "Kirk", 1: "Kyle", 3: "Opponent 1", 4: "Opponent 2" });
  });

  it("labels strangers neutrally and leaves the unnamed chosen player as You", () => {
    expect(playerNamesFor(withPlayers(["near", "near", "far"]), 1, {})).toEqual({ 2: "Partner", 3: "Opponent" });
  });

  it("gives no names until a player is chosen", () => {
    expect(playerNamesFor(withPlayers(["near", "far"]), null, { me: "Kirk" })).toEqual({});
  });
});

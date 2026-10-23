import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import { parseAnalysisResult } from "./contract";
import { focusShots } from "./shotLabels";

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

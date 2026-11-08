import { describe, expect, it } from "vitest";
import walkResult from "../../walk-result.json";
import { parseAnalysisResult, type AnalysisResultV1 } from "../analysis/contract";
import { chosenPlayer, lastGameReview } from "./lastGameReview";

const sample = () => parseAnalysisResult(structuredClone(walkResult)) as AnalysisResultV1;

describe("lastGameReview", () => {
  it("uses the chosen player's zone time and keeps their side on the left", () => {
    const review = lastGameReview(sample(), 1)!;
    expect(review).not.toBeNull();
    expect(review.kitchenLineShare).toBeCloseTo(0.5, 2);
    expect(review.nearSide).toBe(true);
    expect(review.window).toBe("rallies");
    expect(review.heatmap.dwell_seconds.length).toBeGreaterThan(0);
  });

  it("falls back to the analysed player's positioning when nobody was picked", () => {
    const result = sample();
    expect(chosenPlayer(result, null)).toBeNull(); // court-half selection, no track chosen
    const review = lastGameReview(result, null)!;
    expect(review.kitchenLineShare).toBe(result.metrics.positioning.value!.fraction_of_mapped_time.kitchen_line);
    expect(review.window).toBe("video");
  });

  it("lists at most three of the player's own moments, in video order", () => {
    const review = lastGameReview(sample(), 1)!;
    expect(review.moments.length).toBeLessThanOrEqual(3);
    const times = review.moments.map((m) => m.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("never shows test fixtures or results without a heatmap", () => {
    expect(lastGameReview({ ...sample(), data_origin: "test_fixture" }, 1)).toBeNull();
    const noHeat = sample();
    noHeat.metrics.court_heatmap = { ...noHeat.metrics.court_heatmap, value: null };
    expect(lastGameReview(noHeat, 1)).toBeNull();
  });

  it("prefers the player the user saved over the analysed track", () => {
    const result = sample();
    result.player_selection = { ...result.player_selection!, method: "track_id", track_id: 2 };
    expect(chosenPlayer(result, null)).toBe(2);
    expect(chosenPlayer(result, 4)).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import { parseAnalysisResult, type AnalysisResultV1 } from "./contract";
import { KITCHEN_LINE_M, buildCourtMap, levelFor, toOwnView, zoneAt, zoneTip } from "./courtMap";

const CELL = 0.6096;
const X0 = -1.2192;
const Y0 = -2.4384;
const L = 13.4112;

/** A measured result whose heatmap has `seconds` in the cells holding each (x, y) point (near-baseline coordinates). */
function withHeat(spots: { x: number; y: number; s: number }[], side: "near" | "far" = "near", tracked = 40): AnalysisResultV1 {
  const r = structuredClone(parseAnalysisResult(fixture));
  const grid = Array.from({ length: 30 }, () => Array.from({ length: 14 }, () => 0));
  for (const { x, y, s } of spots) grid[Math.floor((y - Y0) / CELL)][Math.floor((x - X0) / CELL)] += s;
  r.data_origin = "measured";
  r.player_selection = { ...r.player_selection!, method: "court_half", track_id: null, court_half: side };
  r.metrics.positioning = { ...r.metrics.positioning, value: r.metrics.positioning.value ? { ...r.metrics.positioning.value, court_half: side } : null };
  r.metrics.court_heatmap.value = {
    ...r.metrics.court_heatmap.value!,
    x_edges_m: Array.from({ length: 15 }, (_, i) => X0 + i * CELL),
    y_edges_m: Array.from({ length: 31 }, (_, i) => Y0 + i * CELL),
    cell_size_m: CELL, dwell_seconds: grid, tracked_time_s: tracked,
  };
  return r;
}

describe("court map", () => {
  it("splits time into kitchen, no-man's land, baseline and outside", () => {
    const map = buildCourtMap(withHeat([
      { x: 1.5, y: 5.5, s: 4 }, // kitchen
      { x: 1.5, y: 3, s: 5 }, // transition
      { x: 3, y: 0.5, s: 1 }, // baseline
    ]))!;
    expect(map.share.kitchen).toBeCloseTo(0.4);
    expect(map.share.transition).toBeCloseTo(0.5);
    expect(map.share.baseline).toBeCloseTo(0.1);
    expect(map.level.name).toBe("Climber");
    expect(map.nextLevel?.name).toBe("Net player");
    expect(map.challenge).toMatchObject({ lowerIsBetter: true, done: false });
    expect(map.challenge!.now).toBeCloseTo(0.5);
  });

  it("reads a far-side player from their own end of the court", () => {
    // 5.5 m from the far baseline is the far kitchen.
    const map = buildCourtMap(withHeat([{ x: 1, y: L - 5.5, s: 6 }], "far"))!;
    expect(map.nearSide).toBe(false);
    expect(map.share.kitchen).toBe(1);
    expect(map.hotSpot.y).toBeGreaterThan(KITCHEN_LINE_M);
    expect(map.hotSpot.x).toBeGreaterThan(4); // mirrored: their left is the grid's right
  });

  it("awards Line holder when the busiest square touches the kitchen line", () => {
    const map = buildCourtMap(withHeat([{ x: 1.5, y: KITCHEN_LINE_M - 0.1, s: 3 }, { x: 1.5, y: 2, s: 1 }]))!;
    expect(map.hotSpotOnLine).toBe(true);
    expect(map.badges.find((b) => b.id === "line_holder")?.earned).toBe(true);
    expect(zoneTip(map, "kitchen")).toContain("right on the kitchen line");
  });

  it("gives no challenge or grading for a very short clip", () => {
    const map = buildCourtMap(withHeat([{ x: 1.5, y: 3, s: 2 }], "near", 4))!;
    expect(map.graded).toBe(false);
    expect(map.challenge).toBeNull();
  });

  it("has no map for test data or an empty heatmap", () => {
    expect(buildCourtMap(parseAnalysisResult(fixture))).toBeNull();
    expect(buildCourtMap(withHeat([]))).toBeNull();
  });

  it("names zones and levels from the thresholds", () => {
    expect(zoneAt(6)).toBe("kitchen");
    expect(zoneAt(3)).toBe("transition");
    expect(zoneAt(1)).toBe("baseline");
    expect(levelFor(0.1).name).toBe("Baseliner");
    expect(levelFor(0.6).name).toBe("Kitchen boss");
    expect(toOwnView(1, 2, false)).toEqual({ x: 6.096 - 1, y: L - 2 });
  });
});

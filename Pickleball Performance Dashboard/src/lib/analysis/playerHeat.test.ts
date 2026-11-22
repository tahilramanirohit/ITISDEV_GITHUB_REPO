import { describe, expect, it } from "vitest";
import fixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import { parseAnalysisResult, type AnalysisResultV1 } from "./contract";
import { applyHomography, courtMappingFrom, heatZoneAt, homographyFrom4, mainZone, heatmapFromPositions, playerHeat, playerTracks, positionAt, HEAT_CELL_M, HEAT_X0, HEAT_Y0 } from "./playerHeat";
import { COURT_LENGTH_M as L, COURT_WIDTH_M as W } from "../coaching/lastGameReview";

// A camera behind the near baseline: the court as a trapezoid, narrower far away.
const corners = { nl: [358, 900], nr: [1541, 903], fl: [646, 257], fr: [1241, 260] } as const;
const toImage = homographyFrom4([[0, 0], [W, 0], [0, L], [W, L]], [corners.nl, corners.nr, corners.fl, corners.fr] as [number, number][])!;
const px = (x: number, y: number) => applyHomography(toImage, [x, y])!.map(Math.round) as [number, number];
const lines: [number, number, number, number][] = [[...corners.nl, ...corners.nr], [...corners.fl, ...corners.fr], [...corners.nl, ...corners.fl], [...corners.nr, ...corners.fr]];

function withPlayers(): AnalysisResultV1 {
  const r = structuredClone(parseAnalysisResult(fixture));
  r.court_lines = [{ time_seconds: 0, lines }];
  r.players = [
    { player_id: 1, label: "P1", on_court: true, side: "near", first_seen_s: 0, last_seen_s: 10, observed_frames: 50, median_court_m: null, thumbnail: null },
    { player_id: 2, label: "P2", on_court: true, side: "far", first_seen_s: 0, last_seen_s: 10, observed_frames: 50, median_court_m: null, thumbnail: null },
    { player_id: 9, label: "Ref", on_court: false, side: null, first_seen_s: 0, last_seen_s: 10, observed_frames: 50, median_court_m: null, thumbnail: null },
  ];
  // Feet of player 1 at (1.5, 4.8) m (near kitchen line), player 2 at (4.5, 12.6) m (far baseline), 10 frames 0.5 s apart.
  const box = ([x, y]: [number, number]): [number, number, number, number] => [x - 30, y - 150, x + 30, y];
  r.player_positions = Array.from({ length: 10 }, (_, i) => ({ time_seconds: i * 0.5, players: [
    { track_id: 1, bbox: box(px(1.5, 4.8)), confidence: 0.9 },
    { track_id: 2, bbox: box(px(4.5, 12.6)), confidence: 0.9 },
    { track_id: 9, bbox: box(px(-0.9, 6.7)), confidence: 0.9 },
  ] }));
  return r;
}

describe("player heat on a top-view court", () => {
  it("maps the image back to the court from the four corners", () => {
    const h = courtMappingFrom({ time_seconds: 0, lines })!;
    const [x, y] = applyHomography(h, px(2, 5))!;
    expect(x).toBeCloseTo(2, 1);
    expect(y).toBeCloseTo(5, 1);
  });

  it("puts each on-court player's time in the right cell, and leaves out the referee", () => {
    const heat = playerHeat(withPlayers());
    expect(heat.map((h) => h.playerId)).toEqual([1, 2]);
    const cell = (x: number, y: number) => [Math.floor((y - HEAT_Y0) / HEAT_CELL_M), Math.floor((x - HEAT_X0) / HEAT_CELL_M)];
    const [r1, c1] = cell(1.5, 4.8);
    expect(heat[0].seconds[r1][c1]).toBeCloseTo(4.7, 1); // 9 gaps of 0.5 s + 0.2 s for the last frame
    expect(heat[0].totalS).toBeCloseTo(4.7, 1);
    const [r2, c2] = cell(4.5, 12.6);
    expect(heat[1].seconds[r2][c2]).toBeGreaterThan(4);
    expect(heat[1].hotSpot![1]).toBeGreaterThan(11);
  });

  it("skips frames where a corner is outside the picture (clipped lines)", () => {
    const r = withPlayers();
    r.court_lines = [{ time_seconds: 0, lines: [[400, 1080, 1500, 1080] as [number, number, number, number], ...lines.slice(1)] }];
    expect(playerHeat(r)).toEqual([]);
  });
});

describe("main zone", () => {
  it("names where a player spent most of their time, judged from their own side", () => {
    expect(heatZoneAt(1.5, 4.8)).toBe("kitchen"); // 1.9 m from the net
    expect(heatZoneAt(3, 3)).toBe("transition");
    expect(heatZoneAt(3, 0.5)).toBe("baseline");
    expect(heatZoneAt(3, -1)).toBe("behind");
    expect(heatZoneAt(3, L + 1)).toBe("behind");
    expect(heatZoneAt(-0.5, 5)).toBe("outside");
    const heat = playerHeat(withPlayers());
    expect(mainZone(heat[0])).toEqual({ zone: "kitchen", share: 1 });
    expect(mainZone(heat[1])!.zone).toBe("baseline");
  });
});

describe("rally window", () => {
  it("counts only time inside detected rallies, like the zone bars", () => {
    const r = withPlayers();
    r.metrics.rally_segmentation = { ...r.metrics.rally_segmentation, value: { ...(r.metrics.rally_segmentation.value ?? {}), rallies: [{ rally_index: 0, start_s: 0, end_s: 2, shots: 3 }] } } as typeof r.metrics.rally_segmentation;
    const heat = playerHeat(r);
    expect(heat[0].totalS).toBeCloseTo(2.5, 1); // frames at 0, 0.5, 1, 1.5, 2 s, 0.5 s each
  });
});

describe("moving dots", () => {
  it("keeps each on-court player's path in court metres", () => {
    const tracks = playerTracks(withPlayers());
    expect([...tracks.keys()]).toEqual([1, 2]);
    expect(tracks.get(1)!.length).toBe(10);
    expect(tracks.get(1)![0].x).toBeCloseTo(1.5, 1);
    expect(tracks.get(1)![0].y).toBeCloseTo(4.8, 1);
  });
  it("moves smoothly between samples and disappears in long gaps", () => {
    const track = [{ t: 0, x: 0, y: 0 }, { t: 1, x: 2, y: 4 }, { t: 5, x: 3, y: 3 }];
    expect(positionAt(track, 0.5)).toEqual({ t: 0.5, x: 1, y: 2 });
    expect(positionAt(track, 1.3)).toEqual(track[1]);   // a gap of 4 s: hold briefly
    expect(positionAt(track, 3)).toBeNull();            // then hide
    expect(positionAt(track, 4.6)).toEqual(track[2]);   // the next sample is near
    expect(positionAt([], 1)).toBeNull();
  });
});

describe("heatmap for Home", () => {
  it("gives the chosen player's own heat, or everyone's when nobody is chosen", () => {
    const mine = heatmapFromPositions(withPlayers(), 2)!;
    expect(mine.everyone).toBe(false);
    expect(mine.nearSide).toBe(false);
    expect(mine.value.dwell_seconds.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(mine.value.tracked_time_s, 2);
    const all = heatmapFromPositions(withPlayers(), null)!;
    expect(all.everyone).toBe(true);
    expect(all.value.tracked_time_s).toBeCloseTo(9.4, 1);
    expect(all.value.x_edges_m).toHaveLength(15);
  });
});

import { describe, expect, it } from "vitest";
import testFixture from "../../../contracts/fixtures/analysis_result.test_fixture.v1.json";
import kirkLabels from "../../../eval/TestVideoKirk_REAL.labels.json";
import { parseAnalysisResult } from "./contract";
import {
  LABEL_TYPES, LabelFileError, TYPE_KEYS, boxesAt, draftsFromResult, parseLabelFile, snapToFrame, toLabelFile,
  typeForKey, type ShotLabel,
} from "./labels";

const label = (t: number, extra: Partial<ShotLabel> = {}): ShotLabel =>
  ({ id: String(t), t, player: 1, type: "dink", resolution_s: 0.1, ...extra });

describe("labels file", () => {
  it("reads the whole-second labels file and keeps each shot's precision", () => {
    const { labels, meta } = parseLabelFile(kirkLabels);
    expect(labels).toHaveLength(kirkLabels.shots.length);
    expect(labels.every((l) => l.resolution_s === 1)).toBe(true);
    expect(meta.video).toBe("TestVideoKirk_REAL.mp4");
    const saved = toLabelFile(labels, meta);
    expect(saved.time_resolution_s).toBe(0.1);
    expect(saved.shots[0]).toMatchObject({ t: 1, player: 3, type: "serve", outcome: "fault", resolution_s: 1 });
  });

  it("saves frame-precise labels without a per-shot resolution and leaves out unconfirmed suggestions", () => {
    const saved = toLabelFile([label(2.5), label(1.2, { draft: true }), label(0.4, { outcome: "error", note: "net" })],
      { video: "v.mp4", labelled_by: "me", notes: "" });
    expect(saved.shots).toEqual([
      { t: 0.4, player: 1, type: "dink", outcome: "error", note: "net" },
      { t: 2.5, player: 1, type: "dink" },
    ]);
  });

  it("maps the retired third-shot names and rejects unknown types", () => {
    const { labels } = parseLabelFile({ shots: [{ t: 3, player: 2, type: "third_shot_drop" }] });
    expect(labels[0].type).toBe("drop");
    expect(() => parseLabelFile({ shots: [{ t: 3, player: 2, type: "smash" }] })).toThrow(LabelFileError);
    expect(() => parseLabelFile({ nothing: [] })).toThrow(LabelFileError);
  });
});

describe("keys and times", () => {
  it("gives every type its own key", () => {
    const keys = LABEL_TYPES.map((t) => TYPE_KEYS[t]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => /^[a-z]$/.test(k))).toBe(true);
    expect(typeForKey("V")).toBe("volley");
    expect(typeForKey("1")).toBeNull();
  });

  it("snaps to the nearest frame", () => {
    expect(snapToFrame(18.41, 30)).toBe(18.4);
    expect(snapToFrame(1.017, 30)).toBe(1.033);
  });
});

describe("from a PicklePro result", () => {
  const result = parseAnalysisResult(structuredClone(testFixture));

  it("finds the player boxes shown at a time", () => {
    const snap = result.player_positions[3];
    expect(boxesAt(result, snap.time_seconds + 0.01)).toEqual(snap.players);
    expect(boxesAt(result, 10_000)).toEqual([]);
    expect(boxesAt(null, 1)).toEqual([]);
  });

  it("turns detected shots into unconfirmed suggestions, skipping ones already labelled", () => {
    const withShots = structuredClone(result);
    withShots.metrics.shot_classification.value = {
      type_definitions: {}, bounces: [], counts_by_type: {} as never, selected_player_counts_by_type: {} as never,
      shots: [
        { time_seconds: 1.01, rally_index: 0, shot_number: 1, hitter_track_id: 2, hitter_side: "near", by_selected_player: false,
          hitter_court_m: null, shot_type: "unclassified", contact: "unknown", ground_speed_mps: null, landing_court_m: null,
          landed_in: null, evidence: "" },
        { time_seconds: 2.0, rally_index: 0, shot_number: 2, hitter_track_id: 3, hitter_side: "far", by_selected_player: false,
          hitter_court_m: null, shot_type: "dink", contact: "unknown", ground_speed_mps: null, landing_court_m: null,
          landed_in: null, evidence: "" },
      ],
    };
    const drafts = draftsFromResult(withShots, [label(2.1, { player: 3 })], 30);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ t: 1, player: 2, type: "volley", draft: true });
  });
});

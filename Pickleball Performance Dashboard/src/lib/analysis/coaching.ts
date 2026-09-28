import type { AnalysisResultV1, HeatmapValue, PositioningValue } from "./contract";

export type Drill = { name: string; how: string };
export type CoachingItem = {
  title: string;
  observation: string;
  why?: string;
  drill?: Drill;
  /** A measurable goal for the next recorded session. */
  target?: string;
  evidence: string;
};
export type CoachingReport = {
  available: boolean;
  introduction: string;
  strengths: CoachingItem[];
  focus: CoachingItem[];
  limitation: string;
};
export type ProgressRow = {
  label: string;
  before: string;
  after: string;
  change: "better" | "worse" | "same";
};

// Practice thresholds. These are common coaching conventions for recreational
// doubles and singles positioning, not validated benchmarks.
export const THRESHOLDS = {
  transitionHigh: 0.25,
  transitionGood: 0.15,
  lingersPerMinuteHigh: 1,
  kitchenLineLow: 0.25,
  kitchenLineGood: 0.35,
  approachSlowS: 3,
  approachGoodS: 2,
  insideKitchenHigh: 0.1,
  sideImbalance: 0.7,
  maxFocusItems: 3,
} as const;

const DRILLS = {
  transition: {
    name: "Drop-and-step",
    how: "From the baseline, hit a soft drop off a partner's feed, take two or three steps forward, split-step as your partner hits, reset the next ball, and repeat until you reach the kitchen line. Three sets of ten.",
  },
  kitchenLine: {
    name: "Return-and-close",
    how: "Your partner serves deep. Hit a deep, high return and keep moving until you are set at the kitchen line before their third shot bounces. Twenty returns; count how many times you were set in time.",
  },
  approach: {
    name: "Split-step ladder",
    how: "Start at the baseline. Each time your partner calls \"go\", move forward quickly and split-step; reach the kitchen line in no more than three moves. Ten reps, then add a fed ball at each stop.",
  },
  insideKitchen: {
    name: "Dink and recover",
    how: "Dink cross-court with a partner. Whenever a ball pulls you into the kitchen, step back behind the line before the next shot. Three rounds of two minutes.",
  },
  side: {
    name: "Shadow recovery",
    how: "After each shadow swing, recover to the ready spot for your side while a partner points to random targets. Three rounds of one minute.",
  },
} satisfies Record<string, Drill>;

const LIMITATION = "These ideas come from where the player stood, not from shots, technique, or point outcomes. Position estimates have not been validated on real matches, the clip includes time between rallies, and the targets are practice goals rather than validated benchmarks.";

const COURT_WIDTH_M = 6.096;
const COURT_LENGTH_M = 13.4112;
const NET_Y_M = COURT_LENGTH_M / 2;

const pct = (f: number) => `${Math.round(f * 100)}%`;
const secs = (s: number) => `${s.toFixed(1)} s`;

/** Why coaching cannot be given for this result, or null when it can. */
export function coachingBlocker(result: AnalysisResultV1): string | null {
  if (result.data_origin !== "measured") return "Coaching is unavailable for sample results. Analyze a real video first.";
  if (result.metrics.court_heatmap.status !== "measured" || !result.metrics.court_heatmap.value) {
    return "Coaching needs a measured court heatmap and enough tracked player time. Check the analysis warnings and camera view.";
  }
  if (!result.provenance.detector.confidence_is_model_score || !result.provenance.detector.name.includes("person")) {
    return "Coaching needs a player detection model. Motion detection alone cannot reliably identify a person.";
  }
  if (result.calibration?.quality !== "good") {
    return "Coaching needs a reliable court calibration. Review the court lines or use a clearer fixed-camera recording.";
  }
  const selection = result.player_selection;
  if (!selection || selection.tracked_fraction < 0.5 ||
      selection.ambiguous_frames > result.coverage.frames_analyzed * 0.2) {
    return "Coaching needs one player tracked clearly through most of the analyzed clip. In doubles, choose a specific player track and re-run analysis.";
  }
  const positioning = result.metrics.positioning;
  const mapped = positioning.status === "measured" && positioning.value
    ? positioning.value.mapped_time_s
    : summarizeHeatmap(result.metrics.court_heatmap.value, selectedHalf(result)).total;
  if (mapped < 10 || mapped < result.metrics.court_heatmap.value.tracked_time_s * 0.5) {
    return "Coaching needs at least ten seconds of the selected player clearly mapped inside the court.";
  }
  return null;
}

function selectedHalf(result: AnalysisResultV1): "near" | "far" | null {
  const sel = result.player_selection;
  return sel?.method === "court_half" ? sel.court_half ?? null : null;
}

function measuredPositioning(result: AnalysisResultV1): PositioningValue | null {
  const m = result.metrics.positioning;
  return m.status === "measured" ? m.value : null;
}

export function buildCoachingReport(result: AnalysisResultV1): CoachingReport {
  const blocker = coachingBlocker(result);
  if (blocker) return { available: false, introduction: blocker, strengths: [], focus: [], limitation: LIMITATION };
  const positioning = measuredPositioning(result);
  if (positioning) return positioningReport(positioning);
  return heatmapReport(result.metrics.court_heatmap.value!, selectedHalf(result));
}

function positioningReport(v: PositioningValue): CoachingReport {
  const f = v.fraction_of_mapped_time;
  const s = v.seconds;
  const minutes = v.mapped_time_s / 60;
  const lingersPerMinute = minutes > 0 ? v.transition_lingers / minutes : 0;
  const strengths: CoachingItem[] = [];
  const focus: CoachingItem[] = [];
  const base = `${secs(v.mapped_time_s)} of the selected player's positions were mapped on their half of the court.`;

  if (f.transition > THRESHOLDS.transitionHigh || lingersPerMinute >= THRESHOLDS.lingersPerMinuteHigh) {
    const lingers = v.transition_lingers
      ? ` There ${v.transition_lingers === 1 ? "was 1 stay" : `were ${v.transition_lingers} stays`} of 2 seconds or longer${v.longest_transition_linger_s ? ` (longest ${secs(v.longest_transition_linger_s)})` : ""}.`
      : "";
    focus.push({
      title: "Move through the transition area",
      observation: `${pct(f.transition)} of mapped time was in the transition area between the baseline and the kitchen line.${lingers}`,
      why: "Balls often land at your feet in this area, which makes them hard to attack or return. Moving through it with controlled stops usually leaves you in a stronger position.",
      drill: DRILLS.transition,
      target: `Next session: under ${pct(THRESHOLDS.transitionHigh)} of court time in the transition area${v.transition_lingers ? `, and fewer than ${v.transition_lingers} long stays there` : ""}.`,
      evidence: `${secs(s.transition)} in the transition area. ${base}`,
    });
  } else if (f.transition <= THRESHOLDS.transitionGood) {
    strengths.push({
      title: "Little time stuck mid-court",
      observation: `Only ${pct(f.transition)} of mapped time was in the transition area.`,
      evidence: `${secs(s.transition)} in the transition area. ${base}`,
    });
  }

  if (f.kitchen_line < THRESHOLDS.kitchenLineLow) {
    focus.push({
      title: "Spend more time at the kitchen line",
      observation: `${pct(f.kitchen_line)} of mapped time was in the ready area just behind the kitchen line.`,
      why: "At the kitchen line you can volley and keep your opponents hitting upward. Players who reach it after the return tend to control more points.",
      drill: DRILLS.kitchenLine,
      target: `Next session: at least ${pct(THRESHOLDS.kitchenLineGood)} of court time at the kitchen line.`,
      evidence: `${secs(s.kitchen_line)} at the kitchen line. ${base}`,
    });
  } else if (f.kitchen_line >= THRESHOLDS.kitchenLineGood) {
    strengths.push({
      title: "Strong kitchen-line presence",
      observation: `${pct(f.kitchen_line)} of mapped time was at the kitchen line.`,
      evidence: `${secs(s.kitchen_line)} at the kitchen line. ${base}`,
    });
  }

  if (v.median_approach_s != null && v.median_approach_s > THRESHOLDS.approachSlowS) {
    focus.push({
      title: "Get to the kitchen line faster",
      observation: `Moving from the baseline area to the kitchen line took ${secs(v.median_approach_s)} (median of ${v.approaches_to_kitchen_line} approach${v.approaches_to_kitchen_line === 1 ? "" : "es"}).`,
      why: "A quicker approach, with a split step when your opponent hits, gives them less time to hit at your feet.",
      drill: DRILLS.approach,
      target: `Next session: median approach under ${secs(THRESHOLDS.approachSlowS)}.`,
      evidence: `${v.approaches_to_kitchen_line} measured approach${v.approaches_to_kitchen_line === 1 ? "" : "es"}. Walking forward between points can also count as an approach.`,
    });
  } else if (v.median_approach_s != null && v.median_approach_s <= THRESHOLDS.approachGoodS && v.approaches_to_kitchen_line >= 2) {
    strengths.push({
      title: "Quick approaches",
      observation: `Median time from the baseline area to the kitchen line was ${secs(v.median_approach_s)} over ${v.approaches_to_kitchen_line} approaches.`,
      evidence: "Measured from the smoothed foot position of the selected player.",
    });
  }

  if (f.inside_kitchen > THRESHOLDS.insideKitchenHigh) {
    focus.push({
      title: "Recover behind the kitchen line",
      observation: `${pct(f.inside_kitchen)} of mapped time was well inside the kitchen (non-volley zone).`,
      why: "You cannot volley while standing in the kitchen, so staying there invites opponents to hit at you. Step in to dink when you need to, then step back out.",
      drill: DRILLS.insideKitchen,
      target: `Next session: under ${pct(THRESHOLDS.insideKitchenHigh / 2)} of court time inside the kitchen.`,
      evidence: `${secs(s.inside_kitchen)} inside the kitchen. Foot positions within 0.3 m of the line are counted as at the line to allow for measurement error.`,
    });
  }

  if (v.left_side_fraction != null) {
    const sideShare = Math.max(v.left_side_fraction, 1 - v.left_side_fraction);
    if (sideShare >= THRESHOLDS.sideImbalance) {
      const side = v.left_side_fraction > 0.5 ? "left" : "right";
      focus.push({
        title: "Check your court coverage",
        observation: `${pct(sideShare)} of in-court time was on the player's ${side} half (facing the net).`,
        why: "This is expected if you were assigned that side in doubles. If not, it may mean you are slow to recover after a wide ball.",
        drill: DRILLS.side,
        target: "Next session: confirm this matches your assigned side, or bring it below 70%.",
        evidence: "Compares the selected player's left and right court positions across the whole clip.",
      });
    }
  }

  const shown = focus.slice(0, THRESHOLDS.maxFocusItems);
  const introduction = shown.length
    ? `${shown.length} focus area${shown.length === 1 ? "" : "s"} for your next practice, based on how the selected player moved in this video.`
    : "No positioning issues stood out in this video. Keep the same habits and record another session to compare.";
  return { available: true, introduction, strengths, focus: shown, limitation: LIMITATION };
}

/** Older results without positioning: a single observation from the heatmap. */
function heatmapReport(value: HeatmapValue, half: "near" | "far" | null): CoachingReport {
  const { zones, total } = summarizeHeatmap(value, half);
  const area = (["backcourt", "transition", "kitchenSide"] as const).reduce((best, zone) => zones[zone] > zones[best] ? zone : best);
  const label = area === "kitchenSide" ? "near the kitchen" : area === "transition" ? "in the transition area" : "in the backcourt";
  const drill = area === "backcourt" ? DRILLS.kitchenLine : area === "transition" ? DRILLS.transition : DRILLS.insideKitchen;
  return {
    available: true,
    introduction: "Basic position feedback. Re-run analysis to get detailed focus areas, drills and targets.",
    strengths: [],
    focus: [{
      title: "Where you spent your time",
      observation: `The selected player spent about ${pct(zones[area] / total)} of mapped court time ${label}.`,
      drill,
      evidence: `${secs(total)} of selected-player positions were mapped inside the court. This includes breaks between points.`,
    }],
    limitation: LIMITATION,
  };
}

function summarizeHeatmap(value: HeatmapValue, selectedHalf: "near" | "far" | null) {
  let near = 0;
  let far = 0;
  const cells: { x: number; y: number; seconds: number }[] = [];
  for (let row = 0; row < value.dwell_seconds.length; row++) {
    const y = (value.y_edges_m[row] + value.y_edges_m[row + 1]) / 2;
    for (let col = 0; col < value.dwell_seconds[row].length; col++) {
      const x = (value.x_edges_m[col] + value.x_edges_m[col + 1]) / 2;
      const seconds = value.dwell_seconds[row][col];
      if (x < 0 || x > COURT_WIDTH_M || y < 0 || y > COURT_LENGTH_M) continue;
      if (y < NET_Y_M) near += seconds;
      else far += seconds;
      cells.push({ x, y, seconds });
    }
  }
  const half = selectedHalf ?? (near >= far ? "near" : "far");
  const zones = { backcourt: 0, transition: 0, kitchenSide: 0 };
  for (const { y, seconds } of cells) {
    if (half === "near" ? y >= NET_Y_M : y < NET_Y_M) continue;
    const fromBaseline = half === "near" ? y : COURT_LENGTH_M - y;
    if (fromBaseline < 2.4) zones.backcourt += seconds;
    else if (fromBaseline < 4.57) zones.transition += seconds;
    else zones.kitchenSide += seconds;
  }
  return { zones, total: zones.backcourt + zones.transition + zones.kitchenSide };
}

/**
 * Before/after practice measures between two coachable results. Returns null
 * when either result cannot be coached or lacks positioning patterns, so a
 * comparison is never made from weaker evidence than the report itself.
 */
export function compareProgress(current: AnalysisResultV1, previous: AnalysisResultV1): ProgressRow[] | null {
  if (coachingBlocker(current) || coachingBlocker(previous)) return null;
  const now = measuredPositioning(current);
  const then = measuredPositioning(previous);
  if (!now || !then) return null;
  const rows: ProgressRow[] = [];
  const add = (label: string, before: number, after: number, fmt: (n: number) => string,
    minChange: number, higherIsBetter: boolean) => {
    const delta = after - before;
    const change = Math.abs(delta) < minChange ? "same" : (delta > 0) === higherIsBetter ? "better" : "worse";
    rows.push({ label, before: fmt(before), after: fmt(after), change });
  };
  add("Time at the kitchen line", then.fraction_of_mapped_time.kitchen_line, now.fraction_of_mapped_time.kitchen_line, pct, 0.03, true);
  add("Time in the transition area", then.fraction_of_mapped_time.transition, now.fraction_of_mapped_time.transition, pct, 0.03, false);
  add("Time inside the kitchen", then.fraction_of_mapped_time.inside_kitchen, now.fraction_of_mapped_time.inside_kitchen, pct, 0.03, false);
  const perMinute = (v: PositioningValue) => v.mapped_time_s > 0 ? v.transition_lingers / (v.mapped_time_s / 60) : 0;
  add("Long transition stays per minute", perMinute(then), perMinute(now), (n) => n.toFixed(1), 0.3, false);
  if (now.median_approach_s != null && then.median_approach_s != null) {
    add("Median approach to the kitchen line", then.median_approach_s, now.median_approach_s, secs, 0.3, false);
  }
  return rows;
}

export function coachingSpeechText(report: CoachingReport): string {
  if (!report.available) return "";
  const parts = [report.introduction];
  if (report.strengths.length) {
    parts.push("What is working.", ...report.strengths.map((item) => `${item.title}. ${item.observation}`));
  }
  report.focus.forEach((item, index) => {
    parts.push(`Focus ${index + 1}: ${item.title}. ${item.observation}`);
    if (item.drill) parts.push(`Try the ${item.drill.name} drill. ${item.drill.how}`);
    if (item.target) parts.push(item.target);
  });
  parts.push(report.limitation);
  return parts.join(" ");
}

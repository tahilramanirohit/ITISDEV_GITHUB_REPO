// ════════════════════════════════════════════════════════════════════════
// DESIGN PREVIEW — every number, name, forecast and recommendation in this
// module is SAMPLE DATA from the original Figma prototype. It is not derived
// from any video and must only render behind the explicit preview route with
// the sample-data banner. Real results are shown by app/analysis/ResultView.
// ════════════════════════════════════════════════════════════════════════
// ── Data ───────────────────────────────────────────────────────────────────
export const dinkData = [
  { match: "M1",  rate: 68 }, { match: "M2",  rate: 71 },
  { match: "M3",  rate: 67 }, { match: "M4",  rate: 74 },
  { match: "M5",  rate: 76 }, { match: "M6",  rate: 72 },
  { match: "M7",  rate: 79 }, { match: "M8",  rate: 77 },
  { match: "M9",  rate: 83 }, { match: "M10", rate: 81 },
];

export const allRallyData = [
  { shots: 4,  errors: 0, phase: "early" },
  { shots: 6,  errors: 1, phase: "early" },
  { shots: 5,  errors: 0, phase: "early" },
  { shots: 8,  errors: 1, phase: "early" },
  { shots: 7,  errors: 0, phase: "early" },
  { shots: 9,  errors: 1, phase: "early" },
  { shots: 11, errors: 2, phase: "mid"   },
  { shots: 14, errors: 2, phase: "mid"   },
  { shots: 12, errors: 3, phase: "mid"   },
  { shots: 16, errors: 2, phase: "mid"   },
  { shots: 13, errors: 3, phase: "mid"   },
  { shots: 18, errors: 4, phase: "mid"   },
  { shots: 20, errors: 5, phase: "late"  },
  { shots: 23, errors: 6, phase: "late"  },
  { shots: 25, errors: 7, phase: "late"  },
  { shots: 22, errors: 6, phase: "late"  },
  { shots: 28, errors: 8, phase: "late"  },
  { shots: 30, errors: 9, phase: "late"  },
];

export type FPoint = { week: string; actual?: number; lower?: number; band?: number };
export const forecastData: FPoint[] = [
  { week: "W−8",  actual: 64 }, { week: "W−6", actual: 67 },
  { week: "W−4",  actual: 70 }, { week: "W−2", actual: 73 },
  { week: "Now",  actual: 76, lower: 76, band: 0 },
  { week: "+2w",  lower: 74, band: 4  }, { week: "+4w",  lower: 73, band: 7  },
  { week: "+6w",  lower: 71, band: 10 }, { week: "+8w",  lower: 70, band: 14 },
  { week: "+10w", lower: 68, band: 19 }, { week: "+12w", lower: 67, band: 24 },
];

export const playStyleData = [
  { metric: "Dinks (Control)", value: 85, fullMark: 100 },
  { metric: "Drops (Finesse)", value: 78, fullMark: 100 },
  { metric: "Volleys (Reflex)", value: 82, fullMark: 100 },
  { metric: "Lobs (Defense)", value: 65, fullMark: 100 },
  { metric: "Drives (Power)", value: 45, fullMark: 100 },
];

export const heatGrid = [
  [0.35, 0.55, 0.85, 0.28, 0.48, 0.18],
  [0.25, 0.42, 0.60, 0.18, 0.28, 0.12],
  [0.70, 0.55, 0.38, 0.10, 0.18, 0.08],
  [0.95, 0.80, 0.50, 0.12, 0.22, 0.08],
];

export const WAVE_BARS = [3,6,10,14,18,22,18,26,30,22,18,14,26,18,10,22,30,18,14,10,18,22,14,8,18,26,18,12,8,14,22,18,30,22,14,18,10,6,12,18];

// ── Post-game summary script (read by Web Speech API) ─────────────────────
export const SUMMARY_TEXT =
  `Welcome back, Alex Garcia. Here is your post-game audio summary for July 8th, 2026. ` +
  `This analysis covers your performance across four key dimensions. ` +

  `Descriptively, your dink success rate reached 81 percent in your most recent match, ` +
  `rising from 67 percent at the start of the 10-match window. ` +
  `You are now within striking distance of your target threshold. ` +

  `From a court positioning standpoint, heatmap data shows 68 percent of your time concentrated in the right-baseline quadrant. ` +
  `Kitchen time stands at 34 percent, which is below your target. ` +
  `The left side of your court remains a recognized vulnerability. ` +

  `On the diagnostic side, a Pearson correlation of 0.97 was detected between rally length and unforced errors. ` +
  `Mistakes escalate sharply in rallies exceeding 18 shots, confirming that late-game physical fatigue, not tactics, is the root cause of your lost points. ` +

  `Looking ahead, your current improvement velocity places your 85 percent volley target approximately 12 weeks away. ` +
  `Your volley success rate of 76 percent is projected to reach the 85 percent goal within 12 weeks under normal training conditions. ` +

  `Here are your three coach recommendations. ` +
  `First, complete Drill Set A, Reset and Recover, before each of your next three sessions to address baseline drive errors in long rallies. ` +
  `Second, join the 4 PM Open Play Queue on July 12th. ` +
  `Your defensive style matches strongly against aggressive opponents, with a projected win rate of 74 percent. ` +
  `Third, add left-side corridor drills twice per week to close the court coverage gap identified in the heatmap. ` +

  `That concludes your post-game summary. Keep pushing, Alex Garcia.`;

export const SUMMARY_DURATION_S = 98; // estimated at speech rate 0.92

// Values the original dashboard hard-coded inline (KPI strip, header, cards).
export const SAMPLE_PLAYER = { name: "ALEX GARCIA", initials: "AG", wins: 18, losses: 7, lastMatch: "Jul 8, 2026", skill: "INTERMEDIATE" };
export const SAMPLE_KPIS = { dinkRate: "76.4%", unforcedErrors: "4.8", kitchenTime: "34%" };

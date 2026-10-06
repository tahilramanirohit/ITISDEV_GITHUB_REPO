import type { ImprovementGoal } from "../api/types";
import type { Drill } from "../analysis/coaching";

// Keys must match public.valid_self_ratings in supabase/migrations.
export const SELF_SKILLS = [
  "serve", "return", "third_shot", "dinking", "volleys",
  "kitchen_line", "transition", "footwork", "consistency", "strategy",
] as const;
export type SelfSkill = (typeof SELF_SKILLS)[number];
export type SkillRating = 1 | 2 | 3 | 4 | 5;
export type SelfRatings = Partial<Record<SelfSkill, SkillRating>>;
export type ErrorLevel = "few" | "some" | "many";

export type SkillGroup = "Shots" | "Court" | "Game";

export type SkillInfo = {
  label: string;
  group: SkillGroup;
  question: string;
  /** What each rating from 1 to 5 looks like, so ratings mean the same thing each session. */
  anchors: [string, string, string, string, string];
  goal: ImprovementGoal;
  why: string;
  drill: Drill;
  /** Words in the player's own notes that point to this skill. */
  keywords: string[];
};

export const SKILL_INFO: Record<SelfSkill, SkillInfo> = {
  serve: {
    label: "Serve", group: "Shots", question: "How reliable and deep were your serves?",
    anchors: ["Often missed", "In, but short", "Mostly in, mid-depth", "Deep and steady", "Deep, placed on purpose"],
    goal: "shot_technique",
    why: "A deep serve keeps the returner back and buys your team time. Consistency matters more than pace.",
    drill: { name: "Target serves", how: "Put a towel 1 m inside the far baseline. Serve 20 balls, counting how many land past the service-box midpoint. Repeat from both sides." },
    keywords: ["serve", "serving", "fault"],
  },
  return: {
    label: "Return of serve", group: "Shots", question: "Were your returns deep, and did you get forward after them?",
    anchors: ["Often missed", "Short, I stayed back", "In, sometimes deep", "Deep and I moved in", "Deep, placed, always moving in"],
    goal: "shot_outcomes",
    why: "A deep return gives you time to reach the kitchen line before the third shot.",
    drill: { name: "Return-and-close", how: "Your partner serves deep. Hit a high, deep return and keep moving until you are set at the kitchen line before their next shot bounces. Twenty returns." },
    keywords: ["return"],
  },
  third_shot: {
    label: "Third-shot drop", group: "Shots", question: "Could you drop the third shot softly into the kitchen?",
    anchors: ["Rarely tried or landed", "Mostly too high", "Some good drops", "Usually soft and low", "Soft, low and placed"],
    goal: "shot_technique",
    why: "A good drop lets the serving team come forward safely. It is the shot that most separates beginner and intermediate play.",
    drill: { name: "Drop ladder", how: "Feed from the kitchen line while you start at the baseline. Drop five balls into the kitchen, step forward two steps, and repeat until you reach the line. Three rounds." },
    keywords: ["drop", "third", "3rd"],
  },
  dinking: {
    label: "Dinking", group: "Shots", question: "How patient and controlled were your dinks?",
    anchors: ["Popped up or netted", "Often too high", "Steady when unhurried", "Patient and low", "Low, varied and attacking"],
    goal: "shot_technique",
    why: "Low, patient dinks force opponents to hit up, giving you the first chance to attack.",
    drill: { name: "Cross-court dink count", how: "Dink cross-court with a partner and count rallies without a ball going above net-plus-30 cm. Aim to beat your best count over three rounds of two minutes." },
    keywords: ["dink", "dinks", "dinking", "soft game", "pop", "popped"],
  },
  volleys: {
    label: "Volleys & hands", group: "Shots", question: "How well did you handle fast balls at the net?",
    anchors: ["Missed most", "Blocked some", "Blocked most", "Blocked and redirected", "Quick and putting balls away"],
    goal: "shot_technique",
    why: "Quick hands win hand battles and let you finish points when an opponent pops the ball up.",
    drill: { name: "Volley rally", how: "Both players stand at the kitchen line and volley without letting the ball bounce, starting slow. Keep the paddle up between shots. Three rounds of one minute." },
    keywords: ["volley", "hands", "speed-up", "speed up", "block", "reaction"],
  },
  kitchen_line: {
    label: "Getting to the kitchen line", group: "Court", question: "How often were you set at the kitchen line during rallies?",
    anchors: ["Rarely got there", "Got there late", "About half the time", "Most rallies", "Every rally, set and early"],
    goal: "positioning",
    why: "At the kitchen line you can volley and keep opponents hitting upward. Teams that get there first win most points.",
    drill: { name: "Split-step ladder", how: "Start at the baseline. Each time your partner calls \"go\", move forward and split-step; reach the line in no more than three moves. Ten reps, then add a fed ball at each stop." },
    keywords: ["kitchen", "nvz", "get forward", "come forward", "stayed back", "stay back"],
  },
  transition: {
    label: "Transition & resets", group: "Court", question: "When caught mid-court, could you reset the ball and keep moving?",
    anchors: ["Got stuck, lost the point", "Stuck often", "Reset some balls", "Reset most and moved in", "Calm resets every time"],
    goal: "positioning",
    why: "Balls often land at your feet mid-court. A soft reset turns a defensive spot into a neutral rally.",
    drill: { name: "Drop-and-step", how: "From the baseline, hit a soft drop off a partner's feed, take two or three steps forward, split-step as your partner hits, reset the next ball, and repeat to the kitchen line. Three sets of ten." },
    keywords: ["transition", "reset", "mid-court", "midcourt", "feet", "no man"],
  },
  footwork: {
    label: "Footwork & ready position", group: "Court", question: "Were you balanced and ready before each shot?",
    anchors: ["Often off balance", "Late to the ball", "Ready on easy balls", "Usually balanced", "Always set early"],
    goal: "positioning",
    why: "Being set before the ball arrives makes every other shot easier.",
    drill: { name: "Shadow recovery", how: "After each shadow swing, recover to your ready spot with a split step while a partner points to random targets. Three rounds of one minute." },
    keywords: ["footwork", "feet", "balance", "slow", "late", "split"],
  },
  consistency: {
    label: "Consistency", group: "Game", question: "How often did you keep the ball in play instead of making an error?",
    anchors: ["Many errors", "More errors than I'd like", "Some errors", "Few errors", "Almost no free points given"],
    goal: "shot_outcomes",
    why: "Most recreational points end on an error. Keeping one more ball in play wins a lot of them.",
    drill: { name: "Twenty in a row", how: "With a partner, rally any shot type and count how many in a row stay in. Restart at zero after an error. Reach 20 before increasing pace." },
    keywords: ["error", "consistent", "consistency", "miss", "into the net", "hit out"],
  },
  strategy: {
    label: "Shot choice & teamwork", group: "Game", question: "Did you choose sensible shots and work well with your partner?",
    anchors: ["Mostly guessed", "Often rushed", "Some good choices", "Usually smart", "Planned and communicated"],
    goal: "shot_outcomes",
    why: "Choosing when to stay patient and when to attack, and talking with your partner, avoids easy mistakes.",
    drill: { name: "Patience game", how: "Play to 7 where you may only attack a ball that is above the net. Call \"mine\" or \"yours\" on every middle ball." },
    keywords: ["strategy", "partner", "communication", "choice", "rushed", "impatient", "attack"],
  },
};

export const SKILL_GROUPS: SkillGroup[] = ["Shots", "Court", "Game"];

export type SelfAssessmentInput = {
  ratings: SelfRatings;
  goals: ImprovementGoal[];
  biggestStruggle?: string | null;
  unforcedErrors?: ErrorLevel | null;
  gamesPlayed?: number | null;
  gamesWon?: number | null;
};

export type SelfFocusItem = {
  skill: SelfSkill;
  title: string;
  rating: SkillRating;
  observation: string;
  why: string;
  drill: Drill;
  target: string;
  reasons: string[];
};

export type SelfStrength = { skill: SelfSkill; title: string; rating: SkillRating; observation: string };

export type SelfReport = {
  available: boolean;
  introduction: string;
  /** Average of the rated skills, 1-5. */
  overall: number | null;
  level: string | null;
  strengths: SelfStrength[];
  focus: SelfFocusItem[];
  plan: { day: string; title: string; detail: string }[];
  limitation: string;
};

export type SelfProgressRow = { skill: SelfSkill; label: string; before: SkillRating; after: SkillRating; change: "better" | "worse" | "same" };

export const MIN_RATED_SKILLS = 3;
const MAX_FOCUS = 3;
const LIMITATION = "This plan comes from your own ratings, not from measurements. Rate yourself the same way each time so changes reflect your play. Add a video analysis to check court positions against your ratings.";

export function levelLabel(overall: number): string {
  if (overall < 2.5) return "Building foundations";
  if (overall < 3.5) return "Developing";
  if (overall < 4.3) return "Solid";
  return "Advanced";
}

export function ratedSkills(ratings: SelfRatings): SelfSkill[] {
  return SELF_SKILLS.filter((skill) => ratings[skill] != null);
}

/** Skills whose keywords appear in the player's own words. */
export function skillsMentioned(text: string | null | undefined): SelfSkill[] {
  if (!text) return [];
  const lower = ` ${text.toLowerCase()} `;
  return SELF_SKILLS.filter((skill) => SKILL_INFO[skill].keywords.some((word) => {
    const at = lower.indexOf(word);
    return at >= 0 && !/[a-z]/.test(lower[at - 1] ?? " ");
  }));
}

export function buildSelfReport(input: SelfAssessmentInput): SelfReport {
  const rated = ratedSkills(input.ratings);
  if (rated.length < MIN_RATED_SKILLS) {
    return {
      available: false,
      introduction: `Rate at least ${MIN_RATED_SKILLS} skills to get your practice plan.`,
      overall: null, level: null, strengths: [], focus: [], plan: [], limitation: LIMITATION,
    };
  }
  const rating = (skill: SelfSkill) => input.ratings[skill] as SkillRating;
  const overall = Math.round((rated.reduce((sum, skill) => sum + rating(skill), 0) / rated.length) * 10) / 10;
  const mentioned = new Set(skillsMentioned(input.biggestStruggle));

  const scored = rated.map((skill) => {
    const info = SKILL_INFO[skill];
    const reasons: string[] = [`You rated it ${rating(skill)}/5`];
    let score = 6 - rating(skill);
    if (input.goals.includes(info.goal)) { score += 1; reasons.push("it matches a focus you chose"); }
    if (mentioned.has(skill)) { score += 1.5; reasons.push("you mentioned it as a struggle"); }
    if (skill === "consistency" && input.unforcedErrors === "many") { score += 1.5; reasons.push("you made many unforced errors"); }
    return { skill, score, reasons };
  });

  // Skills already at 5 have no next anchor to aim for, so they are never focus items.
  const candidates = scored.filter((s) => rating(s.skill) < 5).sort((a, b) =>
    b.score - a.score || rating(a.skill) - rating(b.skill) || SELF_SKILLS.indexOf(a.skill) - SELF_SKILLS.indexOf(b.skill));
  const focus: SelfFocusItem[] = candidates.slice(0, MAX_FOCUS).map(({ skill, reasons }) => {
    const info = SKILL_INFO[skill];
    const r = rating(skill);
    return {
      skill,
      title: r <= 2 ? `Build your ${info.label.toLowerCase()}` : `Level up your ${info.label.toLowerCase()}`,
      rating: r,
      observation: `You rated your ${info.label.toLowerCase()} ${r}/5: "${info.anchors[r - 1]}".`,
      why: info.why,
      drill: info.drill,
      target: `Next session: aim for ${r + 1}/5, "${(info.anchors as readonly string[])[r]}".`,
      reasons,
    };
  });
  const focusSet = new Set(focus.map((f) => f.skill));

  const strengths: SelfStrength[] = rated
    .filter((skill) => rating(skill) >= 4 && !focusSet.has(skill))
    .sort((a, b) => rating(b) - rating(a))
    .slice(0, 3)
    .map((skill) => ({
      skill,
      title: SKILL_INFO[skill].label,
      rating: rating(skill),
      observation: `"${SKILL_INFO[skill].anchors[rating(skill) - 1]}"`,
    }));

  const plan = buildPlan(focus);
  const record = input.gamesPlayed ? ` You won ${input.gamesWon ?? 0} of ${input.gamesPlayed} games.` : "";
  const introduction = focus.length
    ? `${focus.length} thing${focus.length === 1 ? "" : "s"} to practice before your next session, picked from your ratings and goals.${record}`
    : `You rated every skill 5/5. Keep the same habits and rate yourself again after your next session.${record}`;

  return { available: true, introduction, overall, level: levelLabel(overall), strengths, focus, plan, limitation: LIMITATION };
}

function buildPlan(focus: SelfFocusItem[]): SelfReport["plan"] {
  if (!focus.length) return [];
  const [first, second, third] = focus;
  const plan = [
    { day: "Session 1", title: first.drill.name, detail: `15 minutes on your ${SKILL_INFO[first.skill].label.toLowerCase()}. ${first.drill.how}` },
    { day: "Session 2", title: (second ?? first).drill.name, detail: `15 minutes. ${(second ?? first).drill.how}` },
  ];
  plan.push(third
    ? { day: "Session 3", title: third.drill.name, detail: `15 minutes, then play games and notice when it comes up. ${third.drill.how}` }
    : { day: "Session 3", title: "Play and notice", detail: "Play games as normal. After each game, think of one moment where your focus skill mattered." });
  plan.push({ day: "Then", title: "Rate yourself again", detail: "Log a new session and rate the same skills to see what changed." });
  return plan;
}

/** Skill-by-skill change between two self-assessments, for skills rated in both. */
export function compareSelfRatings(current: SelfRatings, previous: SelfRatings): SelfProgressRow[] {
  return SELF_SKILLS.flatMap((skill) => {
    const after = current[skill];
    const before = previous[skill];
    if (after == null || before == null) return [];
    const change = after > before ? "better" : after < before ? "worse" : "same";
    return [{ skill, label: SKILL_INFO[skill].label, before, after, change }];
  });
}

/** Keeps only valid 1-5 ratings for known skills, so a stored row can never break the page. */
export function parseRatings(value: unknown): SelfRatings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: SelfRatings = {};
  for (const skill of SELF_SKILLS) {
    const v = (value as Record<string, unknown>)[skill];
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) out[skill] = v as SkillRating;
  }
  return out;
}

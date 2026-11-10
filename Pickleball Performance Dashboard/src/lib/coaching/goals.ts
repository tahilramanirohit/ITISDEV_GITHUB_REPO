import type { ImprovementGoal } from "../api/types";
import { SELF_SKILLS, SKILL_INFO, type SelfRatings, type SelfSkill, type SkillRating } from "./selfAssessment";

/** Goals run for four weeks from the baseline unless the player picks another length (Settings), then they re-rate. */
export const DEFAULT_GOAL_WEEKS = 4;
export const GOAL_WINDOW_DAYS = DEFAULT_GOAL_WEEKS * 7;
export const MAX_GOAL_WEEKS = 52;

/** A goal length from the profile: whole weeks from 1 to 52, else the default. */
export function goalWeeks(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_GOAL_WEEKS ? value : DEFAULT_GOAL_WEEKS;
}

/** "1 week", "2 weeks". */
export const weeksLabel = (weeks: number) => `${weeks} week${weeks === 1 ? "" : "s"}`;
export const MAX_GOAL_TARGETS = 2;

export type GoalTarget = {
  skill: SelfSkill;
  label: string;
  from: SkillRating;
  target: SkillRating;
  /** YYYY-MM-DD, or null when the baseline has no date. */
  due: string | null;
};

const DAY_MS = 86_400_000;

/** The date the goals are due: the goal length after the baseline was set, plus any days paused by an injury. */
export function goalDueDate(setAt: string | null | undefined, pausedDays = 0, weeks = DEFAULT_GOAL_WEEKS): string | null {
  if (!setAt) return null;
  const start = Date.parse(setAt);
  if (Number.isNaN(start)) return null;
  return new Date(start + (weeks * 7 + pausedDays) * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days since the baseline was set, or null without a date. */
export function daysSince(setAt: string | null | undefined, now = Date.now()): number | null {
  if (!setAt) return null;
  const start = Date.parse(setAt);
  return Number.isNaN(start) ? null : Math.floor((now - start) / DAY_MS);
}

/**
 * Goals from the baseline: the lowest-rated skills, each one point higher.
 * Ties go to skills matching the player's chosen focus, then to the usual skill order.
 */
export function goalTargets(
  baseline: SelfRatings | null | undefined,
  mainGoals: readonly ImprovementGoal[] = [],
  setAt?: string | null,
  pausedDays = 0,
  weeks = DEFAULT_GOAL_WEEKS,
): GoalTarget[] {
  if (!baseline) return [];
  const due = goalDueDate(setAt, pausedDays, weeks);
  const matchesGoal = (skill: SelfSkill) => (mainGoals.includes(SKILL_INFO[skill].goal) ? 0 : 1);
  return SELF_SKILLS
    .filter((skill) => baseline[skill] != null && baseline[skill]! < 5)
    .sort((a, b) => baseline[a]! - baseline[b]! || matchesGoal(a) - matchesGoal(b) || SELF_SKILLS.indexOf(a) - SELF_SKILLS.indexOf(b))
    .slice(0, MAX_GOAL_TARGETS)
    .map((skill) => {
      const from = baseline[skill]!;
      return { skill, label: SKILL_INFO[skill].label, from, target: (from + 1) as SkillRating, due };
    });
}

/** How far a goal has come: 0 at the baseline, 1 at the target. */
export function goalProgress(goal: Pick<GoalTarget, "from" | "target">, now: number | null | undefined): { fraction: number; reached: boolean } {
  if (now == null) return { fraction: 0, reached: false };
  const fraction = Math.min(1, Math.max(0, (now - goal.from) / (goal.target - goal.from)));
  return { fraction, reached: now >= goal.target };
}

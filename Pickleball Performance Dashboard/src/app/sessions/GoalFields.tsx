import { Check } from "lucide-react";
import {
  GOAL_LABELS, IMPROVEMENT_GOALS,
  type GoalValues, type ImprovementGoal, type SelfRating,
} from "../../lib/api/types";
import { BORDER, INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { labelClass, labelStyle } from "../shell/primitives";
import { HoldRater } from "../selfAssessment/HoldRater";

const LEVELS = ["Just starting", "Learning", "Okay", "Good", "Strong"];

const GOAL_DETAILS: Record<ImprovementGoal, string> = {
  positioning: "Moving up to the net and footwork.",
  shot_outcomes: "Returns, consistency, shot choice.",
  shot_technique: "Serve, drops, dinks and volleys.",
};

export function GoalFields({ value, onChange }: { value: GoalValues; onChange: (next: GoalValues) => void }) {
  return (
    <div>
      <p className={labelClass} style={labelStyle}>What do you want to improve?</p>
      <div className="grid gap-2">
        {IMPROVEMENT_GOALS.map((goal: ImprovementGoal) => {
          const ratingKey = `${goal}_rating` as const;
          const selected = value.improvement_goals.includes(goal);
          return (
            <div key={goal} className="rounded-[14px] p-3 focus-within:ring-2 focus-within:ring-[var(--pp-focus)]" style={{ border: `${selected ? 2 : 1}px solid ${selected ? INK : BORDER}`, background: WHITE }}>
              <label className="flex cursor-pointer items-center gap-3 text-sm" style={{ color: INK }}>
                <input type="checkbox" aria-label={GOAL_LABELS[goal]} checked={selected} className="sr-only" onChange={() => onChange({
                  ...value,
                  improvement_goals: selected ? value.improvement_goals.filter((g) => g !== goal) : [...value.improvement_goals, goal],
                  [ratingKey]: selected ? null : value[ratingKey],
                })} />
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: selected ? INK : WHITE, border: `1.5px solid ${selected ? INK : "var(--pp-line-strong)"}`, color: WHITE }}>
                  {selected && <Check size={15} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm">{GOAL_LABELS[goal]}</strong>
                  <span className="block text-xs leading-snug" style={{ color: WHITE_DIM }}>{GOAL_DETAILS[goal]}</span>
                </span>
              </label>
              {selected && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold" style={{ color: WHITE_DIM }}>Your current level (optional)</p>
                    {value[ratingKey] != null && <button type="button" onClick={() => onChange({ ...value, [ratingKey]: null })}
                      className="min-h-[36px] text-xs font-semibold underline" style={{ color: WHITE_SUB }}>Clear</button>}
                  </div>
                  <div className="mt-1">
                    <HoldRater label={`${GOAL_LABELS[goal]} self rating, 1 lowest to 5 highest`} min={1} max={5} value={value[ratingKey] ?? undefined}
                      onChange={(n) => onChange({ ...value, [ratingKey]: n as SelfRating })} valueText={(n) => LEVELS[n - 1]} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs mt-2" style={{ color: WHITE_SUB }}>Your focus shapes which skills your practice plan puts first. Any rating is your own assessment, not a video score.</p>
    </div>
  );
}

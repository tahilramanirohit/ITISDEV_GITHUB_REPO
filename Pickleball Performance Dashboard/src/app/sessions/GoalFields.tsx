import { Check } from "lucide-react";
import {
  GOAL_LABELS, IMPROVEMENT_GOALS,
  type GoalValues, type ImprovementGoal, type SelfRating,
} from "../../lib/api/types";
import { BORDER, INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { fieldStyle, labelClass, labelStyle } from "../shell/primitives";

const GOAL_DETAILS: Record<ImprovementGoal, string> = {
  positioning: "Getting to the kitchen line, transition, footwork.",
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
            <div key={goal} className="rounded-2xl p-3 focus-within:ring-2 focus-within:ring-[#11804f]" style={{ border: `${selected ? 2 : 1}px solid ${selected ? INK : BORDER}`, background: WHITE }}>
              <label className="flex cursor-pointer items-center gap-3 text-sm" style={{ color: INK }}>
                <input type="checkbox" aria-label={GOAL_LABELS[goal]} checked={selected} className="sr-only" onChange={() => onChange({
                  ...value,
                  improvement_goals: selected ? value.improvement_goals.filter((g) => g !== goal) : [...value.improvement_goals, goal],
                  [ratingKey]: selected ? null : value[ratingKey],
                })} />
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: selected ? INK : WHITE, border: `1.5px solid ${selected ? INK : "#c5c8c1"}`, color: WHITE }}>
                  {selected && <Check size={15} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm">{GOAL_LABELS[goal]}</strong>
                  <span className="block text-xs leading-snug" style={{ color: WHITE_DIM }}>{GOAL_DETAILS[goal]}</span>
                </span>
              </label>
              {selected && (
                <label className="mt-2 flex items-center justify-between gap-3 text-xs" style={{ color: WHITE_DIM }}>
                  Your current level (optional)
                  <select aria-label={`${GOAL_LABELS[goal]} self rating`} value={value[ratingKey] ?? ""}
                    onChange={(e) => onChange({ ...value, [ratingKey]: e.target.value ? Number(e.target.value) as SelfRating : null })}
                    className="rounded-xl px-2 py-1.5 text-sm" style={fieldStyle}>
                    <option value="">Not sure</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
                  </select>
                </label>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs mt-2" style={{ color: WHITE_SUB }}>Your focus shapes which skills your practice plan puts first. Any rating is your own assessment, not a video score.</p>
    </div>
  );
}

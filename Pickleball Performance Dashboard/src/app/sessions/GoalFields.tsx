import {
  GOAL_LABELS, IMPROVEMENT_GOALS,
  type GoalValues, type ImprovementGoal, type SelfRating,
} from "../../lib/api/types";
import { BORDER, WHITE_DIM, WHITE_SUB } from "../theme";
import { fieldStyle, labelClass, labelStyle } from "../shell/primitives";

export function GoalFields({ value, onChange }: { value: GoalValues; onChange: (next: GoalValues) => void }) {
  return (
    <div>
      <p className={labelClass} style={labelStyle}>What do you want to improve?</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {IMPROVEMENT_GOALS.map((goal: ImprovementGoal) => {
          const ratingKey = `${goal}_rating` as const;
          const selected = value.improvement_goals.includes(goal);
          return (
            <div key={goal} className="rounded-xl p-3" style={{ border: `1px solid ${BORDER}` }}>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={selected} onChange={() => onChange({
                  ...value,
                  improvement_goals: selected ? value.improvement_goals.filter((g) => g !== goal) : [...value.improvement_goals, goal],
                  [ratingKey]: selected ? null : value[ratingKey],
                })} />
                {GOAL_LABELS[goal]}
              </label>
              {selected && (
                <label className="block mt-2 text-xs" style={{ color: WHITE_DIM }}>
                  Your current level (optional)
                  <select aria-label={`${GOAL_LABELS[goal]} self rating`} value={value[ratingKey] ?? ""}
                    onChange={(e) => onChange({ ...value, [ratingKey]: e.target.value ? Number(e.target.value) as SelfRating : null })}
                    className="w-full rounded-lg px-2 py-1.5 mt-1" style={fieldStyle}>
                    <option value="">Not sure yet</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
                  </select>
                </label>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] mt-2" style={{ color: WHITE_SUB }}>This is your own assessment. Video findings are shown separately.</p>
    </div>
  );
}

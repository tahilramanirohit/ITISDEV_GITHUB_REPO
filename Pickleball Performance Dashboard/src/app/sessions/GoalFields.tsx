import {
  GOAL_LABELS, IMPROVEMENT_GOALS,
  type GoalValues, type ImprovementGoal, type SelfRating,
} from "../../lib/api/types";
import { BLUE_SKY, BORDER, NEON, WHITE_DIM, WHITE_SUB } from "../theme";
import { fieldStyle, labelClass, labelStyle } from "../shell/primitives";

const GOAL_DETAILS: Record<ImprovementGoal, { description: string; availability: string }> = {
  positioning: { description: "Where you move and spend time on the court.", availability: "Video feedback available" },
  shot_outcomes: { description: "Where your shots land and how points end.", availability: "Video feedback in development" },
  shot_technique: { description: "How you prepare, swing, and recover.", availability: "Video feedback in development" },
};

export function GoalFields({ value, onChange }: { value: GoalValues; onChange: (next: GoalValues) => void }) {
  return (
    <div>
      <p className={labelClass} style={labelStyle}>What do you want to improve?</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {IMPROVEMENT_GOALS.map((goal: ImprovementGoal) => {
          const ratingKey = `${goal}_rating` as const;
          const selected = value.improvement_goals.includes(goal);
          return (
            <div key={goal} className="rounded-xl p-4" style={{ border: `1px solid ${selected ? NEON : BORDER}`, background: selected ? `${NEON}0b` : "rgba(41,61,242,0.025)" }}>
              <label className="flex items-start gap-3 text-sm text-[#101827] cursor-pointer">
                <input type="checkbox" aria-label={GOAL_LABELS[goal]} checked={selected} className="mt-1 h-4 w-4" style={{ accentColor: NEON }} onChange={() => onChange({
                  ...value,
                  improvement_goals: selected ? value.improvement_goals.filter((g) => g !== goal) : [...value.improvement_goals, goal],
                  [ratingKey]: selected ? null : value[ratingKey],
                })} />
                <span>
                  <strong className="block text-sm">{GOAL_LABELS[goal]}</strong>
                  <span className="mt-1 block text-xs leading-relaxed" style={{ color: WHITE_DIM }}>{GOAL_DETAILS[goal].description}</span>
                  <span className="mt-2 block text-xs font-semibold" style={{ color: goal === "positioning" ? NEON : BLUE_SKY }}>
                    {GOAL_DETAILS[goal].availability}
                  </span>
                </span>
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
      <p className="text-xs mt-3" style={{ color: WHITE_SUB }}>Your rating is your own assessment, not a video score. You can record shot goals now, but PicklePro cannot assess them from video yet.</p>
    </div>
  );
}

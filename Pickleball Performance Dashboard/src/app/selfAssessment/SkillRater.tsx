import { skillInfo, type SelfSkill, type SkillRating } from "../../lib/coaching/selfAssessment";
import { BORDER, GREEN, INK, OPTIC, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, rovingIndex } from "../shell/primitives";

/** One skill's 1-5 rating as a W3C radio group. Shared by session rating and onboarding. */
export function SkillRater({ skill, value, onChange, question, playFormat }: {
  skill: SelfSkill; value: SkillRating | undefined; onChange: (v: SkillRating | undefined) => void; question?: string; playFormat?: string;
}) {
  const info = skillInfo(skill, playFormat);
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold" style={{ color: INK }}>{info.label}</h3>
          <p className="text-sm" style={{ color: WHITE_DIM }}>{question ?? info.question}</p>
        </div>
        {value && <button type="button" onClick={() => onChange(undefined)} className="shrink-0 text-xs font-semibold underline" style={{ color: WHITE_SUB }}>Clear</button>}
      </div>
      {/* W3C radio group pattern: one tab stop; arrow keys move and select. */}
      <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={`${info.label} rating`}>
        {([1, 2, 3, 4, 5] as SkillRating[]).map((n) => {
          const selected = value === n;
          return <button key={n} type="button" role="radio" aria-checked={selected} aria-label={`${info.label} ${n} of 5: ${info.anchors[n - 1]}`}
            id={`rate-${skill}-${n}`} tabIndex={selected || (!value && n === 1) ? 0 : -1}
            onKeyDown={(e) => {
              const next = rovingIndex(e.key, (value ?? 1) - 1, 5);
              if (next === null) return;
              e.preventDefault();
              onChange((next + 1) as SkillRating);
              document.getElementById(`rate-${skill}-${next + 1}`)?.focus();
            }}
            onClick={() => onChange(n)} className="min-h-[48px] rounded-2xl text-lg font-extrabold transition-colors"
            style={selected ? { background: INK, color: OPTIC } : { background: "#f1f2ee", color: INK, border: `1px solid ${BORDER}` }}>{n}</button>;
        })}
      </div>
      <p className="mt-2 min-h-[1.25rem] text-sm font-semibold" style={{ color: value ? GREEN : WHITE_SUB }}>
        {value ? info.anchors[value - 1] : "Tap a number, or leave it if it didn't come up."}
      </p>
    </Card>
  );
}

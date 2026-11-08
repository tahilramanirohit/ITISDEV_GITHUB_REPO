import { skillInfo, type SelfSkill, type SkillRating } from "../../lib/coaching/selfAssessment";
import { ACCENT_INK, ACTION, BORDER, INK, ON_ACTION, SURFACE_2, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, ScaleLabels, numStyle, pressable, rovingIndex } from "../shell/primitives";

/** One skill's 1-5 rating as a W3C radio group. Shared by session rating and onboarding. */
export function SkillRater({ skill, value, onChange, question, playFormat }: {
  skill: SelfSkill; value: SkillRating | undefined; onChange: (v: SkillRating | undefined) => void; question?: string; playFormat?: string;
}) {
  const info = skillInfo(skill, playFormat);
  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-[55%]">
          <h3 className="text-base font-bold" style={{ color: INK }}>{info.label}</h3>
          <p className="text-sm" style={{ color: WHITE_DIM }}>{question ?? info.question}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end"><span className="pp-tag shrink-0 rounded-full px-2 py-1 text-xs font-bold" style={{ background: SURFACE_2, color: WHITE_DIM }}>YOUR RATING</span>
        {value && <button type="button" onClick={() => onChange(undefined)} className="min-h-[44px] shrink-0 text-sm font-semibold underline" style={{ color: WHITE_SUB }}>Clear</button>}</div>
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
            onClick={() => onChange(n)} className={`min-h-[64px] rounded-[16px] text-[30px] leading-none ${pressable}`}
            style={{ ...numStyle, ...(selected ? { background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION}` } : { background: SURFACE_2, color: INK, border: `1px solid ${BORDER}` }) }}>{n}</button>;
        })}
      </div>
      <ScaleLabels />
      <p className="mt-2 min-h-[1.25rem] text-sm font-semibold" style={{ color: ACCENT_INK }}>
        {value ? `${value} · ${info.anchors[value - 1]}` : ""}
      </p>
    </Card>
  );
}

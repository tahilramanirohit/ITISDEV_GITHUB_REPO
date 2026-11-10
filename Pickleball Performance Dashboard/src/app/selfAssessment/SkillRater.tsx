import { SUCCESS_OUT_OF, skillInfo, successToRating, type SelfSkill, type SkillRating } from "../../lib/coaching/selfAssessment";
import { ACCENT_INK, ACTION, BORDER, INK, ON_ACTION, SURFACE_2, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, ScaleLabels, numStyle, pressable, rovingIndex } from "../shell/primitives";
import { HoldRater } from "./HoldRater";
import { TermHelp } from "./TermHelp";

/**
 * One skill's rating: hold the pickleball to set it. Shots are counted as successes out of 10
 * ("how many went in?") when `onSuccesses` is given; their 1-5 rating follows from that.
 * Other skills are rated 1 to 5. The "?" explains the term. Shared by session rating and onboarding.
 */
export function SkillRater({ skill, value, onChange, question, playFormat, successes, onSuccesses, usual = false, classic = false }: {
  skill: SelfSkill; value: SkillRating | undefined; onChange: (v: SkillRating | undefined) => void; question?: string; playFormat?: string;
  /** Ask about the player's usual level (onboarding) instead of this session. */
  usual?: boolean;
  /** Five 1-5 buttons instead of the hold-to-rate pickleball (the partner's rating page, until peer coaching is simplified). */
  classic?: boolean;
  /** Shots: successes out of 10. */
  successes?: number; onSuccesses?: (n: number | undefined) => void;
}) {
  const info = skillInfo(skill, playFormat);
  const counted = !!info.success && !!onSuccesses && !classic;
  const cleared = counted ? successes !== undefined : value !== undefined;
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold" style={{ color: INK }}>{info.label}<TermHelp term={info.label} meaning={info.meaning} /></h3>
          <p className="text-sm" style={{ color: WHITE_DIM }}>{counted ? (usual ? info.success!.usual : info.success!.question) : question ?? info.question}</p>
        </div>
        {cleared && <button type="button" onClick={() => { if (counted) onSuccesses!(undefined); onChange(undefined); }}
          className="min-h-[44px] shrink-0 text-sm font-semibold underline" style={{ color: WHITE_SUB }}>Clear</button>}
      </div>
      <div className="mt-3">
        {classic
          ? <ClassicScale skill={skill} label={info.label} anchors={info.anchors} value={value} onChange={onChange} />
          : counted
          ? <HoldRater label={`${info.label}: ${usual ? info.success!.usual : info.success!.question}`} min={0} max={SUCCESS_OUT_OF} value={successes}
              onChange={(n) => { onSuccesses!(n); onChange(successToRating(n)); }}
              valueText={(n) => `${n} in · ${SUCCESS_OUT_OF - n} error${SUCCESS_OUT_OF - n === 1 ? "" : "s"} · ${n * 10}%`} />
          : <HoldRater label={`${info.label} rating, 1 lowest to 5 highest`} min={1} max={5} value={value}
              onChange={(n) => onChange(n as SkillRating)} valueText={(n) => info.anchors[n - 1]} />}
      </div>
    </Card>
  );
}

/** One skill's 1-5 rating as a W3C radio group: one tab stop, arrow keys move and select. */
function ClassicScale({ skill, label, anchors, value, onChange }: {
  skill: SelfSkill; label: string; anchors: readonly string[]; value: SkillRating | undefined; onChange: (v: SkillRating) => void;
}) {
  return <>
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={`${label} rating`}>
      {([1, 2, 3, 4, 5] as SkillRating[]).map((n) => {
        const selected = value === n;
        return <button key={n} type="button" role="radio" aria-checked={selected} aria-label={`${label} ${n} of 5: ${anchors[n - 1]}`}
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
    <p className="mt-2 min-h-[1.25rem] text-sm font-semibold" style={{ color: ACCENT_INK }}>{value ? `${value} · ${anchors[value - 1]}` : ""}</p>
  </>;
}

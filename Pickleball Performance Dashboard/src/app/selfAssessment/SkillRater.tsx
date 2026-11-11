import { RATING_MAX, skillInfo, type SelfSkill, type SkillRating } from "../../lib/coaching/selfAssessment";
import { INK, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card } from "../shell/primitives";
import { HoldRater } from "./HoldRater";
import { TermHelp } from "./TermHelp";

/**
 * One skill's rating out of 5: hold the pickleball to set it. Each number has a plain
 * description, so a 3 means the same thing every session. The "?" explains the term.
 * Shared by session rating and onboarding.
 */
export function SkillRater({ skill, value, onChange, question, playFormat }: {
  skill: SelfSkill; value: SkillRating | undefined; onChange: (v: SkillRating | undefined) => void; question?: string; playFormat?: string;
}) {
  const info = skillInfo(skill, playFormat);
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold" style={{ color: INK }}>{info.label}<TermHelp term={info.label} meaning={info.meaning} /></h3>
          <p className="text-sm" style={{ color: WHITE_DIM }}>{question ?? info.question}</p>
        </div>
        {value !== undefined && <button type="button" onClick={() => onChange(undefined)}
          className="min-h-[44px] shrink-0 text-sm font-semibold underline" style={{ color: WHITE_SUB }}>Clear</button>}
      </div>
      <div className="mt-3">
        <HoldRater label={`${info.label} rating, 1 lowest to ${RATING_MAX} highest`} min={1} max={RATING_MAX} value={value}
          onChange={(n) => onChange(n as SkillRating)} valueText={(n) => `${n}/${RATING_MAX} · ${info.anchors[n - 1]}`} />
      </div>
    </Card>
  );
}

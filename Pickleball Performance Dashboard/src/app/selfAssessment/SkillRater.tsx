import { SUCCESS_OUT_OF, skillInfo, successToRating, type SelfSkill, type SkillRating } from "../../lib/coaching/selfAssessment";
import { INK, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card } from "../shell/primitives";
import { HoldRater } from "./HoldRater";
import { TermHelp } from "./TermHelp";

/**
 * One skill's rating: hold the pickleball to set it. Shots are counted as successes out of 10
 * ("how many went in?") when `onSuccesses` is given; their 1-5 rating follows from that.
 * Other skills are rated 1 to 5. The "?" explains the term. Shared by session rating and onboarding.
 */
export function SkillRater({ skill, value, onChange, question, playFormat, successes, onSuccesses, usual = false }: {
  skill: SelfSkill; value: SkillRating | undefined; onChange: (v: SkillRating | undefined) => void; question?: string; playFormat?: string;
  /** Ask about the player's usual level (onboarding) instead of this session. */
  usual?: boolean;
  /** Shots: successes out of 10. */
  successes?: number; onSuccesses?: (n: number | undefined) => void;
}) {
  const info = skillInfo(skill, playFormat);
  const counted = !!info.success && !!onSuccesses;
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
        {counted
          ? <HoldRater label={`${info.label}: ${usual ? info.success!.usual : info.success!.question}`} min={0} max={SUCCESS_OUT_OF} value={successes}
              onChange={(n) => { onSuccesses!(n); onChange(successToRating(n)); }}
              valueText={(n) => `${n} in · ${SUCCESS_OUT_OF - n} error${SUCCESS_OUT_OF - n === 1 ? "" : "s"} · ${n * 10}%`} />
          : <HoldRater label={`${info.label} rating, 1 lowest to 5 highest`} min={1} max={5} value={value}
              onChange={(n) => onChange(n as SkillRating)} valueText={(n) => info.anchors[n - 1]} />}
      </div>
    </Card>
  );
}

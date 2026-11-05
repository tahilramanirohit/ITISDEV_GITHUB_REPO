import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import {
  friendlyDbError, getSelfAssessment, listSelfAssessments, previousAssessment, saveSelfAssessment, type SelfAssessment,
} from "../../lib/api/selfAssessment";
import { listSessions, updateMatchResult } from "../../lib/api/sessions";
import { sessionKind, type MatchResult, type SessionRow } from "../../lib/api/types";
import {
  buildSelfReport, compareSelfRatings, MIN_RATED_SKILLS, ratedSkills, SELF_SKILLS, SKILL_GROUPS, SKILL_INFO,
  type ErrorLevel, type RecoveryLevels, type SelfRatings, type SelfSkill, type SkillRating,
} from "../../lib/coaching/selfAssessment";
import { BORDER, GREEN, INK, PICKLE, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Chip, Notice, PrimaryButton, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { SelfReportView } from "./SelfReportView";
import { SkillRater } from "./SkillRater";
import { peerLowerSkills, type PeerRating } from "../../lib/coaching/peerFeedback";

export { SkillRater };

type Draft = {
  ratings: SelfRatings;
  games_played: number | null;
  games_won: number | null;
  unforced_errors: ErrorLevel | null;
  biggest_struggle: string;
  match_result: MatchResult | null;
  match_score: string;
};

const emptyDraft: Draft = { ratings: {}, games_played: null, games_won: null, unforced_errors: null, biggest_struggle: "", match_result: null, match_score: "" };
const STEPS = [...SKILL_GROUPS, "Wrap-up"] as const;

function Stepper({ label, value, onChange, max }: { label: string; value: number | null; onChange: (v: number | null) => void; max: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
      <span className="text-sm font-semibold" style={{ color: INK }}>{label}</span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={!value} onClick={() => onChange(value && value > 1 ? value - 1 : null)}
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" style={{ border: `1px solid ${BORDER}` }}><Minus size={16} /></button>
        <span className="w-6 text-center text-lg font-bold" aria-live="polite">{value ?? "–"}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={(value ?? 0) >= max} onClick={() => onChange((value ?? 0) + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" style={{ border: `1px solid ${BORDER}` }}><Plus size={16} /></button>
      </span>
    </div>
  );
}

/**
 * The In-game step: rate the session's skills and record the result.
 * `recovery` (from the post-game step) makes the plan lighter after a hard session.
 */
export function SelfAssessmentPanel({ sb, session, recovery, onSaved, peerRatings = [] }: {
  sb: SupabaseClient; session: SessionRow; recovery?: RecoveryLevels | null; onSaved?: () => void;
  /** Partners' ratings of this session; a skill they rated lower becomes the first focus. */
  peerRatings?: PeerRating[];
}) {
  const [saved, setSaved] = useState<SelfAssessment | null | undefined>(undefined);
  const resultDraft = { match_result: session.match_result ?? null, match_score: session.match_score ?? "" };
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft, ...resultDraft });
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previous, setPrevious] = useState<{ label: string; ratings: SelfRatings } | null>(null);

  const loadPrevious = useCallback(async () => {
    try {
      const [items, all] = await Promise.all([listSessions(sb), listSelfAssessments(sb)]);
      const found = previousAssessment(session, items.map((i) => i.session), all);
      setPrevious(found ? { label: `${found.session.title} (${found.session.session_date})`, ratings: found.assessment.ratings } : null);
    } catch {
      setPrevious(null);
    }
  }, [sb, session]);

  useEffect(() => {
    let active = true;
    getSelfAssessment(sb, session.id).then((row) => {
      if (!active) return;
      setSaved(row);
      setEditing(!row);
      if (row) setDraft((d) => ({ ...d, ratings: row.ratings, games_played: row.games_played, games_won: row.games_won,
        unforced_errors: row.unforced_errors, biggest_struggle: row.biggest_struggle ?? "" }));
    }).catch((e) => { if (active) { setSaved(null); setEditing(true); setError(friendlyDbError(e instanceof Error ? e.message : String(e))); } });
    void loadPrevious();
    return () => { active = false; };
  }, [sb, session.id, loadPrevious]);

  const report = useMemo(() => saved ? buildSelfReport({
    ratings: saved.ratings, goals: session.improvement_goals ?? [], biggestStruggle: saved.biggest_struggle,
    unforcedErrors: saved.unforced_errors, gamesPlayed: saved.games_played, gamesWon: saved.games_won, playFormat: session.play_format,
    recovery, peerLower: peerLowerSkills(saved.ratings, peerRatings),
  }) : null, [saved, session.improvement_goals, session.play_format, recovery, peerRatings]);

  const progress = useMemo(() => saved && previous ? compareSelfRatings(saved.ratings, previous.ratings, session.play_format) : null,
    [saved, previous, session.play_format]);

  const rate = (skill: SelfSkill, v: SkillRating | undefined) =>
    setDraft((d) => { const ratings = { ...d.ratings }; if (v) ratings[skill] = v; else delete ratings[skill]; return { ...d, ratings }; });
  const ratedCount = ratedSkills(draft.ratings).length;
  const solo = sessionKind(session) === "solo";

  async function save() {
    if (ratedCount < MIN_RATED_SKILLS) return setError(`Rate at least ${MIN_RATED_SKILLS} skills. You have rated ${ratedCount}.`);
    setBusy(true);
    setError("");
    try {
      const row = await saveSelfAssessment(sb, session.id, {
        ratings: draft.ratings, games_played: draft.games_played,
        games_won: draft.games_played == null ? null : Math.min(draft.games_won ?? 0, draft.games_played),
        unforced_errors: draft.unforced_errors, biggest_struggle: draft.biggest_struggle.trim() || null,
      });
      const score = draft.match_score.trim() || null;
      if (!solo && (draft.match_result !== (session.match_result ?? null) || score !== (session.match_score ?? null))) {
        await updateMatchResult(sb, session.id, { match_result: draft.match_result, match_score: score });
      }
      setSaved(row);
      onSaved?.();
      setEditing(false);
      setStep(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(friendlyDbError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (saved === undefined) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

  if (!editing && saved && report) {
    return <SelfReportView report={report} previousLabel={previous?.label} sessionTitle={session.title} playFormat={session.play_format}
      progress={progress}
      onEdit={() => { setEditing(true); setStep(0); }} />;
  }

  const group = STEPS[step];
  const skills = SELF_SKILLS.filter((s) => SKILL_INFO[s].group === group);
  const last = step === STEPS.length - 1;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: INK }}>Rate your game</h2>
          <span className="text-xs font-bold" style={{ color: WHITE_SUB }}>{ratedCount} of {SELF_SKILLS.length} rated</span>
        </div>
        {/* Steps as underlined tabs; any step can be opened directly. */}
        <nav aria-label="Rating steps" className="mt-2 flex gap-5 overflow-x-auto border-b" style={{ borderColor: BORDER }}>
          {STEPS.map((s, i) => <button key={s} type="button" onClick={() => { setError(""); setStep(i); }} aria-current={i === step ? "step" : undefined}
            className="-mb-px min-h-[40px] shrink-0 border-b-[3px] py-2 text-sm font-semibold"
            style={i === step ? { color: INK, borderColor: PICKLE } : { color: i < step ? GREEN : WHITE_DIM, borderColor: "transparent" }}>{s}</button>)}
        </nav>
        {step === 0 && <p className="mt-3 text-sm" style={{ color: WHITE_DIM }}>Think about this session only. 3 means "okay for my level". Skip anything that didn't come up.</p>}
      </div>

      {group !== "Wrap-up" ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{skills.map((skill) => <SkillRater key={skill} skill={skill} playFormat={session.play_format} value={draft.ratings[skill]} onChange={(v) => rate(skill, v)} />)}</div> : <div className="space-y-4 lg:max-w-xl">
        {!solo && <>
        <div>
          <p className={labelClass} style={labelStyle}>Result</p>
          <div className="flex gap-2" role="group" aria-label="Result">
            {(["win", "loss"] as MatchResult[]).map((r) => <Chip key={r} selected={draft.match_result === r}
              onClick={() => setDraft((d) => ({ ...d, match_result: d.match_result === r ? null : r }))}>{r === "win" ? "Won" : "Lost"}</Chip>)}
          </div>
        </div>
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="match-score">Score (optional)</label>
          <input id="match-score" maxLength={40} value={draft.match_score} inputMode="text" placeholder="11-7, 9-11, 11-5"
            onChange={(e) => setDraft((d) => ({ ...d, match_score: e.target.value }))} className="w-full rounded-[14px] px-4 py-3 text-base" style={fieldStyle} />
        </div>
        <Stepper label="Games played" value={draft.games_played} max={50}
          onChange={(v) => setDraft((d) => ({ ...d, games_played: v, games_won: v == null ? null : Math.min(d.games_won ?? 0, v) }))} />
        {draft.games_played != null && <Stepper label="Games won" value={draft.games_won} max={draft.games_played}
          onChange={(v) => setDraft((d) => ({ ...d, games_won: v }))} />}
        </>}
        <div>
          <p className={labelClass} style={labelStyle}>Unforced errors</p>
          <div className="flex gap-2">
            {(["few", "some", "many"] as ErrorLevel[]).map((level) => <Chip key={level} selected={draft.unforced_errors === level}
              onClick={() => setDraft((d) => ({ ...d, unforced_errors: d.unforced_errors === level ? null : level }))}>
              {level[0].toUpperCase() + level.slice(1)}</Chip>)}
          </div>
        </div>
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="struggle">What gave you the most trouble? (optional)</label>
          <textarea id="struggle" rows={3} maxLength={500} value={draft.biggest_struggle}
            onChange={(e) => setDraft((d) => ({ ...d, biggest_struggle: e.target.value }))}
            placeholder="e.g. my dinks kept popping up, I got stuck mid-court" className="w-full rounded-[14px] px-4 py-3 text-base" style={fieldStyle} />
        </div>
      </div>}

      {last && ratedCount < MIN_RATED_SKILLS && <Notice tone="warn">
        A plan needs at least {MIN_RATED_SKILLS} skills that came up in this session. You have rated {ratedCount}. Go back and rate the ones you played; skipped skills count as "didn't come up", not as low scores.
      </Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2 lg:max-w-xl">
        {step > 0 && <button type="button" onClick={() => setStep(step - 1)} aria-label="Previous step"
          className="flex min-h-[48px] w-14 items-center justify-center rounded-[14px]" style={{ border: `1px solid ${BORDER}`, background: WHITE }}><ArrowLeft size={18} /></button>}
        {last
          ? <PrimaryButton type="button" className="flex-1" disabled={busy || ratedCount < MIN_RATED_SKILLS} onClick={() => void save()}>{busy ? "Saving…" : "See my practice plan"}</PrimaryButton>
          : <PrimaryButton type="button" className="flex-1" onClick={() => { setError(""); setStep(step + 1); window.scrollTo({ top: 0 }); }}>Next</PrimaryButton>}
      </div>
      {saved && <button type="button" onClick={() => { setEditing(false); setError(""); }} className="w-full text-sm font-semibold underline" style={{ color: WHITE_DIM }}>Cancel editing</button>}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Frown, Meh, Minus, Plus, Smile, Sparkles } from "lucide-react";
import {
  friendlyDbError, getSelfAssessment, listSelfAssessments, previousAssessment, saveSelfAssessment, type SelfAssessment,
} from "../../lib/api/selfAssessment";
import { listSessions, updateMatchResult } from "../../lib/api/sessions";
import { sessionKind, type MatchResult, type SessionRow } from "../../lib/api/types";
import {
  buildSelfReport, compareSelfRatings, MIN_RATED_SKILLS, ratedSkills, SELF_SKILLS, SKILL_GROUPS, SKILL_INFO, skillInfo,
  type ErrorLevel, type RecoveryLevels, type SelfRatings, type SelfSkill, type SkillRating,
} from "../../lib/coaching/selfAssessment";
import { ACCENT_SOFT, ACCENT_INK, ACTION, ACTION_SOFT, CHECK, BORDER, GREEN, HERO, INK, ON_ACTION, ON_HERO, PICKLE, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Chip, Notice, PrimaryButton, cardStyle, numStyle, fieldStyle, labelClass, labelStyle, pressable } from "../shell/primitives";
import { SelfReportView } from "./SelfReportView";
import { SkillRater } from "./SkillRater";
import { useDataUse } from "../onboarding/DataUse";
import { parseGameScore } from "../../lib/coaching/scoreParse";
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

function Stepper({ label, value, onChange, max, auto = false, min = 1 }: { label: string; value: number | null; onChange: (v: number | null) => void; max: number; auto?: boolean; min?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
      <span className="text-sm font-semibold" style={{ color: INK }}>{label} {auto && <AutoTag />}</span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value == null} onClick={() => onChange(value != null && value > min ? value - 1 : null)}
          className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30" style={{ border: `1px solid ${BORDER}` }}><Minus size={16} /></button>
        <span style={numStyle} className="w-6 text-center text-2xl font-bold" aria-live="polite">{value ?? "–"}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={(value ?? 0) >= max} onClick={() => onChange((value ?? 0) + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30" style={{ border: `1px solid ${BORDER}` }}><Plus size={16} /></button>
      </span>
    </div>
  );
}

function AutoTag() {
  return <span className="pp-tag inline-flex rounded-full px-2 py-1 text-xs font-extrabold" style={{ background: ACCENT_SOFT, color: ACCENT_INK }}>AUTO</span>;
}

/**
 * The In-game step: rate the session's skills and record the result.
 * `recovery` (from the post-game step) makes the plan lighter after a hard session;
 * `injured` (recovery mode is on) turns it into a recovery plan.
 */
export function SelfAssessmentPanel({ sb, session, recovery, onSaved, peerRatings = [], injured = false }: {
  sb: SupabaseClient; session: SessionRow; recovery?: RecoveryLevels | null; onSaved?: () => void; injured?: boolean;
  /** Partners' ratings of this session; a skill they rated lower becomes the first focus. */
  peerRatings?: PeerRating[];
}) {
  const { analytics } = useDataUse();
  const [saved, setSaved] = useState<SelfAssessment | null | undefined>(undefined);
  const resultDraft = { match_result: session.match_result ?? null, match_score: session.match_score ?? "" };
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft, ...resultDraft });
  const [manual, setManual] = useState({ match_result: session.match_result != null, games_played: false, games_won: false });
  const parsedScore = parseGameScore(draft.match_score);
  const effective = {
    match_result: !manual.match_result && parsedScore ? parsedScore.match_result : draft.match_result,
    games_played: !manual.games_played && parsedScore ? parsedScore.games_played : draft.games_played,
    games_won: !manual.games_won && parsedScore ? parsedScore.games_won : draft.games_won,
  };
  const isAuto = (key: keyof typeof manual) => !manual[key] && parsedScore?.[key] != null;
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previous, setPrevious] = useState<{ label: string; ratings: SelfRatings } | null>(null);

  const loadPrevious = useCallback(async () => {
    if (!analytics) { setPrevious(null); return; }
    try {
      const [items, all] = await Promise.all([listSessions(sb), listSelfAssessments(sb)]);
      const found = previousAssessment(session, items.map((i) => i.session), all);
      setPrevious(found ? { label: `${found.session.title} (${found.session.session_date})`, ratings: found.assessment.ratings } : null);
    } catch {
      setPrevious(null);
    }
  }, [sb, session, analytics]);

  useEffect(() => {
    let active = true;
    getSelfAssessment(sb, session.id).then((row) => {
      if (!active) return;
      setSaved(row);
      setEditing(!row);
      if (row) setManual({ match_result: session.match_result != null, games_played: row.games_played != null, games_won: row.games_won != null });
      if (row) setDraft((d) => ({ ...d, ratings: row.ratings, games_played: row.games_played, games_won: row.games_won,
        unforced_errors: row.unforced_errors, biggest_struggle: row.biggest_struggle ?? "" }));
    }).catch((e) => { if (active) { setSaved(null); setEditing(true); setError(friendlyDbError(e instanceof Error ? e.message : String(e))); } });
    void loadPrevious();
    return () => { active = false; };
  }, [sb, session.id, loadPrevious]);

  const report = useMemo(() => saved ? buildSelfReport({
    ratings: saved.ratings, goals: session.improvement_goals ?? [], biggestStruggle: saved.biggest_struggle,
    unforcedErrors: saved.unforced_errors, gamesPlayed: saved.games_played, gamesWon: saved.games_won, playFormat: session.play_format,
    recovery, injured, peerLower: peerLowerSkills(saved.ratings, peerRatings),
  }) : null, [saved, session.improvement_goals, session.play_format, recovery, injured, peerRatings]);

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
        ratings: draft.ratings, games_played: effective.games_played,
        games_won: effective.games_played == null ? null : Math.min(effective.games_won ?? 0, effective.games_played),
        unforced_errors: draft.unforced_errors, biggest_struggle: draft.biggest_struggle.trim() || null,
      });
      const score = draft.match_score.trim() || null;
      if (!solo && (effective.match_result !== (session.match_result ?? null) || score !== (session.match_score ?? null))) {
        await updateMatchResult(sb, session.id, { match_result: effective.match_result, match_score: score });
      }
      setSaved(row);
      onSaved?.();
      setEditing(false);
      setStep(0);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(friendlyDbError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (saved === undefined) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

  if (!editing && saved && report) {
    return <SelfReportView report={report} previousLabel={previous?.label} sessionTitle={session.title} playFormat={session.play_format} planKey={session.id}
      progress={progress}
      onEdit={() => { setEditing(true); setStep(0); }} />;
  }

  const group = STEPS[step];
  const skills = SELF_SKILLS.filter((s) => SKILL_INFO[s].group === group);
  const last = step === STEPS.length - 1;

  const won = effective.match_result === "win";
  const scores = draft.match_score.split(",").map((g) => g.trim()).filter((g) => /^\d{1,2}\s*[-–:]\s*\d{1,2}$/.test(g));
  const scoreboard = !solo && (effective.match_result || effective.games_played != null) && <section aria-label="Scoreboard"
    className="relative overflow-hidden rounded-[22px] p-4" style={{ background: HERO, color: ON_HERO }}>
    <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-10 h-40 w-40 rounded-full" style={{ background: "radial-gradient(rgba(254,188,23,.3), transparent 70%)" }} />
    <div className="relative flex items-center gap-3">
      {effective.match_result && <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[16px] text-[28px]"
        style={{ ...numStyle, ...(won ? { background: ACTION, color: ON_ACTION } : { background: "#0e1a13", color: ON_HERO, border: "1px solid #5b7263" }) }}>{won ? "W" : "L"}</span>}
      <span className="min-w-0">
        {effective.games_played != null && <span className="block text-[40px] leading-none" style={{ ...numStyle, color: won ? ACTION : ON_HERO }}>
          {effective.games_won ?? 0}–{effective.games_played - (effective.games_won ?? 0)}</span>}
        <span className="mt-1 block text-sm" style={{ color: "#c6d3ca" }}>{scores.length ? scores.join(" · ") : effective.match_result ? (won ? "Won" : "Lost") : ""}</span>
      </span>
    </div>
  </section>;
  const ratedList = SELF_SKILLS.filter((sk) => draft.ratings[sk] != null);

  const resultFields = !solo && <section aria-label="Game result" className="space-y-3 rounded-[20px] border-t-4 p-4" style={{ ...cardStyle, borderTop: `4px solid ${CHECK}` }}>
    <h3 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: ACCENT_INK }}>Result</h3>
    <div><label className={labelClass} style={labelStyle} htmlFor="match-score">Score (optional)</label>
      <input id="match-score" maxLength={40} value={draft.match_score} inputMode="text" placeholder="11-7, 9-11, 11-5"
        onChange={(e) => setDraft((d) => ({ ...d, match_score: e.target.value }))} className="w-full rounded-[14px] px-4 py-3 text-base" style={fieldStyle} /></div>
    <div><p className={`${labelClass} flex items-center justify-between`} style={labelStyle}>Result {isAuto("match_result") && <AutoTag />}</p>
      <div className="flex gap-2" role="group" aria-label="Result">{(["win", "loss"] as MatchResult[]).map((r) => <Chip key={r} selected={effective.match_result === r}
        onClick={() => { setManual((m) => ({ ...m, match_result: true })); setDraft((d) => ({ ...d, match_result: effective.match_result === r ? null : r })); }}>{r === "win" ? "Won" : "Lost"}</Chip>)}</div></div>
    <Stepper label="Games played" value={effective.games_played} max={50} auto={isAuto("games_played")}
      onChange={(v) => { setManual((m) => ({ ...m, games_played: true })); setDraft((d) => ({ ...d, games_played: v })); }} />
    {effective.games_played != null && <Stepper label="Games won" value={effective.games_won == null ? null : Math.min(effective.games_won, effective.games_played)} max={effective.games_played} min={0} auto={isAuto("games_won")}
      onChange={(v) => { setManual((m) => ({ ...m, games_won: true })); setDraft((d) => ({ ...d, games_won: v })); }} />}
    {parsedScore && <p className="text-sm" style={{ color: WHITE_DIM }}>Worked out from your score. Use the controls to edit.</p>}
  </section>;

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
        {step === 0 && <p className="mt-3 text-sm" style={{ color: WHITE_DIM }}>Think about this game only. Skip anything that didn't come up.</p>}
        {last && <p className="mt-3 text-[26px] font-extrabold leading-tight" style={{ color: INK }}>{solo ? "Nice session." : "Nice game."}</p>}
      </div>

      {last && scoreboard}
      {last && ratedList.length > 0 && <section aria-label="You rated" className="rounded-[20px] p-4" style={cardStyle}>
        <h3 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: ACCENT_INK }}>You rated</h3>
        <ul className="mt-1">
          {ratedList.map((sk) => {
            const v = draft.ratings[sk]!;
            const info = skillInfo(sk, session.play_format);
            return <li key={sk} className="border-t first:border-t-0" style={{ borderColor: BORDER }}>
              <button type="button" onClick={() => setStep(SKILL_GROUPS.indexOf(SKILL_INFO[sk].group))} aria-label={`${info.label}: ${v} out of 5, ${info.anchors[v - 1]}. Change`}
                className="flex min-h-[52px] w-full items-center gap-3 py-1.5 text-left">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${ACTION} ${v * 20}%, ${BORDER} 0)` }}>
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-full text-base"
                    style={{ ...numStyle, color: "#1f1a05", background: "radial-gradient(circle at 35% 30%, #fff3b0 0 12%, #f3d46b 13%)" }}>{v}</span>
                </span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold" style={{ color: INK }}>{info.label}</span>
                  <span className="block text-[13px]" style={{ color: WHITE_DIM }}>{info.anchors[v - 1]}</span></span>
                <span className="text-xs font-semibold underline" style={{ color: WHITE_SUB }}>Change</span>
              </button>
            </li>;
          })}
        </ul>
      </section>}
      {last && resultFields}
      {group !== "Wrap-up" ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{skills.map((skill) => <SkillRater key={skill} skill={skill} playFormat={session.play_format} value={draft.ratings[skill]} onChange={(v) => rate(skill, v)} />)}</div> : <div className="space-y-4 lg:max-w-xl">
        <div>
          <p className={labelClass} style={labelStyle}>Unforced errors</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Unforced errors">
            {(["few", "some", "many"] as ErrorLevel[]).map((level) => {
              const on = draft.unforced_errors === level;
              const Icon = level === "few" ? Smile : level === "some" ? Meh : Frown;
              return <button key={level} type="button" aria-pressed={on}
                onClick={() => setDraft((d) => ({ ...d, unforced_errors: d.unforced_errors === level ? null : level }))}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[16px] text-sm font-bold ${pressable}`}
                style={{ background: on ? ACTION_SOFT : WHITE, border: `1.5px solid ${on ? ACTION : BORDER}`, color: INK }}>
                <Icon size={22} aria-hidden="true" style={{ color: on ? ACTION : WHITE_DIM }} />{level[0].toUpperCase() + level.slice(1)}</button>;
            })}
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
          ? <PrimaryButton type="button" className="flex-1" disabled={busy || ratedCount < MIN_RATED_SKILLS} onClick={() => void save()}>{busy ? "Saving…" : <span className="inline-flex items-center gap-2">See my practice plan <Sparkles size={18} aria-hidden="true" /></span>}</PrimaryButton>
          : <PrimaryButton type="button" className="flex-1" onClick={() => { setError(""); setStep(step + 1); window.scrollTo({ top: 0 }); }}>Next</PrimaryButton>}
      </div>
      {saved && <button type="button" onClick={() => { setEditing(false); setError(""); }} className="w-full text-sm font-semibold underline" style={{ color: WHITE_DIM }}>Cancel editing</button>}
    </div>
  );
}

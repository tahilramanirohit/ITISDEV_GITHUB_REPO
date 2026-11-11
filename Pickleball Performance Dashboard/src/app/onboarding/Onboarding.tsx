import { useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check } from "lucide-react";
import {
  completeOnboarding, PLAY_FREQUENCIES, PLAY_REASONS,
  type OnboardingInput, type PlayFrequency, type PlayReason, type PlayerProfile,
} from "../../lib/api/profile";
import { friendlyDbError } from "../../lib/api/selfAssessment";
import { GOAL_LABELS, IMPROVEMENT_GOALS, type ImprovementGoal } from "../../lib/api/types";
import { MIN_RATED_SKILLS, SELF_SKILLS, SKILL_GROUPS, SKILL_INFO, type SkillRating } from "../../lib/coaching/selfAssessment";
import { goalTargets } from "../../lib/coaching/goals";
import { ACTION, ON_ACTION, SURFACE, LINE, ACCENT_INK, INK_2, alpha, BORDER, CHECK, CREAM, DISPLAY_FONT, INK, ON_CHECK, ON_CREAM, SURFACE_2, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Chip, Notice, PickleSays, numStyle, pressable, rovingIndex, PrimaryButton, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { SkillRater } from "../selfAssessment/SkillRater";
import { LevelHint } from "../buddy/LevelHint";
import { CourtTests } from "../tests/CourtTests";
import { PROFILE_LEVELS } from "../../lib/api/buddy";

import { EXPERIENCE, nearestExperience } from "./experience";
export { EXPERIENCE } from "./experience";
export const LEVELS = PROFILE_LEVELS;
const FREQUENCY_LABELS: Record<PlayFrequency, string> = {
  first_time: "Just starting", monthly: "A few times a month", weekly: "About once a week", few_per_week: "2–3 times a week", daily: "Almost every day",
};
const REASON_LABELS: Record<PlayReason, string> = {
  fun: "Fun", fitness: "Fitness", social: "Meeting people", compete: "Winning more games", tournaments: "Tournaments",
};
const GOAL_HINTS: Record<ImprovementGoal, string> = {
  positioning: "Moving up to the net and footwork",
  shot_outcomes: "Returns, consistency, shot choice",
  shot_technique: "Serve, drops, dinks and volleys",
};
const HANDS = [["right", "Right"], ["left", "Left"], ["ambidextrous", "Both"]] as const;
const FORMATS = [["doubles", "Doubles"], ["singles", "Singles"], ["both", "Both"]] as const;
const STEPS = ["About you", "Your game", "Why you play", "Your goals", "Your skills", "Court tests"] as const;
/** The profile is saved after "Your skills"; the court tests that follow are optional. */
const SKILLS_STEP = 4;

function Question({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className={labelClass} style={labelStyle}>{label}</p><div className="flex flex-wrap gap-2">{children}</div></div>;
}

/**
 * Getting to know the player, shown once after the account is created. The
 * answers fill the private profile and a starting practice plan.
 */
export function Onboarding({ sb, userId, initial, onDone, onCancel }: {
  sb: SupabaseClient; userId: string; initial: PlayerProfile | null; onDone: () => void; onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingInput>({
    display_name: initial?.display_name === "Player" && !initial?.onboarding_completed_at ? "" : initial?.display_name ?? "",
    is_adult_confirmed: initial?.is_adult_confirmed ?? false,
    years_playing: nearestExperience(initial?.years_playing),
    play_frequency: initial?.play_frequency ?? null,
    usual_format: initial?.usual_format ?? null,
    dominant_hand: initial?.dominant_hand ?? null,
    self_level: initial?.self_level ?? null,
    play_reasons: initial?.play_reasons ?? [],
    main_goals: initial?.main_goals ?? [],
    baseline_ratings: initial?.baseline_ratings ?? {},
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof OnboardingInput>(k: K, v: OnboardingInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = <T,>(list: T[], v: T) => list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  function next() {
    setError("");
    if (step === 0 && !form.display_name.trim()) return setError("Tell us what to call you.");
    if (step === 3 && !form.main_goals.length) return setError("Pick at least one thing to work on.");
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    if (ratedCount < MIN_RATED_SKILLS) return setError(`Rate at least ${MIN_RATED_SKILLS} skills so Pickle can set your goals. You have rated ${ratedCount}.`);
    setBusy(true);
    setError("");
    try {
      await completeOnboarding(sb, userId, { ...form, display_name: form.display_name.trim() });
      setBusy(false);
      setStep(SKILLS_STEP + 1);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(friendlyDbError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
      setBusy(false);
    }
  }

  const ratedCount = Object.keys(form.baseline_ratings).length;
  const last = step === SKILLS_STEP;
  const testsStep = step === SKILLS_STEP + 1;
  const enough = ratedCount >= MIN_RATED_SKILLS;
  const goals = enough ? goalTargets(form.baseline_ratings, form.main_goals) : [];

  return (
    <div className="mx-auto flex min-h-[85dvh] max-w-2xl flex-col gap-5 pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
      <div>
        <div className="flex min-h-[44px] items-center justify-between text-sm font-bold">
          <button type="button" className="inline-flex min-h-[44px] items-center gap-1" style={{ color: ACCENT_INK }} onClick={() => { if (step > 0) { setError(""); setStep(step - 1); } else if (onCancel) onCancel(); else void sb.auth.signOut(); }}><ArrowLeft size={16} />{step === 0 ? "Cancel" : "Back"}</button>
          <span style={{ color: INK_2 }}>{testsStep ? "Optional court tests" : `Step ${step + 1} of ${SKILLS_STEP + 1}`}</span>
        </div>
        {!testsStep && <div className="mt-3 grid grid-cols-5 gap-1" aria-hidden="true">{STEPS.slice(0, SKILLS_STEP + 1).map((s, i) => <span key={s} className="h-1.5 rounded-full" style={{ background: i <= step ? ACTION : SURFACE_2 }} />)}</div>}
        {!testsStep && <><p className="mt-5 text-sm font-extrabold uppercase tracking-wide" style={{ color: ACCENT_INK }}>Let's get to know your game</p><h1 className="mt-1 text-2xl font-extrabold" style={{ color: INK }}>{STEPS[step]}</h1></>}
      </div>

      {step === 0 && <div className="space-y-4">
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="onboard-name">What should we call you?</label>
          <input id="onboard-name" autoComplete="given-name" maxLength={80} value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)} className="w-full rounded-[14px] px-4 py-3 text-base" style={fieldStyle} />
        </div>
        <div>
          <h2 id="experience-label" className="text-xl font-extrabold leading-tight">How long have you been playing pickleball?</h2>
          <p className="mt-1 text-base" style={{ color: INK_2 }}>Count from your first game.</p>
          <div role="radiogroup" aria-labelledby="experience-label" className="mt-3 grid grid-cols-2 gap-2.5">
            {EXPERIENCE.map((e, i) => {
              const selected = form.years_playing === e.years;
              return <button key={e.years} type="button" role="radio" aria-checked={selected} aria-label={e.label}
                tabIndex={selected || (form.years_playing == null && i === 0) ? 0 : -1}
                onKeyDown={(event) => { const next = rovingIndex(event.key, i, EXPERIENCE.length); if (next == null) return; event.preventDefault(); set("years_playing", EXPERIENCE[next].years); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }}
                onClick={() => set("years_playing", e.years)}
                className={`min-h-[88px] rounded-[22px] border border-t-4 px-3 py-2 text-left ${i === 4 ? "col-span-2 flex min-h-[64px] items-center gap-3" : ""} ${pressable}`}
                style={{ background: selected ? ACTION : SURFACE, color: selected ? ON_ACTION : ACCENT_INK, borderColor: selected ? ACTION : LINE, borderTopColor: selected ? ACTION : CHECK, boxShadow: selected ? `0 4px 20px ${alpha(ACTION, 18)}` : "none" }}>
                <span className="block text-[36px] leading-none" style={numStyle}>{e.number}</span><span className="mt-1 block text-sm font-bold" style={{ color: selected ? ON_ACTION : INK_2 }}>{e.unit}</span>
              </button>;
            })}
          </div>
          {form.years_playing != null && <div className="mt-3" aria-live="polite"><PickleSays size="sm" title={EXPERIENCE.find((e) => e.years === form.years_playing)?.reply} /></div>}
        </div>
      </div>}

      {step === 1 && <div className="space-y-5">
        <Question label="How often do you play?">
          {PLAY_FREQUENCIES.map((f) => <Chip key={f} selected={form.play_frequency === f} onClick={() => set("play_frequency", f)}>{FREQUENCY_LABELS[f]}</Chip>)}
        </Question>
        <Question label="What do you usually play?">
          {FORMATS.map(([v, l]) => <Chip key={v} selected={form.usual_format === v} onClick={() => set("usual_format", v)}>{l}</Chip>)}
        </Question>
        <Question label="Which hand holds the paddle?">
          {HANDS.map(([v, l]) => <Chip key={v} selected={form.dominant_hand === v} onClick={() => set("dominant_hand", v)}>{l}</Chip>)}
        </Question>
      </div>}

      {step === 2 && <div className="space-y-5">
        <Question label="Where would you place your level?">
          {LEVELS.map((l) => <Chip key={l} selected={form.self_level === l} onClick={() => set("self_level", l)}>{l}</Chip>)}
          <LevelHint level={form.self_level} />
        </Question>
        <Question label="Why do you play? Pick any.">
          {PLAY_REASONS.map((r) => <Chip key={r} selected={form.play_reasons.includes(r)} onClick={() => set("play_reasons", toggle(form.play_reasons, r))}>{REASON_LABELS[r]}</Chip>)}
        </Question>
      </div>}

      {step === 3 && <div className="space-y-2">
        <p className={labelClass} style={labelStyle}>What do you most want to improve? Pick one or more.</p>
        {IMPROVEMENT_GOALS.map((goal) => {
          const selected = form.main_goals.includes(goal);
          return <button key={goal} type="button" aria-pressed={selected} onClick={() => set("main_goals", toggle(form.main_goals, goal))}
            className="flex w-full items-center gap-3 rounded-[14px] p-4 text-left"
            style={{ background: WHITE, border: `${selected ? 2 : 1}px solid ${selected ? INK : BORDER}` }}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" aria-hidden="true"
              style={{ background: selected ? INK : WHITE, border: `1.5px solid ${selected ? INK : "var(--pp-line-strong)"}`, color: WHITE }}>{selected && <Check size={15} strokeWidth={3} />}</span>
            <span><strong className="block text-sm" style={{ color: INK }}>{GOAL_LABELS[goal]}</strong>
              <span className="block text-xs" style={{ color: WHITE_DIM }}>{GOAL_HINTS[goal]}</span></span>
          </button>;
        })}
      </div>}

      {step === 4 && <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-extrabold leading-tight" style={{ color: INK, fontFamily: DISPLAY_FONT }}>Where is your game today?</h2>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: WHITE_DIM }}>
            This is your <strong style={{ color: INK }}>baseline</strong>. Pickle sets your goals from your lowest skills. Skip any you're unsure about.
          </p>
        </div>
        <div role="status" aria-live="polite" className="flex items-center gap-2.5 rounded-[14px] px-3 py-2.5" style={{ background: SURFACE_2 }}>
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black"
            style={enough ? { background: CHECK, color: ON_CHECK } : { border: `2px solid ${BORDER}`, color: WHITE_SUB }}>{enough ? <Check size={15} strokeWidth={3} /> : ratedCount}</span>
          <span className="text-sm"><strong style={{ color: INK }}>{ratedCount} rated</strong> <span style={{ color: WHITE_DIM }}>· at least {MIN_RATED_SKILLS} needed</span></span>
        </div>
        {SKILL_GROUPS.map((group) => <section key={group} className="space-y-3">
          <h2 className="text-sm font-bold" style={{ color: WHITE_SUB }}>{group}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
          {SELF_SKILLS.filter((s) => SKILL_INFO[s].group === group).map((skill) => (
            <SkillRater key={skill} skill={skill} value={form.baseline_ratings[skill]} question="Your usual level"
              onChange={(v?: SkillRating) => setForm((f) => {
                const ratings = { ...f.baseline_ratings };
                if (v) ratings[skill] = v; else delete ratings[skill];
                return { ...f, baseline_ratings: ratings };
              })} />
          ))}
          </div>
        </section>)}
        {goals.length > 0 && <section aria-label="Your goals" className="rounded-[18px] p-4" style={{ background: CREAM, color: ON_CREAM }}>
          <p className="text-xs font-extrabold tracking-wide" style={{ color: ON_CREAM }}>YOUR GOALS FOR THE NEXT 4 WEEKS</p>
          <p className="mt-1.5 text-[15px] font-extrabold">{goals.map((g) => `${g.label} ${g.from} → ${g.target}`).join(" · ")}</p>
          <p className="mt-1 text-[13px]" style={{ color: ON_CREAM }}>From your lowest ratings. Track them on the Progress page.</p>
        </section>}
      </div>}

      {testsStep && <div className="space-y-3">
        <div>
          <h2 className="text-2xl font-extrabold leading-tight" style={{ color: INK, fontFamily: DISPLAY_FONT }}>Quick court tests</h2>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: WHITE_DIM }}>
            Your profile is saved. These counted drills give Pickle a <strong style={{ color: INK }}>measured baseline</strong> next to your ratings.
            Do them now at the court, or later from Progress.</p>
        </div>
        <CourtTests sb={sb} onSkip={onDone} onSaved={onDone} />
      </div>}

      {error && <Notice tone="error">{error}</Notice>}
      {testsStep ? null : last
        ? <PrimaryButton type="button" className="w-full" disabled={busy} onClick={() => void finish()}>{busy ? "Saving…" : "Save · next: quick court tests"}</PrimaryButton>
        : <PrimaryButton type="button" className="mt-auto w-full" onClick={next}>Continue</PrimaryButton>}
    </div>
  );
}

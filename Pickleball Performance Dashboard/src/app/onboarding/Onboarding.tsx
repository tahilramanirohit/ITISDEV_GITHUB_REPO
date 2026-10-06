import { useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check } from "lucide-react";
import {
  completeOnboarding, PLAY_FREQUENCIES, PLAY_REASONS,
  type OnboardingInput, type PlayFrequency, type PlayReason, type PlayerProfile,
} from "../../lib/api/profile";
import { friendlyDbError } from "../../lib/api/selfAssessment";
import { GOAL_LABELS, IMPROVEMENT_GOALS, type ImprovementGoal } from "../../lib/api/types";
import { SELF_SKILLS, SKILL_GROUPS, SKILL_INFO, type SkillRating } from "../../lib/coaching/selfAssessment";
import { BORDER, DISPLAY_FONT, GREEN, INK, NAVY, OPTIC, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Chip, Notice, PrimaryButton, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { SkillRater } from "../selfAssessment/SelfAssessmentPanel";

export const EXPERIENCE = [
  { years: 0, label: "Brand new" }, { years: 0.5, label: "Under a year" }, { years: 1.5, label: "1–2 years" },
  { years: 3, label: "2–5 years" }, { years: 5, label: "5+ years" },
] as const;
export const LEVELS = ["New to the game", "Beginner (2.0–2.5)", "Intermediate (3.0–3.5)", "Advanced (4.0+)", "Not sure"] as const;
const FREQUENCY_LABELS: Record<PlayFrequency, string> = {
  first_time: "Just starting", monthly: "A few times a month", weekly: "About once a week", few_per_week: "2–3 times a week", daily: "Almost every day",
};
const REASON_LABELS: Record<PlayReason, string> = {
  fun: "Fun", fitness: "Fitness", social: "Meeting people", compete: "Winning more games", tournaments: "Tournaments",
};
const GOAL_HINTS: Record<ImprovementGoal, string> = {
  positioning: "Getting to the kitchen line, transition, footwork",
  shot_outcomes: "Returns, consistency, shot choice",
  shot_technique: "Serve, drops, dinks and volleys",
};
const HANDS = [["right", "Right"], ["left", "Left"], ["ambidextrous", "Both"]] as const;
const FORMATS = [["doubles", "Doubles"], ["singles", "Singles"], ["both", "Both"]] as const;
const STEPS = ["About you", "Your game", "Why you play", "Your goals", "Your skills"] as const;

function nearestExperience(years: number | null | undefined) {
  if (years == null) return null;
  return EXPERIENCE.reduce((best, e) => Math.abs(e.years - years) < Math.abs(best.years - years) ? e : best).years;
}

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
    display_name: initial?.display_name ?? "",
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
    if (step === 0 && !form.is_adult_confirmed) return setError("PicklePro is for players aged 18 and over.");
    if (step === 3 && !form.main_goals.length) return setError("Pick at least one thing to work on.");
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      await completeOnboarding(sb, userId, { ...form, display_name: form.display_name.trim() });
      onDone();
    } catch (e) {
      setError(friendlyDbError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
      setBusy(false);
    }
  }

  const ratedCount = Object.keys(form.baseline_ratings).length;
  const last = step === STEPS.length - 1;

  return (
    <div className="space-y-5">
      {step === 0 ? (
        <section className="relative overflow-hidden rounded-3xl p-5" style={{ background: NAVY, color: WHITE }}>
          <div aria-hidden="true" className="absolute -right-10 -top-10 h-36 w-36 rounded-full" style={{ background: OPTIC, opacity: 0.2 }} />
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: OPTIC }}>Welcome to PicklePro</p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight" style={{ fontFamily: DISPLAY_FONT }}>Let's get to know your game</h1>
          <p className="mt-2 text-sm" style={{ color: "#c9cdd4" }}>Five quick steps, about two minutes. Your answers stay private and shape your first practice plan.</p>
        </section>
      ) : (
        <button type="button" onClick={() => { setError(""); setStep(step - 1); }} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>
          <ArrowLeft size={16} /> Back
        </button>
      )}

      <div>
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span style={{ color: GREEN }}>Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
          {onCancel && <button type="button" onClick={onCancel} className="normal-case underline" style={{ color: WHITE_SUB }}>Cancel</button>}
        </div>
        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }} aria-hidden="true">
          {STEPS.map((s, i) => <span key={s} className="h-1.5 rounded-full" style={{ background: i <= step ? INK : "#dcdfd8" }} />)}
        </div>
      </div>

      {step === 0 && <div className="space-y-4">
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="onboard-name">What should we call you?</label>
          <input id="onboard-name" autoComplete="given-name" maxLength={80} value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)} className="w-full rounded-2xl px-4 py-3 text-base" style={fieldStyle} />
        </div>
        <label className="flex items-start gap-3 rounded-2xl p-4 text-sm" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={form.is_adult_confirmed} onChange={(e) => set("is_adult_confirmed", e.target.checked)} />
          <span>I am at least 18 years old. This does not make my profile visible to others.</span>
        </label>
      </div>}

      {step === 1 && <div className="space-y-5">
        <Question label="How long have you played pickleball?">
          {EXPERIENCE.map((e) => <Chip key={e.label} selected={form.years_playing === e.years} onClick={() => set("years_playing", e.years)}>{e.label}</Chip>)}
        </Question>
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
            className="flex w-full items-center gap-3 rounded-2xl p-4 text-left"
            style={{ background: WHITE, border: `${selected ? 2 : 1}px solid ${selected ? INK : BORDER}` }}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" aria-hidden="true"
              style={{ background: selected ? INK : WHITE, border: `1.5px solid ${selected ? INK : "#c5c8c1"}`, color: WHITE }}>{selected && <Check size={15} strokeWidth={3} />}</span>
            <span><strong className="block text-sm" style={{ color: INK }}>{GOAL_LABELS[goal]}</strong>
              <span className="block text-xs" style={{ color: WHITE_DIM }}>{GOAL_HINTS[goal]}</span></span>
          </button>;
        })}
      </div>}

      {step === 4 && <div className="space-y-4">
        <p className="text-sm" style={{ color: WHITE_DIM }}>
          How does each skill usually go for you? 3 means "okay for my level". Skip any you're unsure about. Rate at least 3 to get a starting plan ({ratedCount} rated).
        </p>
        {SKILL_GROUPS.map((group) => <section key={group} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: WHITE_SUB }}>{group}</h2>
          <div className="grid gap-3 md:grid-cols-2">
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
      </div>}

      {error && <Notice tone="error">{error}</Notice>}
      {last
        ? <PrimaryButton type="button" className="w-full" disabled={busy} onClick={() => void finish()}>{busy ? "Saving…" : ratedCount ? "Finish and see my plan" : "Skip and finish"}</PrimaryButton>
        : <PrimaryButton type="button" className="w-full" onClick={next}>Continue</PrimaryButton>}
    </div>
  );
}

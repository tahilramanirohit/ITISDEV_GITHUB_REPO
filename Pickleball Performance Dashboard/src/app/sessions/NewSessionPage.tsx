import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Camera, Check, ClipboardCheck } from "lucide-react";
import { createSession, type NewSession } from "../../lib/api/sessions";
import { friendlyDbError } from "../../lib/api/selfAssessment";
import { getProfile } from "../../lib/api/profile";
import {
  CONTEXT_LABELS, FORMAT_LABELS, PLAY_FORMATS, SESSION_CONTEXTS, type ReviewMode,
} from "../../lib/api/types";
import { BORDER, CARD_GLOW, GREEN, GREEN_BG, INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Chip, Notice, PrimaryButton, ScreenTitle, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { GoalFields } from "./GoalFields";

const today = () => new Date().toISOString().slice(0, 10);

function defaultTitle(date: string, context: NewSession["session_context"]) {
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday} ${CONTEXT_LABELS[context].toLowerCase()}`;
}

function ModeCard({ selected, onSelect, icon, title, detail, tag }: {
  selected: boolean; onSelect: () => void; icon: ReactNode; title: string; detail: string; tag: string;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
      style={{ background: WHITE, boxShadow: CARD_GLOW, border: `2px solid ${selected ? INK : BORDER}` }}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: selected ? INK : GREEN_BG, color: selected ? WHITE : GREEN }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-base font-bold" style={{ color: INK }}>{title}</span>
          {selected && <Check size={18} style={{ color: INK }} aria-hidden="true" />}
        </span>
        <span className="mt-0.5 block text-sm leading-snug" style={{ color: WHITE_DIM }}>{detail}</span>
        <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: GREEN_BG, color: GREEN }}>{tag}</span>
      </span>
    </button>
  );
}

export default function NewSessionPage({ sb, userId, trialNoWorker = false }: { sb: SupabaseClient; userId?: string; trialNoWorker?: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get("mode");
  const [step, setStep] = useState<1 | 2>(preset === "self" || preset === "video" ? 2 : 1);
  const [form, setForm] = useState<NewSession>({
    title: "", session_date: today(), session_context: "casual_match", play_format: "doubles",
    performance_scope: "individual", review_mode: preset === "video" ? "video" : "self", notes: null, improvement_goals: [],
    positioning_rating: null, shot_outcomes_rating: null, shot_technique_rating: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof NewSession>(k: K, v: NewSession[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Start from what the player told us when they joined; they can still change it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    getProfile(sb, userId).then((p) => {
      if (!active || !p) return;
      setForm((f) => ({
        ...f,
        improvement_goals: f.improvement_goals.length ? f.improvement_goals : p.main_goals ?? [],
        play_format: p.usual_format === "singles" ? "singles" : p.usual_format === "doubles" ? "doubles" : f.play_format,
      }));
    }).catch(() => {});
    return () => { active = false; };
  }, [sb, userId]);
  const chooseMode = (mode: ReviewMode) => set("review_mode", mode);

  async function submit() {
    if (!form.improvement_goals.length) return setError("Choose at least one thing to improve.");
    setBusy(true);
    setError("");
    try {
      const title = form.title.trim() || defaultTitle(form.session_date, form.session_context);
      const s = await createSession(sb, { ...form, title, notes: form.notes?.trim() || null });
      navigate(`/sessions/${s.id}`);
    } catch (err) {
      setError(friendlyDbError(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {step === 2 && <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>
        <ArrowLeft size={16} /> Back
      </button>}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: GREEN }}>Step {step} of 2</p>
        <ScreenTitle title={step === 1 ? "Log a session" : "About this session"}
          subtitle={step === 1 ? "How do you want to review your game?" : "A few taps. Everything except your focus is optional."} />
      </div>

      {step === 1 && <>
        <div className="space-y-3">
          <ModeCard selected={form.review_mode === "self"} onSelect={() => chooseMode("self")} icon={<ClipboardCheck size={24} />}
            title="Rate my own game" tag="No video · about 2 minutes"
            detail="Rate ten skills from how the session felt. You get focus areas, drills and a practice plan right away." />
          <ModeCard selected={form.review_mode === "video"} onSelect={() => chooseMode("video")} icon={<Camera size={24} />}
            title="Analyze a video" tag="Computer vision · takes longer"
            detail="Upload a clip from a fixed camera. PicklePro maps where you stood on court. You can rate yourself too." />
        </div>
        {form.review_mode === "video" && trialNoWorker && <Notice tone="info">Video analysis is paused on this public trial. You can still create the session and rate yourself.</Notice>}
        <PrimaryButton type="button" className="w-full" onClick={() => setStep(2)}>Continue</PrimaryButton>
      </>}

      {step === 2 && <>
        <section className="space-y-2">
          <p className={labelClass} style={labelStyle}>What kind of session?</p>
          <div className="flex flex-wrap gap-2">
            {SESSION_CONTEXTS.map((c) => <Chip key={c} selected={form.session_context === c} onClick={() => set("session_context", c)}>{CONTEXT_LABELS[c]}</Chip>)}
          </div>
        </section>
        <section className="space-y-2">
          <p className={labelClass} style={labelStyle}>Format</p>
          <div className="flex flex-wrap gap-2">
            {PLAY_FORMATS.map((f) => <Chip key={f} selected={form.play_format === f} onClick={() => set("play_format", f)}>{FORMAT_LABELS[f]}</Chip>)}
          </div>
        </section>
        <GoalFields value={form} onChange={(goals) => setForm((current) => ({ ...current, ...goals }))} />
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass} style={labelStyle} htmlFor="title">Name (optional)</label>
            <input id="title" maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)}
              placeholder={defaultTitle(form.session_date, form.session_context)} className="w-full rounded-2xl px-4 py-3 text-base" style={fieldStyle} />
          </div>
          <div className="col-span-2">
            <label className={labelClass} style={labelStyle} htmlFor="date">Date</label>
            <input id="date" type="date" value={form.session_date} onChange={(e) => set("session_date", e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-base" style={fieldStyle} />
          </div>
          <div className="col-span-2">
            <label className={labelClass} style={labelStyle} htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" rows={2} maxLength={2000} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
              placeholder="Where you played, who with, anything to remember" className="w-full rounded-2xl px-4 py-3 text-base" style={fieldStyle} />
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <PrimaryButton type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
          {busy ? "Creating…" : form.review_mode === "self" ? "Start rating" : "Continue to video upload"}
        </PrimaryButton>
        <p className="text-center text-xs" style={{ color: WHITE_SUB }}>Your sessions are private to your account.</p>
      </>}
    </div>
  );
}

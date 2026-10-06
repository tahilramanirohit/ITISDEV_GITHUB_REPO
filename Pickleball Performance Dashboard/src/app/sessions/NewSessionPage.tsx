import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Camera, Check, ClipboardCheck } from "lucide-react";
import { createSession, type NewSession } from "../../lib/api/sessions";
import { friendlyDbError } from "../../lib/api/selfAssessment";
import { getProfile } from "../../lib/api/profile";
import {
  CONTEXT_LABELS, FORMAT_LABELS, KIND_LABELS, SOLO_FORMATS,
  type MatchResult, type PlayFormat, type ReviewMode, type SessionContext, type SessionKind,
} from "../../lib/api/types";
import { saveOtherPlayers, type OtherPlayer } from "../../lib/api/players";
import { BORDER, CARD_GLOW, GREEN, GREEN_BG, INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Chip, Notice, PrimaryButton, ScreenTitle, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { GoalFields } from "./GoalFields";

const today = () => new Date().toISOString().slice(0, 10);
const ROUNDS = ["Pool play", "Round of 16", "Quarterfinal", "Semifinal", "Final", "Other"];

function defaultTitle(date: string, context: NewSession["session_context"]) {
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday} ${CONTEXT_LABELS[context].toLowerCase()}`;
}

function ModeCard({ selected, onSelect, icon, title, detail, tag }: {
  selected: boolean; onSelect: () => void; icon: ReactNode; title: string; detail: string; tag: string;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
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
  const [kind, setKindState] = useState<SessionKind>("match");
  const [partner, setPartner] = useState("");
  const [opponents, setOpponents] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof NewSession>(k: K, v: NewSession[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setKind = (next: SessionKind, format?: PlayFormat | null) => {
    setKindState(next);
    setForm((f) => {
      const court = f.play_format === "singles" || f.play_format === "doubles";
      if (next === "solo") return { ...f, session_context: "practice", play_format: format && SOLO_FORMATS.includes(format) ? format : "drill_other" };
      const play_format: PlayFormat = format === "singles" || format === "doubles" ? format : court ? f.play_format : "doubles";
      return { ...f, play_format, session_context: next === "tournament" ? "tournament" : f.session_context === "tournament" || f.session_context === "drill" ? "casual_match" : f.session_context };
    });
  };
  // Start from what the player told us when they joined; they can still change it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    getProfile(sb, userId).then((p) => {
      if (!active || !p) return;
      // Saved default settings win over the onboarding answers.
      const format = p.default_play_format ?? (p.usual_format === "singles" || p.usual_format === "doubles" ? p.usual_format : null);
      setForm((f) => ({
        ...f,
        improvement_goals: f.improvement_goals.length ? f.improvement_goals : p.main_goals ?? [],
        review_mode: preset ? f.review_mode : p.default_review_mode ?? f.review_mode,
      }));
      setKind(p.default_session_kind ?? "match", format);
    }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per player
  }, [sb, userId]);
  const chooseMode = (mode: ReviewMode) => set("review_mode", mode);

  async function submit() {
    if (!form.improvement_goals.length) return setError("Choose at least one thing to improve.");
    setBusy(true);
    setError("");
    try {
      const title = form.title.trim() || (kind === "tournament" && form.tournament_name?.trim()) || defaultTitle(form.session_date, form.session_context);
      const { tournament_name, tournament_round, match_result, match_score, ...base } = form;
      // Tournament fields are only sent for tournaments, so other sessions also work on older databases.
      const tournament = kind === "tournament" ? {
        tournament_name: tournament_name?.trim() || null, tournament_round: tournament_round || null,
        match_result: match_result ?? null, match_score: match_score?.trim() || null,
      } : {};
      const s = await createSession(sb, { ...base, ...tournament, title, notes: form.notes?.trim() || null });
      const players: OtherPlayer[] = kind === "solo" ? [] : [
        ...(form.play_format === "doubles" ? [{ role: "partner" as const, display_name: partner }] : []),
        ...opponents.slice(0, form.play_format === "doubles" ? 2 : 1).map((name) => ({ role: "opponent" as const, display_name: name })),
      ];
      if (players.some((p) => p.display_name.trim())) {
        // Names are a convenience: the session is already saved, so a failure here does not block it.
        await saveOtherPlayers(sb, s.id, players).catch(() => {});
      }
      navigate(`/sessions/${s.id}`);
    } catch (err) {
      setError(friendlyDbError(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-3xl">
      {step === 2 && <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>
        <ArrowLeft size={16} /> Back
      </button>}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: GREEN }}>Step {step} of 2</p>
        <ScreenTitle title={step === 1 ? "Log a session" : "About this session"}
          subtitle={step === 1 ? "How do you want to review your game?" : "A few taps. Everything except your focus is optional."} />
      </div>

      {step === 1 && <>
        <div className="grid gap-3 lg:grid-cols-2">
          <ModeCard selected={form.review_mode === "self"} onSelect={() => chooseMode("self")} icon={<ClipboardCheck size={24} />}
            title="Rate my own game" tag="No video · about 2 minutes to rate"
            detail="Rate ten skills from how the session felt. You get focus areas, drills and a practice plan right away." />
          <ModeCard selected={form.review_mode === "video"} onSelect={() => chooseMode("video")} icon={<Camera size={24} />}
            title="Analyze a video" tag="Computer vision · takes longer"
            detail="Upload a rally clip. PicklePro maps where you stood on court. Best results need a fixed camera and a clear court view. Moving-camera clips may produce limited results. You can rate yourself too." />
        </div>
        {form.review_mode === "video" && trialNoWorker && <Notice tone="info">Video analysis is paused on this public trial. You can still create the session and rate yourself.</Notice>}
        <PrimaryButton type="button" className="w-full" onClick={() => setStep(2)}>Continue</PrimaryButton>
      </>}

      {step === 2 && <>
        <section className="space-y-2">
          <p className={labelClass} style={labelStyle}>What kind of session?</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Session kind">
            {(["solo", "match", "tournament"] as SessionKind[]).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
              className="min-h-[52px] rounded-full px-2 text-sm font-bold" style={kind === k ? { background: INK, color: WHITE } : { background: WHITE, color: INK, border: `1px solid ${BORDER}` }}>
              {KIND_LABELS[k]}</button>)}
          </div>
          <p className="text-xs" style={{ color: WHITE_SUB }}>
            {kind === "solo" ? "On your own: drills, wall practice or a ball machine." : kind === "match" ? "Games against other players outside a tournament." : "An official tournament match, with its round and score."}
          </p>
        </section>
        {kind !== "tournament" && <section className="space-y-2">
          <p className={labelClass} style={labelStyle}>{kind === "solo" ? "Type of practice" : "Setting"}</p>
          <div className="flex flex-wrap gap-2">
            {(kind === "solo" ? ["practice", "drill"] : ["casual_match", "leveling_game", "practice"] as SessionContext[]).map((c) =>
              <Chip key={c} selected={form.session_context === c} onClick={() => set("session_context", c as SessionContext)}>{CONTEXT_LABELS[c as SessionContext]}</Chip>)}
          </div>
          {kind === "match" && <p className="text-xs" style={{ color: WHITE_SUB }}>
            {form.session_context === "leveling_game" ? "Leveling game: a game used to place you in a skill level or group, such as at a club or open play."
              : form.session_context === "practice" ? "Practice match: a game where trying things matters more than the score."
              : "Casual match: a friendly game, such as open play."}
          </p>}
        </section>}
        <section className="space-y-2">
          <p className={labelClass} style={labelStyle}>Format</p>
          <div className="flex flex-wrap gap-2">
            {(kind === "solo" ? SOLO_FORMATS : ["singles", "doubles"] as PlayFormat[]).map((f) => <Chip key={f} selected={form.play_format === f} onClick={() => set("play_format", f)}>{FORMAT_LABELS[f]}</Chip>)}
          </div>
          {kind === "solo" && form.review_mode === "video" && form.play_format !== "drill_other" &&
            <p className="text-xs" style={{ color: WHITE_SUB }}>Wall and ball-machine sessions are rated only; video analysis needs a court view.</p>}
        </section>
        {kind === "tournament" && <section className="space-y-3 rounded-2xl p-4" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
          <p className="text-sm font-bold" style={{ color: INK }}>Tournament match</p>
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="tournament-name">Tournament</label>
            <input id="tournament-name" maxLength={120} value={form.tournament_name ?? ""} onChange={(e) => set("tournament_name", e.target.value)}
              placeholder="e.g. Manila Open 2026" className="w-full rounded-2xl px-4 py-3 text-base" style={fieldStyle} />
          </div>
          <div>
            <p className={labelClass} style={labelStyle}>Round</p>
            <div className="flex flex-wrap gap-2">{ROUNDS.map((r) => <Chip key={r} selected={form.tournament_round === r} onClick={() => set("tournament_round", form.tournament_round === r ? null : r)}>{r}</Chip>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelClass} style={labelStyle}>Result</p>
              <div className="flex gap-2">{(["win", "loss"] as MatchResult[]).map((r) => <Chip key={r} selected={form.match_result === r}
                onClick={() => set("match_result", form.match_result === r ? null : r)}>{r === "win" ? "Won" : "Lost"}</Chip>)}</div>
            </div>
            <div className="min-w-0">
              <label className={labelClass} style={labelStyle} htmlFor="score">Score</label>
              <input id="score" maxLength={40} value={form.match_score ?? ""} onChange={(e) => set("match_score", e.target.value)}
                placeholder="11-7, 9-11, 11-5" className="w-full min-w-0 rounded-2xl px-4 py-3 text-base" style={fieldStyle} />
            </div>
          </div>
        </section>}
        {kind !== "solo" && <section className="space-y-2">
          <p className={labelClass} style={labelStyle}>Who did you play with? (optional)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {form.play_format === "doubles" && <input aria-label="Partner name" maxLength={80} value={partner} onChange={(e) => setPartner(e.target.value)}
              placeholder="Partner" className="w-full rounded-2xl px-4 py-3 text-base sm:col-span-2" style={fieldStyle} />}
            {opponents.slice(0, form.play_format === "doubles" ? 2 : 1).map((name, i) => <input key={i} aria-label={`Opponent ${i + 1} name`} maxLength={80} value={name}
              onChange={(e) => setOpponents((o) => o.map((v, j) => j === i ? e.target.value : v))}
              placeholder={form.play_format === "doubles" ? `Opponent ${i + 1}` : "Opponent"} className="w-full rounded-2xl px-4 py-3 text-base" style={fieldStyle} />)}
          </div>
          <p className="text-xs" style={{ color: WHITE_SUB }}>Names stay private to you and are not linked to other accounts.</p>
        </section>}
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

import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Camera, ChevronDown, ClipboardCheck, ChevronRight, Target, Trophy, User, Users } from "lucide-react";
import { createSession, type NewSession } from "../../lib/api/sessions";
import { friendlyDbError } from "../../lib/api/selfAssessment";
import { getProfile } from "../../lib/api/profile";
import {
  CONTEXT_LABELS, FORMAT_LABELS, SOLO_FORMATS,
  type MatchResult, type PlayFormat, type ReviewMode, type SessionContext, type SessionKind,
} from "../../lib/api/types";
import { saveOtherPlayers, type OtherPlayer } from "../../lib/api/players";
import { listMyBuddies, type BuddyLink } from "../../lib/api/buddy";
import { matchBuddy, tagBuddiesInGame } from "../../lib/api/gameShares";
import { ACTION, BORDER, INK, ON_ACTION, SURFACE_2, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Chip, HeroProgress, Notice, PageHero, PreferenceSwitch, PrimaryButton, Sheet, cardStyle, fieldStyle, labelClass, labelStyle, pressable } from "../shell/primitives";
import { autoSessionTitle, localDate } from "../../lib/coaching/sessionNames";
import { GoalFields } from "./GoalFields";


/** Values from a Buddy "Log this session" link; anything malformed is ignored. */
export function buddyPreset(params: URLSearchParams): { name: string; date?: string; context?: SessionContext; format?: PlayFormat; requestId?: string } | null {
  const name = params.get("with")?.trim().slice(0, 80);
  if (!name) return null;
  const date = params.get("date");
  const context = params.get("context");
  const format = params.get("format");
  const requestId = params.get("buddy");
  return {
    requestId: requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : undefined,
    name,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    context: context === "practice" || context === "casual_match" ? context : undefined,
    format: format === "singles" || format === "doubles" ? format : undefined,
  };
}
const ROUNDS = ["Pool play", "Round of 16", "Quarterfinal", "Semifinal", "Final", "Other"];

const KIND_ICON: Record<SessionKind, typeof Trophy> = { solo: Target, match: Users, tournament: Trophy };
const KIND_SHORT: Record<SessionKind, string> = { solo: "Solo", match: "Game", tournament: "Tournament" };

/** One tap picks how to review the session and moves on. */
function ModeCard({ onSelect, icon, title, detail }: { onSelect: () => void; icon: ReactNode; title: string; detail: string }) {
  return (
    <button type="button" onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-[20px] p-4 text-left ${pressable}`}
      style={{ ...cardStyle, borderWidth: 2 }}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: ACTION, color: ON_ACTION }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-extrabold" style={{ color: INK }}>{title}</span>
        <span className="mt-0.5 block text-sm leading-snug" style={{ color: WHITE_DIM }}>{detail}</span>
      </span>
      <ChevronRight size={20} aria-hidden="true" style={{ color: WHITE_SUB }} />
    </button>
  );
}

/** An either/or choice as one bar of options, with an icon on each when given. */
function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; value: T | null | undefined; onChange: (v: T) => void;
  options: { value: T; label: string; Icon?: typeof Trophy }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-[16px] p-1"
      style={{ background: SURFACE_2, gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
          className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-1 text-sm font-bold ${pressable}`}
          style={on ? { background: ACTION, color: ON_ACTION } : { color: INK }}>
          {o.Icon && <o.Icon size={18} aria-hidden="true" />}{o.label}
        </button>;
      })}
    </div>
  );
}

/** A labelled group of questions in one card. */
function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2.5 rounded-[20px] p-4" style={cardStyle}>
      <h2 className="flex items-baseline justify-between text-base font-extrabold" style={{ color: INK }}>{title}
        {hint && <span className="text-xs font-semibold" style={{ color: WHITE_SUB }}>{hint}</span>}</h2>
      {children}
    </section>
  );
}

export default function NewSessionPage({ sb, userId, trialNoWorker = false }: { sb: SupabaseClient; userId?: string; trialNoWorker?: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get("mode");
  // "Log this session" from Buddy: the buddy, purpose, format and date arrive in the link.
  const buddy = buddyPreset(params);
  const [step, setStep] = useState<1 | 2>(preset === "self" || preset === "video" ? 2 : 1);
  // The session is named and timed automatically from when it's logged; the player can rename it later.
  const [startedAt] = useState(() => new Date());
  const [form, setForm] = useState<NewSession>({
    title: "", session_date: buddy?.date ?? localDate(startedAt), session_context: buddy?.context ?? "casual_match", play_format: buddy?.format ?? "doubles",
    performance_scope: "individual", review_mode: preset === "video" ? "video" : "self", notes: null, improvement_goals: [],
    positioning_rating: null, shot_outcomes_rating: null, shot_technique_rating: null,
  });
  const [kind, setKindState] = useState<SessionKind>("match");
  // In doubles a buddy is your partner; in singles they are your opponent.
  const [partner, setPartner] = useState(buddy && (buddy.format ?? "doubles") === "doubles" ? buddy.name : "");
  const [opponents, setOpponents] = useState([buddy?.format === "singles" ? buddy.name : "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Buddies named as players can see this game on their account (they're asked first).
  const [buddies, setBuddies] = useState<BuddyLink[]>([]);
  const [shareOff, setShareOff] = useState<Set<string>>(new Set());
  useEffect(() => { listMyBuddies(sb).then((b) => setBuddies(b ?? [])).catch(() => {}); }, [sb]);
  const named = [...(form.play_format === "doubles" ? [partner] : []), ...opponents.slice(0, form.play_format === "doubles" ? 2 : 1)];
  const buddyMatches = kind === "solo" ? [] : named.map((n) => matchBuddy(n, buddies)).filter((m, i, all): m is { id: string; name: string } =>
    !!m && all.findIndex((x) => x?.id === m.id) === i);
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
      // A buddy session keeps the format and context from the link.
      if (!buddy) setKind(p.default_session_kind ?? "match", format);
    }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per player
  }, [sb, userId]);
  const chooseMode = (mode: ReviewMode) => { set("review_mode", mode); setStep(2); };
  const when = `${startedAt.toLocaleDateString("en-US", { weekday: "long" })} · ${startedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

  async function submit() {
    if (!form.improvement_goals.length) return setError("Choose at least one thing to improve.");
    setBusy(true);
    setError("");
    try {
      const title = form.title.trim() || autoSessionTitle(startedAt, kind, form.tournament_name);
      const { tournament_name, tournament_round, match_result, match_score, ...base } = form;
      // Tournament name and round only for tournaments; result and score for any game.
      const tournament = kind === "tournament" ? { tournament_name: tournament_name?.trim() || null, tournament_round: tournament_round || null } : {};
      const result = kind !== "solo" && (match_result || match_score?.trim()) ? { match_result: match_result ?? null, match_score: match_score?.trim() || null } : {};
      // A buddy session keeps the date from the link; otherwise play started now.
      const start = buddy?.date ? {} : { actual_start_at: startedAt.toISOString() };
      const s = await createSession(sb, { ...base, ...tournament, ...result, ...start, title, notes: form.notes?.trim() || null,
        // Logged from a buddy session: link it so Progress can count games with buddies.
        ...(buddy?.requestId ? { buddy_request_id: buddy.requestId } : {}) });
      const players: OtherPlayer[] = kind === "solo" ? [] : [
        ...(form.play_format === "doubles" ? [{ role: "partner" as const, display_name: partner }] : []),
        ...opponents.slice(0, form.play_format === "doubles" ? 2 : 1).map((name) => ({ role: "opponent" as const, display_name: name })),
      ];
      if (players.some((p) => p.display_name.trim())) {
        // Names are a convenience: the session is already saved, so a failure here does not block it.
        await saveOtherPlayers(sb, s.id, players).catch(() => {});
      }
      const shareWith = buddyMatches.filter((m) => !shareOff.has(m.id)).map((m) => m.id);
      // Sharing is a bonus: a failure here never blocks the saved game.
      if (shareWith.length) await tagBuddiesInGame(sb, s.id, shareWith).catch(() => {});
      navigate(`/sessions/${s.id}`);
    } catch (err) {
      setError(friendlyDbError(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  const formats: PlayFormat[] = kind === "solo" ? SOLO_FORMATS : ["singles", "doubles"];
  return (
    <div>
      <PageHero eyebrow={when} title={step === 1 ? "How do you want to review it?" : "What did you play?"}
        action={step === 2 ? <button type="button" onClick={() => setStep(1)} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-[12px] px-3 text-sm font-semibold"
          style={{ background: "var(--pp-surface)", color: INK, border: "1px solid var(--pp-line)" }}><ArrowLeft size={16} /> Back</button> : undefined}>
        <HeroProgress value={step / 2} label={`Step ${step} of 2`} />
      </PageHero>
      <Sheet>
      <div className="space-y-4 lg:mx-auto lg:max-w-3xl">

      {step === 1 && <div className="grid gap-3 lg:grid-cols-2">
        <ModeCard onSelect={() => chooseMode("self")} icon={<ClipboardCheck size={24} />}
          title="Rate my own game" detail="Rate your skills and get a practice plan." />
        <ModeCard onSelect={() => chooseMode("video")} icon={<Camera size={24} />}
          title="Analyze a video" detail="See where you stood on court. You can rate yourself too." />
      </div>}

      {step === 2 && <>
        {form.review_mode === "video" && trialNoWorker && <Notice tone="info">Video analysis is paused on this public trial. You can still create the session and rate yourself.</Notice>}
        <Group title="Type">
          <Segmented label="Session kind" value={kind} onChange={(k) => setKind(k)}
            options={(["solo", "match", "tournament"] as SessionKind[]).map((k) => ({ value: k, label: KIND_SHORT[k], Icon: KIND_ICON[k] }))} />
          <Segmented label="Format" value={form.play_format} onChange={(f) => set("play_format", f)}
            options={formats.map((f) => ({ value: f, label: FORMAT_LABELS[f], Icon: f === "singles" ? User : f === "doubles" ? Users : undefined }))} />
          {kind === "solo" && form.review_mode === "video" && form.play_format !== "drill_other" &&
            <p className="text-xs" style={{ color: WHITE_SUB }}>Wall and ball-machine sessions are rated only; video analysis needs a court view.</p>}
          {kind === "tournament" && <div className="space-y-2.5 pt-1">
            <div>
              <label className={labelClass} style={labelStyle} htmlFor="tournament-name">Tournament</label>
              <input id="tournament-name" maxLength={120} value={form.tournament_name ?? ""} onChange={(e) => set("tournament_name", e.target.value)}
                placeholder="e.g. Manila Open 2026" className="w-full rounded-[16px] px-4 py-3 text-base" style={fieldStyle} />
            </div>
            <div>
              <p className={labelClass} style={labelStyle}>Round</p>
              <div className="flex flex-wrap gap-2">{ROUNDS.map((r) => <Chip key={r} selected={form.tournament_round === r} onClick={() => set("tournament_round", form.tournament_round === r ? null : r)}>{r}</Chip>)}</div>
            </div>
          </div>}
        </Group>

        {kind !== "solo" && <Group title="Result" hint="optional">
          <Segmented label="Result" value={form.match_result} onChange={(r) => set("match_result", form.match_result === r ? null : r)}
            options={(["win", "loss"] as MatchResult[]).map((r) => ({ value: r, label: r === "win" ? "Won" : "Lost" }))} />
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="score">Score by game</label>
            <input id="score" maxLength={40} inputMode="numeric" value={form.match_score ?? ""} onChange={(e) => set("match_score", e.target.value)}
              placeholder="11-7, 9-11, 11-5" className="w-full min-w-0 rounded-[16px] px-4 py-3 text-base" style={fieldStyle} />
          </div>
        </Group>}

        <GoalFields value={form} onChange={(goals) => setForm((current) => ({ ...current, ...goals }))} />

        <details className="group rounded-[20px]" style={{ ...cardStyle, borderStyle: "dashed" }}>
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 text-base font-extrabold" style={{ color: INK }}>
            More details
            <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: WHITE_SUB }}>
              {kind === "solo" ? "Practice type, notes" : "Players, setting, notes"}
              <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" /></span>
          </summary>
          <div className="space-y-4 px-4 pb-4">
            {kind !== "solo" && <section className="space-y-2">
              <p className={labelClass} style={labelStyle}>Who played</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {form.play_format === "doubles" && <input aria-label="Partner name" maxLength={80} value={partner} onChange={(e) => setPartner(e.target.value)}
                  placeholder="Partner" className="w-full rounded-[16px] px-4 py-3 text-base sm:col-span-2" style={fieldStyle} />}
                {opponents.slice(0, form.play_format === "doubles" ? 2 : 1).map((name, i) => <input key={i} aria-label={`Opponent ${i + 1} name`} maxLength={80} value={name}
                  onChange={(e) => setOpponents((o) => o.map((v, j) => j === i ? e.target.value : v))}
                  placeholder={form.play_format === "doubles" ? `Opponent ${i + 1}` : "Opponent"} className="w-full rounded-[16px] px-4 py-3 text-base" style={fieldStyle} />)}
              </div>
              {buddyMatches.length > 0 && <div className="rounded-[16px] px-4" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
                {buddyMatches.map((m) => <PreferenceSwitch key={m.id} label={`Share this game with ${m.name}`}
                  detail={`${m.name.split(" ")[0]} is your buddy. They'll be asked to add it, with any video and analysis, to their Sessions.`}
                  checked={!shareOff.has(m.id)} onChange={() => setShareOff((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} />)}
              </div>}
              <p className="text-sm" style={{ color: WHITE_SUB }}>Names stay private to you.</p>
            </section>}
            {kind !== "tournament" && <section className="space-y-2">
              <p className={labelClass} style={labelStyle}>{kind === "solo" ? "Type of practice" : "Setting"}</p>
              <div className="flex flex-wrap gap-2">
                {(kind === "solo" ? ["practice", "drill"] : ["casual_match", "leveling_game", "practice"] as SessionContext[]).map((c) =>
                  <Chip key={c} selected={form.session_context === c} onClick={() => set("session_context", c as SessionContext)}>{CONTEXT_LABELS[c as SessionContext]}</Chip>)}
              </div>
            </section>}
            <div>
              <label className={labelClass} style={labelStyle} htmlFor="notes">Notes</label>
              <textarea id="notes" rows={2} maxLength={2000} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
                placeholder="Where you played, anything to remember" className="w-full rounded-[16px] px-4 py-3 text-base" style={fieldStyle} />
            </div>
          </div>
        </details>

        {error && <Notice tone="error">{error}</Notice>}
        <div className="sticky bottom-24 z-10 lg:static">
          <PrimaryButton type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? "Creating…" : form.review_mode === "self" ? "Start rating" : "Continue to video upload"}
          </PrimaryButton>
        </div>
        <p className="text-center text-xs" style={{ color: WHITE_SUB }}>Named "{autoSessionTitle(startedAt, kind, form.tournament_name)}" automatically. You can rename it later.</p>
      </>}
      </div>
      </Sheet>
    </div>
  );
}

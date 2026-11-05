import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import type { SessionListItem } from "../../lib/api/sessions";
import type { SelfAssessment } from "../../lib/api/selfAssessment";
import type { OtherPlayer } from "../../lib/api/players";
import { FORMAT_LABELS, CONTEXT_LABELS } from "../../lib/api/types";
import { selfCoachScript } from "../../lib/coaching/coachScript";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { CoachLauncher } from "../coach/CoachPlayer";
import { InstallTip } from "../shell/InstallTip";
import { RecoveryCard, useInjury } from "../recovery/RecoveryCard";
import {
  ACCENT, ACCENT_INK, ACTION, ACTION_EDGE, CHECK, HERO, INK, INK_2, INK_3, LINE, LINE_STRONG, ON_ACTION, ON_CHECK, ON_HERO,
  SURFACE, SURFACE_2,
} from "../theme";
import { Notice, PickleSays, SectionTitle, cardStyle, numStyle, pressable } from "../shell/primitives";
import { formatSessionDate, useSessionsData, weekStreak } from "../sessions/sessionUi";

const WEEKLY_TARGET = 3;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One pickleball, filled when a game was played. */
function Ball({ filled }: { filled: boolean }) {
  if (!filled) return <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke={LINE_STRONG} strokeWidth="2" strokeDasharray="4 3" /></svg>;
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" className="pp-rise">
      <circle cx="16" cy="16" r="15" fill={ACTION} />
      {[[10, 11, 2.2], [20, 9, 2.2], [23, 18, 2.2], [14, 21, 2.2], [8, 19, 1.8]].map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#c48d00" />)}
    </svg>
  );
}

/** A 1 to 5 self rating as five dots. */
function RatingDots({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${value} of 5`} className="flex shrink-0 gap-1">
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className="h-2 w-2 rounded-full" style={{ background: n <= Math.round(value) ? ACCENT : SURFACE_2 }} />)}
    </span>
  );
}

/** "11-9" (first game, our score first) as two numbers, or null when there is no usable score. */
function parseScore(score?: string | null): [number, number] | null {
  const m = score?.match(/(\d{1,2})\s*[-–:]\s*(\d{1,2})/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function overallFor(item: SessionListItem, assessment?: SelfAssessment): number | null {
  if (!assessment) return null;
  const r = buildSelfReport({ ratings: assessment.ratings, goals: item.session.improvement_goals ?? [], playFormat: item.session.play_format });
  return r.available && r.overall != null ? r.overall : null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** The last game as a broadcast-style scoreboard on a court, linking to the session. */
function LastGame({ item, players, you, rating }: { item: SessionListItem; players: OtherPlayer[]; you: string; rating: number | null }) {
  const { session } = item;
  const score = parseScore(session.match_score);
  const partner = players.find((p) => p.role === "partner")?.display_name;
  const opponents = players.filter((p) => p.role === "opponent").map((p) => firstName(p.display_name)).filter(Boolean);
  const us = [you, partner && firstName(partner)].filter(Boolean).join(" / ").toUpperCase();
  const them = (opponents.join(" / ") || "OPPONENTS").toUpperCase();
  const won = session.match_result ? session.match_result === "win" : score ? score[0] > score[1] : null;
  const row = (name: string, points: number | undefined, lead: boolean) => (
    <span className="flex overflow-hidden rounded-[8px] text-[15px] leading-none" style={{ ...numStyle, fontWeight: 700 }}>
      <span className="px-2 py-1.5" style={{ background: HERO, color: lead ? ON_HERO : "#c6d3ca" }}>{name}</span>
      {points != null && <span className="px-2.5 py-1.5" style={lead ? { background: ACTION, color: ON_ACTION } : { background: "#22342a", color: ON_HERO }}>{points}</span>}
    </span>
  );
  return (
    <a href={`#/sessions/${session.id}`} aria-label={`Last game: ${session.title}${score ? `, ${score[0]} to ${score[1]}` : ""}. Open it.`}
      className={`relative block h-[150px] overflow-hidden rounded-[18px] ${pressable}`} style={{ background: "#2f5d8a", border: `1px solid ${LINE}` }}>
      <svg aria-hidden="true" viewBox="0 0 340 150" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <rect width="340" height="150" fill="#3f7a4a" />
        <path d="M70 18 H270 L330 150 H10 Z" fill="#2f5d8a" />
        <g fill="none" stroke="#ffffff" strokeOpacity=".85" strokeWidth="2.5"><path d="M70 18 H270 L330 150 H10 Z" /><path d="M170 18 V60 M170 96 V150 M52 60 H288 M35 96 H305" /></g>
        <rect x="58" y="74" width="224" height="8" fill="#0e1a13" opacity=".7" />
      </svg>
      <span className="absolute left-2.5 top-2.5 flex flex-col gap-1.5">
        {row(us, score?.[0], won !== false)}
        {row(them, score?.[1], won === false)}
      </span>
      <span className="absolute bottom-2.5 left-2.5 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-extrabold" style={{ background: ACTION, color: ON_ACTION }}>
        Last game · {formatSessionDate(session.session_date, { weekday: "short" })}
      </span>
      {rating != null && <span className="absolute bottom-2.5 right-2.5 rounded-full px-3 py-1.5 text-[13px] font-bold" style={{ background: HERO, color: ON_HERO }}>
        Rated <span style={{ ...numStyle, fontSize: 16 }}>{rating.toFixed(1)}</span></span>}
    </a>
  );
}

/** Placeholder where the last game will appear, so a new player sees what is coming. */
function GhostGame() {
  return (
    <section aria-label="Your games" className="grid min-h-[112px] grid-cols-[96px_1fr] items-center gap-3 rounded-[18px] border-2 border-dashed px-3.5" style={{ borderColor: LINE }}>
      <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true">
        <g fill="none" stroke={LINE_STRONG} strokeWidth="2"><path d="M18 6h60l14 54H4z" /><path d="M48 6v20M48 40v20M11 33h74" /></g>
        <rect x="10" y="4" width="38" height="9" rx="3" fill={SURFACE_2} /><rect x="10" y="15" width="30" height="9" rx="3" fill={SURFACE_2} />
      </svg>
      <div>
        <p className="text-sm font-extrabold" style={{ color: INK }}>Your games show here</p>
        <p className="mt-0.5 text-xs leading-snug" style={{ color: INK_3 }}>Score, partner and a video if you add one.</p>
      </div>
    </section>
  );
}

/** Three steps for a new player; disappears once all are done. */
function GetStarted({ steps }: { steps: { title: string; detail: string; done: boolean; href: string }[] }) {
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);
  return (
    <section aria-label="Get started" className="rounded-[18px] px-3.5 pb-1 pt-3" style={cardStyle}>
      <div className="flex items-baseline justify-between pb-1.5">
        <h2 className="text-sm font-extrabold">Get started</h2>
        <span className="text-[17px]" style={numStyle}><span style={{ color: ACCENT_INK }}>{done}</span><span style={{ color: INK_3 }}>/{steps.length}</span></span>
      </div>
      <ol>
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li key={s.title} className="border-t" style={{ borderColor: LINE }}>
              <a href={s.done ? undefined : s.href} aria-current={isCurrent ? "step" : undefined}
                className="grid min-h-[52px] grid-cols-[26px_1fr_auto] items-center gap-2.5 py-2">
                {s.done
                  ? <span className="grid h-[26px] w-[26px] place-items-center rounded-full" style={{ background: CHECK, color: ON_CHECK }}><Check size={14} strokeWidth={3.2} aria-hidden="true" /></span>
                  : <span className="grid h-[26px] w-[26px] place-items-center rounded-full text-[15px]"
                      style={isCurrent ? { ...numStyle, background: ACTION, color: ON_ACTION } : { ...numStyle, border: `2px dashed ${LINE_STRONG}`, color: INK_3 }}>{i + 1}</span>}
                <span className="min-w-0">
                  <b className={`block text-sm ${s.done ? "line-through" : ""}`} style={{ color: s.done || !isCurrent ? INK_3 : INK }}>{s.title}</b>
                  <span className="block text-xs" style={{ color: isCurrent ? INK_2 : INK_3 }}>{s.done ? "Done" : s.detail}</span>
                </span>
                {isCurrent && <ChevronRight size={18} aria-hidden="true" style={{ color: ACCENT_INK }} />}
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function HomePage({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const { items, assessments, players, error } = useSessionsData(sb);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  useEffect(() => {
    let active = true;
    getProfile(sb, userId).then((p) => { if (active) setProfile(p); }).catch(() => {});
    return () => { active = false; };
  }, [sb, userId]);
  const name = firstName(profile?.display_name ?? "");
  const injury = useInjury(sb);
  const injured = !!injury.open;

  const byId = useMemo(() => new Map(assessments.map((a) => [a.session_id, a])), [assessments]);
  // Latest session that has a usable self-assessment plan.
  const latestPlan = useMemo(() => {
    for (const item of items ?? []) {
      const a = byId.get(item.session.id);
      if (!a) continue;
      const report = buildSelfReport({ ratings: a.ratings, goals: item.session.improvement_goals ?? [], playFormat: item.session.play_format,
        biggestStruggle: a.biggest_struggle, unforcedErrors: a.unforced_errors });
      if (report.available) return { href: `#/sessions/${item.session.id}`, starting: false, report, title: item.session.title, playFormat: item.session.play_format };
    }
    // Before any rated session, plan from the onboarding answers.
    if (profile?.baseline_ratings) {
      const report = buildSelfReport({ ratings: profile.baseline_ratings, goals: profile.main_goals ?? [] });
      if (report.available) return { href: "#/new?mode=self", starting: true, report, title: "your first sessions", playFormat: null };
    }
    return null;
  }, [items, byId, profile]);

  const sessions = items ?? [];
  const dates = sessions.map((i) => i.session.session_date);
  const streak = weekStreak(dates);
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const thisWeek = dates.filter((d) => d >= isoDay(monday)).length;
  const coachScript = useMemo(() => latestPlan && latestPlan.report.focus.length
    ? selfCoachScript({ report: latestPlan.report, sessionTitle: latestPlan.title, playFormat: latestPlan.playFormat, length: "short" }) : null, [latestPlan]);

  const hasRatedPlan = !!latestPlan && !latestPlan.starting;
  const steps = [
    { title: "Set up your profile", detail: "Name, level and how often you play", done: !!profile?.onboarding_completed_at || !!profile?.display_name, href: "#/profile/edit" },
    { title: "Log your first game", detail: "Rate how it felt, about 2 min", done: sessions.length > 0, href: "#/new?mode=self" },
    { title: "Get your drill plan", detail: "Pickle picks what to work on", done: hasRatedPlan, href: sessions[0] ? `#/sessions/${sessions[0].session.id}?tab=plan` : "#/new?mode=self" },
  ];
  const newPlayer = items !== null && steps.some((s) => !s.done);

  const focus = latestPlan?.report.focus[0];
  const bubble = items === null ? null
    : injured ? { title: `Rest up${name ? `, ${name}` : ""}.`, body: "Your plan is rest for now and your goals are paused. Tap \"I'm back to playing\" when you're ready." }
    : sessions.length === 0 ? { title: `Hi${name ? ` ${name}` : ""}, I'm Pickle.`, body: "Log your first game and I'll tell you what to work on." }
    : focus ? { title: hasRatedPlan ? `Next up: ${focus.label.toLowerCase()}` : "Nice first game!", body: `${focus.drill.name}, 3 times this week.` }
    : { title: thisWeek >= WEEKLY_TARGET ? "You hit this week's target." : "Good to see you back.", body: "Rate your next game and I'll pick a drill." };

  const left = Math.max(0, WEEKLY_TARGET - thisWeek);
  const weekHint = injured ? "Paused while you recover" : thisWeek >= WEEKLY_TARGET ? "Target hit. Nice work." : sessions.length === 0 ? `Goal: ${WEEKLY_TARGET} games a week` : `${left} more to hit your goal`;
  const last = sessions[0];
  const earlier = sessions.slice(1, 4);

  return (
    <div className="space-y-4">
      {bubble && <PickleSays title={bubble.title}>{bubble.body}</PickleSays>}
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start lg:gap-10 lg:space-y-0">
        <div className="space-y-4">
          <InstallTip />
          {error && <Notice tone="error">{error}</Notice>}
          {injury.open && <RecoveryCard sb={sb} injury={injury.open} onChanged={() => void injury.reload()} />}
          {newPlayer && !injured && <GetStarted steps={steps} />}

          <section aria-label="This week" className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3.5" style={cardStyle}>
            <div>
              <h2 className="text-[13px] font-semibold" style={{ color: INK_2 }}>Games this week</h2>
              <div role="img" aria-label={`${thisWeek} of ${WEEKLY_TARGET} games played`} className="mt-2 flex gap-2">
                {Array.from({ length: WEEKLY_TARGET }, (_, i) => <Ball key={i} filled={i < thisWeek} />)}
              </div>
              <p className="mt-1.5 text-xs" style={{ color: INK_3 }}>{weekHint}</p>
            </div>
            <div className="text-right">
              <p className="text-[46px] leading-[0.9]" style={{ ...numStyle, color: streak ? ACCENT_INK : LINE_STRONG }}>{streak}</p>
              <p className="mt-0.5 text-xs font-semibold" style={{ color: INK_2 }}>week streak</p>
            </div>
          </section>

          {items === null ? <p className="text-sm" style={{ color: INK_3 }}>Loading your games…</p>
            : last ? <LastGame item={last} players={players.get(last.session.id) ?? []} you={name || "You"} rating={overallFor(last, byId.get(last.session.id))} />
            : <GhostGame />}

          {earlier.length > 0 && <section aria-label="Earlier games">
            <div className="flex items-baseline justify-between pb-1.5">
              <h2 className="text-[13px] font-bold" style={{ color: INK_2 }}>Earlier</h2>
              <a href="#/sessions" className="inline-flex min-h-[32px] items-center text-xs font-bold" style={{ color: ACCENT_INK }}>All {sessions.length}</a>
            </div>
            <ul className="border-b" style={{ borderColor: LINE }}>
              {earlier.map((item) => {
                const s = item.session;
                const score = parseScore(s.match_score);
                const won = s.match_result ? s.match_result === "win" : score ? score[0] > score[1] : null;
                const rating = overallFor(item, byId.get(s.id));
                return (
                  <li key={s.id} className="border-t" style={{ borderColor: LINE }}>
                    <a href={`#/sessions/${s.id}`} className="grid min-h-[44px] grid-cols-[48px_1fr_auto_34px] items-center gap-2 py-1.5 text-[13px]">
                      <span style={{ color: INK_3 }}>{formatSessionDate(s.session_date, { weekday: "short" })}</span>
                      <span className="truncate" style={{ color: INK }}>{CONTEXT_LABELS[s.session_context]} · {FORMAT_LABELS[s.play_format].toLowerCase()}</span>
                      <span className="text-base" style={{ ...numStyle, fontWeight: 700, color: won ? ACCENT_INK : INK_3 }}>{score ? `${score[0]}–${score[1]}` : "—"}</span>
                      <span className="text-right text-base" style={{ ...numStyle, fontWeight: 700, color: INK }}>{rating != null ? rating.toFixed(1) : "—"}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>}

          <a href="#/new" className={`flex min-h-[52px] items-center justify-center rounded-full text-base font-extrabold ${pressable}`}
            style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
            {sessions.length === 0 ? "Log your first game" : "Log today's game"}
          </a>
        </div>

        <div className="space-y-4">
          {latestPlan && latestPlan.report.focus.length > 0 && <section className="space-y-2">
            <SectionTitle action={<a href={latestPlan.href} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold" style={{ color: ACCENT_INK }}>
              {latestPlan.starting ? "Rate a game" : "Full plan"} <ArrowRight size={14} aria-hidden="true" /></a>}>
              {injured ? "When you're back" : latestPlan.starting ? "Where to start" : "Practice next"}
            </SectionTitle>
            {latestPlan.starting && <p className="-mt-1 text-sm" style={{ color: INK_2 }}>From your setup answers. Rate a game after you play to update it.</p>}
            <ol className="border-b" style={{ borderColor: LINE }}>
              {latestPlan.report.focus.map((f, i) => (
                <li key={f.skill} className="border-t" style={{ borderColor: LINE }}>
                  <a href={latestPlan.href} className="flex min-h-[56px] items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <b className="block text-[15px] font-bold" style={{ color: INK }}>{f.label}</b>
                      <span className="block text-[13px]" style={{ color: INK_2 }}>{f.drill.name}{i === 0 && !injured ? ", 3 times this week" : ""}</span>
                    </span>
                    <RatingDots value={f.rating} />
                  </a>
                </li>
              ))}
            </ol>
          </section>}
          {coachScript && !injured && <CoachLauncher shortScript={coachScript} tone="light" compact />}
          {!hasRatedPlan && <section className="rounded-[18px] p-4" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
            <p className="text-sm font-bold" style={{ color: INK }}>Have a recording?</p>
            <p className="mt-0.5 text-sm leading-relaxed" style={{ color: INK_2 }}>Film from behind the baseline with the whole court in view, and PicklePro maps where you stood. <a href="#/example" className="font-bold" style={{ color: ACCENT_INK }}>See an example</a></p>
          </section>}
        </div>
      </div>
    </div>
  );
}

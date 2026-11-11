import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Check, ChevronRight, Flame, Plus, Target, Video } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import type { SessionListItem } from "../../lib/api/sessions";
import type { SelfAssessment } from "../../lib/api/selfAssessment";
import { FORMAT_LABELS, CONTEXT_LABELS } from "../../lib/api/types";
import { selfCoachScript } from "../../lib/coaching/coachScript";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { CoachLauncher } from "../coach/CoachPlayer";
import { InstallTip } from "../shell/InstallTip";
import { RecoveryCard, useInjury } from "../recovery/RecoveryCard";
import { RecoveryEntry } from "../recovery/RecoverySwitch";
import {
  ACCENT_INK, ACTION, ACTION_SOFT, alpha, CHECK, HERO, INK, INK_2, INK_3, LINE, LINE_STRONG, ON_ACTION, ON_CHECK, ON_HERO,
  SURFACE,
} from "../theme";
import { Notice, PageHero, PickleSays, cardStyle, mascotUrl, numStyle, pressable } from "../shell/primitives";
import { LastGameCard, firstName, homeFeaturedGame, parseScore } from "./LastGame";
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
      {[[10, 11, 2.2], [20, 9, 2.2], [23, 18, 2.2], [14, 21, 2.2], [8, 19, 1.8]].map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={ON_ACTION} />)}
    </svg>
  );
}

function overallFor(item: SessionListItem, assessment?: SelfAssessment): number | null {
  if (!assessment) return null;
  const r = buildSelfReport({ ratings: assessment.ratings, goals: item.session.improvement_goals ?? [], playFormat: item.session.play_format });
  return r.available && r.overall != null ? r.overall : null;
}


/** Three steps for a new player; disappears once all are done. */
function GetStarted({ steps }: { steps: { title: string; detail: string; done: boolean; href: string }[] }) {
  const current = steps.findIndex((s) => !s.done);
  return <section aria-label="Getting started">
    <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide" style={{ color: ACCENT_INK }}>Getting started</h2>
    <ol className="space-y-2.5">{steps.map((s, i) => {
      const now = i === current;
      return <li key={s.title}><a href={s.done ? undefined : s.href} aria-current={now ? "step" : undefined} className={`grid min-h-[72px] grid-cols-[44px_1fr] items-center gap-3 ${pressable}`}>
        <span className="grid h-11 w-11 place-items-center rounded-full text-xl" style={{ ...numStyle, ...(s.done ? { background: CHECK, color: ON_CHECK } : now ? { background: ACTION, color: ON_ACTION, boxShadow: `0 0 0 5px ${alpha(ACTION, 15)}` } : { color: ACCENT_INK, border: `2px solid ${LINE_STRONG}` }) }}>{s.done ? <Check size={22} strokeWidth={3} /> : i + 1}</span>
        <span className="flex min-h-[72px] flex-col justify-center rounded-[20px] px-4 py-3" style={{ ...cardStyle, border: `${now ? 2 : 1}px solid ${now ? ACTION : LINE}` }}><b className="text-base">{s.title}</b><span className="mt-0.5 text-sm" style={{ color: INK_2 }}>{s.done ? "Done" : s.detail}</span></span>
      </a></li>;
    })}</ol>
  </section>;
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
    { title: "Log your first game", detail: "Score and how it felt", done: sessions.length > 0, href: "#/new?mode=self" },
    { title: "Get your drill plan", detail: "Pickle picks what to work on", done: hasRatedPlan, href: sessions[0] ? `#/sessions/${sessions[0].session.id}?tab=plan` : "#/new?mode=self" },
  ];
  const newPlayer = items !== null && sessions.length === 0;

  const focus = latestPlan?.report.focus[0];
  const bubble = items === null ? null
    : injured ? { title: `Rest up${name ? `, ${name}` : ""}.`, body: "Recovery mode is on: your plan is rest and your goals are paused. Turn off recovery mode when you're ready." }
    : sessions.length === 0 ? { title: `Hi${name ? ` ${name}` : ""}, I'm Pickle.`, body: "Log your first game and I'll tell you what to work on." }
    : focus ? { title: hasRatedPlan ? `Next up: ${focus.label.toLowerCase()}` : "Nice first game!", body: `${focus.drill.name}, 3 times this week.` }
    : { title: thisWeek >= WEEKLY_TARGET ? "You hit this week's target." : "Good to see you back.", body: "Rate your next game and I'll pick a drill." };

  const left = Math.max(0, WEEKLY_TARGET - thisWeek);
  const weekHint = injured ? "Paused for recovery mode" : thisWeek >= WEEKLY_TARGET ? "Target hit. Nice work." : sessions.length === 0 ? `Goal: ${WEEKLY_TARGET} games a week` : `${left} more to hit your goal`;
  // Featured game: the newest one with a video, so Shot replay and Heatmap show when you've uploaded one.
  const last = homeFeaturedGame(sessions);
  const earlier = sessions.filter((item) => item !== last).slice(0, 3);
  const greeting = <PageHero band eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} title={`Hi${name ? `, ${name}` : ""}`} />;

  if (newPlayer && !injured) return <div className="mx-auto max-w-2xl space-y-5">
    {greeting}
    {error && <Notice tone="error">{error}</Notice>}
    <section className="rounded-[28px] p-4" style={{ background: HERO }}>
      <div className="flex items-end gap-2.5">
        <img src={mascotUrl} alt="" aria-hidden="true" className="h-28 w-auto shrink-0" />
        <div className="mb-2 rounded-[20px] rounded-bl-[4px] px-4 py-3" style={{ background: ACTION, color: ON_ACTION }}><h2 className="text-xl font-extrabold leading-tight">Log your first game</h2><p className="mt-1 text-base">About 2 minutes. Then I'll tell you what to work on.</p></div>
      </div>
      <a href="#/new?mode=self" className={`mt-3 flex min-h-[56px] items-center justify-center gap-2 rounded-full text-base font-extrabold ${pressable}`} style={{ background: ACTION, color: ON_ACTION }}><Plus size={22} />Log your first game</a>
    </section>
    <GetStarted steps={steps} />
    <a href="#/new?mode=video" className={`flex min-h-[76px] items-center gap-3 rounded-[22px] p-4 ${pressable}`} style={{ background: ACTION_SOFT, border: `1px solid ${LINE}`, color: INK }}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px]" style={{ background: ACTION, color: ON_ACTION }}><Video size={24} /></span><span className="min-w-0 flex-1"><b className="block text-base">Have a recording?</b><span className="block text-sm" style={{ color: INK_2 }}>PicklePro maps where you stood.</span></span><ChevronRight size={20} />
    </a>
    <p className="text-center text-sm leading-relaxed" style={{ color: INK_2 }}>Games this week and your streak appear after your first game.</p>
    <InstallTip />
  </div>;

  return <div className="space-y-4">
    {greeting}
    {error && <Notice tone="error">{error}</Notice>}
    {bubble && <div className="rounded-[24px] px-3 py-2" style={{ background: injured ? SURFACE : ACTION }}><PickleSays tone={injured ? "cream" : "yellow"} title={bubble.title}>{bubble.body}</PickleSays></div>}
    {injury.open && <RecoveryCard sb={sb} injury={injury.open} onChanged={() => void injury.reload()} />}
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        {sessions.length > 0 && <section aria-label="This week" className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] p-4" style={{ background: "color-mix(in srgb, var(--pp-green) 16%, var(--pp-surface))", border: "1px solid color-mix(in srgb, var(--pp-green) 30%, var(--pp-line))", color: INK }}>
            <h2 className="text-sm font-bold" style={{ color: CHECK }}>Games this week</h2>
            <div role="img" aria-label={`${thisWeek} of ${WEEKLY_TARGET} games played`} className="mt-3 flex flex-wrap gap-1.5">{Array.from({ length: WEEKLY_TARGET }, (_, i) => <Ball key={i} filled={i < thisWeek} />)}</div>
            <p className="mt-2 text-sm" style={{ color: INK_2 }}>{weekHint}</p>
          </div>
          <div className="rounded-[22px] p-4" style={{ background: CHECK, color: ON_CHECK }}><h2 className="flex items-center gap-1.5 text-sm font-bold"><Flame size={16} aria-hidden="true" />Week streak</h2><p className="mt-2 text-[46px] leading-none" style={numStyle}>{streak}</p><p className="mt-1 text-sm">{streak === 1 ? "week" : "weeks"} in a row</p></div>
        </section>}
        {items === null ? <p className="text-base" style={{ color: INK_3 }}>Loading your games…</p> : last && <LastGameCard sb={sb} item={last} players={players.get(last.session.id) ?? []} you={name || "You"} rating={overallFor(last, byId.get(last.session.id))} />}
      </div>
      <div className="space-y-4">
        {latestPlan && focus && <section className="rounded-[22px] border-t-4 p-4" style={{ background: HERO, borderColor: ACTION, color: ON_HERO }}>
          <h2 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#c6d3ca" }}><Target size={16} aria-hidden="true" style={{ color: ACTION }} />{injured ? "When you're back" : latestPlan.starting ? "Where to start" : "Practice next"}</h2>
          <h3 className="mt-1 text-2xl font-extrabold">{focus.drill.name}</h3>
          <p className="mt-1 text-base" style={{ color: "#c6d3ca" }}>{latestPlan.report.plan[0]?.detail.split(". ")[0]}.{injured ? " Wait until you're ready to play." : ""}</p>
          <a href={latestPlan.href} className={`mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold ${pressable}`} style={{ background: ACTION, color: ON_ACTION }}>Full plan <ArrowRight size={16} /></a>
        </section>}
        {coachScript && !injured && <CoachLauncher shortScript={coachScript} tone="light" compact />}
      </div>
      <a href="#/new?mode=self" className={`mt-2 flex min-h-[52px] items-center justify-center gap-2 rounded-full text-base font-extrabold lg:col-span-2 ${pressable}`} style={{ background: ACTION, color: ON_ACTION }}><Plus size={22} />{sessions.length === 0 ? "Log your first game" : "Log today's game"}</a>

    </div>
          {earlier.length > 0 && <section aria-label="Earlier games">
            <div className="flex items-baseline justify-between pb-2">
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em]" style={{ color: CHECK }}>Earlier</h2>
              <a href="#/sessions" className="inline-flex min-h-[44px] items-center text-sm font-bold" style={{ color: CHECK }}>All {sessions.length}</a>
            </div>
            <ul className="overflow-hidden rounded-[20px] px-3.5" style={{ ...cardStyle, boxShadow: `inset 5px 0 0 ${ACTION}` }}>
              {earlier.map((item) => {
                const s = item.session;
                const score = parseScore(s.match_score);
                const won = s.match_result ? s.match_result === "win" : score ? score[0] > score[1] : null;
                const rating = overallFor(item, byId.get(s.id));
                return (
                  <li key={s.id} className="border-t first:border-t-0" style={{ borderColor: LINE }}>
                    <a href={`#/sessions/${s.id}`} className="grid min-h-[52px] grid-cols-[52px_1fr_auto_34px] items-center gap-2 py-1.5 pl-1 text-[15px]">
                      <span className="text-sm" style={{ color: INK_3 }}>{formatSessionDate(s.session_date, { weekday: "short" })}</span>
                      <span className="truncate" style={{ color: INK }}>{CONTEXT_LABELS[s.session_context]} · {FORMAT_LABELS[s.play_format].toLowerCase()}</span>
                      <span className="text-base" style={{ ...numStyle, fontWeight: 700, color: won ? ACCENT_INK : INK_3 }}>{score ? `${score[0]}–${score[1]}` : "—"}</span>
                      <span className="text-right text-base" style={{ ...numStyle, fontWeight: 700, color: INK }}>{rating != null ? rating.toFixed(1) : "—"}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>}
    {injury.loaded && !injured && sessions.length > 0 && <RecoveryEntry sb={sb} onChanged={() => void injury.reload()} />}
    <InstallTip />
  </div>;
}

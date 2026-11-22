import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { listJournalSummaries } from "../../lib/api/capture";
import { SKILL_INFO, type ErrorLevel } from "../../lib/coaching/selfAssessment";
import { daysSince, goalPeriodEnded, goalProgress, goalTargets, goalWeeks, weeksLabel } from "../../lib/coaching/goals";
import { pausedDays } from "../../lib/coaching/injury";
import { RecoveryCard, useInjury } from "../recovery/RecoveryCard";
import { PickleGrowthCard } from "./PickleGrowthCard";
import { pickleJar, weeklyQuests, type JarSession } from "../../lib/coaching/brineJar";
import { localDate } from "../../lib/coaching/sessionNames";
import { deriveAnalysisState } from "../../lib/analysis/state";
import { readPlanTicks } from "../selfAssessment/planTicks";
import {
  baselineSummary, buildPoints, gameResults, inMode, latestRating, MODE_LABELS, PROGRESS_MODES, skillRows, weeksCovered,
  type ProgressMode,
} from "../../lib/coaching/progressStats";
import { CLEAR_GAP, insightHeadline, readinessInsights, type InsightLine, type JournalEntry } from "../../lib/coaching/readinessInsights";
import { listMyPeerRatings } from "../../lib/api/partners";
import { latestPeerBySkill } from "../../lib/coaching/peerFeedback";
import { lastTestedOn, type CourtTestRow } from "../../lib/coaching/baselineTests";
import { listCourtTests } from "../../lib/api/courtTests";
import {
  ACCENT_INK, ACTION, ACTION_SOFT, BORDER, CHECK, CREAM, HERO, INK, INK_2, INK_3, ON_ACTION, ON_CHECK, ON_CREAM, ON_HERO,
  SURFACE_2, WARN, WHITE_SUB,
} from "../theme";
import { Notice, PageHero, cardStyle, mascotUrl, numStyle, pressable } from "../shell/primitives";
import { ChecklistBar } from "../shell/ChecklistBar";
import { useSessionsData } from "../sessions/sessionUi";
import { sessionKind } from "../../lib/api/types";

const MODE_KEY = "picklepro.progress.mode";

function readMode(): ProgressMode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    return PROGRESS_MODES.includes(saved as ProgressMode) ? (saved as ProgressMode) : "games";
  } catch {
    return "games";
  }
}

const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

const ERROR_STYLE: Record<ErrorLevel, { height: number; color: string; label: string }> = {
  many: { height: 44, color: WARN, label: "Many" },
  some: { height: 28, color: ACTION, label: "Some" },
  few: { height: 14, color: CHECK, label: "Few" },
};

/** The average rating over recent sessions, with the baseline as a dashed line when there is one. */
function Trend({ values, baseline }: { values: number[]; baseline: number | null }) {
  const w = 300, h = 84;
  if (values.length < 2) return <svg viewBox="0 0 300 84" className="block h-auto w-full" aria-hidden="true"><polyline points="6,74 80,62 150,50 220,34 294,18" fill="none" stroke="#5b7263" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" /></svg>;
  const all = baseline == null ? values : [...values, baseline];
  const lo = Math.min(...all) - 0.2, hi = Math.max(...all) + 0.2;
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, y(v)] as const);
  const lastPt = pts[pts.length - 1];
  return <svg className="block h-auto w-full" viewBox={`-6 -6 ${w + 12} ${h + 22}`} role="img"
    aria-label={`Average rating went from ${values[0].toFixed(1)} to ${values[values.length - 1].toFixed(1)}${baseline != null ? `, baseline ${baseline.toFixed(1)}` : ""}`}>
    {baseline != null && <>
      <line x1={0} x2={w} y1={y(baseline)} y2={y(baseline)} stroke="#c6d3ca" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="5 5" />
      <text x={w} y={Math.max(10, y(baseline) - 6)} textAnchor="end" fill="#c6d3ca" fontSize={11}>baseline {baseline.toFixed(1)}</text>
    </>}
    <polygon points={`0,${h} ${pts.map((p) => p.join(",")).join(" ")} ${w},${h}`} fill={ACTION} fillOpacity={0.14} />
    <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={ACTION} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={lastPt[0]} cy={lastPt[1]} r={6} fill={ACTION} stroke={HERO} strokeWidth={2.5} />
  </svg>;
}

/** Win rate as a ring, like Design B's win-rate tile. */
function Ring({ percent }: { percent: number }) {
  const r = 20, c = 2 * Math.PI * r;
  return <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" className="shrink-0">
    <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(12,22,17,.18)" strokeWidth="7" />
    <circle cx="26" cy="26" r={r} fill="none" stroke={ACTION} strokeWidth="7" strokeLinecap="round"
      strokeDasharray={`${(percent / 100) * c} ${c}`} transform="rotate(-90 26 26)" />
  </svg>;
}

/** Detail screens behind the overview's rows (Progress v2, 22 Nov: short overview, details on tap). */
const VIEWS = ["skills", "games", "jar", "habits", "rate"] as const;
type View = (typeof VIEWS)[number];

/** A row on the overview that opens a detail screen. */
function MoreRow({ view, title, detail }: { view: View; title: string; detail: string }) {
  return <li className="border-t first:border-t-0" style={{ borderColor: BORDER }}>
    <a href={`#/progress?view=${view}`} className={`flex min-h-[56px] items-center justify-between gap-3 py-2.5 ${pressable}`}>
      <span className="min-w-0"><b className="block text-[15px]" style={{ color: INK }}>{title}</b>
        <span className="block text-[13px]" style={{ color: INK_2 }}>{detail}</span></span>
      <ChevronRight size={18} aria-hidden="true" style={{ color: INK_3 }} />
    </a>
  </li>;
}

/** One skill as five pickleball dots (Progress pick C): filled up to now, a ring on where you started. */
function SkillDots({ label, base, now, peer }: { label: string; base: number; now: number; peer?: number }) {
  const change = Math.round((now - base) * 10) / 10;
  return <li className="flex min-h-[48px] items-center justify-between gap-3 border-t py-1.5 first:border-t-0" style={{ borderColor: BORDER }}>
    <span className="min-w-0"><span className="block text-sm font-semibold" style={{ color: INK }}>{label}</span>
      <span className="block text-xs" style={{ color: change > 0 ? ACCENT_INK : change < 0 ? WARN : INK_3 }}>
        {change > 0 ? `▲ ${change} up` : change < 0 ? `▼ ${-change} down` : "same"}{peer != null ? <span style={{ color: INK_3 }}> · partner {peer}</span> : null}</span></span>
    <span className="flex shrink-0 gap-1.5" role="img" aria-label={`${label}: now ${now} out of 5, started at ${base}${peer != null ? `, partner ${peer}` : ""}`}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className="inline-block h-[15px] w-[15px] rounded-full"
        style={{ background: n <= now ? "#f6d33c" : SURFACE_2, boxShadow: n === Math.round(base) ? `0 0 0 2px ${INK}` : n <= now ? "inset 0 0 0 1.5px #c9a400" : undefined }} />)}
    </span>
  </li>;
}

/** Before & after as pairs (Progress pick A): two bars on the 1-5 scale and an honest label. */
const PAIR_TITLES: Record<string, string> = { sleep: "Sleep", ready: "Feeling ready", warmup: "Warm-up" };
function HabitPair({ yes, no }: { yes: InsightLine; no: InsightLine }) {
  const gap = Math.round((Number(yes.value) - Number(no.value)) * 10) / 10;
  const id = yes.id.slice(0, -4);
  const row = (l: InsightLine, strong: boolean) => <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_34px] items-center gap-2 text-[13px]">
    <span className="truncate" style={{ color: INK_2 }}>{l.label} <span style={{ color: INK_3 }}>({l.count})</span></span>
    <span className="relative h-2 rounded-full" style={{ background: SURFACE_2 }}>
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Number(l.value) / 5) * 100}%`, background: strong ? CHECK : INK_3 }} /></span>
    <span className="text-right" style={{ ...numStyle, color: INK }}>{l.value}</span>
  </div>;
  return <li className="space-y-1.5 border-t py-3 first:border-t-0" style={{ borderColor: BORDER }}>
    <div className="flex items-center justify-between gap-2">
      <b className="text-sm" style={{ color: INK }}>{PAIR_TITLES[id] ?? id}</b>
      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: SURFACE_2, color: Math.abs(gap) < CLEAR_GAP ? INK_3 : gap > 0 ? ACCENT_INK : WARN }}>
        {Math.abs(gap) < CLEAR_GAP ? "too close to call" : `${gap > 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)} with it`}</span>
    </div>
    {row(yes, gap >= 0)}{row(no, gap < 0)}
  </li>;
}

export default function ProgressPage({ sb, userId }: { sb: SupabaseClient; userId?: string }) {
  const { items, assessments, error } = useSessionsData(sb);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [journal, setJournal] = useState<Map<string, JournalEntry>>(new Map());
  const [peerRows, setPeerRows] = useState<{ skill: string; rating: number; updated_at: string }[]>([]);
  const [courtTests, setCourtTests] = useState<CourtTestRow[] | null>(null);
  const [mode, setModeState] = useState<ProgressMode>(readMode);
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const view = VIEWS.includes(viewParam as View) ? (viewParam as View) : null;

  useEffect(() => {
    let active = true;
    if (userId) getProfile(sb, userId).then((p) => { if (active) setProfile(p); }).catch(() => {});
    // Optional: before the capture migration, Progress simply has no before/after row.
    listJournalSummaries(sb).then((j) => { if (active) setJournal(j); }).catch(() => {});
    // Optional court tests (no longer part of sign-up): only the "Court tests" row uses them.
    listCourtTests(sb).then((c) => { if (active) setCourtTests(c); }).catch(() => { if (active) setCourtTests(null); });
    // And peer ratings from partners (peer-feedback update): the partner marker on the skill bars.
    if (userId) listMyPeerRatings(sb, userId).then((r) => { if (active) setPeerRows(r); }).catch(() => {});
    return () => { active = false; };
  }, [sb, userId]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  const setMode = (next: ProgressMode) => {
    setModeState(next);
    try { window.localStorage.setItem(MODE_KEY, next); } catch { /* private window: keep it for this visit only */ }
  };

  const allPoints = useMemo(() => buildPoints((items ?? []).map((i) => i.session), assessments), [items, assessments]);
  const points = useMemo(() => allPoints.filter((p) => inMode(p.kind, mode)), [allPoints, mode]);
  const rated = useMemo(() => points.filter((p) => p.overall != null), [points]);
  const baseline = useMemo(() => baselineSummary(profile?.baseline_ratings, profile?.onboarding_completed_at), [profile]);
  const results = useMemo(() => gameResults(points), [points]);
  const insights = useMemo(() => readinessInsights(points, journal), [points, journal]);
  const skills = useMemo(() => skillRows(rated, baseline?.ratings), [rated, baseline]);
  // Days spent injured since the baseline push the goal deadline back.
  const injury = useInjury(sb);
  const goalPause = pausedDays(injury.periods, profile?.onboarding_completed_at);
  // The goal length is the player's setting (Settings → Goals), 4 weeks by default.
  const goalLength = goalWeeks(profile?.goal_weeks);
  const goals = useMemo(() => goalTargets(profile?.baseline_ratings, profile?.main_goals ?? [], profile?.onboarding_completed_at, goalPause, goalLength)
    .map((g) => {
      const now = latestRating(allPoints, g.skill);
      return { ...g, now, ...goalProgress(g, now) };
    }), [profile, allPoints, goalPause, goalLength]);
  // Not while recovery mode pauses the goals.
  const goalsEnded = !injury.open && goalPeriodEnded(goals[0]?.due, localDate());
  const peer = useMemo(() => latestPeerBySkill(peerRows), [peerRows]);
  // Games logged from an accepted buddy session (buddy-match update).
  const withBuddies = useMemo(() => (items ?? []).filter((i) => i.session.buddy_request_id && sessionKind(i.session) !== "solo").length, [items]);

  if (items === null && !error) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

  const last = rated.at(-1);
  const reference = baseline?.overall ?? rated[0]?.overall ?? null;
  const change = last && reference != null && (baseline || rated.length > 1) ? Math.round((last.overall! - reference) * 10) / 10 : null;
  const weeks = weeksCovered(rated);
  const trend = rated.slice(-10).map((p) => p.overall!);
  // Pickle's brine jar. Games compare with the baseline first; practice and "All" start from the first rating.
  const analyzed = new Set((items ?? []).filter((i) => deriveAnalysisState({ video: i.video, job: i.job, result: i.result }) === "completed").map((i) => i.session.id));
  const jarSessions: JarSession[] = points.map((p) => ({ date: p.date, overall: p.overall, analyzed: analyzed.has(p.sessionId), planSteps: readPlanTicks(p.sessionId).length }));
  const jar = pickleJar(jarSessions, mode === "games" ? baseline?.overall ?? null : null);
  const quests = weeklyQuests(jarSessions, localDate(new Date()));
  const unrated = allPoints.filter((p) => p.overall == null).reverse();
  const kindWord = mode === "games" ? "game" : mode === "practice" ? "practice" : "session";
  const showResults = mode !== "practice" && (results.record || results.gamesWon || results.errors);
  const reached = goals.filter((g) => g.reached).length;
  const open = goals.filter((g) => !g.reached);
  // "What changed": only skills that moved, biggest first; the steady ones fold into one line.
  const moved = skills.filter((r) => r.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const sortedSkills = [...moved, ...skills.filter((r) => r.change === 0)];
  const headline = insightHeadline(insights.lines);
  const pairs = insights.lines.filter((l) => l.id.endsWith("-yes"))
    .flatMap((yes) => { const no = insights.lines.find((l) => l.id === `${yes.id.slice(0, -4)}-no`); return no ? [[yes, no] as const] : []; });
  const questsDone = quests.filter((q) => q.done).length;
  const weakest = [...skills].sort((a, b) => a.change - b.change || a.now - b.now)[0];
  // One next step, picked in this order: new goals, a game to rate, the weakest skill's plan, log a game.
  const lastTest = courtTests ? lastTestedOn(courtTests) : null;
  const retestIn = lastTest ? goalLength * 7 - (daysSince(lastTest) ?? 0) : null;
  const next = goalsEnded ? { href: "#/welcome", label: "Set new goals" }
    : unrated[0] ? { href: `#/sessions/${unrated[0].sessionId}?tab=plan`, label: `Rate ${unrated[0].title}` }
    : last && weakest ? { href: `#/sessions/${last.sessionId}?tab=plan`, label: `Work on ${SKILL_INFO[weakest.skill].label.toLowerCase()} next` }
    : { href: "#/new", label: "Log a game" };

  const tabs = <div role="group" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-full p-1" style={{ background: HERO }}>
    {PROGRESS_MODES.map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
      className={`min-h-[44px] rounded-full text-sm font-bold ${pressable}`}
      style={mode === m ? { background: ACTION, color: ON_ACTION } : { color: "#c6d3ca" }}>{MODE_LABELS[m]}</button>)}
  </div>;
  const card = { ...cardStyle, borderTop: `4px solid ${CHECK}` };

  // ── Detail screens ──────────────────────────────────────────────────────
  if (view) {
    const titles: Record<View, string> = { skills: "Skills", games: "Games & results", jar: "Pickle's jar", habits: "Before & after", rate: "Games to rate" };
    return <div className="space-y-4">
      <a href="#/progress" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold" style={{ color: ACCENT_INK }}>‹ Progress</a>
      <h1 className="text-2xl font-extrabold" style={{ color: INK }}>{titles[view]}</h1>
      {view !== "rate" && tabs}

      {view === "skills" && <section aria-label="Skills" className="rounded-[20px] p-4" style={card}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: INK_3 }}>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-full" style={{ background: "#f6d33c" }} />now</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-full" style={{ boxShadow: `0 0 0 2px ${INK}` }} />where you started</span>
        </div>
        {sortedSkills.length ? <ul className="mt-2">{sortedSkills.map((r) => <SkillDots key={r.skill} label={SKILL_INFO[r.skill].label} base={r.base} now={r.now} peer={peer[r.skill]} />)}</ul>
          : <p className="mt-3 text-sm" style={{ color: INK_2 }}>Rate a {kindWord} to see your skills here.</p>}
        <p className="mt-2 text-xs" style={{ color: INK_3 }}>Out of 5 · your own ratings{mode === "all" ? "" : ` in ${mode === "games" ? "games" : "practice"}`}.</p>
      </section>}

      {view === "games" && (showResults ? <section aria-label="Game results" className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5 rounded-[22px] p-3.5" style={{ background: CHECK, color: ON_CHECK }}>
          <p className="text-sm font-bold">Win rate</p>
          <div className="flex items-center gap-2.5">
            {results.record && <Ring percent={results.record.rate} />}
            <span className="min-w-0"><span className="block text-[34px] leading-none" style={numStyle}>{results.record ? `${results.record.rate}%` : "—"}</span>
              <span className="mt-1 block text-sm">{results.record ? `${results.record.won} won · ${results.record.lost} lost` : "Add results"}</span></span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 rounded-[22px] p-3.5" style={{ background: "color-mix(in srgb, var(--pp-green) 16%, var(--pp-surface))", border: "1px solid color-mix(in srgb, var(--pp-green) 30%, var(--pp-line))" }}>
          <p className="text-sm font-bold" style={{ color: CHECK }}>Unforced errors</p>
          {results.errors ? <>
            <div role="img" aria-label={`Unforced errors over the last ${results.errors.levels.length} games: ${results.errors.levels.join(", ")}`}
              className="flex h-12 items-end gap-1">
              {results.errors.levels.map((level, i) => <i key={i} className="flex-1 rounded-[5px]"
                style={{ height: ERROR_STYLE[level].height, background: ERROR_STYLE[level].color }} />)}
            </div>
            <p className="text-sm" style={{ color: INK_2 }}>{ERROR_STYLE[results.errors.latest].label} now{results.errors.first !== results.errors.latest ? `, was ${results.errors.first}` : ""} · fewer is better</p>
          </> : <p className="text-sm" style={{ color: INK_2 }}>Rate errors after a game to see them here.</p>}
        </div>
        <div className="col-span-2 flex items-center gap-3 rounded-[22px] p-3.5" style={{ ...cardStyle, borderTop: `4px solid ${ACTION}` }}>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold" style={{ color: CHECK }}>Games won</span>
            <span className="mt-1 block text-[30px] leading-none" style={numStyle}>{results.gamesWon ? <>{results.gamesWon.won}<span className="text-lg" style={{ color: INK_3 }}>/{results.gamesWon.played}</span></> : "—"}</span>
          </span>
          <span className="text-right text-sm" style={{ color: INK_2 }}>
            {results.gamesWon?.before ? `Was ${results.gamesWon.before.won}/${results.gamesWon.before.played}` : results.gamesWon ? "Recent games" : "Add game counts"}
            <br />last {Math.min(8, points.filter((p) => p.kind !== "solo").length)} games{withBuddies > 0 ? ` · ${withBuddies} with a buddy` : ""}</span>
        </div>
      </section> : <p className="rounded-[14px] px-3 py-2.5 text-sm" style={{ background: SURFACE_2, color: INK_2 }}>
        Add Won/Lost or unforced errors to 2 games to see your results here.</p>)}

      {view === "jar" && <PickleGrowthCard jar={jar} quests={quests} kindWord={kindWord} planHref={last ? `#/sessions/${last.sessionId}?tab=plan` : null} />}

      {view === "habits" && <section aria-label="Before and after your games" className="rounded-[20px] p-4" style={card}>
        <p className="text-xs" style={{ color: INK_3 }}>Average {kindWord} rating out of 5, with and without each habit. A gap under 0.3 is too close to call.</p>
        {pairs.length > 0 ? <ul className="mt-1.5">{pairs.map(([yes, no]) => <HabitPair key={yes.id} yes={yes} no={no} />)}</ul>
          : <p className="mt-2 text-sm" style={{ color: INK_2 }}>Fill in the pre-game check-in on a few {kindWord === "practice" ? "practices" : "games"} to see patterns.</p>}
        {insights.recoveryNote && <p className="mt-2 rounded-[14px] px-3 py-2.5 text-[13px] leading-snug" style={{ background: ACTION_SOFT, color: INK }}>
          <b style={{ color: ACCENT_INK }}>Recovery:</b> {insights.recoveryNote}</p>}
        <p className="mt-2 text-xs" style={{ color: INK_3 }}>Patterns in your own entries, not medical advice.</p>
      </section>}

      {view === "rate" && <section aria-label="Games to rate" className="rounded-[20px] p-4" style={card}>
        {unrated.length ? <ul>
          {unrated.slice(0, 10).map((s) => <li key={s.sessionId} className="border-t first:border-t-0" style={{ borderColor: BORDER }}>
            <a href={`#/sessions/${s.sessionId}?tab=plan`} className="flex min-h-[48px] items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate font-semibold" style={{ color: INK }}>{s.title}</span>
                <span className="text-xs" style={{ color: WHITE_SUB }}>{shortDate(s.date)}</span></span>
              <span className="shrink-0 font-bold" style={{ color: ACCENT_INK }}>Rate it</span>
            </a>
          </li>)}
        </ul> : <p className="text-sm" style={{ color: INK_2 }}>Every game is rated.</p>}
      </section>}
    </div>;
  }

  // ── Overview: goals, the average, what changed, rows for the rest, one next step ──
  return (
    <div className="space-y-4">
      <PageHero band title="Progress"
        action={items && <span className="pb-1.5 text-[15px] font-semibold" style={{ color: "#c6d3ca" }}>
          {rated.length ? `${rated.length} rated · ${weeks} week${weeks === 1 ? "" : "s"}` : `${items.length ? `${items.length} logged · ` : ""}0 rated yet`}</span>} />
      {tabs}
      {error && <Notice tone="error">{error}</Notice>}
      {injury.open && <RecoveryCard sb={sb} injury={injury.open} onChanged={() => void injury.reload()} showPlan={false} />}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          {goals.length > 0 && <section aria-label="Your goals" className="rounded-[20px] p-4" style={card}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="shrink-0 text-[17px] font-extrabold">Your goals</h2>
              <span className="text-xs" style={{ color: INK_3 }}>{injury.open ? "paused for recovery mode"
                : goalsEnded ? `ended ${shortDate(goals[0].due!)}` : goals[0]?.due ? `due ${shortDate(goals[0].due)}` : weeksLabel(goalLength)}
                {" · "}<a href="#/settings" className="font-bold underline" style={{ color: ACCENT_INK }}>Change</a></span>
            </div>
            <div className="mt-2.5"><ChecklistBar bare label="Goals reached" done={reached} total={goals.length} count={`${reached} of ${goals.length} reached`} /></div>
            {open.length > 0 && <>
              <p className="mt-3 text-xs font-bold" style={{ color: INK_2 }}>Still to reach</p>
              <ul className="mt-1 space-y-2.5">
                {open.map((g) => <li key={g.skill}>
                  <div className="flex justify-between gap-3 text-sm"><b style={{ color: INK }}>{g.label}</b>
                    <span style={{ ...numStyle, color: INK_2 }}>{g.now == null ? `not rated · goal ${g.target}` : `${g.now} of ${g.target}`}</span></div>
                  <div className="relative mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: SURFACE_2 }}>
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(g.fraction * 100)}%`, background: CHECK }} /></div>
                </li>)}
              </ul>
            </>}
            {reached > 0 && <details className="mt-2 text-sm" open={open.length === 0}>
              <summary className="min-h-[40px] cursor-pointer py-2 font-bold" style={{ color: ACCENT_INK }}>Reached ({reached})</summary>
              <ul>{goals.filter((g) => g.reached).map((g) => <li key={g.skill} className="flex justify-between gap-3 py-1" style={{ color: INK_2 }}>
                <span>✓ {g.label}</span><span style={numStyle}>now {g.now}</span></li>)}</ul>
            </details>}
            {/* Once the due date passes, say so and offer the next step (re-rating starts a new period). */}
            {goalsEnded && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[14px] px-3 py-2.5" style={{ background: SURFACE_2 }}>
              <span className="text-sm font-bold" style={{ color: INK }}>Goal period ended</span>
              <a href="#/welcome" className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-extrabold ${pressable}`}
                style={{ background: ACTION, color: ON_ACTION }}>Set new goals</a>
            </div>}
          </section>}

          <section aria-label={`Average ${kindWord} rating`} className="rounded-[22px] p-4" style={{ background: HERO, color: ON_HERO, borderTop: `4px solid ${ACTION}` }}>
            <p className="text-sm font-bold" style={{ color: "#c6d3ca" }}>Average {kindWord} rating <span className="font-semibold">· out of 5</span></p>
            {last ? <>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3"><span className="text-[64px] leading-[0.95]" style={numStyle}>{last.overall!.toFixed(1)}</span>
              <span className="text-base font-bold" style={{ color: change != null && change < 0 ? "#ff8a65" : ACTION }}>
                {change == null ? `Your first ${kindWord} rating`
                  : change === 0 ? `Same as your ${baseline ? "baseline" : "first"}`
                  : `${change > 0 ? "▲ +" : "▼ "}${change.toFixed(1)} since your ${baseline ? "baseline" : "first rating"}`}</span></p>
              {baseline && <p className="mt-1 text-sm" style={{ color: "#c6d3ca" }}>Baseline {baseline.overall.toFixed(1)}{baseline.setAt ? ` · set ${shortDate(baseline.setAt)}` : ""}</p>}
            </> : <>
              <p className="mt-1.5 text-2xl font-extrabold">No rating yet</p>
              <p className="mt-1 text-sm" style={{ color: "#c6d3ca" }}>
                {mode === "games" && allPoints.some((p) => p.overall != null) ? "No rated games yet. Try Practice or All." : `Rate a ${kindWord} to see your trend`}</p>
              {baseline && <p className="mt-1 text-sm" style={{ color: "#c6d3ca" }}>Your baseline is {baseline.overall.toFixed(1)}</p>}
            </>}
            {trend.length >= 2 && <div className="mt-3"><Trend values={trend} baseline={baseline?.overall ?? null} /></div>}
          </section>
        </div>

        <div className="space-y-4">
          {skills.length > 0 && <section aria-label="What changed" className="rounded-[20px] p-4" style={card}>
            <h2 className="text-[17px] font-extrabold">What changed</h2>
            <p className="text-xs" style={{ color: INK_3 }}>Since your {baseline ? "baseline" : "first rating"} · out of 5</p>
            <ul className="mt-2">
              {moved.slice(0, 4).map((r) => <li key={r.skill} className="flex min-h-[44px] items-center justify-between gap-3 border-t text-sm" style={{ borderColor: BORDER }}>
                <span style={{ color: INK }}>{SKILL_INFO[r.skill].label}</span>
                <span className="shrink-0 font-bold" style={{ color: r.change > 0 ? ACCENT_INK : WARN }}>
                  <span style={numStyle}>{r.base} → {r.now}</span> · {r.change > 0 ? `▲ ${r.change} up` : `▼ ${-r.change} down`}</span>
              </li>)}
              {moved.length === 0 && <li className="py-2 text-sm" style={{ color: INK_2 }}>No change yet. Keep rating your {kindWord === "practice" ? "practices" : "games"}.</li>}
            </ul>
            <a href="#/progress?view=skills" className="mt-1 flex min-h-[44px] items-center justify-between border-t text-sm font-bold" style={{ borderColor: BORDER, color: ACCENT_INK }}>
              {skills.length - Math.min(4, moved.length) > 0 ? `${skills.length - Math.min(4, moved.length)} other skills · See all` : "See all skills"}
              <ChevronRight size={18} aria-hidden="true" /></a>
          </section>}

          <section aria-label="More" className="rounded-[20px] px-4 py-1" style={cardStyle}>
            <ul>
              {mode !== "practice" && <MoreRow view="games" title="Games & results"
                detail={results.record ? `Won ${results.record.won} of ${results.record.won + results.record.lost}${results.errors ? ` · errors ${ERROR_STYLE[results.errors.latest].label.toLowerCase()}` : ""}` : "Add Won/Lost to see your record"} />}
              {(points.length > 0 || baseline) && <MoreRow view="jar" title="Pickle's jar" detail={`${jar.name} · ${questsDone} of ${quests.length} quests this week`} />}
              <MoreRow view="habits" title="Before & after" detail={headline ?? "How sleep and warm-ups line up with your games"} />
              {courtTests && <li className="border-t first:border-t-0" style={{ borderColor: BORDER }}>
                <a href="#/tests" className={`flex min-h-[56px] items-center justify-between gap-3 py-2.5 ${pressable}`}>
                  <span className="min-w-0"><b className="block text-[15px]" style={{ color: INK }}>Court tests</b>
                    <span className="block text-[13px]" style={{ color: INK_2 }}>{!lastTest ? "Optional · 5 counted drills at the court"
                      : retestIn != null && retestIn > 0 ? `Last ${shortDate(lastTest)} · re-test in ${retestIn} day${retestIn === 1 ? "" : "s"}` : `Last ${shortDate(lastTest)} · time to re-test`}</span></span>
                  <ChevronRight size={18} aria-hidden="true" style={{ color: INK_3 }} />
                </a>
              </li>}
              {unrated.length > 0 && <MoreRow view="rate" title="Games to rate" detail={`${unrated.length} ${unrated.length === 1 ? "game" : "games"} without your ratings`} />}
            </ul>
          </section>

          {!baseline && profile && <a href="#/welcome" className={`flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] px-4 py-3 ${pressable}`} style={cardStyle}>
            <span><b className="block text-sm">Set your baseline</b><span className="text-xs" style={{ color: INK_2 }}>Rate 3 skills so Pickle can set your goals</span></span>
            <span className="inline-flex items-center gap-1 font-bold" style={{ color: ACCENT_INK }}>Start <ChevronRight size={16} aria-hidden="true" /></span>
          </a>}
          {rated.length < 3 && <a href="#/example" className={`grid min-h-[64px] grid-cols-[40px_1fr_20px] items-center gap-2.5 rounded-[16px] px-3 py-1.5 ${pressable}`} style={{ background: CREAM, color: ON_CREAM }}>
            <img src={mascotUrl} alt="" aria-hidden="true" className="h-[52px] w-10 object-contain" />
            <span><b className="block text-sm">See an example game</b><span className="text-xs" style={{ color: "#36413a" }}>What this page looks like after a few games</span></span>
            <ChevronRight size={20} aria-hidden="true" />
          </a>}

          <a href={next.href} className={`flex min-h-[52px] w-full items-center justify-center rounded-full px-4 text-base font-extrabold ${pressable}`}
            style={{ background: ACTION, color: ON_ACTION }}>{next.label}</a>
        </div>
      </div>
    </div>
  );
}

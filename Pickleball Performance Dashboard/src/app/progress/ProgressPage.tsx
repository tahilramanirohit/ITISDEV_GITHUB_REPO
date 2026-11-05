import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { listJournalSummaries } from "../../lib/api/capture";
import { SKILL_INFO, type ErrorLevel } from "../../lib/coaching/selfAssessment";
import { daysSince, GOAL_WINDOW_DAYS, goalProgress, goalTargets } from "../../lib/coaching/goals";
import {
  baselineSummary, buildPoints, gameResults, inMode, latestRating, MODE_LABELS, PROGRESS_MODES, skillRows, weeksCovered,
  type ProgressMode,
} from "../../lib/coaching/progressStats";
import { readinessInsights, type JournalEntry } from "../../lib/coaching/readinessInsights";
import { courtTestGoals, formatResult, lastTestedOn, type CourtTestRow } from "../../lib/coaching/baselineTests";
import { listCourtTests } from "../../lib/api/courtTests";
import { listMyPeerRatings } from "../../lib/api/partners";
import { latestPeerBySkill } from "../../lib/coaching/peerFeedback";
import {
  ACCENT, ACCENT_INK, ACTION, ACTION_SOFT, BORDER, CHECK, CREAM, INK, INK_2, INK_3, LINE_STRONG, ON_ACTION, ON_CREAM, STRONG,
  ON_STRONG, SURFACE, SURFACE_2, WARN, WHITE_SUB,
} from "../theme";
import { Notice, cardStyle, mascotUrl, numStyle, pressable } from "../shell/primitives";
import { useSessionsData } from "../sessions/sessionUi";

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
  const w = 150, h = 70;
  if (values.length < 2) return <svg viewBox="0 0 120 70" width="110" height="64" aria-hidden="true"><polyline points="4,60 30,52 56,44 82,32 116,18" fill="none" stroke={LINE_STRONG} strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" /></svg>;
  const all = baseline == null ? values : [...values, baseline];
  const lo = Math.min(...all) - 0.2, hi = Math.max(...all) + 0.2;
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, y(v)] as const);
  const lastPt = pts[pts.length - 1];
  return <svg width={w} height={h + 16} viewBox={`-6 -6 ${w + 12} ${h + 22}`} role="img"
    aria-label={`Average rating went from ${values[0].toFixed(1)} to ${values[values.length - 1].toFixed(1)}${baseline != null ? `, baseline ${baseline.toFixed(1)}` : ""}`}>
    {baseline != null && <>
      <line x1={0} x2={w} y1={y(baseline)} y2={y(baseline)} stroke={LINE_STRONG} strokeWidth={2} strokeDasharray="5 5" />
      <text x={0} y={Math.min(h + 14, y(baseline) + 14)} fill={INK_3} fontSize={10}>baseline</text>
    </>}
    <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={lastPt[0]} cy={lastPt[1]} r={5} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
  </svg>;
}

function Stat({ label, value, sub, good }: { label: string; value: ReactNode; sub?: string; good?: boolean }) {
  return <div className="min-w-0 rounded-[14px] p-2.5" style={{ background: SURFACE_2 }}>
    <p className="text-xs" style={{ color: INK_3 }}>{label}</p>
    <p className="mt-0.5 text-[30px] leading-none" style={numStyle}>{value}</p>
    {sub && <p className="mt-1 text-xs font-bold" style={{ color: good ? ACCENT_INK : INK_2 }}>{sub}</p>}
  </div>;
}

function Bar({ fraction }: { fraction: number }) {
  return <div className="relative mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: SURFACE_2 }}>
    <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
      style={{ width: `${Math.round(fraction * 100)}%`, background: CHECK }} />
  </div>;
}

export default function ProgressPage({ sb, userId }: { sb: SupabaseClient; userId?: string }) {
  const { items, assessments, error } = useSessionsData(sb);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [journal, setJournal] = useState<Map<string, JournalEntry>>(new Map());
  const [courtTests, setCourtTests] = useState<CourtTestRow[] | null>(null);
  const [peerRows, setPeerRows] = useState<{ skill: string; rating: number; updated_at: string }[]>([]);
  const [mode, setModeState] = useState<ProgressMode>(readMode);

  useEffect(() => {
    let active = true;
    if (userId) getProfile(sb, userId).then((p) => { if (active) setProfile(p); }).catch(() => {});
    // Optional: before the capture migration, Progress simply has no before/after card.
    listJournalSummaries(sb).then((j) => { if (active) setJournal(j); }).catch(() => {});
    // Optional too: before the court-tests update, Progress shows no measured goals.
    listCourtTests(sb).then((t) => { if (active) setCourtTests(t); }).catch(() => { if (active) setCourtTests(null); });
    // And peer ratings from partners (peer-feedback update): the "peer" column.
    if (userId) listMyPeerRatings(sb, userId).then((r) => { if (active) setPeerRows(r); }).catch(() => {});
    return () => { active = false; };
  }, [sb, userId]);

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
  const goals = useMemo(() => goalTargets(profile?.baseline_ratings, profile?.main_goals ?? [], profile?.onboarding_completed_at)
    .map((g) => {
      const now = latestRating(allPoints, g.skill);
      return { ...g, now, ...goalProgress(g, now) };
    }), [profile, allPoints]);

  const measured = useMemo(() => courtTestGoals(courtTests ?? []), [courtTests]);
  const peer = useMemo(() => latestPeerBySkill(peerRows), [peerRows]);
  const hasPeer = Object.keys(peer).length > 0;
  const cols = hasPeer ? "grid-cols-[1fr_40px_44px_44px]" : "grid-cols-[1fr_48px_52px]";

  if (items === null && !error) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

  const last = rated.at(-1);
  const reference = baseline?.overall ?? rated[0]?.overall ?? null;
  const change = last && reference != null && (baseline || rated.length > 1) ? Math.round((last.overall! - reference) * 10) / 10 : null;
  const weeks = weeksCovered(rated);
  const trend = rated.slice(-10).map((p) => p.overall!);
  const unrated = allPoints.filter((p) => p.overall == null).reverse();
  const baselineAge = daysSince(baseline?.setAt);
  const lastTest = courtTests ? lastTestedOn(courtTests) : null;
  const testAge = daysSince(lastTest);
  const rerate = baselineAge != null && baselineAge >= GOAL_WINDOW_DAYS;
  const retest = testAge != null && testAge >= GOAL_WINDOW_DAYS;
  const oldest = Math.max(rerate ? baselineAge! : 0, retest ? testAge! : 0);
  const kindWord = mode === "games" ? "game" : mode === "practice" ? "practice" : "session";
  const showResults = mode !== "practice" && (results.record || results.gamesWon || results.errors);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.015em]">Progress</h1>
        {items && <span className="pb-1 text-[13px] font-semibold" style={{ color: INK_3 }}>
          {rated.length ? `${rated.length} rated · ${weeks} week${weeks === 1 ? "" : "s"}` : `${items.length ? `${items.length} logged · ` : ""}0 rated yet`}</span>}
      </div>

      <div role="group" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-full p-1" style={{ background: SURFACE_2 }}>
        {PROGRESS_MODES.map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
          className={`min-h-[44px] rounded-full text-sm font-bold ${pressable}`}
          style={mode === m ? { background: ACTION, color: ON_ACTION } : { color: INK_2 }}>{MODE_LABELS[m]}</button>)}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          <section aria-label={`Average ${kindWord} rating`} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-[18px] p-4" style={cardStyle}>
            <div>
              <p className="text-xs" style={{ color: INK_3 }}>Average {kindWord} rating</p>
              {last ? <>
                <p className="text-[56px] leading-[0.95]" style={numStyle}>{last.overall!.toFixed(1)}</p>
                <p className="mt-1 text-[13px] font-bold" style={{ color: change != null && change < 0 ? WARN : ACCENT_INK }}>
                  {change == null ? `Your first ${kindWord} rating`
                    : change === 0 ? `Same as your ${baseline ? "baseline" : "first"}`
                    : `${change > 0 ? "+" : ""}${change.toFixed(1)} since your ${baseline ? "baseline" : "first rating"}`}</p>
                {baseline && <p className="mt-0.5 text-xs" style={{ color: INK_3 }}>Baseline {baseline.overall.toFixed(1)}{baseline.setAt ? ` · set ${shortDate(baseline.setAt)}` : ""}</p>}
              </> : <>
                <p className="mt-1.5 text-2xl font-extrabold" style={{ color: INK_3 }}>No rating yet</p>
                <p className="mt-1 text-[13px]" style={{ color: INK_2 }}>
                  {mode === "games" && allPoints.some((p) => p.overall != null) ? "No rated games yet. Try Practice or All." : `Rate a ${kindWord} to see your trend`}</p>
                {baseline && <p className="mt-1 text-xs" style={{ color: INK_3 }}>Your baseline is {baseline.overall.toFixed(1)}</p>}
              </>}
            </div>
            <Trend values={trend} baseline={baseline?.overall ?? null} />
          </section>

          {showResults && <section aria-label="Game results" className="rounded-[18px] p-4" style={cardStyle}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-extrabold">Game results</h2>
              <span className="text-xs" style={{ color: INK_3 }}>last {Math.min(8, points.filter((p) => p.kind !== "solo").length)} games</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Win rate" value={results.record ? `${results.record.rate}%` : "—"}
                sub={results.record ? `${results.record.won} won · ${results.record.lost} lost` : "Add results"} good={!!results.record && results.record.rate >= 50} />
              <Stat label="Games won" value={results.gamesWon ? <>{results.gamesWon.won}<span className="text-lg" style={{ color: INK_3 }}>/{results.gamesWon.played}</span></> : "—"}
                sub={results.gamesWon?.before ? `Was ${results.gamesWon.before.won}/${results.gamesWon.before.played}` : results.gamesWon ? "Recent games" : "Add game counts"}
                good={!!results.gamesWon?.before && results.gamesWon.won / results.gamesWon.played > results.gamesWon.before.won / results.gamesWon.before.played} />
              <Stat label="Errors" value={results.errors ? ERROR_STYLE[results.errors.latest].label : "—"}
                sub={results.errors && results.errors.first !== results.errors.latest ? `Was "${results.errors.first}"` : results.errors ? "Unforced" : "Rate errors"}
                good={!!results.errors && ERROR_STYLE[results.errors.latest].height < ERROR_STYLE[results.errors.first].height} />
            </div>
            {results.errors && <>
              <p className="mt-3 text-xs" style={{ color: INK_3 }}>Unforced errors, game by game</p>
              <div role="img" aria-label={`Unforced errors over the last ${results.errors.levels.length} games: ${results.errors.levels.join(", ")}`}
                className="mt-1.5 flex h-11 items-end gap-1.5">
                {results.errors.levels.map((level, i) => <i key={i} className="flex-1 rounded-[5px]"
                  style={{ height: ERROR_STYLE[level].height, background: ERROR_STYLE[level].color }} />)}
              </div>
              <div className="mt-2 flex gap-3.5 text-[11px]" style={{ color: INK_2 }} aria-hidden="true">
                {(["many", "some", "few"] as ErrorLevel[]).map((l) => <span key={l} className="flex items-center gap-1">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ background: ERROR_STYLE[l].color }} />{l}</span>)}
              </div>
            </>}
          </section>}
          {mode !== "practice" && !showResults && rated.length > 0 && <p className="rounded-[14px] px-3 py-2.5 text-[13px]" style={{ background: SURFACE_2, color: INK_2 }}>
            Log Won/Lost, games won or unforced errors on 2 games to see your game results.</p>}

          {(goals.length > 0 || measured.length > 0) && <section aria-label="Your goals" className="rounded-[18px] p-4" style={cardStyle}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-extrabold">Your goals</h2>
              <span className="text-xs" style={{ color: INK_3 }}>from your baseline{goals[0]?.due ? ` · due ${shortDate(goals[0].due)}` : ""}</span>
            </div>
            <ul className="mt-3 space-y-3.5">
              {goals.map((g) => <li key={g.skill}>
                <div className="flex justify-between text-sm"><b>{g.label}</b>
                  <span className="text-[17px]" style={numStyle}>{g.from} → <span style={{ color: ACCENT_INK }}>{g.target}</span></span></div>
                <Bar fraction={g.fraction} />
                <p className="mt-1 text-xs" style={{ color: g.reached ? ACCENT_INK : INK_3, fontWeight: g.reached ? 700 : 400 }}>
                  {g.reached ? `✓ Reached: now ${g.now}` : g.now == null ? "Not rated since your baseline" : `Now ${g.now}`}</p>
              </li>)}
            </ul>
            {measured.length > 0 && <>
              <p className={`text-xs font-bold ${goals.length ? "mt-4 border-t pt-3" : "mt-3"}`} style={{ color: INK_2, borderColor: BORDER }}>Measured on court</p>
              <ul className="mt-2 space-y-3.5" aria-label="Court test goals">
                {measured.map((m) => <li key={m.test.key}>
                  <div className="flex justify-between text-sm"><b>{m.test.label}</b>
                    <span className="text-[17px]" style={numStyle}>{formatResult(m.test, m.base)} → <span style={{ color: ACCENT_INK }}>{formatResult(m.test, m.target)}</span></span></div>
                  <Bar fraction={m.fraction} />
                  <p className="mt-1 text-xs" style={{ color: m.reached ? ACCENT_INK : INK_3, fontWeight: m.reached ? 700 : 400 }}>
                    {m.reached ? `✓ Reached${m.best != null ? `: best ${formatResult(m.test, m.best)}` : ""}`
                      : m.best == null ? `Baseline set ${shortDate(m.baseDate)} · re-test to see progress` : `Best since: ${formatResult(m.test, m.best)}`}</p>
                </li>)}
              </ul>
            </>}
          </section>}

          {(insights.lines.length > 0 || insights.recoveryNote) && <section aria-label="Before and after your games" className="rounded-[18px] p-4" style={cardStyle}>
            <h2 className="text-[15px] font-extrabold">Before and after your {mode === "practice" ? "practice" : "games"}</h2>
            <p className="mt-0.5 text-xs" style={{ color: INK_3 }}>From your pre-game check-ins and recovery logs</p>
            {insights.lines.length > 0 && <dl className="mt-2.5 text-sm">
              {insights.lines.map((l) => <div key={l.id} className="flex items-center justify-between gap-3 border-t py-2.5" style={{ borderColor: BORDER }}>
                <dt>{l.label} <span className="text-xs" style={{ color: INK_3 }}>({l.count})</span></dt>
                <dd className="text-lg" style={{ ...numStyle, color: l.better ? ACCENT_INK : INK }}>{l.value}</dd>
              </div>)}
            </dl>}
            {insights.recoveryNote && <p className="mt-2 rounded-[14px] px-3 py-2.5 text-[13px] leading-snug" style={{ background: ACTION_SOFT, color: INK }}>
              <b style={{ color: ACCENT_INK }}>Recovery:</b> {insights.recoveryNote}</p>}
            <p className="mt-2 text-xs" style={{ color: INK_3 }}>Patterns in your own entries, not medical advice.</p>
          </section>}

          {unrated.length > 0 && <section className="rounded-[18px] p-4" style={cardStyle}>
            <p className="text-[15px] font-bold" style={{ color: INK }}>{rated.length === 0 ? "Rate a game you already logged" : "Add ratings to earlier games"}</p>
            <ul className="mt-2">
              {unrated.slice(0, 3).map((s) => <li key={s.sessionId} className="border-t" style={{ borderColor: BORDER }}>
                <a href={`#/sessions/${s.sessionId}?tab=plan`} className="flex min-h-[48px] items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold" style={{ color: INK }}>{s.title}</span>
                    <span className="text-xs" style={{ color: WHITE_SUB }}>{s.date}</span></span>
                  <span className="shrink-0 font-bold" style={{ color: ACCENT_INK }}>Rate it</span>
                </a>
              </li>)}
            </ul>
            {unrated.length > 3 && <p className="mt-1 text-xs" style={{ color: WHITE_SUB }}>{unrated.length - 3} more in Sessions.</p>}
          </section>}
        </div>

        <div className="space-y-4">
          <section aria-label="By skill">
            <div className={`grid ${cols} gap-2 pb-1.5 text-xs`} style={{ color: INK_3 }}>
              <span className="font-bold" style={{ color: INK_2 }}>By skill</span>
              {skills.length ? <><span className="text-right">{baseline ? "base" : "first"}</span><span className="text-right">now</span>
                {hasPeer && <span className="text-right">peer</span>}</>
                : <span className={`${hasPeer ? "col-span-3" : "col-span-2"} whitespace-nowrap text-right`}>fills in after a rated {kindWord}</span>}
            </div>
            <ul className="border-b" style={{ borderColor: BORDER }}>
              {skills.map((row) => <li key={row.skill} className={`grid min-h-[44px] ${cols} items-center gap-2 border-t text-sm`} style={{ borderColor: BORDER }}>
                <span className="truncate">{SKILL_INFO[row.skill].label}
                  <span className="sr-only">{row.change > 0 ? ", improved" : row.change < 0 ? ", lower" : ", no change"}</span></span>
                <span className="text-right text-[15px]" style={{ ...numStyle, fontWeight: 700, color: INK_3 }}>{row.base}</span>
                <span className="text-right text-base" style={{ ...numStyle, color: row.change > 0 ? ACCENT_INK : row.change < 0 ? WARN : INK }}>{row.now}</span>
                {hasPeer && <span className="text-right text-[15px]" style={{ ...numStyle, color: INK_2 }}
                  aria-label={peer[row.skill] != null ? `peer ${peer[row.skill]}` : "no peer rating"}>{peer[row.skill] ?? "—"}</span>}
              </li>)}
            </ul>
            <p className="mt-2 text-xs" style={{ color: WHITE_SUB }}>Your own ratings{mode === "all" ? "" : ` in ${mode === "games" ? "games" : "practice"} only`}, not measured scores.{hasPeer ? " Peer: your partners' latest rating." : ""}</p>
          </section>

          {(rerate || retest) && <section aria-label="Time to re-test" className="rounded-[18px] p-4" style={{ background: CREAM, color: ON_CREAM }}>
            <p className="text-[15px] font-extrabold">Time to re-test your baseline</p>
            <p className="mt-0.5 text-[13px]" style={{ color: "#36413a" }}>{Math.floor(oldest / 7)} weeks since you {rerate && retest ? "set it" : rerate ? "rated it" : "tested"}.
              {" "}Re-test to see how far you have come.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rerate && <a href="#/welcome" className={`inline-flex min-h-[48px] items-center rounded-full px-5 text-[15px] font-extrabold ${pressable}`}
                style={{ background: STRONG, color: ON_STRONG }}>Re-rate skills</a>}
              <a href="#/tests" className={`inline-flex min-h-[48px] items-center rounded-full px-5 text-[15px] font-extrabold ${pressable}`}
                style={rerate ? { border: `1px solid ${ON_CREAM}`, color: ON_CREAM } : { background: STRONG, color: ON_STRONG }}>Court tests</a>
            </div>
          </section>}
          {courtTests && courtTests.length === 0 && profile && <a href="#/tests" className={`flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] px-4 py-3 ${pressable}`} style={cardStyle}>
            <span><b className="block text-sm">Measure your game</b><span className="text-xs" style={{ color: INK_2 }}>5 quick court tests give you a measured baseline</span></span>
            <span className="inline-flex items-center gap-1 font-bold" style={{ color: ACCENT_INK }}>Start <ChevronRight size={16} aria-hidden="true" /></span>
          </a>}
          {!baseline && profile && <a href="#/welcome" className={`flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] px-4 py-3 ${pressable}`} style={cardStyle}>
            <span><b className="block text-sm">Set your baseline</b><span className="text-xs" style={{ color: INK_2 }}>Rate 3 skills so Pickle can set your goals</span></span>
            <span className="inline-flex items-center gap-1 font-bold" style={{ color: ACCENT_INK }}>Start <ChevronRight size={16} aria-hidden="true" /></span>
          </a>}

          {rated.length < 3 && <a href="#/example" className={`grid min-h-[64px] grid-cols-[40px_1fr_20px] items-center gap-2.5 rounded-[16px] px-3 py-1.5 ${pressable}`} style={{ background: CREAM, color: ON_CREAM }}>
            <img src={mascotUrl} alt="" aria-hidden="true" className="h-[52px] w-10 object-contain" />
            <span><b className="block text-sm">See an example game</b><span className="text-xs" style={{ color: "#36413a" }}>What this page looks like after a few games</span></span>
            <ChevronRight size={20} aria-hidden="true" />
          </a>}
        </div>
      </div>
    </div>
  );
}

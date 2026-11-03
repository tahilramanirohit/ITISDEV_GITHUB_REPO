import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { buildSelfReport, SELF_SKILLS, SKILL_INFO, type SelfSkill } from "../../lib/coaching/selfAssessment";
import { ACCENT, ACCENT_INK, ACTION, BORDER, CREAM, GREEN, INK, INK_2, INK_3, LINE_STRONG, ON_CREAM, ORANGE, SURFACE, SURFACE_2, WHITE_SUB } from "../theme";
import { Notice, cardStyle, mascotUrl, numStyle, pressable } from "../shell/primitives";
import { useSessionsData } from "../sessions/sessionUi";

type Point = { sessionId: string; date: string; title: string; overall: number; ratings: Partial<Record<SelfSkill, number>> };

/** The average rating over recent games as a line, or a dashed placeholder before there are two. */
function Trend({ values }: { values: number[] }) {
  const w = 140, h = 64;
  if (values.length < 2) return <svg viewBox="0 0 120 70" width="110" height="64" aria-hidden="true"><polyline points="4,60 30,52 56,44 82,32 116,18" fill="none" stroke={LINE_STRONG} strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" /></svg>;
  const lo = Math.min(...values) - 0.2, hi = Math.max(...values) + 0.2;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - lo) / (hi - lo)) * h] as const);
  const lastPt = pts[pts.length - 1];
  return <svg width={w} height={h} viewBox={`-6 -6 ${w + 12} ${h + 12}`} role="img" aria-label={`Average rating went from ${values[0].toFixed(1)} to ${values[values.length - 1].toFixed(1)}`}>
    <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={lastPt[0]} cy={lastPt[1]} r={5} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
  </svg>;
}

export default function ProgressPage({ sb }: { sb: SupabaseClient }) {
  const { items, assessments, error } = useSessionsData(sb);

  const points = useMemo<Point[]>(() => {
    const sessions = new Map((items ?? []).map((i) => [i.session.id, i.session]));
    return assessments.flatMap((a) => {
      const s = sessions.get(a.session_id);
      if (!s) return [];
      const report = buildSelfReport({ ratings: a.ratings, goals: s.improvement_goals ?? [] });
      return report.available && report.overall != null
        ? [{ sessionId: s.id, date: s.session_date, title: s.title, overall: report.overall, ratings: a.ratings }] : [];
    }).sort((x, y) => x.date.localeCompare(y.date));
  }, [items, assessments]);

  const ratedIds = new Set(points.map((p) => p.sessionId));
  const unrated = (items ?? []).map((i) => i.session).filter((s) => !ratedIds.has(s.id));

  if (items === null && !error) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

  const recent = points.slice(-10);
  const first = points[0];
  const last = points.at(-1);
  const change = first && last && points.length > 1 ? Math.round((last.overall - first.overall) * 10) / 10 : null;

  const weeks = first && last ? Math.max(1, Math.round((Date.parse(last.date) - Date.parse(first.date)) / 604800000) + 1) : 0;
  const trend = recent.map((p) => p.overall);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.015em]">Progress</h1>
        {items && <span className="pb-1 text-[13px] font-semibold" style={{ color: INK_3 }}>
          {points.length === 0 ? `${items.length ? `${items.length} logged · ` : ""}0 rated yet` : `${points.length} rated · ${weeks} week${weeks === 1 ? "" : "s"}`}</span>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          <section aria-label="Average self rating" className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-[18px] p-4" style={cardStyle}>
            <div>
              <p className="text-xs" style={{ color: INK_3 }}>Average self rating</p>
              {last ? <>
                <p className="text-[56px] leading-[0.95]" style={numStyle}>{last.overall.toFixed(1)}</p>
                <p className="mt-1 text-[13px] font-bold" style={{ color: change != null && change < 0 ? ORANGE : ACCENT_INK }}>
                  {change == null ? "Your first rating" : change === 0 ? `Same as your first, ${first!.overall.toFixed(1)}` : `${change > 0 ? "Up" : "Down"} from ${first!.overall.toFixed(1)}`}</p>
              </> : <>
                <p className="mt-1.5 text-2xl font-extrabold" style={{ color: INK_3 }}>No rating yet</p>
                <p className="mt-1 text-[13px]" style={{ color: INK_2 }}>Rate 3 games to see your trend</p>
                <div role="img" aria-label="0 of 3 games rated" className="mt-2 flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="h-1.5 w-7 rounded-full" style={{ background: SURFACE_2 }} />)}</div>
              </>}
            </div>
            <Trend values={trend} />
          </section>

          {unrated.length > 0 && <section className="rounded-[18px] p-4" style={cardStyle}>
            <p className="text-[15px] font-bold" style={{ color: INK }}>{points.length === 0 ? "Rate a game you already logged" : "Add ratings to earlier games"}</p>
            <ul className="mt-2">
              {unrated.slice(0, 3).map((s) => <li key={s.id} className="border-t" style={{ borderColor: BORDER }}>
                <a href={`#/sessions/${s.id}?tab=plan`} className="flex min-h-[48px] items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold" style={{ color: INK }}>{s.title}</span>
                    <span className="text-xs" style={{ color: WHITE_SUB }}>{s.session_date}</span></span>
                  <span className="shrink-0 font-bold" style={{ color: ACCENT_INK }}>Rate it</span>
                </a>
              </li>)}
            </ul>
            {unrated.length > 3 && <p className="mt-1 text-xs" style={{ color: WHITE_SUB }}>{unrated.length - 3} more in Sessions.</p>}
          </section>}

          {points.length === 0 && <section className="grid grid-cols-[84px_1fr] items-center gap-3.5 rounded-[18px] p-4" style={cardStyle}>
            <svg viewBox="0 0 84 140" width="84" height="140" aria-hidden="true"><g fill="none" stroke={LINE_STRONG} strokeWidth="2"><rect x="3" y="3" width="78" height="134" rx="3" /><path d="M3 51h78M3 89h78M42 3v48M42 89v48" /></g><line x1="0" y1="70" x2="84" y2="70" stroke={LINE_STRONG} strokeWidth="4" /></svg>
            <div className="space-y-1.5">
              <h2 className="text-base font-extrabold">Where you stood</h2>
              <p className="text-[13px] leading-snug" style={{ color: INK_2 }}>Upload a rally video and we'll map where you played on court.</p>
              <a href="#/new?mode=video" className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-[13px] font-extrabold ${pressable}`} style={{ border: `1px solid ${ACTION}`, color: ACCENT_INK }}>Analyze a video</a>
            </div>
          </section>}
        </div>

        <section aria-label="By skill">
          <div className="grid grid-cols-[1fr_44px_48px] gap-2 pb-1.5 text-xs" style={{ color: INK_3 }}>
            <span className="font-bold" style={{ color: INK_2 }}>By skill</span>
            {points.length ? <><span className="text-right">first</span><span className="text-right">now</span></> : <span className="col-span-2 whitespace-nowrap text-right">fills in after game 1</span>}
          </div>
          <ul className="border-b" style={{ borderColor: BORDER }}>
            {(points.length ? SELF_SKILLS : SELF_SKILLS.slice(0, 4)).map((skill) => {
              const values = points.flatMap((p) => p.ratings[skill] != null ? [p.ratings[skill]!] : []);
              if (points.length && !values.length) return null;
              const delta = values.length ? values.at(-1)! - values[0] : 0;
              const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
              return <li key={skill} className="grid min-h-[44px] grid-cols-[1fr_44px_48px] items-center gap-2 border-t text-sm" style={{ borderColor: BORDER }}>
                <span className="flex min-w-0 items-center gap-2"><span className="truncate" style={{ color: values.length ? INK : INK_3 }}>{SKILL_INFO[skill].label}</span>
                  {values.length > 1 && <Icon size={14} aria-label={delta > 0 ? "improved" : delta < 0 ? "lower" : "no change"} style={{ color: delta > 0 ? GREEN : delta < 0 ? ORANGE : WHITE_SUB, flexShrink: 0 }} />}</span>
                <span className="text-right text-[15px]" style={{ ...numStyle, fontWeight: 700, color: INK_3 }}>{values.length ? values[0].toFixed(1) : ""}</span>
                <span className="text-right text-base" style={{ ...numStyle, color: values.length ? (delta > 0 ? ACCENT_INK : INK) : LINE_STRONG }}>{values.length ? values.at(-1)!.toFixed(1) : "—"}</span>
              </li>;
            })}
          </ul>
          <p className="mt-2 text-xs" style={{ color: WHITE_SUB }}>Your own ratings, not measured scores. Video sessions add court positions in each session's Video tab.</p>
          {points.length < 3 && <a href="#/example" className={`mt-4 grid min-h-[64px] grid-cols-[40px_1fr_20px] items-center gap-2.5 rounded-[16px] px-3 py-1.5 ${pressable}`} style={{ background: CREAM, color: ON_CREAM }}>
            <img src={mascotUrl} alt="" aria-hidden="true" className="h-[52px] w-10 object-contain" />
            <span><b className="block text-sm">See an example game</b><span className="text-xs" style={{ color: "#36413a" }}>What this page looks like after a few games</span></span>
            <ChevronRight size={20} aria-hidden="true" />
          </a>}
        </section>
      </div>
    </div>
  );
}

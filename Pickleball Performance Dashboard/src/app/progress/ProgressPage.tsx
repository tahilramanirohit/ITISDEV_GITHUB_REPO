import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { buildSelfReport, SELF_SKILLS, SKILL_INFO, type SelfSkill } from "../../lib/coaching/selfAssessment";
import { BORDER, DISPLAY_FONT, GREEN, INK, NAVY, OPTIC, ORANGE, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Notice, ScreenTitle, SectionTitle } from "../shell/primitives";
import { useSessionsData } from "../sessions/sessionUi";

type Point = { sessionId: string; date: string; title: string; overall: number; ratings: Partial<Record<SelfSkill, number>> };

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs" style={{ color: WHITE_SUB }}>1 rating</span>;
  const w = 72, h = 24;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - 1) / 4) * h}`).join(" ");
  return <svg width={w} height={h} viewBox={`-2 -2 ${w + 4} ${h + 4}`} aria-hidden="true">
    <polyline points={pts} fill="none" stroke={GREEN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
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

  return (
    <div className="space-y-6">
      <ScreenTitle title="Self-rated progress" subtitle="How your own skill ratings change over time. Video measurements are not turned into skill scores." />
      {error && <Notice tone="error">{error}</Notice>}
      {items && <p className="text-sm font-semibold" style={{ color: INK }}>
        {items.length} session{items.length === 1 ? "" : "s"} logged · {points.length} rated
      </p>}
      {unrated.length > 0 && <Card>
        <p className="text-base font-bold" style={{ color: INK }}>{points.length === 0 ? "Your sessions are saved. Skill trends appear after you add self-ratings." : "Add ratings to earlier sessions"}</p>
        <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Rate a session you already logged, including video sessions. No need to create a new one.</p>
        <ul className="mt-3 divide-y" style={{ borderColor: BORDER }}>
          {unrated.slice(0, 5).map((s) => <li key={s.id}>
            <a href={`#/sessions/${s.id}?tab=plan`} className="flex min-h-[48px] items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate font-semibold" style={{ color: INK }}>{s.title}</span>
                <span className="text-xs" style={{ color: WHITE_SUB }}>{s.session_date}</span></span>
              <span className="shrink-0 font-bold" style={{ color: GREEN }}>Rate this session →</span>
            </a>
          </li>)}
        </ul>
        {unrated.length > 5 && <p className="mt-2 text-xs" style={{ color: WHITE_SUB }}>{unrated.length - 5} more in Sessions.</p>}
      </Card>}
      {points.length === 0 ? (
        <Card>
          <p className="text-base font-bold" style={{ color: INK }}>Nothing to chart yet</p>
          <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Rate at least 3 skills for a session and it shows up here. Two or more rated sessions show trends.</p>
          <a href="#/new?mode=self" className="mt-4 inline-flex min-h-[44px] items-center rounded-2xl px-5 text-sm font-bold" style={{ background: INK, color: WHITE }}>Log and rate a new session</a>
        </Card>
      ) : <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <section className="rounded-3xl p-5" style={{ background: NAVY, color: WHITE }}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: OPTIC }}>Average self rating</p>
              <p className="text-4xl font-extrabold" style={{ fontFamily: DISPLAY_FONT }}>{last!.overall.toFixed(1)}<span className="text-lg" style={{ color: "#9aa1ab" }}>/5</span></p>
            </div>
            {change != null && <p className="text-sm font-bold" style={{ color: change > 0 ? OPTIC : change < 0 ? "#ffb08a" : "#c9cdd4" }}>
              {change > 0 ? "+" : ""}{change.toFixed(1)} since first</p>}
          </div>
          <div className="mt-4 flex h-28 items-end gap-1.5 lg:h-48" role="img" aria-label={`Average rating for the last ${recent.length} rated sessions`}>
            {recent.map((p, i) => <div key={p.sessionId} className="flex h-full flex-1 flex-col justify-end" title={`${p.title}: ${p.overall.toFixed(1)}`}>
              <div className="w-full rounded-t-lg" style={{ height: `${(p.overall / 5) * 100}%`, background: i === recent.length - 1 ? OPTIC : "rgba(213,240,90,0.35)" }} />
            </div>)}
          </div>
          <p className="mt-2 text-xs" style={{ color: "#9aa1ab" }}>{recent.length} most recent rated session{recent.length === 1 ? "" : "s"}</p>
        </section>

        <section className="space-y-3">
          <SectionTitle>By skill</SectionTitle>
          <Card className="!p-2">
            <ul>
              {SELF_SKILLS.map((skill) => {
                const values = points.flatMap((p) => p.ratings[skill] != null ? [p.ratings[skill]!] : []);
                if (!values.length) return null;
                const delta = values.at(-1)! - values[0];
                const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
                const color = delta > 0 ? GREEN : delta < 0 ? ORANGE : WHITE_SUB;
                return <li key={skill} className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0" style={{ borderColor: BORDER }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" style={{ color: INK }}>{SKILL_INFO[skill].label}</span>
                    <span className="text-xs" style={{ color: WHITE_SUB }}>{SKILL_INFO[skill].group}</span>
                  </span>
                  <Sparkline values={values} />
                  <span className="w-12 text-right text-lg font-extrabold" style={{ color: INK, fontFamily: DISPLAY_FONT }}>{values.at(-1)}</span>
                  <Icon size={16} style={{ color }} aria-label={delta > 0 ? "improved" : delta < 0 ? "lower" : "no change"} />
                </li>;
              })}
            </ul>
          </Card>
          <p className="text-xs" style={{ color: WHITE_SUB }}>Self ratings, not measurements. Video sessions add measured court positions in each session's Video tab.</p>
        </section>
      </div>}
    </div>
  );
}

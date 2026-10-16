import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { buildSelfReport, SELF_SKILLS, SKILL_INFO, type SelfSkill } from "../../lib/coaching/selfAssessment";
import { BORDER, GREEN, INK, NEON, NEON_D, PAPER, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Coach } from "../shell/Coach";
import { Card, Notice, PageHero, SectionTitle, Sheet } from "../shell/primitives";
import { useSessionsData } from "../sessions/sessionUi";

type Point = { sessionId: string; date: string; title: string; overall: number; ratings: Partial<Record<SelfSkill, number>> };

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs" style={{ color: WHITE_SUB }}>1 rating</span>;
  // A small trend line beside each skill meter.
  const w = 64, h = 18;
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
    <div>
      <PageHero eyebrow="Self-rated" title="Progress" subtitle="How your own skill ratings change over time. Video measurements are not turned into skill scores." />
      <Sheet>
      <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      {points.length === 0 ? (
        <section className="flex flex-col items-center rounded-[var(--radius-lg)] p-6 text-center" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
          <Coach size={120} />
          <p className="mt-3 type-heading" style={{ color: INK }}>Nothing to chart yet</p>
          <p className="mt-1 type-small" style={{ color: WHITE_DIM }}>Rate at least 3 skills for a session and it shows up here. Two or more rated sessions show trends.</p>
          <a href="#/new?mode=self" className="mt-4 inline-flex min-h-[48px] items-center rounded-[var(--radius-md)] px-5 type-body-strong" style={{ background: NEON, color: NEON_D }}>Log and rate a new session</a>
        </section>
      ) : <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {/* The number first, then the trend. */}
        <section className="rounded-[var(--radius-lg)] p-4 sm:p-6" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-label="Average self rating">
          <p className="type-label" style={{ color: WHITE_SUB }}>Average self rating</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="type-stat" style={{ color: INK }}>{last!.overall.toFixed(1)}<span className="text-xl" style={{ color: WHITE_SUB }}>/5</span></p>
            {change != null && <p className="flex items-center gap-1 type-body-strong tabular-nums" style={{ color: change > 0 ? GREEN : WHITE_DIM }}>
              {change > 0 ? <TrendingUp size={18} aria-hidden="true" /> : change < 0 ? <TrendingDown size={18} aria-hidden="true" /> : <Minus size={18} aria-hidden="true" />}
              {change > 0 ? "+" : ""}{change.toFixed(1)} since first</p>}
          </div>
          <div className="mt-4 flex h-28 items-end gap-1.5 border-b lg:h-48" style={{ borderColor: BORDER }} role="img" aria-label={`Average rating for the last ${recent.length} rated sessions`}>
            {recent.map((p, i) => <div key={p.sessionId} className="flex h-full flex-1 flex-col justify-end" title={`${p.title}: ${p.overall.toFixed(1)}`}>
              <div className="w-full rounded-t-[6px]" style={{ height: `${(p.overall / 5) * 100}%`, background: i === recent.length - 1 ? GREEN : PAPER }} />
            </div>)}
          </div>
          <p className="mt-2 type-small" style={{ color: WHITE_SUB }}>{recent.length} most recent rated session{recent.length === 1 ? "" : "s"} · {items?.length ?? 0} logged in all</p>
        </section>

        <section className="space-y-3">
          <SectionTitle>By skill</SectionTitle>
          <Card className="!p-0">
            <ul>
              {SELF_SKILLS.map((skill) => {
                const values = points.flatMap((p) => p.ratings[skill] != null ? [p.ratings[skill]!] : []);
                if (!values.length) return null;
                const now = values.at(-1)!;
                const delta = now - values[0];
                return <li key={skill} className="border-b px-4 py-3 last:border-b-0" style={{ borderColor: BORDER }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate type-body-strong" style={{ color: INK }}>{SKILL_INFO[skill].label}</span>
                    <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                      <span className="text-sm font-bold" style={{ color: delta > 0 ? GREEN : WHITE_DIM }}
                        aria-label={delta > 0 ? `improved by ${delta}` : delta < 0 ? `lower by ${-delta}` : "no change"}>{delta > 0 ? `+${delta}` : delta === 0 ? "0" : delta}</span>
                      <span className="type-heading" style={{ color: INK }}>{now}</span>
                    </span>
                  </div>
                  {/* Low skills are never red: the meter shows the level, the sign shows the change. */}
                  <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: PAPER }} aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${(now / 5) * 100}%`, background: GREEN }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3"><span className="text-xs" style={{ color: WHITE_SUB }}>{SKILL_INFO[skill].group}</span><Sparkline values={values} /></div>
                </li>;
              })}
            </ul>
          </Card>
          <p className="type-small" style={{ color: WHITE_SUB }}>Self ratings, not measurements. Video sessions add measured court positions in each session's Video tab.</p>
        </section>
      </div>}
      {unrated.length > 0 && <Card>
        <p className="type-body-strong" style={{ color: INK }}>{points.length === 0 ? "Your sessions are saved. Skill trends appear after you add self-ratings." : "Add ratings to earlier sessions"}</p>
        <p className="mt-1 type-small" style={{ color: WHITE_DIM }}>Rate a session you already logged, including video sessions. No need to create a new one.</p>
        <ul className="mt-3 divide-y" style={{ borderColor: BORDER }}>
          {unrated.slice(0, 5).map((s) => <li key={s.id} style={{ borderColor: BORDER }}>
            <a href={`#/sessions/${s.id}?tab=plan`} className="flex min-h-[48px] items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate font-bold" style={{ color: INK }}>{s.title}</span>
                <span className="text-xs" style={{ color: WHITE_SUB }}>{s.session_date}</span></span>
              <span className="shrink-0 font-bold" style={{ color: GREEN }}>Rate this session →</span>
            </a>
          </li>)}
        </ul>
        {unrated.length > 5 && <p className="mt-2 text-xs" style={{ color: WHITE_SUB }}>{unrated.length - 5} more in Sessions.</p>}
      </Card>}
      </div>
      </Sheet>
    </div>
  );
}

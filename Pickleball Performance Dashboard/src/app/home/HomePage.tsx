import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Camera, Check, ChevronRight, Plus } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { selfCoachScript } from "../../lib/coaching/coachScript";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { CoachLauncher } from "../coach/CoachPlayer";
import { InstallTip } from "../shell/InstallTip";
import { BORDER, GREEN, HERO, INK, ON_BRAND, ON_BRAND_MUTED, ON_BRAND_PICKLE, PAPER, PICKLE, WHITE, WHITE_DIM, WHITE_SUB, YELLOW, YELLOW_INK } from "../theme";
import { MASCOT_NAME } from "../brand";
import { Coach } from "../shell/Coach";
import { Notice, PageHero, SectionTitle, Sheet } from "../shell/primitives";
import { EmptySessions, SessionCard, useSessionsData, weekStreak } from "../sessions/sessionUi";

const WEEKLY_TARGET = 3;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mon–Sun strip: a dot under days with a session, today outlined. */
function WeekStrip({ dates }: { dates: string[] }) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return { label: d.toLocaleDateString(undefined, { weekday: "narrow" }), day: d.getDate(), played: dates.includes(isoDay(d)), today: d.toDateString() === today.toDateString() };
  });
  return (
    <ol className="grid grid-cols-7 text-center" aria-label={`This week: played on ${days.filter((d) => d.played).length} days`}>
      {days.map((d, i) => (
        <li key={i} className="text-xs" style={{ color: WHITE_SUB }}>
          {d.label}
          <span className="mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full text-xs font-bold"
            aria-label={`${d.day}${d.played ? ", played" : ""}${d.today ? ", today" : ""}`}
            style={d.played ? { background: PICKLE, color: WHITE } : { background: d.today ? WHITE : PAPER, color: INK, border: d.today ? `2px solid ${INK}` : "none" }}>
            {d.played ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : d.day}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One quiet row: icon, title, a short line, chevron. */
function Row({ href, icon, title, detail }: { href: string; icon: ReactNode; title: string; detail: string }) {
  return (
    <a href={href} className="flex min-h-[64px] items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)]" style={{ background: PAPER, color: GREEN }}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block type-body-strong" style={{ color: INK }}>{title}</span>
        <span className="block type-small" style={{ color: WHITE_DIM }}>{detail}</span></span>
      <ChevronRight size={20} aria-hidden="true" style={{ color: WHITE_DIM }} />
    </a>
  );
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomePage({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const { items, assessments, players, error } = useSessionsData(sb);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  useEffect(() => {
    let active = true;
    getProfile(sb, userId).then((p) => { if (active) setProfile(p); }).catch(() => {});
    return () => { active = false; };
  }, [sb, userId]);
  const name = profile?.display_name?.split(" ")[0] ?? "";

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
  const focus = latestPlan?.report.focus[0];
  const coachScript = useMemo(() => latestPlan && latestPlan.report.focus.length
    ? selfCoachScript({ report: latestPlan.report, sessionTitle: latestPlan.title, playFormat: latestPlan.playFormat, length: "short" }) : null, [latestPlan]);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const selfRating = latestPlan?.report.overall != null && !latestPlan.starting ? latestPlan.report.overall.toFixed(1) : "–";

  return (
    <div>
      <PageHero eyebrow={today} title={name ? `${greeting()}, ${name}` : greeting()} />
      <Sheet>
        <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-6">
            {/* The one brand card: what to practice now, with Piko. */}
            <section aria-labelledby="focus-title" className="rounded-[var(--radius-lg)] p-5 sm:p-6" style={{ background: HERO, color: ON_BRAND }}>
              <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="type-label" style={{ color: ON_BRAND_PICKLE }}>{latestPlan?.starting ? "Your starting focus" : focus ? "Your focus this week" : `${MASCOT_NAME} says`}</p>
                <h2 id="focus-title" className="mt-2 type-display-lg">{focus ? focus.label : "Ready to play?"}</h2>
                <p className="mt-2 type-small" style={{ color: ON_BRAND_MUTED }}>
                  {focus
                    ? `${focus.drill.name} · 3 times this week · from ${latestPlan!.starting ? "your setup answers" : "your last session"}`
                    : "Log a session and rate how it felt. You'll get focus areas and drills."}
                </p>
              </div>
              <Coach size={96} disc className="shrink-0" />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <a href={focus ? latestPlan!.href : "#/new"} className="inline-flex min-h-[48px] items-center gap-2 rounded-[var(--radius-md)] px-5 type-body-strong" style={{ background: YELLOW, color: YELLOW_INK }}>
                  {focus ? "Start practice" : "Log a session"} <ArrowRight size={18} aria-hidden="true" />
                </a>
                {coachScript && <CoachLauncher shortScript={coachScript} tone="brand" compact label={`Hear ${MASCOT_NAME}`} />}
              </div>
            </section>

            {/* Numbers first: three stats, then the week. */}
            <section aria-label="Your numbers" className="rounded-[var(--radius-lg)] p-4 sm:p-6" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
              <dl className="grid grid-cols-3 gap-2">
                <div><dt className="type-label" style={{ color: WHITE_SUB }}>This week</dt><dd className="mt-1 type-stat" style={{ color: INK }}>{thisWeek}<span className="text-xl" style={{ color: WHITE_SUB }}>/{WEEKLY_TARGET}</span></dd></div>
                <div><dt className="type-label" style={{ color: WHITE_SUB }}>Week streak</dt><dd className="mt-1 type-stat" style={{ color: INK }}>{streak}</dd></div>
                <div><dt className="type-label" style={{ color: WHITE_SUB }}>Self rating</dt><dd className="mt-1 type-stat" style={{ color: INK }}>{selfRating}</dd></div>
              </dl>
              <div className="mt-4 border-t pt-4" style={{ borderColor: BORDER }}><WeekStrip dates={dates} /></div>
              <p className="mt-3 text-center type-small" style={{ color: WHITE_SUB }}>{sessions.length} sessions logged</p>
            </section>

            <div className="space-y-3">
              <Row href="#/new" icon={<Plus size={20} aria-hidden="true" />} title="Log today's game" detail="Rate how it felt in about 2 minutes" />
              <Row href="#/new?mode=video" icon={<Camera size={20} aria-hidden="true" />} title="Analyze a match video" detail="Optional · where you stood on court" />
            </div>
            <InstallTip />
          </div>

          <div className="space-y-4">
            {error && <Notice tone="error">{error}</Notice>}
            <section className="space-y-3">
              <SectionTitle action={sessions.length > 2 ? <a href="#/sessions" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold" style={{ color: GREEN }}>See all <ArrowRight size={14} aria-hidden="true" /></a> : undefined}>
                Recent sessions
              </SectionTitle>
              {items === null ? <p className="type-small" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
                : items.length === 0 ? <EmptySessions />
                : <ul className="space-y-3">{items.slice(0, 2).map((item) => <li key={item.session.id}><SessionCard item={item} assessment={byId.get(item.session.id)} players={players.get(item.session.id)} you={name || "You"} /></li>)}</ul>}
            </section>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Camera, ClipboardCheck, Dumbbell, Flame } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { BORDER, CARD_GLOW, DISPLAY_FONT, GREEN, GREEN_BG, INK, NAVY, OPTIC, OPTIC_INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Notice, SectionTitle } from "../shell/primitives";
import { EmptySessions, SessionCard, useSessionsData, weekStreak } from "../sessions/sessionUi";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}


/** Strava-style weekly summary: one bar per day this week, plus streak and totals. */
function WeekCard({ dates, streak, total, month }: { dates: string[]; streak: number; total: number; month: number }) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { label: d.toLocaleDateString(undefined, { weekday: "narrow" }), count: dates.filter((x) => x === iso).length, isToday: d.toDateString() === today.toDateString() };
  });
  const week = days.reduce((n, d) => n + d.count, 0);
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <section className="rounded-2xl p-4" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-labelledby="week-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="week-title" className="text-sm font-bold" style={{ color: INK }}>This week</h2>
          <p className="text-3xl font-extrabold tracking-tight" style={{ color: INK }}>{week} <span className="text-base font-semibold" style={{ color: WHITE_SUB }}>session{week === 1 ? "" : "s"}</span></p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: streak ? OPTIC : "#eceef2", color: streak ? OPTIC_INK : WHITE_SUB }}>
          <Flame size={16} aria-hidden="true" /> {streak} week streak
        </span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2" role="img" aria-label={`Sessions per day this week: ${days.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="flex h-16 w-full items-end justify-center rounded-lg" style={{ background: "#f4f5f7" }}>
              {d.count > 0 && <div className="w-full rounded-lg" style={{ height: `${Math.max(28, (d.count / max) * 100)}%`, background: GREEN }} />}
            </div>
            <span className="text-[11px] font-semibold" style={{ color: d.isToday ? GREEN : WHITE_SUB }}>{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm" style={{ borderColor: BORDER }}>
        <p><span className="block text-[11px]" style={{ color: WHITE_SUB }}>This month</span><b className="text-lg">{month}</b></p>
        <p><span className="block text-[11px]" style={{ color: WHITE_SUB }}>All time</span><b className="text-lg">{total}</b></p>
      </div>
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
  const name = profile?.display_name?.split(" ")[0] ?? "";

  const byId = useMemo(() => new Map(assessments.map((a) => [a.session_id, a])), [assessments]);
  // Latest session that has a usable self-assessment plan.
  const latestPlan = useMemo(() => {
    for (const item of items ?? []) {
      const a = byId.get(item.session.id);
      if (!a) continue;
      const report = buildSelfReport({ ratings: a.ratings, goals: item.session.improvement_goals ?? [], playFormat: item.session.play_format,
        biggestStruggle: a.biggest_struggle, unforcedErrors: a.unforced_errors });
      if (report.available) return { href: `#/sessions/${item.session.id}`, starting: false, report };
    }
    // Before any rated session, plan from the onboarding answers.
    if (profile?.baseline_ratings) {
      const report = buildSelfReport({ ratings: profile.baseline_ratings, goals: profile.main_goals ?? [] });
      if (report.available) return { href: "#/new?mode=self", starting: true, report };
    }
    return null;
  }, [items, byId, profile]);

  const sessions = items ?? [];
  const thisMonth = new Date().toISOString().slice(0, 7);
  const streak = weekStreak(sessions.map((i) => i.session.session_date));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold" style={{ color: WHITE_SUB }}>{greeting()}{name ? `, ${name}` : ""}</p>
        <h1 className="text-[1.75rem] font-extrabold leading-tight lg:text-4xl" style={{ color: INK, fontFamily: DISPLAY_FONT }}>Ready to play better?</h1>
      </div>

      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl p-5" style={{ background: NAVY, color: WHITE }}>
        <div aria-hidden="true" className="absolute -right-10 -top-10 h-40 w-40 rounded-full" style={{ background: OPTIC, opacity: 0.18 }} />
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: OPTIC }}>After your game</p>
        <p className="mt-1 text-xl font-extrabold leading-snug" style={{ fontFamily: DISPLAY_FONT }}>Log it and get a practice plan in two minutes.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href="#/new?mode=self" className="flex min-h-[52px] items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ background: OPTIC, color: OPTIC_INK }}>
            <ClipboardCheck size={18} /> Rate my game
          </a>
          <a href="#/new?mode=video" className="flex min-h-[52px] items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ background: "rgba(255,255,255,0.1)", color: WHITE }}>
            <Camera size={18} /> Analyze video
          </a>
        </div>
      </section>

      {items && items.length > 0 && <WeekCard dates={sessions.map((i) => i.session.session_date)} streak={streak}
        total={sessions.length} month={sessions.filter((i) => i.session.session_date.startsWith(thisMonth)).length} />}

      {latestPlan && latestPlan.report.focus.length > 0 && <section className="space-y-3">
        <SectionTitle action={<a href={latestPlan.href} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>
          {latestPlan.starting ? "Rate a session" : "Full plan"} <ArrowRight size={14} /></a>}>
          {latestPlan.starting ? "Your starting focus" : "Your focus"}
        </SectionTitle>
        {latestPlan.starting && <p className="-mt-1 text-sm" style={{ color: WHITE_DIM }}>From your setup answers, not updated by video analysis. Rate a session after you play to update it.</p>}
        {latestPlan.report.focus.length > 1 && latestPlan.report.focus.every((f) => f.rating === latestPlan.report.focus[0].rating) &&
          <p className="-mt-1 text-xs" style={{ color: WHITE_SUB }}>These skills have the same rating. They are ordered by your goals and what you said gave you trouble, then by skill order.</p>}
        <div className="grid gap-3 lg:grid-cols-3">
          {latestPlan.report.focus.map((f, i) => (
            <a key={f.skill} href={latestPlan.href} className="rounded-2xl p-4"
              style={{ background: i === 0 ? OPTIC : WHITE, border: `1px solid ${i === 0 ? OPTIC : BORDER}`, boxShadow: CARD_GLOW }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: i === 0 ? OPTIC_INK : GREEN }}>Focus {i + 1} · {f.rating}/5</p>
              <p className="mt-1 text-base font-bold" style={{ color: INK }}>{f.label}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: i === 0 ? OPTIC_INK : WHITE_DIM }}><Dumbbell size={14} /> {f.drill.name}</p>
            </a>
          ))}
        </div>
      </section>}

      </div>
      <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      <section className="space-y-3">
        <SectionTitle action={sessions.length > 3 ? <a href="#/sessions" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>See all <ArrowRight size={14} /></a> : undefined}>
          Recent activity
        </SectionTitle>
        {items === null ? <p className="text-sm" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
          : items.length === 0 ? <EmptySessions />
          : <ul className="space-y-3">{items.slice(0, 3).map((item) => <li key={item.session.id}><SessionCard item={item} assessment={byId.get(item.session.id)} players={players.get(item.session.id)} you={name || "You"} /></li>)}</ul>}
      </section>

      <section className="rounded-2xl p-4" style={{ background: GREEN_BG }}>
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color: GREEN }}><Camera size={16} /> Have a recording?</p>
        <p className="mt-1 text-sm" style={{ color: INK }}>Video analysis is an optional extra. It maps where you stood on court using computer vision, alongside your own ratings.</p>
      </section>
      </div>
      </div>
    </div>
  );
}

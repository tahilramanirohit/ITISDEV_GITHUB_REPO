import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Camera, Dumbbell, Trophy } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { BORDER, CARD_GLOW, DEEP, GREEN, INK, PICKLE, WHITE, WHITE_DIM, WHITE_SUB, YELLOW, YELLOW_INK } from "../theme";
import { Notice, PageHero, RingTile, SectionTitle, Sheet } from "../shell/primitives";
import { EmptySessions, SessionCard, useSessionsData, weekStreak } from "../sessions/sessionUi";

const WEEKLY_TARGET = 3;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mon–Sun strip: a ring on days with a session, today filled in. */
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
        <li key={i} className="text-[11px] font-semibold" style={{ color: WHITE_SUB }}>
          {d.label}
          <span className="mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full text-xs font-bold"
            aria-label={`${d.day}${d.played ? ", played" : ""}${d.today ? ", today" : ""}`}
            style={d.today ? { background: DEEP, color: YELLOW } : { background: WHITE, color: INK, border: d.played ? `2px solid ${PICKLE}` : `1px solid ${BORDER}` }}>
            {d.day}
          </span>
        </li>
      ))}
    </ol>
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
  const dates = sessions.map((i) => i.session.session_date);
  const streak = weekStreak(dates);
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const thisWeek = dates.filter((d) => d >= isoDay(monday)).length;
  const focus = latestPlan?.report.focus[0];

  return (
    <div>
      <PageHero mascot eyebrow={name ? `Hi ${name}` : "Welcome back"}
        title={focus ? <>Today's a good day for <span style={{ color: YELLOW }}>{focus.label.toLowerCase()}.</span></> : <>Ready to <span style={{ color: YELLOW }}>play?</span></>} />
      <Sheet>
        <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <RingTile label="Self rating" value={latestPlan?.report.overall != null && !latestPlan.starting ? latestPlan.report.overall.toFixed(1) : "–"}
                fraction={latestPlan?.report.overall != null && !latestPlan.starting ? (latestPlan.report.overall - 1) / 4 : 0} />
              <RingTile label="This week" value={`${thisWeek}/${WEEKLY_TARGET}`} fraction={thisWeek / WEEKLY_TARGET} color={YELLOW} />
            </div>

            {focus && <a href={latestPlan!.href} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-full py-1.5 pl-1.5 pr-1.5"
              style={{ background: YELLOW, color: YELLOW_INK }}>
              <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: DEEP, color: YELLOW }}><Trophy size={18} aria-hidden="true" /></span>
              <span className="min-w-0"><b className="block text-sm">Weekly challenge</b><span className="block truncate text-xs">{focus.drill.name} · 3 times this week</span></span>
              <span className="rounded-full px-4 py-2 text-xs font-extrabold" style={{ background: DEEP, color: WHITE }}>START</span>
            </a>}

            <WeekStrip dates={dates} />
            <p className="-mt-2 text-center text-xs font-semibold" style={{ color: WHITE_SUB }}>{streak} week streak · {sessions.length} sessions logged</p>

            <a href="#/new" className="flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-sm font-bold" style={{ background: DEEP, color: WHITE, boxShadow: "0 8px 18px rgba(11,42,26,0.25)" }}>
              Played today?
              <span className="ml-auto rounded-full px-4 py-2.5 text-xs font-extrabold" style={{ background: YELLOW, color: YELLOW_INK }}>Log today's game</span>
            </a>

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
                    style={{ background: i === 0 ? YELLOW : WHITE, border: `1px solid ${i === 0 ? YELLOW : BORDER}`, boxShadow: CARD_GLOW }}>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: i === 0 ? YELLOW_INK : GREEN }}>Focus {i + 1} · {f.rating}/5</p>
                    <p className="mt-1 text-base font-extrabold" style={{ color: INK }}>{f.label}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: i === 0 ? YELLOW_INK : WHITE_DIM }}><Dumbbell size={14} /> {f.drill.name}</p>
                  </a>
                ))}
              </div>
            </section>}
          </div>

          <div className="space-y-5">
            {error && <Notice tone="error">{error}</Notice>}
            <section className="space-y-3">
              <SectionTitle action={sessions.length > 3 ? <a href="#/sessions" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>See all <ArrowRight size={14} /></a> : undefined}>
                Recent activity
              </SectionTitle>
              {items === null ? <p className="text-sm" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
                : items.length === 0 ? <EmptySessions />
                : <ul className="space-y-3">{items.slice(0, 3).map((item) => <li key={item.session.id}><SessionCard item={item} assessment={byId.get(item.session.id)} players={players.get(item.session.id)} you={name || "You"} /></li>)}</ul>}
            </section>
            <section className="rounded-2xl p-4" style={{ background: "#e3f6ea" }}>
              <p className="flex items-center gap-2 text-sm font-bold" style={{ color: GREEN }}><Camera size={16} /> Have a recording?</p>
              <p className="mt-1 text-sm" style={{ color: INK }}>Video analysis is optional. It maps where you stood on court, alongside your own ratings.</p>
            </section>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

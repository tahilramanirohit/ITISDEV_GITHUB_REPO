import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Camera } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { selfCoachScript } from "../../lib/coaching/coachScript";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { CoachLauncher } from "../coach/CoachPlayer";
import { InstallTip } from "../shell/InstallTip";
import { ACCENT, ACCENT_INK, ACTION, ACTION_EDGE, DISPLAY_FONT, INK, INK_2, INK_3, LINE, ON_ACTION, SURFACE_2 } from "../theme";
import { Notice, PageHero, SectionTitle, Sheet, cardStyle, pressable } from "../shell/primitives";
import { EmptySessions, SessionCard, useSessionsData, weekStreak } from "../sessions/sessionUi";

const WEEKLY_TARGET = 3;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Games played this week against the target, as a ring with the count inside. */
function WeekRing({ played, target }: { played: number; target: number }) {
  const r = 42, c = 2 * Math.PI * r;
  const filled = Math.min(1, played / target) * c;
  return (
    <svg viewBox="0 0 100 100" width="88" height="88" role="img" aria-label={`${played} of ${target} games this week`} className="shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" stroke={SURFACE_2} strokeWidth="9" />
      {played > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={ACCENT} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${filled} ${c}`} transform="rotate(-90 50 50)" />}
      <text x="50" y="57" textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight="800" fontSize="23" fill={INK}>{played}/{target}</text>
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

function weekHeadline(played: number, target: number, streak: number, hasSessions: boolean): string {
  if (!hasSessions) return "Log your first game to get a practice plan.";
  if (played >= target) return "You hit this week's target. Nice work.";
  const left = target - played;
  if (streak > 0) return `${left} more game${left === 1 ? "" : "s"} keeps your streak going.`;
  return `${left} game${left === 1 ? "" : "s"} to go this week.`;
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
  const coachScript = useMemo(() => latestPlan && latestPlan.report.focus.length
    ? selfCoachScript({ report: latestPlan.report, sessionTitle: latestPlan.title, playFormat: latestPlan.playFormat, length: "short" }) : null, [latestPlan]);

  const overall = latestPlan?.report.overall != null && !latestPlan.starting ? latestPlan.report.overall : null;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      <PageHero mascot eyebrow={name ? `${today} · Hi ${name}` : today}
        title={weekHeadline(thisWeek, WEEKLY_TARGET, streak, sessions.length > 0)} />
      <Sheet>
        <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start lg:gap-10 lg:space-y-0">
          <div className="space-y-6">
            <InstallTip />

            <section aria-label="This week" className="rounded-[14px] p-5" style={cardStyle}>
              <div className="flex items-center gap-4">
                <WeekRing played={thisWeek} target={WEEKLY_TARGET} />
                <div className="min-w-0">
                  <h2 className="text-[1.05rem] font-bold" style={{ fontFamily: DISPLAY_FONT }}>Games this week</h2>
                  <p className="mt-0.5 text-sm leading-relaxed" style={{ color: INK_2 }}>
                    Target {WEEKLY_TARGET}. {streak > 0 ? `You're on a ${streak}-week streak.` : "Play this week to start a streak."}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 border-t pt-4" style={{ borderColor: LINE }}>
                <div>
                  <dt className="text-[13px]" style={{ color: INK_3 }}>Self rating</dt>
                  <dd className="text-[1.6rem] font-extrabold tabular-nums" style={{ fontFamily: DISPLAY_FONT }}>{overall != null ? overall.toFixed(1) : "–"}<span className="text-base font-semibold" style={{ color: INK_3 }}>/5</span></dd>
                </div>
                <div className="border-l pl-4" style={{ borderColor: LINE }}>
                  <dt className="text-[13px]" style={{ color: INK_3 }}>Games logged</dt>
                  <dd className="text-[1.6rem] font-extrabold tabular-nums" style={{ fontFamily: DISPLAY_FONT }}>{sessions.length}</dd>
                </div>
              </dl>
            </section>

            {latestPlan && latestPlan.report.focus.length > 0 && <section className="space-y-3">
              <SectionTitle action={<a href={latestPlan.href} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold" style={{ color: ACCENT_INK }}>
                {latestPlan.starting ? "Rate a game" : "Full plan"} <ArrowRight size={14} aria-hidden="true" /></a>}>
                {latestPlan.starting ? "Where to start" : "Practice next"}
              </SectionTitle>
              {latestPlan.starting && <p className="-mt-1 text-sm" style={{ color: INK_2 }}>From your setup answers. Rate a game after you play to update it.</p>}
              {latestPlan.report.focus.length > 1 && latestPlan.report.focus.every((f) => f.rating === latestPlan.report.focus[0].rating) &&
                <p className="-mt-1 text-sm" style={{ color: INK_3 }}>These skills have the same rating, so they are ordered by your goals and what gave you trouble.</p>}
              <ol className="overflow-hidden rounded-[14px]" style={cardStyle}>
                {latestPlan.report.focus.map((f, i) => (
                  <li key={f.skill} className={i ? "border-t" : undefined} style={{ borderColor: LINE }}>
                    <a href={latestPlan.href} className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-sunken">
                      <span className="min-w-0">
                        <b className="block text-base font-bold" style={{ color: INK }}>{f.label}</b>
                        <span className="block text-sm" style={{ color: INK_2 }}>{f.drill.name}{i === 0 ? ", 3 times this week" : ""}</span>
                      </span>
                      <RatingDots value={f.rating} />
                    </a>
                  </li>
                ))}
              </ol>
            </section>}

            {coachScript && <CoachLauncher shortScript={coachScript} tone="light" compact />}

            <a href="#/new" className={`flex min-h-[54px] items-center justify-center rounded-[12px] text-base font-bold ${pressable}`}
              style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
              Log today's game
            </a>
          </div>

          <div className="space-y-6">
            {error && <Notice tone="error">{error}</Notice>}
            <section className="space-y-3">
              <SectionTitle action={sessions.length > 3 ? <a href="#/sessions" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold" style={{ color: ACCENT_INK }}>See all <ArrowRight size={14} aria-hidden="true" /></a> : undefined}>
                Recent games
              </SectionTitle>
              {items === null ? <p className="text-sm" style={{ color: INK_3 }}>Loading your games…</p>
                : items.length === 0 ? <EmptySessions />
                : <ul className="space-y-3">{items.slice(0, 3).map((item) => <li key={item.session.id}><SessionCard item={item} assessment={byId.get(item.session.id)} players={players.get(item.session.id)} you={name || "You"} /></li>)}</ul>}
            </section>
            <section className="flex gap-3 rounded-[14px] p-4" style={cardStyle}>
              <Camera size={18} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: ACCENT_INK }} />
              <div>
                <p className="text-sm font-bold">Have a recording?</p>
                <p className="mt-0.5 text-sm leading-relaxed" style={{ color: INK_2 }}>Video analysis is optional. It maps where you stood on court, next to your own ratings.</p>
              </div>
            </section>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

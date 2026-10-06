import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Camera, ClipboardCheck, Dumbbell, Flame } from "lucide-react";
import { getProfile } from "../../lib/api/profile";
import { buildSelfReport, SKILL_INFO } from "../../lib/coaching/selfAssessment";
import { BORDER, CARD_GLOW, DISPLAY_FONT, GREEN, GREEN_BG, INK, NAVY, OPTIC, OPTIC_INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Notice, SectionTitle } from "../shell/primitives";
import { EmptySessions, SessionCard, useSessionsData } from "../sessions/sessionUi";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Consecutive weeks, ending this week or last, with at least one session. */
export function weekStreak(dates: string[], today = new Date()): number {
  const weekIndex = (d: Date) => Math.floor((d.getTime() / 86400000 + 3) / 7); // weeks start on Monday
  const weeks = new Set(dates.map((iso) => weekIndex(new Date(`${iso}T12:00:00Z`))));
  let current = weekIndex(today);
  if (!weeks.has(current)) current -= 1;
  let streak = 0;
  while (weeks.has(current)) { streak += 1; current -= 1; }
  return streak;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
      <p className="text-2xl font-extrabold leading-none" style={{ color: INK, fontFamily: DISPLAY_FONT }}>{value}</p>
      <p className="mt-1 text-xs font-semibold" style={{ color: WHITE_SUB }}>{label}</p>
    </div>
  );
}

export default function HomePage({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const { items, assessments, error } = useSessionsData(sb);
  const [name, setName] = useState("");
  useEffect(() => {
    let active = true;
    getProfile(sb, userId).then((p) => { if (active && p?.display_name) setName(p.display_name.split(" ")[0]); }).catch(() => {});
    return () => { active = false; };
  }, [sb, userId]);

  const byId = useMemo(() => new Map(assessments.map((a) => [a.session_id, a])), [assessments]);
  // Latest session that has a usable self-assessment plan.
  const latestPlan = useMemo(() => {
    for (const item of items ?? []) {
      const a = byId.get(item.session.id);
      if (!a) continue;
      const report = buildSelfReport({ ratings: a.ratings, goals: item.session.improvement_goals ?? [],
        biggestStruggle: a.biggest_struggle, unforcedErrors: a.unforced_errors });
      if (report.available) return { item, report };
    }
    return null;
  }, [items, byId]);

  const sessions = items ?? [];
  const thisMonth = new Date().toISOString().slice(0, 7);
  const streak = weekStreak(sessions.map((i) => i.session.session_date));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold" style={{ color: WHITE_SUB }}>{greeting()}{name ? `, ${name}` : ""}</p>
        <h1 className="text-[1.75rem] font-extrabold leading-tight" style={{ color: INK, fontFamily: DISPLAY_FONT }}>Ready to play better?</h1>
      </div>

      <section className="relative overflow-hidden rounded-3xl p-5" style={{ background: NAVY, color: WHITE }}>
        <div aria-hidden="true" className="absolute -right-10 -top-10 h-40 w-40 rounded-full" style={{ background: OPTIC, opacity: 0.18 }} />
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: OPTIC }}>After your game</p>
        <p className="mt-1 text-xl font-extrabold leading-snug" style={{ fontFamily: DISPLAY_FONT }}>Log it and get a practice plan in two minutes.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href="#/new?mode=self" className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-sm font-bold" style={{ background: OPTIC, color: OPTIC_INK }}>
            <ClipboardCheck size={18} /> Rate my game
          </a>
          <a href="#/new?mode=video" className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-sm font-bold" style={{ background: "rgba(255,255,255,0.1)", color: WHITE }}>
            <Camera size={18} /> Analyze video
          </a>
        </div>
      </section>

      {items && items.length > 0 && <div className="grid grid-cols-3 gap-2">
        <Stat value={String(sessions.length)} label="Sessions" />
        <Stat value={String(sessions.filter((i) => i.session.session_date.startsWith(thisMonth)).length)} label="This month" />
        <div className="rounded-2xl p-3" style={{ background: streak ? OPTIC : WHITE, border: `1px solid ${streak ? OPTIC : BORDER}` }}>
          <p className="flex items-center gap-1 text-2xl font-extrabold leading-none" style={{ color: INK, fontFamily: DISPLAY_FONT }}><Flame size={20} />{streak}</p>
          <p className="mt-1 text-xs font-semibold" style={{ color: streak ? OPTIC_INK : WHITE_SUB }}>Week streak</p>
        </div>
      </div>}

      {latestPlan && latestPlan.report.focus.length > 0 && <section className="space-y-3">
        <SectionTitle action={<a href={`#/sessions/${latestPlan.item.session.id}`} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>Full plan <ArrowRight size={14} /></a>}>
          Your focus
        </SectionTitle>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {latestPlan.report.focus.map((f, i) => (
            <a key={f.skill} href={`#/sessions/${latestPlan.item.session.id}`} className="w-64 shrink-0 snap-start rounded-3xl p-4"
              style={{ background: i === 0 ? OPTIC : WHITE, border: `1px solid ${i === 0 ? OPTIC : BORDER}`, boxShadow: CARD_GLOW }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: i === 0 ? OPTIC_INK : GREEN }}>Focus {i + 1} · {f.rating}/5</p>
              <p className="mt-1 text-base font-bold" style={{ color: INK }}>{SKILL_INFO[f.skill].label}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: i === 0 ? OPTIC_INK : WHITE_DIM }}><Dumbbell size={14} /> {f.drill.name}</p>
            </a>
          ))}
        </div>
      </section>}

      {error && <Notice tone="error">{error}</Notice>}
      <section className="space-y-3">
        <SectionTitle action={sessions.length > 3 ? <a href="#/sessions" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}>See all <ArrowRight size={14} /></a> : undefined}>
          Recent sessions
        </SectionTitle>
        {items === null ? <p className="text-sm" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
          : items.length === 0 ? <EmptySessions />
          : <ul className="space-y-3">{items.slice(0, 3).map((item) => <li key={item.session.id}><SessionCard item={item} assessment={byId.get(item.session.id)} /></li>)}</ul>}
      </section>

      <section className="rounded-3xl p-4" style={{ background: GREEN_BG }}>
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color: GREEN }}><Camera size={16} /> Have a recording?</p>
        <p className="mt-1 text-sm" style={{ color: INK }}>Video analysis is an optional extra. It maps where you stood on court using computer vision, alongside your own ratings.</p>
      </section>
    </div>
  );
}

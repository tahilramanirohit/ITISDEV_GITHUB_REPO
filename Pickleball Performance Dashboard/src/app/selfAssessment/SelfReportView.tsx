import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Clock, Dumbbell, Target, TrendingDown, TrendingUp, Minus, Video } from "lucide-react";
import { SKILL_INFO, type SelfProgressRow, type SelfReport } from "../../lib/coaching/selfAssessment";
import { TermHelp } from "./TermHelp";
import { ACCENT_INK, ACTION, ACTION_SOFT, BORDER, CHECK, DISPLAY_FONT, GREEN, GREEN_BG, HERO, INK, ON_CHECK, ON_HERO, OPTIC, ORANGE, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, RingTile, SectionTitle, cardStyle, mascot2xUrl, mascotUrl, numStyle, pressable } from "../shell/primitives";
import { selfCoachScript } from "../../lib/coaching/coachScript";
import { CoachLauncher } from "../coach/CoachPlayer";
import { readPlanTicks, writePlanTicks } from "./planTicks";

/** Circular 1-5 score, drawn as an SVG ring. */
export function ScoreRing({ value, size = 88 }: { value: number; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (value - 1) / 4));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Average self rating ${value.toFixed(1)} out of 5`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={OPTIC} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={WHITE}
        style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: size * 0.28 }}>{value.toFixed(1)}</text>
    </svg>
  );
}

function RatingDots({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className="h-1.5 w-4 rounded-full" style={{ background: n <= value ? GREEN : "var(--pp-surface-2)" }} />)}
    </span>
  );
}

function FocusCard({ index, item }: { index: number; item: SelfReport["focus"][number] }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${index === 0 ? ACTION : GREEN} ${item.rating * 20}%, var(--pp-surface-2) 0)` }}>
          <span className="grid h-11 w-11 place-items-center rounded-full text-[15px]" style={{ ...numStyle, background: WHITE, color: INK }}>{item.rating}→{Math.min(5, item.rating + 1)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold" style={{ color: WHITE_SUB }}>Focus {index + 1}</span>
          <span className="block text-base font-bold" style={{ color: INK }}>{item.title}</span>
          <span className="mt-1 block"><RatingDots value={item.rating} /></span>
        </span>
        <ChevronDown size={20} style={{ color: WHITE_SUB, transform: open ? "rotate(180deg)" : undefined }} aria-hidden="true" />
      </button>
      {open && <div className="space-y-3 border-t px-4 pb-4 pt-3 text-sm" style={{ borderColor: BORDER }}>
        <p style={{ color: INK }}>{item.observation}<TermHelp term={item.label} meaning={SKILL_INFO[item.skill].meaning} /></p>
        <p style={{ color: WHITE_DIM }}>{item.why}</p>
        <div className="rounded-[14px] p-3" style={{ background: GREEN_BG }}>
          <p className="flex items-center gap-1.5 font-bold" style={{ color: GREEN }}><Dumbbell size={15} /> Drill: {item.drill.name}</p>
          <p className="mt-1" style={{ color: INK }}>{item.drill.how}</p>
        </div>
        <p className="flex items-start gap-1.5 font-semibold" style={{ color: INK }}><Target size={15} className="mt-0.5 shrink-0" style={{ color: GREEN }} />{item.target}</p>
        <p className="text-xs" style={{ color: WHITE_SUB }}>Picked because {item.reasons.join(", ")}.</p>
      </div>}
    </Card>
  );
}

/** Plan steps the player ticked off, kept on this device only. */
function usePlanTicks(planKey?: string) {
  const [done, setDone] = useState<string[]>(() => planKey ? readPlanTicks(planKey) : []);
  const toggle = (id: string) => setDone((d) => {
    const next = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
    if (planKey) writePlanTicks(planKey, next);
    return next;
  });
  return { done, toggle };
}

export function SelfReportView({ report, progress, previousLabel, onEdit, sessionTitle, playFormat, planKey }: {
  report: SelfReport; progress: SelfProgressRow[] | null; previousLabel?: string; onEdit: () => void;
  sessionTitle?: string | null; playFormat?: string | null;
  /** The session id, so ticked-off plan steps are remembered. */
  planKey?: string;
}) {
  const ticks = usePlanTicks(planKey);
  const coach = useMemo(() => report.available ? {
    short: selfCoachScript({ report, progress, sessionTitle, playFormat, length: "short" }),
    full: selfCoachScript({ report, progress, sessionTitle, playFormat, length: "full" }),
  } : null, [report, progress, sessionTitle, playFormat]);
  if (!report.available || report.overall == null) {
    return <Card><p className="text-sm" style={{ color: WHITE_DIM }}>{report.introduction}</p>
      <button type="button" onClick={onEdit} className="mt-3 text-sm font-bold underline" style={{ color: GREEN }}>Continue rating</button></Card>;
  }
  return (
    <div className="space-y-5">
      {report.focus[0] && (
        <section className="relative overflow-hidden rounded-[22px] p-5 pr-28" style={{ background: HERO, color: ON_HERO, borderTop: `4px solid ${ACTION}` }} aria-label="This week's drill">
          <img src={mascot2xUrl} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-2 right-3 h-28 w-auto" />
          <p className="text-sm font-bold" style={{ color: ACTION }}>This week's drill</p>
          <p className="mt-0.5 text-[1.5rem] font-extrabold leading-tight" style={{ fontFamily: DISPLAY_FONT }}>{report.focus[0].drill.name}</p>
          <p className="mt-1 text-base leading-relaxed" style={{ color: "#c6d3ca" }}><b style={{ color: ON_HERO }}>Pickle says:</b> {report.strengths[0]
            ? `your ${report.strengths[0].title.toLowerCase()} is solid. Let's get your ${report.focus[0].label.toLowerCase()} up this week.`
            : `let's get your ${report.focus[0].label.toLowerCase()} up this week.`}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
            <li className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: "rgba(255,255,255,.1)" }}><Clock size={13} aria-hidden="true" />15 min · 3× this week</li>
          </ul>
          {coach && <div className="relative mt-3"><CoachLauncher shortScript={coach.short} fullScript={coach.full} /></div>}
        </section>
      )}
      {report.peerNote && <p role="note" className="flex items-start gap-2.5 rounded-[14px] px-3 py-2.5 text-[13px] leading-snug"
        style={{ background: ACTION_SOFT, color: INK }}>
        <img src={mascotUrl} alt="" aria-hidden="true" className="h-10 w-7 shrink-0 object-contain" />
        <span><b style={{ color: ACCENT_INK }}>Pickle:</b> {report.peerNote}</span></p>}
      <div className="grid grid-cols-2 gap-3">
        <RingTile label="Self rating" value={report.overall.toFixed(1)} fraction={(report.overall - 1) / 4} />
        <RingTile label="Level" value={report.level ?? "–"} fraction={(report.overall - 1) / 4} />
      </div>
      <p className="text-sm" style={{ color: WHITE_DIM }}>{report.introduction}</p>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-5">
      {report.focus.length > 0 && <section className="space-y-3">
        <SectionTitle>Focus next</SectionTitle>
        {report.focus.map((item, i) => <FocusCard key={item.skill} index={i} item={item} />)}
      </section>}

      {report.strengths.length > 0 && <section className="space-y-2">
        <SectionTitle>What's working</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {report.strengths.map((s) => <span key={s.skill} className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold"
            style={{ background: WHITE, border: `1px solid ${BORDER}`, color: INK }} title={s.observation}>
            {s.title} · {s.rating}/5</span>)}
        </div>
      </section>}

      </div>
      <div className="space-y-5">
      {report.plan.length > 0 && <section className="space-y-3">
        <div className="flex items-baseline justify-between"><SectionTitle>Your next week</SectionTitle>
          <span className="text-sm font-bold" style={{ color: WHITE_SUB }}>{report.plan.filter((st) => ticks.done.includes(st.day)).length} of {report.plan.length} done</span></div>
        <Card className="!py-2">
          <ol>
            {report.plan.map((step) => {
              const on = ticks.done.includes(step.day);
              return <li key={step.day} className="border-t first:border-t-0" style={{ borderColor: BORDER }}>
                <button type="button" role="checkbox" aria-checked={on} onClick={() => ticks.toggle(step.day)}
                  className="flex min-h-[56px] w-full items-start gap-3 py-2.5 text-left">
                  <span aria-hidden="true" className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] transition-colors"
                    style={on ? { background: CHECK, color: ON_CHECK } : { border: `2px solid ${BORDER}` }}>{on && <Check size={16} strokeWidth={3} />}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold" style={{ color: WHITE_SUB }}>{step.day}</span>
                    <span className="block text-sm font-bold" style={{ color: INK, textDecoration: on ? "line-through" : undefined }}>{step.title}</span>
                    <span className="block text-sm" style={{ color: WHITE_DIM }}>{step.detail}</span>
                  </span>
                </button>
              </li>;
            })}
          </ol>
        </Card>
        <a href="#/new?mode=video" className={`flex min-h-[64px] items-center gap-3 rounded-[18px] p-3.5 ${pressable}`} style={cardStyle}>
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: ACTION_SOFT, color: ACCENT_INK }}><Video size={20} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold" style={{ color: INK }}>Film your next game</span>
            <span className="block text-sm" style={{ color: WHITE_DIM }}>See where you stood on the court map.</span></span>
          <ChevronRight size={18} aria-hidden="true" style={{ color: WHITE_SUB }} />
        </a>
      </section>}

      {progress && progress.length > 0 && <section className="space-y-3">
        <SectionTitle>Since last time</SectionTitle>
        <Card>
          {previousLabel && <p className="mb-2 text-xs" style={{ color: WHITE_SUB }}>Compared with {previousLabel}</p>}
          <ul className="divide-y" style={{ borderColor: BORDER }}>
            {progress.map((row) => {
              const Icon = row.change === "better" ? TrendingUp : row.change === "worse" ? TrendingDown : Minus;
              const color = row.change === "better" ? GREEN : row.change === "worse" ? ORANGE : WHITE_SUB;
              return <li key={row.skill} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span style={{ color: INK }}>{row.label}</span>
                <span className="inline-flex items-center gap-2 font-semibold" style={{ color }}>
                  {row.before} → {row.after}<Icon size={16} aria-label={row.change} />
                </span>
              </li>;
            })}
          </ul>
        </Card>
      </section>}

      </div>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: WHITE_SUB }}>{report.limitation}</p>
      <button type="button" onClick={onEdit} className="w-full rounded-[14px] py-3 text-sm font-bold lg:w-auto lg:px-8" style={{ border: `1px solid ${BORDER}`, background: WHITE, color: INK }}>
        Edit my ratings
      </button>
    </div>
  );
}

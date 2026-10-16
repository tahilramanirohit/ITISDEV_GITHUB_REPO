import { useMemo, useState } from "react";
import { ChevronDown, Dumbbell, Target, TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import type { SelfProgressRow, SelfReport } from "../../lib/coaching/selfAssessment";
import { BORDER, DEEP, DISPLAY_FONT, GREEN, HERO, INK, NEON_D, ON_BRAND, ON_BRAND_MUTED, ON_BRAND_PICKLE, PAPER, WHITE, WHITE_DIM, WHITE_SUB, YELLOW } from "../theme";
import { Card, HeroProgress, SectionTitle } from "../shell/primitives";
import { Coach } from "../shell/Coach";
import { MASCOT_NAME } from "../brand";
import { selfCoachScript } from "../../lib/coaching/coachScript";
import { CoachLauncher } from "../coach/CoachPlayer";

/** Circular 1-5 score, drawn as an SVG ring. */
export function ScoreRing({ value, size = 88 }: { value: number; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (value - 1) / 4));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Average self rating ${value.toFixed(1)} out of 5`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PAPER} strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GREEN} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={INK}
        style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: size * 0.28 }}>{value.toFixed(1)}</text>
    </svg>
  );
}

function RatingDots({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className="h-2 w-5 rounded-full" style={{ background: n <= value ? GREEN : PAPER }} />)}
    </span>
  );
}

function FocusCard({ index, item }: { index: number; item: SelfReport["focus"][number] }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-[64px] w-full items-center gap-3 p-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-lg"
          style={{ background: index === 0 ? DEEP : PAPER, color: index === 0 ? NEON_D : INK, fontFamily: DISPLAY_FONT, fontWeight: 800 }}>{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block type-body-strong" style={{ color: INK }}>{item.title}</span>
          <span className="mt-1 block"><RatingDots value={item.rating} /></span>
        </span>
        <ChevronDown size={20} style={{ color: WHITE_SUB, transform: open ? "rotate(180deg)" : undefined }} aria-hidden="true" />
      </button>
      {open && <div className="space-y-3 border-t px-4 pb-4 pt-3 type-small" style={{ borderColor: BORDER }}>
        <p style={{ color: INK }}>{item.observation}</p>
        <p style={{ color: WHITE_DIM }}>{item.why}</p>
        <div className="rounded-[var(--radius-md)] p-3" style={{ background: PAPER }}>
          <p className="flex items-center gap-1.5 font-bold" style={{ color: INK }}><Dumbbell size={16} style={{ color: GREEN }} aria-hidden="true" /> Drill: {item.drill.name}</p>
          <p className="mt-1" style={{ color: INK }}>{item.drill.how}</p>
        </div>
        <p className="flex items-start gap-1.5 font-bold" style={{ color: INK }}><Target size={16} className="mt-0.5 shrink-0" style={{ color: GREEN }} aria-hidden="true" />{item.target}</p>
        <p className="text-xs" style={{ color: WHITE_SUB }}>Picked because {item.reasons.join(", ")}.</p>
      </div>}
    </Card>
  );
}

export function SelfReportView({ report, progress, previousLabel, onEdit, sessionTitle, playFormat }: {
  report: SelfReport; progress: SelfProgressRow[] | null; previousLabel?: string; onEdit: () => void;
  sessionTitle?: string | null; playFormat?: string | null;
}) {
  const coach = useMemo(() => report.available ? {
    short: selfCoachScript({ report, progress, sessionTitle, playFormat, length: "short" }),
    full: selfCoachScript({ report, progress, sessionTitle, playFormat, length: "full" }),
  } : null, [report, progress, sessionTitle, playFormat]);
  if (!report.available || report.overall == null) {
    return <Card><p className="type-small" style={{ color: WHITE_DIM }}>{report.introduction}</p>
      <button type="button" onClick={onEdit} className="mt-2 min-h-[44px] text-sm font-bold underline" style={{ color: GREEN }}>Continue rating</button></Card>;
  }
  return (
    <div className="space-y-5">
      {report.focus[0] && (
        <section className="rounded-[var(--radius-lg)] p-5 sm:p-6" style={{ background: HERO, color: ON_BRAND }} aria-label="This week's drill">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="type-label" style={{ color: ON_BRAND_PICKLE }}>This week's drill</p>
              <p className="mt-2 type-display-lg">{report.focus[0].drill.name}</p>
              <p className="mt-2 type-small" style={{ color: ON_BRAND_MUTED }}>For your {report.focus[0].label.toLowerCase()} · 15 minutes, 3 times this week</p>
            </div>
            <Coach size={84} onDark title={MASCOT_NAME} />
          </div>
          {coach && <div className="mt-5"><CoachLauncher shortScript={coach.short} fullScript={coach.full} /></div>}
        </section>
      )}
      {/* Numbers first: the average and level, then what they are based on. */}
      <section aria-label="Your rating" className="rounded-[var(--radius-lg)] p-4 sm:p-6" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
        <div className="flex items-end justify-between gap-4">
          <div><p className="type-label" style={{ color: WHITE_SUB }}>Self rating</p><p className="mt-1 type-stat" style={{ color: INK }}>{report.overall.toFixed(1)}<span className="text-xl" style={{ color: WHITE_SUB }}>/5</span></p></div>
          {report.level && <div className="text-right"><p className="type-label" style={{ color: WHITE_SUB }}>Level</p><p className="mt-1 type-heading" style={{ color: INK }}>{report.level}</p></div>}
        </div>
        <div className="mt-3"><HeroProgress value={(report.overall - 1) / 4} label={`Self rating ${report.overall.toFixed(1)} out of 5`} /></div>
        <p className="mt-3 type-small" style={{ color: WHITE_DIM }}>{report.introduction}</p>
      </section>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-5">
      {report.focus.length > 0 && <section className="space-y-3">
        <SectionTitle>Focus next</SectionTitle>
        {report.focus.map((item, i) => <FocusCard key={item.skill} index={i} item={item} />)}
      </section>}

      {report.strengths.length > 0 && <section className="space-y-2">
        <SectionTitle>What's working</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {report.strengths.map((s) => <span key={s.skill} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold"
            style={{ background: PAPER, color: INK }} title={s.observation}>
            <Sparkles size={16} style={{ color: GREEN }} aria-hidden="true" />{s.title} · {s.rating}/5</span>)}
        </div>
      </section>}

      </div>
      <div className="space-y-5">
      {report.plan.length > 0 && <section className="space-y-3">
        <SectionTitle>Your next week</SectionTitle>
        <Card>
          <ol className="relative space-y-4">
            {report.plan.map((step, i) => <li key={step.day} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: i === report.plan.length - 1 ? YELLOW : DEEP, color: i === report.plan.length - 1 ? INK : NEON_D }}>{i + 1}</span>
                {i < report.plan.length - 1 && <span className="mt-1 w-0.5 flex-1" style={{ background: BORDER }} />}
              </span>
              <span className="pb-1">
                <span className="block type-label" style={{ color: WHITE_SUB }}>{step.day}</span>
                <span className="block type-body-strong" style={{ color: INK }}>{step.title}</span>
                <span className="block type-small" style={{ color: WHITE_DIM }}>{step.detail}</span>
              </span>
            </li>)}
          </ol>
        </Card>
      </section>}

      {progress && progress.length > 0 && <section className="space-y-3">
        <SectionTitle>Since last time</SectionTitle>
        <Card>
          {previousLabel && <p className="mb-2 text-xs" style={{ color: WHITE_SUB }}>Compared with {previousLabel}</p>}
          <ul className="divide-y" style={{ borderColor: BORDER }}>
            {progress.map((row) => {
              const Icon = row.change === "better" ? TrendingUp : row.change === "worse" ? TrendingDown : Minus;
              // Low skills are never red: a drop is shown in muted ink with its sign and an icon.
              const color = row.change === "better" ? GREEN : WHITE_DIM;
              const delta = Number(row.after) - Number(row.before);
              return <li key={row.skill} className="flex min-h-[44px] items-center justify-between gap-3 py-2 type-small">
                <span style={{ color: INK }}>{row.label}</span>
                <span className="inline-flex items-center gap-2 font-bold tabular-nums" style={{ color }}>
                  <span style={{ color: WHITE_DIM, fontWeight: 400 }}>{row.before} → {row.after}</span>
                  {Number.isFinite(delta) && <span className="w-7 text-right">{delta > 0 ? `+${delta}` : delta === 0 ? "0" : delta}</span>}
                  <Icon size={16} aria-label={row.change} />
                </span>
              </li>;
            })}
          </ul>
        </Card>
      </section>}

      </div>
      </div>

      <p className="type-small" style={{ color: WHITE_SUB }}>{report.limitation}</p>
      <button type="button" onClick={onEdit} className="min-h-[48px] w-full rounded-[var(--radius-md)] type-body-strong lg:w-auto lg:px-8" style={{ border: `1px solid ${BORDER}`, background: WHITE, color: INK }}>
        Edit my ratings
      </button>
    </div>
  );
}

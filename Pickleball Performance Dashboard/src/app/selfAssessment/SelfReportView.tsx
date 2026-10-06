import { useState } from "react";
import { ChevronDown, Dumbbell, Target, TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import type { SelfProgressRow, SelfReport } from "../../lib/coaching/selfAssessment";
import { BORDER, DISPLAY_FONT, GREEN, GREEN_BG, INK, OPTIC, ORANGE, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, RingTile, SectionTitle } from "../shell/primitives";
import mascotUrl from "../../assets/picklepro-logo@2x.webp";

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
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className="h-1.5 w-4 rounded-full" style={{ background: n <= value ? GREEN : "#e2e5ea" }} />)}
    </span>
  );
}

function FocusCard({ index, item }: { index: number; item: SelfReport["focus"][number] }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold"
          style={{ background: index === 0 ? OPTIC : GREEN_BG, color: index === 0 ? INK : GREEN, fontFamily: DISPLAY_FONT }}>{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold" style={{ color: INK }}>{item.title}</span>
          <span className="mt-1 block"><RatingDots value={item.rating} /></span>
        </span>
        <ChevronDown size={20} style={{ color: WHITE_SUB, transform: open ? "rotate(180deg)" : undefined }} aria-hidden="true" />
      </button>
      {open && <div className="space-y-3 border-t px-4 pb-4 pt-3 text-sm" style={{ borderColor: BORDER }}>
        <p style={{ color: INK }}>{item.observation}</p>
        <p style={{ color: WHITE_DIM }}>{item.why}</p>
        <div className="rounded-2xl p-3" style={{ background: GREEN_BG }}>
          <p className="flex items-center gap-1.5 font-bold" style={{ color: GREEN }}><Dumbbell size={15} /> Drill: {item.drill.name}</p>
          <p className="mt-1" style={{ color: INK }}>{item.drill.how}</p>
        </div>
        <p className="flex items-start gap-1.5 font-semibold" style={{ color: INK }}><Target size={15} className="mt-0.5 shrink-0" style={{ color: GREEN }} />{item.target}</p>
        <p className="text-xs" style={{ color: WHITE_SUB }}>Picked because {item.reasons.join(", ")}.</p>
      </div>}
    </Card>
  );
}

export function SelfReportView({ report, progress, previousLabel, onEdit }: {
  report: SelfReport; progress: SelfProgressRow[] | null; previousLabel?: string; onEdit: () => void;
}) {
  if (!report.available || report.overall == null) {
    return <Card><p className="text-sm" style={{ color: WHITE_DIM }}>{report.introduction}</p>
      <button type="button" onClick={onEdit} className="mt-3 text-sm font-bold underline" style={{ color: GREEN }}>Continue rating</button></Card>;
  }
  return (
    <div className="space-y-5">
      {report.focus[0] && (
        <section className="relative overflow-hidden rounded-lg p-4 pr-28" style={{ background: OPTIC, color: "#2b2100" }} aria-label="This week's drill">
          <img src={mascotUrl} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-3 right-1 h-28 w-auto -rotate-[8deg]" />
          <p className="text-[11px] font-extrabold uppercase tracking-wider">This week's drill</p>
          <p className="mt-1 text-xl font-black leading-tight">{report.focus[0].drill.name}</p>
          <p className="mt-1 text-sm">For your {report.focus[0].label.toLowerCase()} · 15 minutes, 3 times this week</p>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3">
        <RingTile label="Self rating" value={report.overall.toFixed(1)} fraction={(report.overall - 1) / 4} />
        <RingTile label="Level" value={report.level ?? "–"} fraction={(report.overall - 1) / 4} color={OPTIC} />
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
          {report.strengths.map((s) => <span key={s.skill} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold"
            style={{ background: WHITE, border: `1px solid ${BORDER}`, color: INK }} title={s.observation}>
            <Sparkles size={14} style={{ color: GREEN }} />{s.title} · {s.rating}/5</span>)}
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
                <span className="h-3 w-3 rounded-full" style={{ background: i === report.plan.length - 1 ? OPTIC : GREEN, border: `2px solid ${i === report.plan.length - 1 ? INK : GREEN}` }} />
                {i < report.plan.length - 1 && <span className="mt-1 w-0.5 flex-1" style={{ background: BORDER }} />}
              </span>
              <span className="-mt-1 pb-1">
                <span className="block text-xs font-bold uppercase tracking-wide" style={{ color: WHITE_SUB }}>{step.day}</span>
                <span className="block text-sm font-bold" style={{ color: INK }}>{step.title}</span>
                <span className="block text-sm" style={{ color: WHITE_DIM }}>{step.detail}</span>
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
      <button type="button" onClick={onEdit} className="w-full rounded-2xl py-3 text-sm font-bold lg:w-auto lg:px-8" style={{ border: `1px solid ${BORDER}`, background: WHITE, color: INK }}>
        Edit my ratings
      </button>
    </div>
  );
}

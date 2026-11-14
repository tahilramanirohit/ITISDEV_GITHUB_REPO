import { useEffect, useState } from "react";
import { Check, ChevronRight, ListChecks, Sparkles, Star, Video } from "lucide-react";
import { PICKLE_SIZES } from "../../lib/coaching/pickleGrowth";
import type { PickleJar, Quest } from "../../lib/coaching/brineJar";
import { mascot2xUrl, mascotUrl, numStyle, pressable } from "../shell/primitives";

// The level-up look: warm ball yellow with sun rays and dark ink.
const INK = "#1f1a05";
const SUB = "#5a4610";
const LINE = "#1b2a20";
const BRINE_TOP = "#bfe58a";
const BRINE_BOTTOM = "#8cc63f";
const SHRINK = "#ff8a65";

function message(jar: PickleJar, kindWord: string): string {
  const last = jar.last;
  if (!last) return `Rate your next ${kindWord} to start filling the jar.`;
  if (!jar.nextName && last.step !== "shrank") return `${jar.name}! Pickle is as big as it gets. Keep rating to stay on top.`;
  if (last.step === "jar") return `The jar filled up! Pickle grew into a ${jar.name}.`;
  if (last.step === "grew") return `Pickle grew! Your rating went up, ${last.from.toFixed(1)} → ${last.to.toFixed(1)}.`;
  if (last.step === "shrank") return `Pickle shrank a size (${last.from.toFixed(1)} → ${last.to.toFixed(1)}), but your brine is safe.`;
  return `Same size. Beat ${last.to.toFixed(1)} next ${kindWord}, or fill the jar.`;
}

const QUEST_ICON = { rate: Star, video: Video, plan: ListChecks } as const;

function questText(q: Quest, kind: string, planHref: string | null): { title: string; detail: string; href: string | null } {
  const kindWord = kind === "practice" ? "practice session" : kind;
  if (q.id === "rate") return { title: `Rate a ${kindWord}`, detail: q.done ? "Done this week" : "Takes a minute", href: q.done ? null : "#/new?mode=self" };
  if (q.id === "video") return { title: `Film a ${kindWord}`, detail: q.done ? "Done this week" : "Analyzed videos add the most", href: q.done ? null : "#/new?mode=video" };
  const p = q.progress ?? { now: 0, of: 3 };
  return { title: `Tick ${p.of} plan steps`, detail: q.done ? "Done this week" : `${p.now} of ${p.of} from your plan`, href: q.done ? null : planHref };
}

/**
 * Progress, gamified: Pickle lives in a brine jar. A better rating grows Pickle a size, and
 * this week's quests (rating, filming, plan steps) fill the jar; a full jar grows Pickle too.
 * Pickle and the brine animate from where they were on arrival.
 */
export function PickleGrowthCard({ jar, quests, kindWord, planHref }: {
  jar: PickleJar; quests: Quest[]; kindWord: string;
  /** Where "tick plan steps" goes: the latest rated session's plan. */
  planHref: string | null;
}) {
  const [shown, setShown] = useState({ scale: jar.previousScale, brine: jar.previousBrine });
  useEffect(() => {
    setShown({ scale: jar.previousScale, brine: jar.previousBrine });
    const t = window.setTimeout(() => setShown({ scale: jar.scale, brine: jar.brine }), 350);
    return () => window.clearTimeout(t);
  }, [jar.previousScale, jar.previousBrine, jar.scale, jar.brine]);

  const step = jar.last?.step;
  const badge = step === "grew" || step === "jar" ? "+1 size" : step === "shrank" ? "−1 size" : null;
  const done = quests.filter((q) => q.done).length;

  return (
    <section aria-label="Your pickle" className="relative overflow-hidden rounded-[22px] p-4"
      style={{ background: "radial-gradient(circle at 50% 22%, #ffe7a3, #ffcf4d 52%, #f3a712)", color: INK }}>
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[22%] h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: "repeating-conic-gradient(rgba(255,255,255,.28) 0 9deg, transparent 9deg 18deg)",
          WebkitMaskImage: "radial-gradient(circle, #000 10%, transparent 55%)", maskImage: "radial-gradient(circle, #000 10%, transparent 55%)",
        }} />

      <div className="relative flex items-end gap-3">
        <div role="img" aria-label={`Pickle is size ${jar.size} of ${PICKLE_SIZES.length}, ${jar.name}, in a jar ${jar.brine}% full of brine`}
          className="relative h-[184px] w-[132px] shrink-0">
          <span aria-hidden="true" className="absolute left-3 right-3 top-1.5 h-4 rounded-md" style={{ background: "#1f6b35", border: `3px solid ${LINE}` }} />
          <div aria-hidden="true" className="absolute inset-x-1 bottom-0 top-5 overflow-hidden rounded-[18px_18px_22px_22px]"
            style={{ border: `3px solid ${LINE}`, background: "rgba(255,255,255,.38)" }}>
            <span className="absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-out motion-reduce:transition-none"
              style={{ height: `${shown.brine}%`, background: `linear-gradient(${BRINE_TOP}, ${BRINE_BOTTOM})`, borderTop: shown.brine > 0 && shown.brine < 100 ? `3px solid ${LINE}` : undefined }} />
            <img src={mascotUrl} srcSet={`${mascotUrl} 1x, ${mascot2xUrl} 2x`} alt=""
              className="absolute bottom-1 left-1/2 h-[126px] w-auto max-w-none origin-bottom transition-transform duration-700 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(-50%) scale(${shown.scale})` }} />
            <span className="absolute left-2 top-3 h-16 w-2 rounded-full" style={{ background: "rgba(255,255,255,.55)" }} />
          </div>
          {badge && <span className="absolute -right-2 top-6 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-extrabold shadow-sm"
            style={step === "shrank" ? { background: SHRINK, color: "#2a0f05" } : { background: LINE, color: "#febc17" }}>
            {step !== "shrank" && <Sparkles size={12} aria-hidden="true" />}{badge}</span>}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: SUB }}>
            Size {jar.size} of {PICKLE_SIZES.length}</p>
          <p className="text-[22px] font-extrabold leading-tight">{jar.name}</p>
          <p className="mt-2 text-[40px] leading-none" style={numStyle}>{jar.brine}%</p>
          <p className="text-xs font-extrabold">brine in the jar</p>
          <p className="mt-1.5 text-xs font-semibold leading-snug" style={{ color: SUB }}>
            {jar.nextName ? <>Fill it and Pickle grows into a <b style={{ color: INK }}>{jar.nextName}</b></> : <>Pickle is fully grown. Keep it topped up!</>}
          </p>
        </div>
      </div>

      <p className="relative mt-3 rounded-[14px] px-3 py-2 text-sm font-semibold leading-snug" style={{ background: "rgba(255,255,255,.6)" }}>
        {message(jar, kindWord)}</p>

      <div className="relative mt-3 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em]">This week's quests</p>
        <p className="text-xs font-bold" style={{ color: SUB }}>{done} of {quests.length} · resets Mon</p>
      </div>
      <ul className="relative mt-1.5 space-y-1.5">
        {quests.map((q) => {
          const t = questText(q, kindWord, planHref);
          const Icon = q.done ? Check : QUEST_ICON[q.id];
          const body = <>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: q.done ? "#1f6b35" : LINE, color: q.done ? "#fff" : "#febc17" }}>
              <Icon size={18} strokeWidth={2.6} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-extrabold leading-tight ${q.done ? "line-through opacity-70" : ""}`}>{t.title}</span>
              <span className="block text-xs font-semibold" style={{ color: SUB }}>{t.detail}</span>
              {q.progress && !q.done && <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,.12)" }}>
                <span className="block h-full rounded-full" style={{ width: `${(q.progress.now / q.progress.of) * 100}%`, background: "#1f6b35" }} /></span>}
            </span>
            <span className="shrink-0 text-base" style={numStyle}>+{q.brine}%</span>
            {t.href && <ChevronRight size={18} aria-hidden="true" className="-mr-1 shrink-0" />}
          </>;
          const cls = "flex min-h-[52px] items-center gap-2.5 rounded-[16px] px-2.5 py-2";
          const style = { background: q.done ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.62)" };
          return <li key={q.id}>{t.href
            ? <a href={t.href} className={`${cls} ${pressable}`} style={style} aria-label={`${t.title}, adds ${q.brine}% brine`}>{body}</a>
            : <div className={cls} style={style}>{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}

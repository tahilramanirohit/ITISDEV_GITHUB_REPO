import type { ReactNode } from "react";
import { ACTION, INK, INK_2, SURFACE_2 } from "../theme";

/** A small pickleball that rides along the bar. */
function Ball({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" fill="#f6d33c" stroke="#c9a400" strokeWidth="1.2" />
      {[[12, 5], [6.5, 9], [17.5, 9], [8, 16], [16, 16], [12, 12.5]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#c9a400" />)}
    </svg>
  );
}

/**
 * Checklist progress (professor's notes, 22 Nov: "checklist progress bar"): a title, "2 of 3 done"
 * and a bar along a dashed court line. The large size carries a pickleball at the end of the
 * filled part. Used for a game's steps, the ratings, the practice plan and the weekly quests.
 */
export function ChecklistBar({ label, done, total, count, size = "sm", bare = false, fill = ACTION, track = SURFACE_2, textColor = INK_2, children }: {
  /** Colours for cards that are yellow themselves. */
  fill?: string; track?: string; textColor?: string;
  label: string; done: number; total: number;
  /** Under an existing heading: no title row; the bar and the count share one line (the label is for screen readers). */
  bare?: boolean;
  /** Replaces "2 of 3 done", e.g. "4 of 10 rated". */
  count?: string;
  size?: "sm" | "lg";
  /** Shown under the bar (steps, next action). */
  children?: ReactNode;
}) {
  const safeTotal = Math.max(1, total);
  const fraction = Math.min(1, Math.max(0, done / safeTotal));
  const pct = Math.round(fraction * 100);
  const text = count ?? `${done} of ${total} done`;
  const big = size === "lg";
  const bar = <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total}
    aria-valuenow={done} aria-valuetext={text}
    className={`relative ${big ? "mt-2.5 h-3.5" : bare ? "h-2 min-w-0 flex-1" : "mt-1.5 h-2"} rounded-full`} style={{ background: track }}>
    <span aria-hidden="true" className="absolute inset-x-2 top-1/2 border-t-2 border-dashed" style={{ borderColor: "color-mix(in srgb, var(--pp-ink) 16%, transparent)" }} />
    <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 motion-reduce:transition-none"
      style={{ width: `${pct}%`, background: fill }} />
    {big && <span aria-hidden="true" className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 leading-none transition-[left] duration-300 motion-reduce:transition-none"
      style={{ left: `${Math.min(97, Math.max(3, pct))}%` }}><Ball size={24} /></span>}
  </div>;
  if (bare) return <div className="flex items-center gap-3">{bar}
    <span aria-hidden="true" className="shrink-0 text-xs font-bold tabular-nums" style={{ color: textColor }}>{text}</span>{children}</div>;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={big ? "text-base font-extrabold" : "text-sm font-bold"} style={{ color: INK }}>{label}</span>
        <span aria-hidden="true" className="shrink-0 text-xs font-bold tabular-nums" style={{ color: textColor }}>{text}</span>
      </div>
      {bar}
      {children}
    </div>
  );
}

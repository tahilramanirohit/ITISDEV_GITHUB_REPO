import { useId } from "react";
import type { HeatmapValue } from "../../lib/analysis/contract";
import { COURT_LENGTH_M as L, COURT_WIDTH_M as W, KITCHEN_M, NET_M } from "../../lib/coaching/lastGameReview";

/** Metres from the net beyond which a spot counts as "the back" (the zone-time baseline zone). */
const BACK_FROM_NET_M = 5.2;
const PAD = 0.7;
const TOP = 1.0;

/**
 * The court seen from straight above, lying sideways, with the player's side on the left.
 * Each heatmap cell glows in proportion to the time spent there: yellow in the kitchen and
 * mid-court, orange at the back.
 */
export function TopCourtHeatmap({ value, nearSide, label }: { value: HeatmapValue; nearSide: boolean; label: string }) {
  const id = useId().replace(/:/g, "");
  const across = (y: number) => (nearSide ? y : L - y); // court length -> left to right
  const max = Math.max(1e-9, ...value.dwell_seconds.flat());
  const cells: { x: number; y: number; w: number; h: number; o: number; back: boolean }[] = [];
  let total = 0, cx = 0, cy = 0;
  value.dwell_seconds.forEach((row, ri) => row.forEach((sec, ci) => {
    if (sec <= 0) return;
    const y0 = value.y_edges_m[ri], y1 = value.y_edges_m[ri + 1];
    const x0 = value.x_edges_m[ci], x1 = value.x_edges_m[ci + 1];
    const a = across(y0), b = across(y1);
    const mid = (y0 + y1) / 2;
    // A gentle curve keeps lightly-visited spots visible next to the busiest one.
    cells.push({ x: Math.min(a, b), y: x0, w: Math.abs(b - a), h: x1 - x0, o: Math.min(1, 0.25 + 0.85 * Math.pow(sec / max, 0.6)), back: Math.abs(mid - NET_M) > BACK_FROM_NET_M });
    total += sec; cx += sec * across(mid); cy += sec * (x0 + x1) / 2;
  }));
  const k1 = NET_M - KITCHEN_M, k2 = NET_M + KITCHEN_M;
  const text = { fill: "#eaeee7", fontSize: 0.36, fontWeight: 700, fontFamily: "Inter, system-ui, sans-serif" } as const;
  return (
    <svg viewBox={`${-PAD} ${-TOP} ${L + 2 * PAD} ${W + TOP + PAD}`} role="img" aria-label={label} className="block h-auto w-full">
      <defs>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.22" /></filter>
        <clipPath id={`${id}-court`}><rect x={-0.4} y={-0.4} width={L + 0.8} height={W + 0.8} /></clipPath>
      </defs>
      <rect x={-PAD} y={-TOP} width={L + 2 * PAD} height={W + TOP + PAD} fill="var(--pp-court-green)" />
      <rect x={0} y={0} width={L} height={W} fill="var(--pp-court-blue)" />
      <rect x={k1} y={0} width={k2 - k1} height={W} fill="color-mix(in srgb, var(--pp-court-blue) 86%, white)" />
      <g filter={`url(#${id}-soft)`} clipPath={`url(#${id}-court)`}>
        {cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} fill={c.back ? "#ff8a65" : "#febc17"} fillOpacity={c.o} />)}
      </g>
      <g fill="none" stroke="#eaeee7" strokeWidth={0.06}>
        <rect x={0} y={0} width={L} height={W} />
        <path d={`M${k1} 0 V${W} M${k2} 0 V${W} M0 ${W / 2} H${k1} M${k2} ${W / 2} H${L}`} />
      </g>
      <line x1={NET_M} x2={NET_M} y1={-0.35} y2={W + 0.35} stroke="#0e1a13" strokeWidth={0.14} />
      {total > 0 && <circle cx={cx / total} cy={cy / total} r={0.2} fill="#febc17" stroke="#0e1a13" strokeWidth={0.08} />}
      <text x={0.1} y={-0.35} {...text}>YOUR SIDE</text>
      <text x={L - 0.1} y={-0.35} textAnchor="end" {...text}>OPPONENTS</text>
      <text x={(k1 + NET_M) / 2} y={W - 0.25} textAnchor="middle" {...text} fontSize={0.28} opacity={0.8}>KITCHEN</text>
      <text x={(k2 + NET_M) / 2} y={W - 0.25} textAnchor="middle" {...text} fontSize={0.28} opacity={0.8}>KITCHEN</text>
    </svg>
  );
}

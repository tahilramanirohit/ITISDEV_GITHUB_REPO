import { useId, useMemo, useState } from "react";
import type { AnalysisResultV1 } from "../../lib/analysis/contract";
import { HEAT_CELL_M, HEAT_COLS, HEAT_ROWS, HEAT_X0, HEAT_Y0, HEAT_ZONE_WORDS, mainZone, type PlayerHeat } from "../../lib/analysis/playerHeat";
import { playerName } from "../../lib/analysis/shotLabels";
import { COURT_LENGTH_M as L, COURT_WIDTH_M as W, KITCHEN_M, NET_M } from "../../lib/coaching/lastGameReview";
import { INK, INK_2, INK_3 } from "../theme";
import { Chip, cardStyle } from "../shell/primitives";

const COURT_BLUE = "#2f5d8a";
const SURROUND = "#2e6b45";
/** One colour per player: near team warm, far team cool, so teams read at a glance. */
const NEAR_COLORS = ["#ffd23f", "#ff7a45"];
const FAR_COLORS = ["#5ad1ff", "#c28bff"];

/** Metres → SVG units (decimetres), with the near baseline at the bottom. */
const X1 = HEAT_X0 + HEAT_COLS * HEAT_CELL_M, Y1 = HEAT_Y0 + HEAT_ROWS * HEAT_CELL_M;
const sx = (x: number) => (x - HEAT_X0) * 10;
const sy = (y: number) => (Y1 - y) * 10;

/**
 * Every player on one top-view court (team request, 22 Nov): each player's time in their own
 * colour, brighter where they stayed longer. Tap a name to show one player at a time.
 */
export function PlayersCourtMap({ result, heat, myPlayerId, names }: {
  result: AnalysisResultV1; heat: PlayerHeat[]; myPlayerId?: number | null; names: Record<number, string>;
}) {
  const [only, setOnly] = useState<number | null>(null);
  const blur = useId().replace(/:/g, "");
  const colored = useMemo(() => {
    let n = 0, f = 0;
    return heat.map((h) => ({ ...h, color: h.side === "far" ? FAR_COLORS[f++ % 2] : NEAR_COLORS[n++ % 2],
      name: names[h.playerId] ?? playerName(result, h.playerId, myPlayerId), main: mainZone(h) }));
  }, [heat, names, result, myPlayerId]);
  const shown = only == null ? colored : colored.filter((h) => h.playerId === only);
  const busiest = Math.max(...shown.flatMap((h) => h.seconds.flat()), 0.001);
  const w = (X1 - HEAT_X0) * 10, hgt = (Y1 - HEAT_Y0) * 10;
  const line = { stroke: "#ffffff", strokeWidth: 0.9, opacity: 0.9 };

  return <section aria-label="Where each player stood on court" className="rounded-[18px] p-4" style={cardStyle}>
    <h3 className="text-base font-extrabold" style={{ color: INK }}>Where everyone played</h3>
    <p className="text-sm" style={{ color: INK_2 }}>Seen from above. Brighter = stayed longer.</p>
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show players">
      <Chip selected={only == null} onClick={() => setOnly(null)}>Everyone</Chip>
      {colored.map((h) => <Chip key={h.playerId} selected={only === h.playerId} onClick={() => setOnly(only === h.playerId ? null : h.playerId)}>
        <i aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ background: h.color }} />{h.name}</Chip>)}
    </div>
    <svg viewBox={`0 0 ${w} ${hgt}`} className="mx-auto mt-3 block h-auto w-full max-w-[340px] rounded-[14px]" role="img"
      aria-label={`Top view of the court. ${shown.map((h) => `${h.name}: ${where(h.main)}`).join(". ")}.`}>
      <defs><filter id={blur} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" /></filter></defs>
      <rect x={0} y={0} width={w} height={hgt} fill={SURROUND} />
      <rect x={sx(0)} y={sy(L)} width={W * 10} height={L * 10} fill={COURT_BLUE} />
      {/* Kitchens, a little lighter */}
      <rect x={sx(0)} y={sy(NET_M + KITCHEN_M)} width={W * 10} height={KITCHEN_M * 20} fill="#ffffff" opacity={0.07} />
      <g filter={`url(#${blur})`}>
        {shown.map((h) => h.seconds.map((row, ri) => row.map((s, ci) => s > 0 && <rect key={`${h.playerId}-${ri}-${ci}`}
          x={sx(HEAT_X0 + ci * HEAT_CELL_M) - 1} y={sy(HEAT_Y0 + (ri + 1) * HEAT_CELL_M) - 1} width={HEAT_CELL_M * 10 + 2} height={HEAT_CELL_M * 10 + 2}
          fill={h.color} opacity={Math.min(0.95, 0.25 + 0.75 * Math.sqrt(s / busiest))} />)))}
      </g>
      {/* Court lines */}
      <rect x={sx(0)} y={sy(L)} width={W * 10} height={L * 10} fill="none" {...line} />
      <line x1={sx(0)} x2={sx(W)} y1={sy(NET_M - KITCHEN_M)} y2={sy(NET_M - KITCHEN_M)} {...line} />
      <line x1={sx(0)} x2={sx(W)} y1={sy(NET_M + KITCHEN_M)} y2={sy(NET_M + KITCHEN_M)} {...line} />
      <line x1={sx(W / 2)} x2={sx(W / 2)} y1={sy(0)} y2={sy(NET_M - KITCHEN_M)} {...line} />
      <line x1={sx(W / 2)} x2={sx(W / 2)} y1={sy(NET_M + KITCHEN_M)} y2={sy(L)} {...line} />
      <line x1={sx(-0.3)} x2={sx(W + 0.3)} y1={sy(NET_M)} y2={sy(NET_M)} stroke="#0d1a12" strokeWidth={2.2} />
      <text x={sx(W + 0.35)} y={sy(NET_M) + 1.5} fill="#ffffff" fontSize={4.2} fontWeight={700}>NET</text>
      <text x={w / 2} y={hgt - 4} textAnchor="middle" fill="#ffffff" opacity={0.8} fontSize={4.6}>near side (camera)</text>
      <text x={w / 2} y={8} textAnchor="middle" fill="#ffffff" opacity={0.8} fontSize={4.6}>far side</text>
      {/* Each player's busiest spot */}
      {shown.map((h) => h.hotSpot && <g key={`spot-${h.playerId}`}>
        <circle cx={sx(h.hotSpot[0])} cy={sy(h.hotSpot[1])} r={4.2} fill={h.color} stroke="#0d1a12" strokeWidth={1.4} />
      </g>)}
    </svg>
    <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
      {shown.map((h) => <li key={h.playerId} className="flex items-center gap-2" style={{ color: INK_2 }}>
        <i aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: h.color, boxShadow: "0 0 0 1.5px #0d1a12" }} />
        <span><b style={{ color: INK }}>{h.name}</b> · {where(h.main)}</span>
      </li>)}
    </ul>
    <p className="mt-2 text-xs" style={{ color: INK_3 }}>Dots mark each player's busiest spot. Estimated from the video.</p>
  </section>;
}

/** "62% in no-man's land" for the legend. */
function where(main: ReturnType<typeof mainZone>): string {
  return main ? `${Math.round(main.share * 100)}% ${HEAT_ZONE_WORDS[main.zone]}` : "not mapped";
}

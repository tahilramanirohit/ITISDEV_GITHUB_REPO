import { useEffect, useId, useMemo, useState } from "react";
import type { AnalysisResultV1 } from "../../lib/analysis/contract";
import {
  HEAT_CELL_M, HEAT_COLS, HEAT_ROWS, HEAT_X0, HEAT_Y0, HEAT_ZONE_WORDS, mainZone, positionAt, type PlayerHeat, type TrackPoint,
} from "../../lib/analysis/playerHeat";
import { courtPlayers, playerName } from "../../lib/analysis/shotLabels";
import { COURT_LENGTH_M as L, COURT_WIDTH_M as W, KITCHEN_M, NET_M } from "../../lib/coaching/lastGameReview";
import { INK, INK_2, INK_3 } from "../theme";
import { Chip, cardStyle } from "../shell/primitives";

const COURT_BLUE = "#2f5d8a";
const SURROUND = "#2e6b45";
/** One colour per player: near team warm, far team cool, so teams read at a glance. */
const NEAR_COLORS = ["#ffd23f", "#ff7a45"];
const FAR_COLORS = ["#5ad1ff", "#c28bff"];
const TRAIL_S = 1.5;

/** The same colour for a player on every court drawing. */
export function playerColors(result: AnalysisResultV1): Record<number, string> {
  const out: Record<number, string> = {};
  let n = 0, f = 0;
  for (const p of [...courtPlayers(result)].sort((a, b) => a.player_id - b.player_id)) {
    out[p.player_id] = p.side === "far" ? FAR_COLORS[f++ % 2] : NEAR_COLORS[n++ % 2];
  }
  return out;
}

/** The video's current time, smooth while it plays (one update per frame), and on pause or seek. */
export function useVideoTime(video: HTMLVideoElement | null | undefined): number {
  const [t, setT] = useState(() => video?.currentTime ?? 0);
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const read = () => setT(video.currentTime);
    const loop = () => { read(); raf = requestAnimationFrame(loop); };
    const play = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); read(); };
    read();
    if (!video.paused) play();
    video.addEventListener("play", play);
    video.addEventListener("pause", stop);
    video.addEventListener("seeked", read);
    video.addEventListener("timeupdate", read);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("play", play);
      video.removeEventListener("pause", stop);
      video.removeEventListener("seeked", read);
      video.removeEventListener("timeupdate", read);
    };
  }, [video]);
  return t;
}

const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

/** Court lines in metres (y from the near baseline). Drawn inside a group already scaled to metres. */
function CourtLines({ stroke = 0.09 }: { stroke?: number }) {
  const line = { stroke: "#ffffff", strokeWidth: stroke, opacity: 0.9 };
  return <>
    <rect x={0} y={0} width={W} height={L} fill="none" {...line} />
    <line x1={0} x2={W} y1={NET_M - KITCHEN_M} y2={NET_M - KITCHEN_M} {...line} />
    <line x1={0} x2={W} y1={NET_M + KITCHEN_M} y2={NET_M + KITCHEN_M} {...line} />
    <line x1={W / 2} x2={W / 2} y1={0} y2={NET_M - KITCHEN_M} {...line} />
    <line x1={W / 2} x2={W / 2} y1={NET_M + KITCHEN_M} y2={L} {...line} />
    <line x1={-0.3} x2={W + 0.3} y1={NET_M} y2={NET_M} stroke="#0d1a12" strokeWidth={stroke * 2.4} />
  </>;
}

/** Moving dots with a short trail, at time t, in court metres. */
function LiveDots({ tracks, ids, t, colors, names, r, upright }: {
  tracks: Map<number, TrackPoint[]>; ids: number[]; t: number; colors: Record<number, string>; names: Record<number, string>; r: number;
  /** Undoes the drawing's own turn or flip for the letter at (x, y), so initials read upright. */
  upright: (x: number, y: number) => string;
}) {
  return <>{ids.map((id) => {
    const track = tracks.get(id) ?? [];
    const now = positionAt(track, t);
    if (!now) return null;
    const trail = track.filter((p) => p.t >= t - TRAIL_S && p.t <= t).map((p) => `${p.x},${p.y}`).concat(`${now.x},${now.y}`);
    return <g key={id}>
      {trail.length > 1 && <polyline points={trail.join(" ")} fill="none" stroke={colors[id]} strokeWidth={r * 0.55} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />}
      <circle cx={now.x} cy={now.y} r={r} fill={colors[id]} stroke="#0d1a12" strokeWidth={r * 0.28} />
      <text x={now.x} y={now.y} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.15} fontWeight={800} fill="#0d1a12"
        transform={upright(now.x, now.y)}>{initial(names[id] ?? "?")}</text>
    </g>;
  })}</>;
}

/**
 * A small top-view court under the video (team request, 22 Nov, option A): every player as a
 * dot that moves with the video, near side on the left, net in the middle.
 */
export function LiveCourtStrip({ result, tracks, video, names, myPlayerId }: {
  result: AnalysisResultV1; tracks: Map<number, TrackPoint[]>; video: HTMLVideoElement | null; names: Record<number, string>; myPlayerId?: number | null;
}) {
  const t = useVideoTime(video);
  const colors = useMemo(() => playerColors(result), [result]);
  const ids = [...tracks.keys()].filter((id) => colors[id]);
  const label = (id: number) => names[id] ?? playerName(result, id, myPlayerId);
  const nameMap = Object.fromEntries(ids.map((id) => [id, label(id)]));
  const visible = ids.filter((id) => positionAt(tracks.get(id)!, t));
  // Turned sideways: court length runs left to right. viewBox in metres around the court.
  const pad = 1.4;
  return <figure className="m-0">
    <svg viewBox={`${-pad} ${-pad} ${L + pad * 2} ${W + pad * 2}`} className="block h-auto w-full rounded-[12px]" role="img"
      aria-label={`Court view at ${t.toFixed(1)} s: ${visible.length ? visible.map(label).join(", ") : "no players mapped right now"}`}>
      <rect x={-pad} y={-pad} width={L + pad * 2} height={W + pad * 2} fill={SURROUND} />
      {/* (x, y) on court → (y, W - x) here: near baseline on the left, the near player's right at the top. */}
      <g transform={`matrix(0 -1 1 0 0 ${W})`}>
        <rect x={0} y={0} width={W} height={L} fill={COURT_BLUE} />
        <rect x={0} y={NET_M - KITCHEN_M} width={W} height={KITCHEN_M * 2} fill="#ffffff" opacity={0.07} />
        <CourtLines stroke={0.07} />
        <LiveDots tracks={tracks} ids={ids} t={t} colors={colors} names={nameMap} r={0.42} upright={(x, y) => `rotate(90 ${x} ${y})`} />
      </g>
    </svg>
    <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: INK_2 }}>
      {ids.map((id) => <span key={id} className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors[id] }} />{label(id)}</span>)}
      <span style={{ color: INK_3 }}>· near side on the left</span>
    </figcaption>
  </figure>;
}

/** Metres → SVG units (decimetres), with the near baseline at the bottom. */
const X1 = HEAT_X0 + HEAT_COLS * HEAT_CELL_M, Y1 = HEAT_Y0 + HEAT_ROWS * HEAT_CELL_M;
const sx = (x: number) => (x - HEAT_X0) * 10;
const sy = (y: number) => (Y1 - y) * 10;

/**
 * Every player on one top-view court (team request, 22 Nov): each player's time in their own
 * colour, brighter where they stayed longer, and dots that move with the video.
 * Tap a name to show one player at a time.
 */
export function PlayersCourtMap({ result, heat, tracks, video, myPlayerId, names }: {
  result: AnalysisResultV1; heat: PlayerHeat[]; tracks?: Map<number, TrackPoint[]>; video?: HTMLVideoElement | null;
  myPlayerId?: number | null; names: Record<number, string>;
}) {
  const [only, setOnly] = useState<number | null>(null);
  const t = useVideoTime(video);
  const blur = useId().replace(/:/g, "");
  const colors = useMemo(() => playerColors(result), [result]);
  const colored = useMemo(() => heat.map((h) => ({ ...h, color: colors[h.playerId] ?? NEAR_COLORS[0],
    name: names[h.playerId] ?? playerName(result, h.playerId, myPlayerId), main: mainZone(h) })), [heat, colors, names, result, myPlayerId]);
  const shown = only == null ? colored : colored.filter((h) => h.playerId === only);
  const busiest = Math.max(...shown.flatMap((h) => h.seconds.flat()), 0.001);
  const w = (X1 - HEAT_X0) * 10, hgt = (Y1 - HEAT_Y0) * 10;
  const nameMap = Object.fromEntries(colored.map((h) => [h.playerId, h.name]));

  return <section aria-label="Where each player stood on court" className="rounded-[18px] p-4" style={cardStyle}>
    <h3 className="text-base font-extrabold" style={{ color: INK }}>Where everyone played</h3>
    <p className="text-sm" style={{ color: INK_2 }}>Seen from above. Brighter = stayed longer{tracks ? "; the dots move with the video" : ""}.</p>
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
      <rect x={sx(0)} y={sy(NET_M + KITCHEN_M)} width={W * 10} height={KITCHEN_M * 20} fill="#ffffff" opacity={0.07} />
      <g filter={`url(#${blur})`}>
        {shown.map((h) => h.seconds.map((row, ri) => row.map((s, ci) => s > 0 && <rect key={`${h.playerId}-${ri}-${ci}`}
          x={sx(HEAT_X0 + ci * HEAT_CELL_M) - 1} y={sy(HEAT_Y0 + (ri + 1) * HEAT_CELL_M) - 1} width={HEAT_CELL_M * 10 + 2} height={HEAT_CELL_M * 10 + 2}
          fill={h.color} opacity={Math.min(0.95, 0.25 + 0.75 * Math.sqrt(s / busiest))} />)))}
      </g>
      {/* Court and dots in metres: flip y so the near baseline is at the bottom. */}
      <g transform={`matrix(10 0 0 -10 ${sx(0)} ${sy(0)})`}>
        <CourtLines />
        {shown.map((h) => h.hotSpot && <circle key={`spot-${h.playerId}`} cx={h.hotSpot[0]} cy={h.hotSpot[1]} r={0.34} fill="none" stroke={h.color} strokeWidth={0.12} />)}
        {tracks && <LiveDots tracks={tracks} ids={shown.map((h) => h.playerId)} t={t} colors={colors} names={nameMap} r={0.45}
          upright={(_x, y) => `matrix(1 0 0 -1 0 ${2 * y})`} />}
      </g>
      <text x={sx(W + 0.35)} y={sy(NET_M) + 1.5} fill="#ffffff" fontSize={4.2} fontWeight={700}>NET</text>
      <text x={w / 2} y={hgt - 4} textAnchor="middle" fill="#ffffff" opacity={0.8} fontSize={4.6}>near side (camera)</text>
      <text x={w / 2} y={8} textAnchor="middle" fill="#ffffff" opacity={0.8} fontSize={4.6}>far side</text>
    </svg>
    <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
      {shown.map((h) => <li key={h.playerId} className="flex items-center gap-2" style={{ color: INK_2 }}>
        <i aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: h.color, boxShadow: "0 0 0 1.5px #0d1a12" }} />
        <span><b style={{ color: INK }}>{h.name}</b> · {where(h.main)}</span>
      </li>)}
    </ul>
    <p className="mt-2 text-xs" style={{ color: INK_3 }}>Rings mark each player's busiest spot. Estimated from the video.</p>
  </section>;
}

/** "62% in no-man's land" for the legend. */
function where(main: ReturnType<typeof mainZone>): string {
  return main ? `${Math.round(main.share * 100)}% ${HEAT_ZONE_WORDS[main.zone]}` : "not mapped";
}

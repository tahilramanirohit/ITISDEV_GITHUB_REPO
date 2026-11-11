import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { COURT_WIDTH_M as W, NET_M } from "../../lib/coaching/lastGameReview";
import { BASELINE_BAND_M, KITCHEN_LINE_M, toOwnView, zoneTip, type CourtMap, type CourtZone } from "../../lib/analysis/courtMap";
import { ACCENT_INK, ACTION, ACTION_SOFT, CHECK, INK, INK_2, INK_3, LINE, ON_ACTION, SURFACE, SURFACE_2 } from "../theme";
import { cardStyle, numStyle } from "../shell/primitives";

// The court and heat colors stay the same in light and dark, like the court on Home.
const COURT_BLUE = "#2f5d8a";
const COURT_GREEN = "#3f7a4a";
const COURT_LINE = "#eaeee7";
const NET = "#0e1a13";
const HIGHLIGHT = "#febc17";
/** Blue (passed through) to red (stayed), as in TV heatmaps. */
const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [43, 108, 255]], [0.3, [34, 211, 197]], [0.5, [126, 224, 74]], [0.72, [255, 210, 63]], [1, [255, 90, 42]],
];
const HEAT_GRADIENT = "linear-gradient(90deg,#2b6cff,#22d3c5,#7ee04a,#ffd23f,#ff5a2a)";

// Drawing area, in metres of the player's own half: a little run-off around it.
const X_MIN = -0.6, X_MAX = W + 0.6, Y_MIN = -1.3, Y_MAX = NET_M + 0.7;
const PX = 64; // canvas pixels per metre
const HEAT_PX = 16; // the heat is computed coarse, then smoothed and scaled up
/** Heat fainter than this fades out, so brief visits don't tint the whole court. */
const FADE_FROM = 0.2, FADE_OVER = 0.25;

const ZONES: { key: CourtZone; label: string; from: number; to: number }[] = [
  { key: "kitchen", label: "Kitchen", from: KITCHEN_LINE_M, to: NET_M },
  { key: "transition", label: "No-man's land", from: BASELINE_BAND_M, to: KITCHEN_LINE_M },
  { key: "baseline", label: "Baseline", from: Y_MIN, to: BASELINE_BAND_M },
];

function heatColor(t: number): [number, number, number] {
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [b, cb] = HEAT_STOPS[i];
    if (t <= b) {
      const [a, ca] = HEAT_STOPS[i - 1];
      const f = (t - a) / (b - a);
      return [0, 1, 2].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * f)) as [number, number, number];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

/** The glow as a small image of the player's own half: bilinear over the grid, blurred, coloured. */
function heatImage(map: CourtMap): HTMLCanvasElement | null {
  const { heatmap, nearSide } = map;
  const w = Math.round((X_MAX - X_MIN) * HEAT_PX), h = Math.round((Y_MAX - Y_MIN) * HEAT_PX);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cell = heatmap.cell_size_m, x0 = heatmap.x_edges_m[0], y0 = heatmap.y_edges_m[0];
  const grid = heatmap.dwell_seconds;
  const at = (r: number, c: number) => grid[r]?.[c] ?? 0;
  const sample = (gx: number, gy: number) => {
    const c = (gx - x0) / cell - 0.5, r = (gy - y0) / cell - 0.5;
    const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
    return at(r0, c0) * (1 - fc) * (1 - fr) + at(r0, c0 + 1) * fc * (1 - fr) + at(r0 + 1, c0) * (1 - fc) * fr + at(r0 + 1, c0 + 1) * fc * fr;
  };
  let field = new Float32Array(w * h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    // Own view back to grid coordinates (the mirror is its own inverse).
    const g = toOwnView(X_MIN + (px + 0.5) / HEAT_PX, Y_MAX - (py + 0.5) / HEAT_PX, nearSide);
    field[py * w + px] = sample(g.x, g.y);
  }
  for (let pass = 0; pass < 3; pass++) { // soft edges without canvas filters (not in every browser)
    const next = new Float32Array(w * h);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) { sum += field[y * w + x]; n++; }
      }
      next[py * w + px] = sum / n;
    }
    field = next;
  }
  let max = 0;
  for (const v of field) max = Math.max(max, v);
  if (max <= 0) return null;
  const img = ctx.createImageData(w, h);
  field.forEach((v, i) => {
    const t = Math.pow(v / max, 0.55);
    const fade = Math.min(1, (t - FADE_FROM) / FADE_OVER);
    if (fade <= 0) return;
    const [r, g, b] = heatColor(Math.min(1, t));
    img.data.set([r, g, b, Math.round(fade * fade * (3 - 2 * fade) * (140 + 95 * t))], i * 4);
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function CourtCanvas({ map, zone, onPickZone, label }: { map: CourtMap; zone: CourtZone; onPickZone: (z: CourtZone) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const heat = useMemo(() => (typeof document === "undefined" ? null : heatImage(map)), [map]);
  const width = Math.round((X_MAX - X_MIN) * PX), height = Math.round((Y_MAX - Y_MIN) * PX);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const P = (x: number, y: number): [number, number] => [(x - X_MIN) * PX, (Y_MAX - y) * PX];
    const line = (x1: number, y1: number, x2: number, y2: number, lw: number, color: string) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      ctx.moveTo(...P(x1, y1)); ctx.lineTo(...P(x2, y2)); ctx.stroke();
    };
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COURT_GREEN; ctx.fillRect(0, 0, width, height);
    const [cx, cy] = P(0, NET_M);
    ctx.fillStyle = COURT_BLUE; ctx.fillRect(cx, cy, W * PX, NET_M * PX);
    // The chosen zone, lightly lit.
    const z = ZONES.find((item) => item.key === zone)!;
    const top = P(0, z.to)[1], bottom = P(0, Math.max(0, z.from))[1];
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(cx, top, W * PX, bottom - top);
    if (heat) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(heat, 0, 0, width, height); }
    ctx.strokeStyle = COURT_LINE; ctx.lineWidth = 4; ctx.strokeRect(cx, cy, W * PX, NET_M * PX);
    line(W / 2, 0, W / 2, KITCHEN_LINE_M, 4, COURT_LINE);
    line(0, KITCHEN_LINE_M, W, KITCHEN_LINE_M, 6, "#ffffff");
    line(-0.45, NET_M, W + 0.45, NET_M, 11, NET);
    ctx.setLineDash([14, 10]); ctx.strokeStyle = HIGHLIGHT; ctx.lineWidth = 4;
    ctx.strokeRect(cx + 4, top + 4, W * PX - 8, bottom - top - 8); ctx.setLineDash([]);
    // Home base: the busiest square.
    const [hx, hy] = P(map.hotSpot.x, map.hotSpot.y);
    ctx.beginPath(); ctx.arc(hx, hy, 19, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.font = "800 24px Inter, system-ui, sans-serif";
    const text = "Home base", tw = ctx.measureText(text).width + 30;
    const lx = Math.min(Math.max(6, hx + 24), width - tw - 6), ly = Math.max(6, hy - 50);
    ctx.fillStyle = "rgba(14,26,19,0.88)"; ctx.beginPath(); ctx.roundRect?.(lx, ly, tw, 40, 20); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "left"; ctx.fillText(text, lx + 15, ly + 28);
    ctx.font = "800 19px Inter, system-ui, sans-serif"; ctx.fillStyle = COURT_LINE; ctx.textAlign = "center";
    const [nx, ny] = P(W / 2, NET_M + 0.38); ctx.fillText("NET", nx, ny + 7);
  }, [map, zone, heat, width, height]);

  return <canvas ref={ref} width={width} height={height} role="img" aria-label={label}
    className="block h-auto w-full cursor-pointer rounded-[16px]"
    onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const y = Y_MAX - ((e.clientY - r.top) / r.height) * (Y_MAX - Y_MIN);
      onPickZone(y >= KITCHEN_LINE_M ? "kitchen" : y >= BASELINE_BAND_M ? "transition" : "baseline");
    }} />;
}

const pct = (f: number) => `${Math.round(f * 100)}%`;

function Bar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full" style={{ background: LINE }}>
      <div className="h-full rounded-full" style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`, background: color }} />
    </div>
  );
}

export type PositioningGoal = { active: boolean; onAdd: () => Promise<void> };

/**
 * Where the analysed player moved, from above, with a light game layer: a level from time at
 * the kitchen, badges and one challenge for the next game. `name` is set when the map belongs
 * to someone other than the viewer (a shared report, or a different player picked).
 */
export function CourtMapPanel({ map, name, previous, goal, playful = true }: {
  map: CourtMap; name?: string; previous?: CourtMap | null; goal?: PositioningGoal; playful?: boolean;
}) {
  const [zone, setZone] = useState<CourtZone>(() =>
    (["kitchen", "transition", "baseline"] as CourtZone[]).reduce((a, b) => (map.share[b] > map.share[a] ? b : a)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const game = playful && map.graded;
  const next = map.nextLevel;
  const toNext = next ? Math.max(1, Math.round((next.minKitchen - map.share.kitchen) * 100)) : 0;
  const levelFraction = next ? (map.share.kitchen - map.level.minKitchen) / (next.minKitchen - map.level.minKitchen) : 1;
  const challenge = game ? map.challenge : null;
  const prevNow = challenge && previous?.graded ? (challenge.lowerIsBetter ? previous.share.transition : previous.share.kitchen) : null;
  const label = `${name ?? "Your"} half of the court from above. Kitchen ${pct(map.share.kitchen)}, no-man's land ${pct(map.share.transition)}, baseline ${pct(map.share.baseline)}.`;

  return (
    <section aria-label="Court map" className="space-y-3">
      <div className="rounded-[20px] p-4 sm:p-5" style={{ ...cardStyle, borderTop: `4px solid ${CHECK}` }}>
        <h3 className="text-lg font-extrabold tracking-[-0.01em]" style={{ color: INK }}>{name ? `Where ${name} moved` : "Where you moved"}</h3>
        <p className="text-sm" style={{ color: INK_3 }}>{Math.round(map.trackedS)} s of rallies, seen from above. An estimate from the video.</p>

        {game && <div className="mt-3 flex items-center gap-3 rounded-[16px] p-3" style={{ background: SURFACE_2 }}>
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(${ACTION} ${Math.round(levelFraction * 100)}%, ${LINE} 0)` }}>
            <span className="grid h-9 w-9 place-items-center rounded-full text-lg" style={{ background: SURFACE_2, color: INK, ...numStyle }}>{map.level.level}</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold leading-tight" style={{ color: INK }}>Level {map.level.level} · {map.level.name}</p>
            <p className="mb-1.5 mt-0.5 text-[13px]" style={{ color: INK_3 }}>
              {pct(map.share.kitchen)} at the kitchen{next ? ` · ${toNext}% to ${next.name}` : " · top level"}</p>
            <Bar fraction={levelFraction} color={ACTION} />
          </div>
        </div>}

        <div className="mt-3"><CourtCanvas map={map} zone={zone} onPickZone={setZone} label={label} /></div>
        <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: INK_3 }} aria-hidden="true">
          <span>Passed through</span><span className="h-1.5 flex-1 rounded-full" style={{ background: HEAT_GRADIENT }} /><span>Stayed</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Zones">
          {ZONES.map((z) => {
            const on = z.key === zone;
            return <button key={z.key} type="button" aria-pressed={on} onClick={() => setZone(z.key)}
              className="min-h-[52px] rounded-[14px] px-1 py-1.5 text-xs font-semibold leading-tight transition-colors"
              style={{ background: on ? ACTION_SOFT : SURFACE, border: `1px solid ${on ? ACTION : LINE}`, color: INK }}>
              {z.label}<span className="mt-0.5 block text-lg leading-none" style={numStyle}>{pct(map.share[z.key])}</span>
            </button>;
          })}
        </div>
        <p aria-live="polite" className="mt-2 min-h-[4.5em] text-sm leading-relaxed" style={{ color: INK_2 }}>{zoneTip(map, zone, name)}</p>
        {map.share.outside >= 0.05 && <p className="text-xs" style={{ color: INK_3 }}>{pct(map.share.outside)} outside the sidelines.</p>}

        {game && <>
          <p className="mt-2 text-sm font-extrabold" style={{ color: INK }}>Badges</p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {map.badges.map((b) => <li key={b.id} className="flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-xs font-bold"
              style={b.earned ? { background: CHECK, color: "#ffffff" } : { background: SURFACE_2, color: INK_3 }}>
              {b.earned && <Check size={14} strokeWidth={3} aria-hidden="true" />}
              {b.name}{!b.earned && b.progress ? ` ${b.progress}` : ""}
              <span className="sr-only">{b.earned ? ", earned" : ", not earned yet"}</span>
            </li>)}
          </ul>
        </>}
      </div>

      {challenge && <div className="rounded-[20px] p-4 sm:p-5" style={{ ...cardStyle, borderTop: `4px solid ${ACTION}` }}>
        <p className="text-xs font-extrabold uppercase tracking-[0.06em]" style={{ color: ACCENT_INK }}>Next game</p>
        <h3 className="mt-0.5 text-base font-extrabold" style={{ color: INK }}>{challenge.title}</h3>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: INK_2 }}>{challenge.how}</p>
        <div className="mb-1 mt-3 flex justify-between gap-2 text-xs" style={{ color: INK_3 }}>
          <span>Now <b style={{ color: INK }}>{pct(challenge.now)}</b>{prevNow != null && <> · last game {pct(prevNow)}</>}</span>
          <span>Goal <b style={{ color: INK }}>{pct(challenge.goal)}</b></span>
        </div>
        <Bar fraction={challenge.lowerIsBetter ? challenge.goal / challenge.now : challenge.now / challenge.goal} color={CHECK} />
        {goal && (goal.active
          ? <p className="mt-3 flex min-h-[44px] items-center gap-1.5 text-sm font-bold" style={{ color: ACCENT_INK }}>
              <Check size={16} strokeWidth={3} aria-hidden="true" /> Court positioning is one of your goals</p>
          : <>
              <button type="button" disabled={saving} onClick={async () => {
                setSaving(true); setSaveError(false);
                try { await goal.onAdd(); } catch { setSaveError(true); } finally { setSaving(false); }
              }} className="mt-3 min-h-[48px] w-full rounded-full text-[15px] font-extrabold transition-transform active:scale-[0.98]"
                style={{ background: ACTION, color: ON_ACTION, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Adding…" : "Add court positioning to my goals"}</button>
              {saveError && <p role="alert" className="mt-1.5 text-sm" style={{ color: "var(--pp-danger)" }}>Couldn't save that. Try again.</p>}
            </>)}
      </div>}
    </section>
  );
}

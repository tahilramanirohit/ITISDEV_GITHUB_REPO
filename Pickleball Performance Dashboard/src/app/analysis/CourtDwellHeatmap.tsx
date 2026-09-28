import type { HeatmapValue } from "../../lib/analysis/contract";
import { WHITE_SUB } from "../theme";

// Court geometry (metres), matching server/picklepro/court.py.
const W = 6.096;
const L = 13.4112;
const NET = L / 2;
const KITCHEN = 2.1336;

/** Dwell-time heatmap in court coordinates. Near baseline is drawn at the bottom. */
export function CourtDwellHeatmap({ value }: { value: HeatmapValue }) {
  const xs = value.x_edges_m;
  const ys = value.y_edges_m;
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const y0 = ys[0];
  const y1 = ys[ys.length - 1];
  const vw = x1 - x0;
  const vh = y1 - y0;
  // SVG y grows downward; court y grows away from the camera.
  const sx = (x: number) => x - x0;
  const sy = (y: number) => y1 - y;
  const max = Math.max(1e-9, ...value.dwell_seconds.flat());

  return (
    <figure style={{ maxWidth: 260, margin: "0 auto" }}>
      <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" role="img"
        aria-label="Court heatmap of time spent per area, near baseline at the bottom">
        <rect x={0} y={0} width={vw} height={vh} fill="#0a2258" />
        {value.dwell_seconds.map((row, ri) =>
          row.map((sec, ci) =>
            sec > 0 ? (
              <rect key={`${ri}-${ci}`} x={sx(xs[ci])} y={sy(ys[ri + 1])} width={xs[ci + 1] - xs[ci]}
                height={ys[ri + 1] - ys[ri]} fill="#b8f523" fillOpacity={0.15 + 0.85 * (sec / max)}>
                <title>{`${sec.toFixed(1)} s`}</title>
              </rect>
            ) : null,
          ),
        )}
        <g fill="none" stroke="#e8f4ff" strokeWidth={0.05}>
          <rect x={sx(0)} y={sy(L)} width={W} height={L} />
          <line x1={sx(0)} x2={sx(W)} y1={sy(NET - KITCHEN)} y2={sy(NET - KITCHEN)} />
          <line x1={sx(0)} x2={sx(W)} y1={sy(NET + KITCHEN)} y2={sy(NET + KITCHEN)} />
          <line x1={sx(W / 2)} x2={sx(W / 2)} y1={sy(0)} y2={sy(NET - KITCHEN)} />
          <line x1={sx(W / 2)} x2={sx(W / 2)} y1={sy(NET + KITCHEN)} y2={sy(L)} />
        </g>
        <line x1={sx(-0.3)} x2={sx(W + 0.3)} y1={sy(NET)} y2={sy(NET)} stroke="#f97316" strokeWidth={0.08} />
      </svg>
      <figcaption className="text-[10px] mt-2 text-center" style={{ color: WHITE_SUB }}>
        Near baseline (camera side) at bottom · cell {value.cell_size_m.toFixed(2)} m · brightest cell = {max.toFixed(1)} s
      </figcaption>
    </figure>
  );
}

import { useState } from "react";
import { Info, Play } from "lucide-react";
import {
  SHOT_CLASSES, type AnalysisResultV1, type ShotClass, type ShotContact,
} from "../../lib/analysis/contract";
import { BLUE_SKY, BORDER, NEON, ORANGE, ORANGE_L, VIOLET, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Pill, WidgetHeader } from "../shell/primitives";

export const SHOT_LABELS: Record<ShotClass, string> = {
  serve: "Serve", return: "Return", overhead: "Overhead", volley: "Volley",
  dink: "Dink", drive: "Drive", lob: "Lob", unclassified: "Unclassified",
};

const SHOT_COLORS: Record<ShotClass, string> = {
  serve: NEON, return: BLUE_SKY, overhead: ORANGE, volley: VIOLET,
  dink: "#34d399", drive: "#f472b6", lob: "#facc15", unclassified: WHITE_SUB,
};

const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function Bars({ counts }: { counts: Record<ShotClass, number> }) {
  const total = SHOT_CLASSES.reduce((n, c) => n + (counts[c] ?? 0), 0);
  return (
    <ul className="space-y-1.5" aria-label="Shot counts">
      {SHOT_CLASSES.map((c) => {
        const n = counts[c] ?? 0;
        const share = total ? n / total : 0;
        return (
          <li key={c} className="grid grid-cols-[88px_1fr_64px] items-center gap-2 text-xs">
            <span style={{ color: c === "unclassified" ? WHITE_SUB : WHITE }}>{SHOT_LABELS[c]}</span>
            <span className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: SHOT_COLORS[c] }} />
            </span>
            <span className="font-mono text-right" style={{ color: WHITE_DIM }}>{n} · {Math.round(share * 100)}%</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ShotsPanel({ result, onSeek }: { result: AnalysisResultV1; onSeek?: (t: number) => void }) {
  const shots = result.metrics.shot_classification;
  const rallies = result.metrics.rally_segmentation;
  const v = shots.value ?? null;
  const [filter, setFilter] = useState<ShotClass | "all">("all");

  if (!v) {
    return (
      <Card>
        <WidgetHeader title="Shots" subtitle="Serve, return, overhead, volley, dink, drive and lob from ball tracking." />
        <p className="text-xs flex gap-2" style={{ color: ORANGE_L }}>
          <Info size={12} className="flex-shrink-0 mt-0.5" /> {shots.reason ?? "Not available."}
        </p>
        {shots.status === "not_computed" && (
          <p className="text-xs mt-2" style={{ color: WHITE_DIM }}>
            This result was made by a worker without the ball model, or before shot detection existed. Start the
            worker with <code>start_worker.bat</code> (it installs the models), then use <strong>Re-run analysis</strong> above.
          </p>
        )}
      </Card>
    );
  }

  const list: ShotContact[] = v.contacts.filter((c) => filter === "all" || c.shot_class === filter);
  const rv = rallies.value ?? null;
  return (
    <Card>
      <WidgetHeader title="Shots" subtitle="Rule-based shot types from ball tracking. Tap a shot to jump to it in the video." />
      <div className="flex flex-wrap gap-2 mb-3">
        <Pill color={VIOLET}>EXPERIMENTAL</Pill>
        <Pill color={WHITE_SUB} title={v.rule_version}>Not yet checked against labelled footage</Pill>
      </div>

      {v.selected_player_counts && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-white mb-1.5">Your shots <span style={{ color: WHITE_SUB }}>({v.selected_player})</span></p>
          <Bars counts={v.selected_player_counts} />
        </div>
      )}
      <p className="text-xs font-semibold text-white mb-1.5">All detected hits</p>
      <Bars counts={v.counts} />

      <div className="mt-3 text-xs space-y-1" style={{ color: WHITE_DIM }}>
        {rv && (
          <p>
            {rv.rallies.length} rallies ({rv.complete_count} complete, {rv.truncated_count} cut off by the clip)
            {rv.mean_complete_duration_s != null && <> · average complete rally {rv.mean_complete_duration_s.toFixed(1)} s</>}
          </p>
        )}
        <p>
          Ball seen for {v.ball_observed_s.toFixed(1)} s ({v.ball_interpolated_s.toFixed(1)} s filled across short gaps);
          {" "}{v.ball_detections_rejected} ball detections ignored as not in play.
        </p>
        <p>"Unclassified" means the evidence was too weak to name the shot. It is counted, not hidden.</p>
      </div>

      <div className="mt-4">
        <label className="text-xs mr-2" style={{ color: WHITE_DIM }} htmlFor="shot-filter">Show</label>
        <select id="shot-filter" value={filter} onChange={(e) => setFilter(e.target.value as ShotClass | "all")}
          className="rounded-lg px-2 py-1 text-xs" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: WHITE }}>
          <option value="all" className="bg-[#071a3e]">All hits ({v.contacts.length})</option>
          {SHOT_CLASSES.map((c) => (
            <option key={c} value={c} className="bg-[#071a3e]">{SHOT_LABELS[c]} ({v.counts[c] ?? 0})</option>
          ))}
        </select>
        <ul className="mt-2 max-h-72 overflow-y-auto space-y-1 pr-1" aria-label="Detected hits">
          {list.map((c) => (
            <li key={`${c.time_seconds}-${c.shot_class}`}>
              <button type="button" onClick={() => onSeek?.(c.time_seconds)} title={c.reason}
                className="w-full text-left rounded-lg px-2 py-1.5 flex items-center gap-2 text-xs hover:bg-white/5"
                style={{ border: `1px solid ${BORDER}` }}>
                <Play size={10} style={{ color: BLUE_SKY }} />
                <span className="font-mono w-14" style={{ color: WHITE_DIM }}>{fmtT(c.time_seconds)}</span>
                <span className="font-semibold w-24" style={{ color: SHOT_COLORS[c.shot_class] }}>{SHOT_LABELS[c.shot_class]}</span>
                <span style={{ color: WHITE_SUB }}>{c.side ? `${c.side} side` : "side unknown"}</span>
                <span className="ml-auto" style={{ color: c.evidence === "strong" ? NEON : WHITE_SUB }}>{c.evidence}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <details className="mt-3">
        <summary className="text-xs cursor-pointer" style={{ color: BLUE_SKY }}>How shots are named</summary>
        <p className="text-xs mt-2" style={{ color: WHITE_DIM }}>
          Each hit gets one label, checked in this order: {v.precedence.map((c) => SHOT_LABELS[c]).join(" → ")}.
          Speed and height are estimated from the video image, not measured in km/h or metres.
        </p>
        <ul className="mt-1 space-y-1">
          {SHOT_CLASSES.map((c) => (
            <li key={c} className="text-xs" style={{ color: WHITE_DIM }}>
              <strong style={{ color: WHITE }}>{SHOT_LABELS[c]}:</strong> {v.class_definitions[c]}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

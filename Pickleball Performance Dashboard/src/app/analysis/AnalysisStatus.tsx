import { useState } from "react";
import { STATE_LABELS, type AnalysisUiState } from "../../lib/analysis/state";
import { BLUE_SKY, BORDER, NEON, ORANGE, ROSE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Pill, fieldStyle, labelClass, labelStyle } from "../shell/primitives";

const STATE_COLORS: Record<AnalysisUiState, string> = {
  not_uploaded: WHITE_SUB,
  uploading: BLUE_SKY,
  upload_incomplete: ORANGE,
  queued: BLUE_SKY,
  processing: BLUE_SKY,
  completed: NEON,
  insufficient_data: ORANGE,
  failed: ROSE,
};

export function AnalysisStateBadge({ state }: { state: AnalysisUiState }) {
  return <Pill color={STATE_COLORS[state]}>{STATE_LABELS[state].toUpperCase()}</Pill>;
}

export function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}
      role="progressbar" aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(fraction * 100)}%`, background: BLUE_SKY }} />
    </div>
  );
}

export type AnalysisParams = {
  calibration?: unknown;
  selection?: { method: "court_half"; court_half: "near" | "far" } | { method: "track_id"; track_id: number };
  experimental_zones?: boolean;
};

/**
 * The worker selects the near player by default and detects court landmarks
 * when an optional court model is configured. Manual calibration remains an
 * advanced fallback for videos where the model cannot locate the court.
 */
export function AnalysisParamsForm({ onChange }: { onChange: (params: AnalysisParams | null, error: string | null) => void }) {
  const [mode, setMode] = useState<"none" | "near" | "far" | "track">("near");
  const [trackId, setTrackId] = useState("");
  const [calibration, setCalibration] = useState("");
  const [zones, setZones] = useState(false);

  function emit(next: { mode?: typeof mode; trackId?: string; calibration?: string; zones?: boolean }) {
    const m = next.mode ?? mode;
    const t = next.trackId ?? trackId;
    const c = next.calibration ?? calibration;
    const z = next.zones ?? zones;
    const params: AnalysisParams = {};
    if (m === "near" || m === "far") params.selection = { method: "court_half", court_half: m };
    if (m === "track") {
      const n = Number.parseInt(t, 10);
      if (!Number.isInteger(n) || n < 0) return onChange(null, "Enter a whole-number track id.");
      params.selection = { method: "track_id", track_id: n };
    }
    if (c.trim()) {
      try {
        const parsed = JSON.parse(c);
        if (!parsed || !Array.isArray(parsed.points)) throw new Error("missing points");
        params.calibration = parsed;
      } catch {
        return onChange(null, "Calibration must be the JSON produced for `picklepro.cli analyze --calibration`.");
      }
    }
    if (z) params.experimental_zones = true;
    onChange(params, null);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} style={labelStyle} htmlFor="player-selection">Player to analyze</label>
        <select id="player-selection" value={mode} className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}
          onChange={(e) => { const v = e.target.value as typeof mode; setMode(v); emit({ mode: v }); }}>
          <option value="none" className="bg-[#071a3e]">Not selected (no court metrics)</option>
          <option value="near" className="bg-[#071a3e]">The single player on the near half</option>
          <option value="far" className="bg-[#071a3e]">The single player on the far half</option>
          <option value="track" className="bg-[#071a3e]">A specific track id</option>
        </select>
        {mode === "track" && (
          <input aria-label="Track id" inputMode="numeric" value={trackId} placeholder="e.g. 3"
            className="w-full rounded-xl px-3 py-2 text-sm mt-2" style={fieldStyle}
            onChange={(e) => { setTrackId(e.target.value); emit({ trackId: e.target.value }); }} />
        )}
        <label className="flex items-center gap-2 text-xs mt-3" style={{ color: WHITE_DIM }}>
          <input type="checkbox" checked={zones} onChange={(e) => { setZones(e.target.checked); emit({ zones: e.target.checked }); }} />
          Also compute experimental zone occupancy (not validated)
        </label>
      </div>
      <div>
        <p className="text-xs" style={{ color: WHITE_DIM }}>
          Court mapping runs automatically when a court model is configured on the analysis worker.
        </p>
        <details className="mt-2">
          <summary className="text-xs cursor-pointer" style={{ color: BLUE_SKY }}>Manual court calibration (advanced fallback)</summary>
          <label className={labelClass} style={labelStyle} htmlFor="calibration-json">Court calibration JSON</label>
          <textarea id="calibration-json" rows={4} value={calibration} placeholder='{"image_width": 1920, "image_height": 1080, "points": [...]}'
            className="w-full rounded-xl px-3 py-2 text-xs font-mono" style={{ ...fieldStyle, border: `1px solid ${BORDER}` }}
            onChange={(e) => { setCalibration(e.target.value); emit({ calibration: e.target.value }); }} />
        </details>
      </div>
    </div>
  );
}

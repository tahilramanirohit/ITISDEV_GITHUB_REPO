import { useState } from "react";
import { STATE_LABELS, type AnalysisUiState } from "../../lib/analysis/state";
import { BLUE_SKY, NEON, ORANGE, ROSE, WHITE_DIM, WHITE_SUB } from "../theme";
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

/** A null fraction draws a moving bar: work is happening, but how much is done is unknown. */
export function ProgressBar({ fraction, label }: { fraction: number | null; label?: string }) {
  return (
    <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(41,61,242,0.1)" }}
      role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}>
      {fraction === null
        ? <div className="h-full w-1/3 rounded-full animate-pulse" style={{ background: BLUE_SKY }} />
        : <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(fraction * 100)}%`, background: BLUE_SKY }} />}
    </div>
  );
}

export const FRAME_MODES = [
  { value: "standard", label: "Standard (fastest)", hint: "About 10 player and 15 ball checks a second." },
  { value: "near_players", label: "Detailed near players", hint: "Also checks every frame while the ball is near a player, where hits happen. Finds more shots; takes longer." },
] as const;
export type FrameMode = (typeof FRAME_MODES)[number]["value"];

export type AnalysisParams = {
  selection?: { method: "court_half"; court_half: "near" | "far" } | { method: "track_id"; track_id: number };
  experimental_zones?: boolean;
  /** Left out for "standard", so saved jobs keep their old form. */
  frame_mode?: Exclude<FrameMode, "standard">;
};

/**
 * The worker selects the near player by default and detects court landmarks
 * when an optional court model is configured. Court correction is handled by
 * the visible review step before upload.
 */
export function AnalysisParamsForm({ onChange }: { onChange: (params: AnalysisParams | null, error: string | null) => void }) {
  const [mode, setMode] = useState<"none" | "near" | "far" | "track">("near");
  const [trackId, setTrackId] = useState("");
  const [zones, setZones] = useState(false);
  const [frameMode, setFrameMode] = useState<FrameMode>("standard");

  function emit(next: { mode?: typeof mode; trackId?: string; zones?: boolean; frameMode?: FrameMode }) {
    const m = next.mode ?? mode;
    const t = next.trackId ?? trackId;
    const z = next.zones ?? zones;
    const f = next.frameMode ?? frameMode;
    const params: AnalysisParams = {};
    if (m === "near" || m === "far") params.selection = { method: "court_half", court_half: m };
    if (m === "track") {
      const n = Number.parseInt(t, 10);
      if (!Number.isInteger(n) || n < 0) return onChange(null, "Enter a whole-number track id.");
      params.selection = { method: "track_id", track_id: n };
    }
    if (z) params.experimental_zones = true;
    if (f !== "standard") params.frame_mode = f;
    onChange(params, null);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} style={labelStyle} htmlFor="player-selection">Player to analyze</label>
        <select id="player-selection" value={mode} className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}
          onChange={(e) => { const v = e.target.value as typeof mode; setMode(v); emit({ mode: v }); }}>
          <option value="none" className="bg-white">Not selected (no court metrics)</option>
          <option value="near" className="bg-white">The single player on the near half</option>
          <option value="far" className="bg-white">The single player on the far half</option>
          <option value="track" className="bg-white">A specific track id</option>
        </select>
        {mode === "track" && (
          <input aria-label="Track id" inputMode="numeric" value={trackId} placeholder="e.g. 3"
            className="w-full rounded-xl px-3 py-2 text-sm mt-2" style={fieldStyle}
            onChange={(e) => { setTrackId(e.target.value); emit({ trackId: e.target.value }); }} />
        )}
        <label className="flex items-center gap-2 text-sm mt-3" style={{ color: WHITE_DIM }}>
          <input type="checkbox" checked={zones} onChange={(e) => { setZones(e.target.checked); emit({ zones: e.target.checked }); }} />
          Also compute experimental zone occupancy (not validated)
        </label>
      </div>
      <div>
        <label className={labelClass} style={labelStyle} htmlFor="frame-mode">Analysis detail</label>
        <select id="frame-mode" value={frameMode} className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}
          onChange={(e) => { const v = e.target.value as FrameMode; setFrameMode(v); emit({ frameMode: v }); }}>
          {FRAME_MODES.map((m) => <option key={m.value} value={m.value} className="bg-white">{m.label}</option>)}
        </select>
        <p className="text-xs mt-1" style={{ color: WHITE_DIM }}>{FRAME_MODES.find((m) => m.value === frameMode)?.hint}</p>
        <p className="text-sm mt-3" style={{ color: WHITE_DIM }}>
          Review and correct the court on your video before analysis. Re-running an upload keeps its saved court setup.
        </p>
      </div>
    </div>
  );
}

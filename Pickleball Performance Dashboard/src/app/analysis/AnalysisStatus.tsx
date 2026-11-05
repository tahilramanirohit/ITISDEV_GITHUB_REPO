import { useEffect, useState } from "react";
import { STATE_LABELS, type AnalysisUiState } from "../../lib/analysis/state";
import { BLUE_SKY, NEON, ORANGE, ROSE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Pill, fieldStyle, labelClass, labelStyle, pressable } from "../shell/primitives";

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
    <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--pp-accent-soft)" }}
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

export type PlayersOnCourt = 2 | 4;

/** Singles sessions start at 2 players, everything else at 4. */
export const defaultPlayersOnCourt = (playFormat?: string | null): PlayersOnCourt => (playFormat === "singles" ? 2 : 4);

/**
 * How many players are on the court: told to the analyzer before it runs, so a
 * singles video never gets four players (a spectator or a player on the next court).
 */
export function PlayersOnCourtToggle({ value, onChange, idBase = "players-on-court" }: {
  value: PlayersOnCourt; onChange: (v: PlayersOnCourt) => void; idBase?: string;
}) {
  return <div>
    <p className={labelClass} style={labelStyle} id={`${idBase}-label`}>Players on court</p>
    <div role="group" aria-labelledby={`${idBase}-label`} className="grid grid-cols-2 gap-1 rounded-full p-1" style={{ background: "var(--pp-surface-2)" }}>
      {([[2, "2 · Singles"], [4, "4 · Doubles"]] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={value === v}
        onClick={() => onChange(v)} className={`min-h-[44px] rounded-full text-sm font-bold ${pressable}`}
        style={value === v ? { background: "var(--pp-action)", color: "var(--pp-on-action)" } : { color: "var(--pp-ink-2)" }}>{label}</button>)}
    </div>
    <p className="mt-1 text-xs" style={{ color: WHITE_DIM }}>The analyzer keeps at most {value === 2 ? "one player" : "two players"} on each side of the net, so people off court are not counted.</p>
  </div>;
}

export type AnalysisParams = {
  /** 2 (singles) or 4 (doubles). */
  players_on_court?: PlayersOnCourt;
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
export function AnalysisParamsForm({ onChange, playFormat, showPlayers = true, initialPlayers }: {
  onChange: (params: AnalysisParams | null, error: string | null) => void; playFormat?: string;
  /** Off where the players toggle is shown separately (the upload card). */
  showPlayers?: boolean;
  initialPlayers?: PlayersOnCourt;
}) {
  const [players, setPlayers] = useState<PlayersOnCourt>(initialPlayers ?? defaultPlayersOnCourt(playFormat));
  const doubles = players === 4;
  const [mode, setMode] = useState<"none" | "near" | "far" | "track">("near");
  const [trackId, setTrackId] = useState("");
  const [zones, setZones] = useState(false);
  const [frameMode, setFrameMode] = useState<FrameMode>("standard");

  function emit(next: { mode?: typeof mode; trackId?: string; zones?: boolean; frameMode?: FrameMode; players?: PlayersOnCourt }) {
    const p = next.players ?? players;
    const m = next.mode ?? mode;
    const t = next.trackId ?? trackId;
    const z = next.zones ?? zones;
    const f = next.frameMode ?? frameMode;
    const params: AnalysisParams = showPlayers ? { players_on_court: p } : {};
    if (m === "near" || m === "far") params.selection = { method: "court_half", court_half: m };
    if (m === "track") {
      const n = Number.parseInt(t, 10);
      if (!Number.isInteger(n) || n < 0) return onChange(null, "Enter the player number shown on the player cards.");
      params.selection = { method: "track_id", track_id: n };
    }
    if (z) params.experimental_zones = true;
    if (f !== "standard") params.frame_mode = f;
    onChange(params, null);
  }

  // Send the starting choice too, so an untouched form still tells the analyzer the player count.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  useEffect(() => { emit({}); }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showPlayers && <div className="sm:col-span-2"><PlayersOnCourtToggle value={players} idBase="form-players"
        onChange={(v) => { setPlayers(v); emit({ players: v }); }} /></div>}
      <div>
        <label className={labelClass} style={labelStyle} htmlFor="player-selection">Choose the player for positioning analysis</label>
        <select id="player-selection" value={mode} className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}
          onChange={(e) => { const v = e.target.value as typeof mode; setMode(v); emit({ mode: v }); }}>
          <option value="none" className="bg-surface">Not selected (no court metrics)</option>
          <option value="near" className="bg-surface">{doubles ? "The most-seen player on the near side" : "The player on the near side"}</option>
          <option value="far" className="bg-surface">{doubles ? "The most-seen player on the far side" : "The player on the far side"}</option>
          <option value="track" className="bg-surface">A specific player number (from the player cards)</option>
        </select>
        {mode === "track" && (
          <input aria-label="Player number" inputMode="numeric" value={trackId} placeholder="e.g. 3"
            className="w-full rounded-xl px-3 py-2 text-sm mt-2" style={fieldStyle}
            onChange={(e) => { setTrackId(e.target.value); emit({ trackId: e.target.value }); }} />
        )}
        <p className="mt-1 text-xs" style={{ color: WHITE_DIM }}>
          {doubles ? "In doubles, two players share each side. For an exact choice, pick yourself under “Which player are you?” after the first run. " : ""}
          This choice changes the court-position measures. It does not filter shot suggestions.
        </p>
        <label className="flex items-center gap-2 text-sm mt-3" style={{ color: WHITE_DIM }}>
          <input type="checkbox" checked={zones} onChange={(e) => { setZones(e.target.checked); emit({ zones: e.target.checked }); }} />
          Also compute experimental zone occupancy (not validated)
        </label>
      </div>
      <div>
        <label className={labelClass} style={labelStyle} htmlFor="frame-mode">Analysis detail</label>
        <select id="frame-mode" value={frameMode} className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}
          onChange={(e) => { const v = e.target.value as FrameMode; setFrameMode(v); emit({ frameMode: v }); }}>
          {FRAME_MODES.map((m) => <option key={m.value} value={m.value} className="bg-surface">{m.label}</option>)}
        </select>
        <p className="text-xs mt-1" style={{ color: WHITE_DIM }}>{FRAME_MODES.find((m) => m.value === frameMode)?.hint}</p>
        <p className="text-sm mt-3" style={{ color: WHITE_DIM }}>
          Review and correct the court on your video before analysis. Re-running an upload keeps its saved court setup.
        </p>
      </div>
    </div>
  );
}

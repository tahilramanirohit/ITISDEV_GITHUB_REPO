import { UserCheck } from "lucide-react";
import type { AnalysisResultV1 } from "../../lib/analysis/contract";
import { courtPlayers, shotsOf } from "../../lib/analysis/shotLabels";
import { BLUE_SKY, BORDER, INK, WHITE_DIM } from "../theme";
import { Card, WidgetHeader } from "../shell/primitives";

/**
 * Every person PicklePro followed on the court, with a photo from the video.
 * Choosing "This is me" makes "My shots" show that player's shots at once.
 */
export function PlayerPicker({ result, myPlayerId, onPick, onUpdateCourt, showShotCounts = false }: {
  result: AnalysisResultV1;
  myPlayerId: number | null;
  onPick: (playerId: number) => void;
  /** Re-run the court analysis for the chosen player; absent when reanalysis is not possible. */
  onUpdateCourt?: () => void;
  showShotCounts?: boolean;
}) {
  const players = courtPlayers(result);
  const others = (result.players ?? []).filter((p) => !p.on_court);
  const shots = shotsOf(result);
  const secondsPerFrame = result.video.fps > 0 ? result.coverage.sample_stride / result.video.fps : 0.1;
  const analysed = result.player_selection?.method === "track_id" ? result.player_selection.track_id : null;
  if (players.length === 0) return null;

  return (
    <Card accent={BLUE_SKY}>
      <WidgetHeader title="Which player are you?"
        subtitle={showShotCounts
          ? "Pick yourself. This filters the shot suggestions right away. Use “Update court feedback for me” to also change the court-position measures."
          : "Pick yourself, then update the court analysis so position measures follow you."} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Players found in the video">
        {players.map((p) => {
          const mine = p.player_id === myPlayerId;
          const count = shots.filter((s) => s.hitter_track_id === p.player_id).length;
          return (
            <li key={p.player_id} className="rounded-xl p-2 flex flex-col items-center text-center"
              style={{ border: `${mine ? 3 : 1}px solid ${mine ? BLUE_SKY : BORDER}` }}>
              {p.thumbnail
                ? <img src={p.thumbnail} alt={`Player ${p.player_id}`} className="h-28 w-auto rounded-lg object-contain bg-[#f6f5ef]" />
                : <div className="h-28 w-20 rounded-lg bg-[#f6f5ef]" aria-hidden="true" />}
              <p className="mt-2 text-base font-bold" style={{ color: INK }}>{mine ? "You" : `Player ${p.player_id}`}</p>
              <p className="text-sm" style={{ color: WHITE_DIM }}>{p.label}</p>
              <p className="text-sm" style={{ color: WHITE_DIM }}>{showShotCounts ? `${count} ${result.metrics.shot_classification.validation === "evaluated_on_real_footage" ? "estimated" : "experimental"} shot${count === 1 ? "" : "s"} · ` : ""}seen {Math.round(p.observed_frames * secondsPerFrame)} s</p>
              <button type="button" onClick={() => onPick(p.player_id)} aria-pressed={mine}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold min-h-[44px]"
                style={mine ? { background: BLUE_SKY, color: "#ffffff" } : { color: BLUE_SKY, border: `1px solid ${BLUE_SKY}60` }}>
                <UserCheck size={16} aria-hidden="true" /> {mine ? "This is me" : "This is me?"}
              </button>
            </li>
          );
        })}
      </ul>
      {myPlayerId != null && onUpdateCourt && analysed !== myPlayerId && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm flex-1 min-w-[14rem]" style={{ color: INK }}>
            The saved analysis still describes {analysed != null ? `Player ${analysed}` : "the near-side player"}. Re-run it before treating this choice as your court feedback.
          </p>
          <button type="button" onClick={onUpdateCourt}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold min-h-[44px]" style={{ background: BLUE_SKY, color: "#ffffff" }}>
            Update court feedback for me (re-runs the analysis)
          </button>
        </div>
      )}
      <p className="mt-3 text-sm" style={{ color: WHITE_DIM }}>
        Player groups are estimates based on clothing, side and movement. A person can appear twice or be confused with someone else; check the video before selecting.
      </p>
      {others.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: BLUE_SKY }}>
            {others.length} {others.length === 1 ? "person" : "people"} off the court (not counted)
          </summary>
          <ul className="mt-2 flex flex-wrap gap-3">
            {others.map((p) => (
              <li key={p.player_id} className="text-center">
                {p.thumbnail && <img src={p.thumbnail} alt={`Person ${p.player_id} off the court`} className="h-20 w-auto rounded" />}
                <p className="text-xs" style={{ color: WHITE_DIM }}>#{p.player_id}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

import { UserCheck } from "lucide-react";
import type { AnalysisResultV1 } from "../../lib/analysis/contract";
import { courtPlayers } from "../../lib/analysis/shotLabels";
import { BLUE_SKY, BORDER, INK } from "../theme";

/**
 * "Which player are you?": each person PicklePro followed on the court, as a photo from the
 * video with a "This is me" button (adviser notes, 10 Nov: just the person and the button).
 */
export function PlayerPicker({ result, myPlayerId, onPick, onUpdateCourt }: {
  result: AnalysisResultV1;
  myPlayerId: number | null;
  onPick: (playerId: number) => void;
  /** Re-run the court analysis for the chosen player; absent when reanalysis is not possible. */
  onUpdateCourt?: () => void;
  /** Kept for older callers; counts are no longer shown. */
  showShotCounts?: boolean;
}) {
  const players = courtPlayers(result);
  const analysed = result.player_selection?.method === "track_id" ? result.player_selection.track_id : null;
  if (players.length === 0) return null;

  return (
    <section aria-label="Which player are you?">
      <h3 className="text-base font-bold" style={{ color: INK }}>Which player are you?</h3>
      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Players found in the video">
        {players.map((p) => {
          const mine = p.player_id === myPlayerId;
          return (
            <li key={p.player_id} className="flex w-[7.5rem] shrink-0 flex-col items-center gap-2 rounded-[16px] p-2"
              style={{ border: `${mine ? 3 : 1}px solid ${mine ? "var(--pp-action)" : BORDER}` }}>
              {p.thumbnail
                ? <img src={p.thumbnail} alt={`Player ${p.player_id}`} className="h-24 w-full rounded-[10px] object-contain bg-sunken" />
                : <div className="h-24 w-full rounded-[10px] bg-sunken" role="img" aria-label={`Player ${p.player_id}`} />}
              <button type="button" onClick={() => onPick(p.player_id)} aria-pressed={mine} aria-label={`This is me: Player ${p.player_id}`}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold"
                style={mine ? { background: "var(--pp-action)", color: "var(--pp-on-action)" } : { color: INK, border: `1px solid ${BORDER}` }}>
                <UserCheck size={15} aria-hidden="true" /> {mine ? "Me" : "This is me"}
              </button>
            </li>
          );
        })}
      </ul>
      {myPlayerId != null && onUpdateCourt && analysed !== myPlayerId && (
        <button type="button" onClick={onUpdateCourt} className="mt-2 min-h-[44px] text-sm font-bold underline" style={{ color: BLUE_SKY }}>
          Update my court feedback (re-runs the analysis)</button>
      )}
    </section>
  );
}

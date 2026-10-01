import { useState } from "react";
import { PlayCircle } from "lucide-react";
import type { AnalysisResultV1, ShotEvent, ShotType } from "../../lib/analysis/contract";
import { SHOT_TYPES } from "../../lib/analysis/contract";
import {
  SHOT_INFO, countByType, formatClock, isMine, playerName, shotsByPlayer, shotsOf,
} from "../../lib/analysis/shotLabels";
import { BLUE_SKY, BORDER, INK, VIOLET, WHITE_DIM } from "../theme";
import { Card, Pill } from "../shell/primitives";

const LIST_LIMIT = 60;
type Tab = "all" | "mine";

/**
 * Estimated shots from the ball's flight, for every player and for the player
 * the user chose. The labels are experimental: each one links to the moment
 * in the video so it can be checked.
 */
export function ShotsPanel({ result, myPlayerId, onWatch }: {
  result: AnalysisResultV1; myPlayerId: number | null; onWatch?: (time: number) => void;
}) {
  const metric = result.metrics.shot_classification;
  const all = shotsOf(result);
  const mine = all.filter((s) => isMine(s, myPlayerId));
  const [tab, setTab] = useState<Tab>("all");
  const rallies = result.metrics.rally_segmentation.value?.rallies ?? [];
  const validated = metric.validation === "evaluated_on_real_footage";

  if (!metric.value || all.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-bold" style={{ color: INK }}>Shots</h3>
        <p className="mt-1 text-base" style={{ color: WHITE_DIM }}>
          {metric.status === "not_computed"
            ? "Shot types are not available for this video."
            : "PicklePro could not follow the ball well enough to name shots in this video."}
        </p>
        {metric.reason && <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>{metric.reason}</p>}
        <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>
          Tip: film from behind the baseline, high enough to see the whole court, in good light.
        </p>
      </Card>
    );
  }

  const listed = tab === "mine" ? mine : all;
  return (
    <Card accent={VIOLET}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold" style={{ color: INK }}>Shots</h3>
        <Pill color={VIOLET} title={metric.reason ?? undefined}>{validated ? "EVALUATED" : "EXPERIMENTAL"}</Pill>
      </div>
      <p className="mt-1 text-base" style={{ color: WHITE_DIM }}>
        {validated ? "Each shot type is estimated from the ball's flight."
          : "Estimated from the ball's flight and not yet checked against hand-labelled videos, so some labels will be wrong."}{" "}
        Tap <strong>Watch</strong> to see a shot in the video.
      </p>

      <div role="tablist" aria-label="Whose shots" className="mt-4 inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BLUE_SKY}` }}>
        {([["all", `All players (${all.length})`], ["mine", `My shots (${myPlayerId != null ? mine.length : "?"})`]] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
            className="px-4 py-2 text-sm font-semibold min-h-[44px]"
            style={{ background: tab === value ? BLUE_SKY : "white", color: tab === value ? "white" : BLUE_SKY }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" && myPlayerId == null ? (
        <p className="mt-4 text-base" style={{ color: INK }}>
          Choose which player you are in <strong>“Which player are you?”</strong> above to see only your shots.
        </p>
      ) : (
        <>
          <ShotCounts shots={listed} />
          <p className="mt-3 text-base" style={{ color: INK }}>
            {listed.length} {tab === "mine" ? "of your" : ""} hits
            {tab === "all" && rallies.length ? ` in ${rallies.length} rall${rallies.length === 1 ? "y" : "ies"}` : ""}
          </p>
          {tab === "all" && <PlayerTable result={result} myPlayerId={myPlayerId} />}
          <h4 className="mt-5 text-base font-bold" style={{ color: INK }}>Every hit, in order</h4>
          <ol className="mt-2 divide-y" style={{ borderColor: BORDER }}>
            {listed.slice(0, LIST_LIMIT).map((shot) => (
              <ShotRow key={`${shot.time_seconds}-${shot.hitter_track_id}`} shot={shot} onWatch={onWatch}
                who={playerName(result, shot.hitter_track_id, myPlayerId)} />
            ))}
          </ol>
          {listed.length > LIST_LIMIT && (
            <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>Showing the first {LIST_LIMIT} of {listed.length} hits.</p>
          )}
        </>
      )}

      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: BLUE_SKY }}>What each shot type means</summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {SHOT_TYPES.map((type) => (
            <div key={type} className="text-sm">
              <dt className="font-semibold" style={{ color: INK }}>
                <span className="inline-block h-2.5 w-2.5 rounded-full mr-1.5" style={{ background: SHOT_INFO[type].color }} aria-hidden="true" />
                {SHOT_INFO[type].name}
              </dt>
              <dd style={{ color: WHITE_DIM }}>{metric.value?.type_definitions[type] ?? SHOT_INFO[type].meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}

function ShotCounts({ shots }: { shots: ShotEvent[] }) {
  const counts = countByType(shots);
  if (!counts.length) return <p className="mt-4 text-base" style={{ color: WHITE_DIM }}>No hits by this player were detected.</p>;
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Shot counts">
      {counts.map(([type, n]) => (
        <li key={type} className="rounded-xl p-3" style={{ border: `1px solid ${BORDER}`, borderLeft: `5px solid ${SHOT_INFO[type].color}` }}>
          <p className="text-2xl font-bold" style={{ color: INK }}>{n}</p>
          <p className="text-base font-semibold" style={{ color: INK }}>{SHOT_INFO[type].name}</p>
          <p className="text-sm" style={{ color: WHITE_DIM }}>{SHOT_INFO[type].meaning}</p>
        </li>
      ))}
    </ul>
  );
}

function PlayerTable({ result, myPlayerId }: { result: AnalysisResultV1; myPlayerId: number | null }) {
  const rows = shotsByPlayer(result).filter((r) => r.shots.length > 0);
  const types = SHOT_TYPES.filter((t) => rows.some((r) => r.shots.some((s) => s.shot_type === t)));
  if (!rows.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm" aria-label="Shots by player">
        <thead>
          <tr style={{ color: WHITE_DIM }}>
            <th scope="col" className="text-left font-semibold py-1 pr-3">Player</th>
            <th scope="col" className="text-right font-semibold py-1 px-2">Total</th>
            {types.map((t: ShotType) => <th key={t} scope="col" className="text-right font-semibold py-1 px-2 whitespace-nowrap">{SHOT_INFO[t].name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, shots }) => (
            <tr key={player?.player_id ?? "unknown"} className="border-t" style={{ borderColor: BORDER, color: INK }}>
              <th scope="row" className="text-left font-semibold py-1.5 pr-3">
                <span className="inline-flex items-center gap-2">
                  {player?.thumbnail && <img src={player.thumbnail} alt="" className="h-8 w-auto rounded" />}
                  {player ? playerName(result, player.player_id, myPlayerId) : "Hitter not identified"}
                </span>
              </th>
              <td className="text-right py-1.5 px-2 font-bold">{shots.length}</td>
              {types.map((t) => <td key={t} className="text-right py-1.5 px-2">{shots.filter((s) => s.shot_type === t).length || "·"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShotRow({ shot, who, onWatch }: { shot: ShotEvent; who: string; onWatch?: (time: number) => void }) {
  const info = SHOT_INFO[shot.shot_type];
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="font-mono text-base w-14" style={{ color: WHITE_DIM }}>{formatClock(shot.time_seconds)}</span>
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: info.color }} aria-hidden="true" />
      <span className="flex-1 min-w-[10rem] text-base" style={{ color: INK }}>
        <strong>{who}</strong> · {info.name}
        {shot.contact === "volley" && !["volley", "counter", "erne"].includes(shot.shot_type) ? " (out of the air)" : ""}
        <span className="block text-sm" style={{ color: WHITE_DIM }}>Why: {shot.evidence}</span>
      </span>
      {onWatch && (
        <button type="button" onClick={() => onWatch(shot.time_seconds)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold min-h-[44px]"
          style={{ color: BLUE_SKY, border: `1px solid ${BLUE_SKY}60` }}
          aria-label={`Watch the ${info.name.toLowerCase()} at ${formatClock(shot.time_seconds)}`}>
          <PlayCircle size={18} aria-hidden="true" /> Watch
        </button>
      )}
    </li>
  );
}

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import type { AnalysisResultV1 } from "../../lib/analysis/contract";
import { SHOT_INFO, countByType, focusShots, formatClock, shotsOf } from "../../lib/analysis/shotLabels";
import { BLUE_SKY, BORDER, INK, VIOLET, WHITE_DIM } from "../theme";
import { Card, Pill } from "../shell/primitives";

const LIST_LIMIT = 40;

/**
 * Estimated shots from the ball's flight. Every label is a suggestion the
 * player can check in the video with one tap.
 */
export function ShotsPanel({ result, onWatch }: { result: AnalysisResultV1; onWatch?: (time: number) => void }) {
  const metric = result.metrics.shot_classification;
  const all = shotsOf(result);
  const focus = focusShots(result);
  const [who, setWho] = useState<"mine" | "all">(focus.mine ? "mine" : "all");
  const listed = who === "mine" ? all.filter((s) => s.by_selected_player) : all;
  const counts = countByType(focus.shots);
  const rallies = result.metrics.rally_segmentation.value?.rallies ?? [];

  if (metric.validation !== "evaluated_on_real_footage") {
    return <Card><h3 className="text-lg font-bold" style={{ color: INK }}>Shots</h3>
      <p className="mt-1 text-base" style={{ color: WHITE_DIM }}>
        Shot labels are unavailable until the detector and rules pass evaluation on labelled real footage.
      </p></Card>;
  }

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

  return (
    <Card accent={VIOLET}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold" style={{ color: INK }}>{focus.mine ? "Your shots" : "Shots in this video"}</h3>
        <Pill color={VIOLET} title={metric.reason ?? undefined}>EVALUATED METRIC</Pill>
      </div>
      <p className="mt-1 text-base" style={{ color: WHITE_DIM }}>
        PicklePro estimates each shot type from observed evidence. Tap <strong>Watch</strong> to check an event yourself.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Shot counts">
        {counts.map(([type, n]) => (
          <li key={type} className="rounded-xl p-3" style={{ border: `1px solid ${BORDER}`, borderLeft: `5px solid ${SHOT_INFO[type].color}` }}>
            <p className="text-2xl font-bold" style={{ color: INK }}>{n}</p>
            <p className="text-base font-semibold" style={{ color: INK }}>{SHOT_INFO[type].name}{n === 1 ? "" : "s"}</p>
            <p className="text-sm" style={{ color: WHITE_DIM }}>{SHOT_INFO[type].meaning}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-base" style={{ color: INK }}>
        {focus.shots.length} {focus.mine ? "of your" : ""} hits{rallies.length ? ` in ${rallies.length} rall${rallies.length === 1 ? "y" : "ies"}` : ""}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-bold" style={{ color: INK }}>Every hit, in order</h4>
        {focus.mine && (
          <div role="group" aria-label="Whose shots to list" className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BLUE_SKY}` }}>
            {(["mine", "all"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={who === value} onClick={() => setWho(value)}
                className="px-4 py-2 text-sm font-semibold min-h-[44px]"
                style={{ background: who === value ? BLUE_SKY : "white", color: who === value ? "white" : BLUE_SKY }}>
                {value === "mine" ? "Mine" : "Everyone"}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="mt-2 divide-y" style={{ borderColor: BORDER }}>
        {listed.slice(0, LIST_LIMIT).map((shot) => {
          const info = SHOT_INFO[shot.shot_type];
          return (
            <li key={`${shot.time_seconds}-${shot.hitter_track_id}`} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-mono text-base w-14" style={{ color: WHITE_DIM }}>{formatClock(shot.time_seconds)}</span>
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: info.color }} aria-hidden="true" />
              <span className="flex-1 min-w-[10rem] text-base" style={{ color: INK }}>
                <strong>{shot.by_selected_player ? "You" : "Other player"}</strong> · {info.name}
                {shot.contact === "volley" && shot.shot_type !== "volley" ? " (out of the air)" : ""}
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
        })}
      </ol>
      {listed.length > LIST_LIMIT && (
        <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>Showing the first {LIST_LIMIT} of {listed.length} hits.</p>
      )}
    </Card>
  );
}

import { ZONES, type AnalysisResultV1, type PlayerZoneTime, type ZoneName } from "../../lib/analysis/contract";
import { BORDER, INK, WHITE_DIM } from "../theme";
import { Card, Pill, WidgetHeader } from "../shell/primitives";

const ZONE_STYLE: Record<ZoneName, { label: string; color: string }> = {
  kitchen: { label: "Kitchen", color: "#293df2" },
  transition: { label: "Transition", color: "#6543a4" },
  baseline: { label: "Baseline", color: "#0f7b6c" },
  outside: { label: "Outside", color: "#a94318" },
};

const pct = (f: number) => `${Math.round(f * 100)}%`;

function ZoneBar({ row }: { row: PlayerZoneTime }) {
  return (
    <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ border: `1px solid ${BORDER}` }}
      role="img" aria-label={ZONES.map((z) => `${ZONE_STYLE[z].label} ${pct(row.zone_share[z])}`).join(", ")}>
      {ZONES.map((z) => row.zone_share[z] > 0 && (
        <div key={z} style={{ width: `${row.zone_share[z] * 100}%`, background: ZONE_STYLE[z].color }} />
      ))}
    </div>
  );
}

/** Zone time per on-court player (F01, F02, F12), with estimated time kept visible. */
export function ZoneTimePanel({ result, myPlayerId }: { result: AnalysisResultV1; myPlayerId: number | null }) {
  const metric = result.metrics.zone_time;
  const value = metric.value;
  if (!value || !value.players.length) return null;
  const people = new Map((result.players ?? []).map((p) => [p.player_id, p]));
  const rows = [...value.players].sort((a, b) => (a.player_id === myPlayerId ? -1 : b.player_id === myPlayerId ? 1 : 0));
  return (
    <section aria-label="Where each player stood">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <WidgetHeader title="Where each player stood"
            subtitle={value.window === "detected_rallies"
              ? `During detected rallies (${Math.round(value.window_s)} s of play).`
              : `Over the whole video (${Math.round(value.window_s)} s); no rallies were detected to narrow it down.`} />
          {metric.status === "experimental" && <Pill color="#6543a4">EXPERIMENTAL · NOT YET CHECKED AGAINST LABELS</Pill>}
        </div>
        <ul className="flex flex-wrap gap-3 text-sm mb-3" aria-label="Zones">
          {ZONES.map((z) => (
            <li key={z} className="flex items-center gap-1.5" title={value.zone_definitions[z]}>
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: ZONE_STYLE[z].color }} />
              <span style={{ color: INK }}>{ZONE_STYLE[z].label}</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-4">
          {rows.map((row) => {
            const person = people.get(row.player_id);
            const mine = row.player_id === myPlayerId;
            return (
              <li key={row.player_id} className="rounded-xl p-3"
                style={{ border: `1px solid ${mine ? "#293df2" : BORDER}`, background: mine ? "rgba(41,61,242,0.04)" : undefined }}>
                <div className="flex items-center gap-3">
                  {person?.thumbnail && <img src={person.thumbnail} alt="" className="h-12 w-auto rounded" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold" style={{ color: INK }}>
                      {mine ? "You · " : ""}{person?.label ?? `Player ${row.player_id}`}
                    </p>
                    <ZoneBar row={row} />
                    <p className="text-sm mt-1" style={{ color: WHITE_DIM }}>
                      {ZONES.map((z) => `${ZONE_STYLE[z].label} ${pct(row.zone_share[z])}`).join(" · ")}
                    </p>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <div><dt className="inline" style={{ color: WHITE_DIM }}>At the kitchen line: </dt><dd className="inline font-semibold">{pct(row.kitchen_line_share)}</dd></div>
                  <div><dt className="inline" style={{ color: WHITE_DIM }}>Seen by the camera: </dt><dd className="inline font-semibold">{pct(row.coverage)}</dd></div>
                  <div title={value.estimate_rules}>
                    <dt className="inline" style={{ color: WHITE_DIM }}>Estimated position: </dt>
                    <dd className="inline font-semibold">{pct(row.estimated_share)}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
        <p className="text-sm mt-3" style={{ color: WHITE_DIM }}>
          Kitchen: within 2.13 m of the net. Transition: from the kitchen line to 5.2 m. Baseline: from 5.2 m to the baseline.
          Outside: beyond a sideline or behind the baseline. "At the kitchen line" is the 1 m just behind it. When a player
          is out of the picture, their position is estimated: {value.estimate_rules}
        </p>
      </Card>
    </section>
  );
}

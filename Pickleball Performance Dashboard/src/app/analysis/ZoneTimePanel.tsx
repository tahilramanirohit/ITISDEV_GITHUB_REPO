import { useState } from "react";
import { ZONES, type AnalysisResultV1, type PlayerZoneTime, type ZoneName } from "../../lib/analysis/contract";
import { BLUE_SKY, BORDER, INK, WHITE_DIM } from "../theme";
import { Card } from "../shell/primitives";

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

function ZoneLegend({ definitions }: { definitions: Record<string, string> }) {
  return (
    <ul className="mt-2 mb-3 flex flex-wrap gap-3 text-sm" aria-label="Zones">
      {ZONES.map((z) => (
        <li key={z} className="flex items-center gap-1.5" title={definitions[z]}>
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: ZONE_STYLE[z].color }} />
          <span style={{ color: INK }}>{ZONE_STYLE[z].label}</span>
        </li>
      ))}
    </ul>
  );
}

function ZoneRow({ row, mine, name, thumbnail, rules }: {
  row: PlayerZoneTime; mine: boolean; name?: string; thumbnail?: string | null; rules: string;
}) {
  return (
    <li className="rounded-xl p-3"
      style={{ border: `1px solid ${mine ? "#293df2" : BORDER}`, background: mine ? "var(--pp-surface-2)" : undefined }}>
      <div className="flex items-center gap-3">
        {thumbnail && <img src={thumbnail} alt="" className="h-12 w-auto rounded" />}
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold" style={{ color: INK }}>{mine ? "You" : name ?? `Player ${row.player_id}`}</p>
          <ZoneBar row={row} />
          <p className="text-sm mt-1" style={{ color: WHITE_DIM }}>
            {ZONES.map((z) => `${ZONE_STYLE[z].label} ${pct(row.zone_share[z])}`).join(" · ")}
          </p>
        </div>
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <div><dt className="inline" style={{ color: WHITE_DIM }}>At the kitchen line: </dt><dd className="inline font-semibold">{pct(row.kitchen_line_share)}</dd></div>
        <div title={rules}>
          <dt className="inline" style={{ color: WHITE_DIM }}>Estimated (off camera): </dt>
          <dd className="inline font-semibold">{pct(row.estimated_share)}</dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * Where each on-court player stood (F01, F02, F12). Once you pick yourself it shows only you,
 * with "Show everyone" for the others (adviser notes, 10 Nov: less on screen).
 */
export function ZoneTimePanel({ result, myPlayerId, othersOf }: {
  result: AnalysisResultV1; myPlayerId: number | null;
  /** Set when the court map above already shows this player: list everyone else, folded away. */
  othersOf?: number | null;
}) {
  const [everyone, setEveryone] = useState(false);
  const metric = result.metrics.zone_time;
  const value = metric.value;
  if (!value || !value.players.length) return null;
  const people = new Map((result.players ?? []).map((p) => [p.player_id, p]));
  const sorted = [...value.players].sort((a, b) => (a.player_id === myPlayerId ? -1 : b.player_id === myPlayerId ? 1 : 0));
  const mineKnown = sorted.some((r) => r.player_id === myPlayerId);
  const rows = mineKnown && !everyone ? sorted.filter((r) => r.player_id === myPlayerId) : sorted;
  if (othersOf !== undefined) {
    const others = sorted.filter((r) => r.player_id !== othersOf);
    if (!others.length) return null;
    return (
      <details className="rounded-[20px] px-4 py-1" style={{ background: "var(--pp-surface)", border: `1px solid ${BORDER}` }}>
        <summary className="flex min-h-[48px] cursor-pointer items-center text-base font-bold" style={{ color: INK }}>
          {othersOf == null ? "Where each player stood" : "Where the other players stood"}</summary>
        <p className="text-sm" style={{ color: WHITE_DIM }}>{value.window === "detected_rallies"
          ? `During rallies (${Math.round(value.window_s)} s of play).` : `Over the whole video (${Math.round(value.window_s)} s).`}</p>
        <ZoneLegend definitions={value.zone_definitions} />
        <ul className="mb-3 space-y-3">{others.map((row) => <ZoneRow key={row.player_id} row={row} mine={row.player_id === myPlayerId}
          name={people.get(row.player_id)?.label} thumbnail={people.get(row.player_id)?.thumbnail} rules={value.estimate_rules} />)}</ul>
      </details>
    );
  }
  return (
    <section aria-label="Where each player stood">
      <Card>
        <h3 className="text-lg font-bold" style={{ color: INK }}>{mineKnown && !everyone ? "Where you stood" : "Where each player stood"}</h3>
        <p className="text-sm" style={{ color: WHITE_DIM }}>{value.window === "detected_rallies"
          ? `During rallies (${Math.round(value.window_s)} s of play).` : `Over the whole video (${Math.round(value.window_s)} s).`}</p>
        <ZoneLegend definitions={value.zone_definitions} />
        <ul className="space-y-3">
          {rows.map((row) => <ZoneRow key={row.player_id} row={row} mine={row.player_id === myPlayerId}
            name={people.get(row.player_id)?.label} thumbnail={people.get(row.player_id)?.thumbnail} rules={value.estimate_rules} />)}
        </ul>
        {mineKnown && sorted.length > 1 && <button type="button" onClick={() => setEveryone(!everyone)}
          className="mt-2 min-h-[44px] text-sm font-bold underline" style={{ color: BLUE_SKY }}>{everyone ? "Show only me" : "Show everyone"}</button>}
      </Card>
    </section>
  );
}

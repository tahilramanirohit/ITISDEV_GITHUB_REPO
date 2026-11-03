import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight } from "lucide-react";
import type { AnalysisResultV1, ShotEvent, ShotType } from "../../lib/analysis/contract";
import { PUBLIC_SHOT_TYPES, SHOT_TYPES } from "../../lib/analysis/contract";
import { SHOT_INFO, countByType, courtPlayers, formatClock, shotsByPlayer, shotsOf } from "../../lib/analysis/shotLabels";
import {
  ACTION, CHECK, INK, INK_2, INK_3, LINE, LINE_STRONG, ON_ACTION, ON_CHECK, SURFACE, SURFACE_2, TABBAR, VIOLET, WARN, WHITE_DIM,
} from "../theme";
import { Card, Pill, numStyle, pressable } from "../shell/primitives";

const LIST_LIMIT = 60;
type Side = "near" | "far";
type Filter = "all" | "you" | "partner" | "them";
const other = (s: Side): Side => (s === "near" ? "far" : "near");

/** Team fixes for one video, saved on this device: player id → court side. */
function useTeamFixes(key: string | undefined): [Record<number, Side>, (next: Record<number, Side>) => void] {
  const read = (): Record<number, Side> => {
    if (!key) return {};
    try { return JSON.parse(window.localStorage.getItem(key) ?? "{}"); } catch { return {}; }
  };
  const [fixes, setFixes] = useState(read);
  useEffect(() => setFixes(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: Record<number, Side>) => {
    setFixes(next);
    if (key) try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode: this visit only */ }
  };
  return [fixes, save];
}

/**
 * Estimated shots as a chat of the rally: your team on the right, the other team on
 * the left. Tap a shot to jump the video there. Teams come from which side of the net
 * each player was on, and can be fixed by hand when the video got them wrong.
 */
export function ShotsPanel({ result, myPlayerId, onWatch, research = false, teamsKey }: {
  result: AnalysisResultV1; myPlayerId: number | null; onWatch?: (time: number) => void; research?: boolean;
  /** Where team fixes for this video are saved on the device. */ teamsKey?: string;
}) {
  const metric = result.metrics.shot_classification;
  const all = shotsOf(result);
  const players = courtPlayers(result);
  const [fixes, setFixes] = useTeamFixes(teamsKey);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const validated = metric.validation === "evaluated_on_real_footage";

  const sideOf = useMemo(() => {
    const base = new Map<number, Side>();
    for (const p of players) if (p.side) base.set(p.player_id, p.side);
    for (const [id, side] of Object.entries(fixes)) base.set(Number(id), side);
    return base;
  }, [players, fixes]);
  // Without a choice, "you" is the player the analysis followed.
  const meId = myPlayerId ?? all.find((s) => s.by_selected_player)?.hitter_track_id ?? null;
  const shotSide = (s: ShotEvent): Side | null => (s.hitter_track_id != null ? sideOf.get(s.hitter_track_id) : undefined) ?? s.hitter_side;
  const mySide: Side = (meId != null ? sideOf.get(meId) : undefined) ?? all.find((s) => s.by_selected_player)?.hitter_side ?? "near";
  const isMe = (s: ShotEvent) => (myPlayerId != null ? s.hitter_track_id === myPlayerId : s.by_selected_player);
  const role = (s: ShotEvent): Exclude<Filter, "all"> => (isMe(s) ? "you" : shotSide(s) === mySide ? "partner" : "them");
  const name = (s: ShotEvent) => {
    if (isMe(s)) return "You";
    if (s.hitter_track_id == null) return "Unknown player";
    return `Player ${s.hitter_track_id}`;
  };

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

  const listed = all.filter((s) => filter === "all" || role(s) === filter);
  const mineCount = all.filter((s) => role(s) === "you").length;
  const counts: Record<Filter, number> = { all: all.length, you: mineCount, partner: all.filter((s) => role(s) === "partner").length, them: all.filter((s) => role(s) === "them").length };
  const doubles = players.length >= 4;

  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold" style={{ color: INK }}>Shots</h3>
        <Pill color={VIOLET} title={metric.reason ?? undefined}>{validated ? "EVALUATED" : "EXPERIMENTAL"}</Pill>
        {players.length >= 2 && <button type="button" onClick={() => setEditing(true)}
          className={`ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${pressable}`}
          style={{ border: `1px solid ${LINE_STRONG}`, color: INK }}>
          <ArrowLeftRight size={14} aria-hidden="true" /> Teams
        </button>}
      </div>
      <p className="mt-1 text-sm" style={{ color: INK_2 }}>
        Your team on the right, the other team on the left. {onWatch ? "Tap a shot to jump the video there." : ""}
        {!validated && " Labels are estimates from the ball's flight, so some will be wrong."}
      </p>

      <div role="radiogroup" aria-label="Show shots by" className="mt-3 grid grid-cols-4 gap-1 rounded-full p-1" style={{ background: TABBAR, border: `1px solid ${LINE}` }}>
        {(["all", "you", "partner", "them"] as Filter[]).filter((f) => doubles || f !== "partner").map((f) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
            aria-label={`${{ all: "All", you: "You", partner: "Partner", them: "Them" }[f]}, ${counts[f]} shot${counts[f] === 1 ? "" : "s"}`}
            className={`min-h-[40px] rounded-full text-[13px] font-bold ${pressable}`}
            style={filter === f ? { background: ACTION, color: ON_ACTION } : { color: INK }}>
            {{ all: "All", you: "You", partner: "Partner", them: "Them" }[f]}
            <span className="ml-1 text-[11px] opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      {filter === "you" && myPlayerId == null && !all.some((s) => s.by_selected_player) ? (
        <p className="mt-4 text-sm" style={{ color: INK }}>Choose which player you are in <strong>“Which player are you?”</strong> above to see your shots.</p>
      ) : (
        <ol aria-label="Shots in this video" className="mt-3 flex max-h-[520px] flex-col gap-2 overflow-y-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {listed.slice(0, LIST_LIMIT).map((shot, i) => {
            const prev = listed[i - 1];
            const newRally = filter === "all" && (!prev || prev.rally_index !== shot.rally_index);
            const r = role(shot);
            const right = r !== "them";
            const info = SHOT_INFO[shot.shot_type];
            const active = selected === shot.time_seconds;
            const bubble = r === "you" ? { background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION}` }
              : r === "partner" ? { background: "color-mix(in srgb, var(--pp-green) 22%, var(--pp-surface))", color: INK, border: `1px solid color-mix(in srgb, var(--pp-green) 40%, transparent)` }
              : { background: SURFACE_2, color: INK, border: `1px solid ${LINE}` };
            const avatar = r === "you" ? { background: ACTION, color: ON_ACTION } : r === "partner" ? { background: CHECK, color: ON_CHECK } : { background: LINE, color: INK_2 };
            const label = name(shot);
            return (
              <li key={`${shot.time_seconds}-${shot.hitter_track_id}`} className="flex flex-col">
                {newRally && <p className="my-1 self-center rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: TABBAR, border: `1px solid ${LINE}`, color: INK_3 }}>
                  Rally {shot.rally_index + 1} · {formatClock(shot.time_seconds)}</p>}
                <button type="button" disabled={!onWatch}
                  onClick={() => { setSelected(shot.time_seconds); onWatch?.(shot.time_seconds); }}
                  aria-label={`${label}, ${info.name} at ${formatClock(shot.time_seconds)}${onWatch ? ". Jump the video here" : ""}`}
                  className={`flex max-w-[88%] items-end gap-1.5 text-left ${right ? "flex-row-reverse self-end" : "self-start"} transition-transform duration-100 active:scale-[0.97] motion-reduce:transition-none disabled:cursor-default`}>
                  <span aria-hidden="true" className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold" style={avatar}>
                    {r === "you" ? "You" : shot.hitter_track_id ?? "?"}</span>
                  <span className={`block px-3 py-1.5 ${right ? "rounded-[16px] rounded-br-[4px]" : "rounded-[16px] rounded-bl-[4px]"}`}
                    style={{ ...bubble, boxShadow: active ? `0 0 0 2px ${INK}` : "none" }}>
                    <span className="block text-[11px] font-semibold" style={{ opacity: 0.75 }}>{label} · <span style={{ ...numStyle, fontWeight: 700, fontSize: 13 }}>{formatClock(shot.time_seconds)}</span></span>
                    <span className="block text-[13px] font-bold leading-snug">{info.name}
                      {shot.contact === "volley" && !["volley", "counter", "erne"].includes(shot.shot_type) ? ", out of the air" : ""}
                      {shot.landed_in === false ? ", landed out" : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {listed.length === 0 && <p className="py-3 text-center text-sm" style={{ color: INK_3 }}>No shots for this filter.</p>}
        </ol>
      )}
      {listed.length > LIST_LIMIT && <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>Showing the first {LIST_LIMIT} of {listed.length} shots.</p>}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: INK_2 }}>Shot totals and what each type means</summary>
        <ShotCounts shots={all} />
        <PlayerTable result={result} research={research} />
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {(research ? SHOT_TYPES : PUBLIC_SHOT_TYPES).map((type) => (
            <div key={type} className="text-sm">
              <dt className="font-semibold" style={{ color: INK }}>{SHOT_INFO[type].name}</dt>
              <dd style={{ color: WHITE_DIM }}>{metric.value?.type_definitions[type] ?? SHOT_INFO[type].meaning}</dd>
            </div>
          ))}
        </dl>
      </details>

      {editing && createPortal(<TeamsSheet players={players.map((p) => p.player_id)} sideOf={sideOf} myPlayerId={meId}
        onMove={(id) => setFixes({ ...fixes, [id]: other(sideOf.get(id) ?? "near") })}
        onReset={() => setFixes({})} onClose={() => setEditing(false)} />, document.body)}
    </Card>
  );
}

/** Bottom sheet: tap a player to move them to the other team. Teams must be even to close. */
function TeamsSheet({ players, sideOf, myPlayerId, onMove, onReset, onClose }: {
  players: number[]; sideOf: Map<number, Side>; myPlayerId: number | null;
  onMove: (id: number) => void; onReset: () => void; onClose: () => void;
}) {
  const near = players.filter((id) => (sideOf.get(id) ?? "near") === "near");
  const far = players.filter((id) => sideOf.get(id) === "far");
  const even = players.length % 2 === 1 || near.length === far.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && even) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [even, onClose]);
  const column = (title: string, ids: number[]) => (
    <div className="flex flex-1 flex-col gap-1.5 rounded-[14px] p-2.5" style={{ background: TABBAR, border: `1px solid ${LINE}` }}>
      <p className="mb-0.5 text-xs font-extrabold" style={{ color: INK_2 }}>{title}</p>
      {ids.map((id) => (
        <button key={id} type="button" onClick={() => onMove(id)} aria-label={`Move ${id === myPlayerId ? "you" : `player ${id}`} to the other team`}
          className={`flex min-h-[44px] items-center gap-2 rounded-full pl-1.5 pr-3 text-[13px] font-bold ${pressable}`}
          style={{ background: SURFACE, border: `1px solid ${LINE}`, color: INK }}>
          <span className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-extrabold"
            style={id === myPlayerId ? { background: ACTION, color: ON_ACTION } : { background: LINE, color: INK_2 }}>{id === myPlayerId ? "You" : id}</span>
          {id === myPlayerId ? "You" : `Player ${id}`}
          <ArrowLeftRight size={13} aria-hidden="true" className="ml-auto" style={{ color: INK_3 }} />
        </button>
      ))}
      {ids.length === 0 && <p className="py-2 text-center text-xs" style={{ color: INK_3 }}>Nobody</p>}
    </div>
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ fontFamily: "var(--font-body)" }}>
      <button type="button" aria-label="Close teams" className="pp-fade absolute inset-0 cursor-default" style={{ background: "rgba(5,10,7,.6)" }}
        onClick={() => { if (even) onClose(); }} />
      <div role="dialog" aria-modal="true" aria-label="Fix teams" className="pp-sheet relative w-full max-w-lg rounded-t-[22px] px-4 pt-4"
        style={{ background: SURFACE, borderTop: `1px solid ${LINE_STRONG}`, paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: LINE_STRONG }} aria-hidden="true" />
        <p className="text-[17px] font-extrabold" style={{ color: INK }}>Who played with who?</p>
        <p className="mt-0.5 text-[13px]" style={{ color: INK_2 }}>Tap a player to move them. Shots switch sides right away.</p>
        <div className="mt-3 flex gap-2">{column("Near side", near)}{column("Far side", far)}</div>
        {!even && <p role="alert" className="mt-2 text-xs font-bold" style={{ color: WARN }}>Each team needs {players.length / 2} player{players.length === 2 ? "" : "s"}.</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onReset} className={`min-h-[48px] rounded-full px-4 text-sm font-bold ${pressable}`} style={{ border: `1px solid ${LINE_STRONG}`, color: INK }}>Reset</button>
          <button type="button" onClick={onClose} disabled={!even} className={`min-h-[48px] flex-1 rounded-full text-[15px] font-extrabold ${pressable}`}
            style={{ background: ACTION, color: ON_ACTION }}>Done</button>
        </div>
      </div>
    </div>
  );
}

function ShotCounts({ shots }: { shots: ShotEvent[] }) {
  const counts = countByType(shots);
  if (!counts.length) return null;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Shot counts">
      {counts.map(([type, n]) => (
        <li key={type} className="rounded-[12px] p-2.5" style={{ border: `1px solid ${LINE}` }}>
          <p className="text-2xl" style={{ ...numStyle, color: INK }}>{n}</p>
          <p className="text-sm font-semibold" style={{ color: INK }}>{SHOT_INFO[type].name}</p>
        </li>
      ))}
    </ul>
  );
}

function PlayerTable({ result, research }: { result: AnalysisResultV1; research: boolean }) {
  const rows = shotsByPlayer(result).filter((r) => r.shots.length > 0);
  const types = (research ? SHOT_TYPES : PUBLIC_SHOT_TYPES).filter((t) => rows.some((r) => r.shots.some((s) => s.shot_type === t)));
  if (!rows.length) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm" aria-label="Shots by player">
        <thead>
          <tr style={{ color: WHITE_DIM }}>
            <th scope="col" className="py-1 pr-3 text-left font-semibold">Player</th>
            <th scope="col" className="px-2 py-1 text-right font-semibold">Total</th>
            {types.map((t: ShotType) => <th key={t} scope="col" className="whitespace-nowrap px-2 py-1 text-right font-semibold">{SHOT_INFO[t].name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, shots }) => (
            <tr key={player?.player_id ?? "unknown"} className="border-t" style={{ borderColor: LINE, color: INK }}>
              <th scope="row" className="py-1.5 pr-3 text-left font-semibold">{player ? `Player ${player.player_id}` : "Hitter not identified"}</th>
              <td className="px-2 py-1.5 text-right font-bold">{shots.length}</td>
              {types.map((t) => <td key={t} className="px-2 py-1.5 text-right">{shots.filter((s) => s.shot_type === t).length || "·"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


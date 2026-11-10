import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { ERROR_KINDS, type AnalysisResultV1, type ErrorKind } from "../../lib/analysis/contract";
import { ACCENT_INK, ACCENT_SOFT, INK, INK_2, INK_3, LINE, SURFACE_2, WARN } from "../theme";
import { Card, numStyle, pressable } from "../shell/primitives";

export const ERROR_LABELS: Record<ErrorKind, string> = {
  serve_fault: "Serve faults",
  out: "Shots out",
  kitchen_fault: "Kitchen faults",
  no_mans_land: "No-man's land",
  stayed_back: "Stayed back after return",
};
const GROUPS: { title: string; kinds: ErrorKind[] }[] = [
  { title: "Shot errors", kinds: ["serve_fault", "out", "kitchen_fault"] },
  { title: "Court positioning", kinds: ["no_mans_land", "stayed_back"] },
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Errors counted from the video (adviser feedback: "count the errors"): serve faults,
 * shots out, kitchen faults and court positioning errors, for you or for everyone,
 * with each one a tap away in the video.
 */
export function ErrorsPanel({ result, myPlayerId, onWatch }: {
  result: AnalysisResultV1; myPlayerId: number | null; onWatch?: (time: number) => void;
}) {
  const metric = result.metrics.error_counts;
  const value = metric?.value;
  const mineKnown = myPlayerId != null && !!value?.players.some((p) => p.player_id === myPlayerId);
  const [who, setWho] = useState<"me" | "all">("me");
  const scope = mineKnown && who === "me" ? "me" : "all";
  const counts = useMemo(() => {
    if (!value) return null;
    if (scope === "all") return value.counts;
    return value.players.find((p) => p.player_id === myPlayerId)!.counts;
  }, [value, scope, myPlayerId]);
  const events = useMemo(() => (value?.events ?? []).filter((e) => scope === "all" || e.player_id === myPlayerId), [value, scope, myPlayerId]);
  const name = (id: number | null) => (id == null ? "Unknown player" : id === myPlayerId ? "You" : `Player ${id}`);

  if (!metric || metric.status === "not_computed" || !value || !counts) return null;
  const total = ERROR_KINDS.reduce((sum, k) => sum + counts[k], 0);

  return (
    <section aria-label="Errors from the video">
      <Card>
        <h3 className="text-lg font-bold" style={{ color: INK }}>Errors from the video</h3>
        {mineKnown && <div role="group" aria-label="Count errors for" className="mt-3 grid grid-cols-2 gap-1 rounded-full p-1" style={{ background: SURFACE_2 }}>
          {([["me", "You"], ["all", "Everyone"]] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={who === v}
            onClick={() => setWho(v)} className={`min-h-[44px] rounded-full text-sm font-bold ${pressable}`}
            style={who === v ? { background: ACCENT_SOFT, color: INK } : { color: INK_2 }}>{label}</button>)}
        </div>}
        {GROUPS.map((g) => <div key={g.title} className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: INK_3 }}>{g.title}</p>
          <dl className="mt-1.5 grid grid-cols-3 gap-2">
            {g.kinds.map((k) => <div key={k} className="rounded-[14px] p-2.5" style={{ background: SURFACE_2 }} title={value.definitions[k]}>
              <dt className="text-xs leading-tight" style={{ color: INK_3 }}>{ERROR_LABELS[k]}</dt>
              <dd className="mt-1 text-[28px] leading-none" style={{ ...numStyle, color: counts[k] ? WARN : INK }}>{counts[k]}</dd>
            </div>)}
          </dl>
        </div>)}
        {total === 0
          ? <p className="mt-4 text-sm" style={{ color: ACCENT_INK }}>No errors found{scope === "me" ? " for you" : ""} in the parts of the video the analysis could follow.</p>
          : <details className="mt-4">
              <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-bold" style={{ color: ACCENT_INK }}>
                Watch each error ({events.length})</summary>
              <ul className="mt-1" aria-label="Errors">
                {events.map((e, i) => <li key={`${e.time_seconds}-${i}`} className="flex items-center gap-3 border-t py-2 text-sm" style={{ borderColor: LINE }}>
                  <span className="w-11 shrink-0 tabular-nums" style={{ color: INK_3 }}>{clock(e.time_seconds)}</span>
                  <span className="min-w-0 flex-1"><b style={{ color: INK }}>{ERROR_LABELS[e.kind]}</b>
                    <span className="block text-xs" style={{ color: INK_2 }}>{name(e.player_id)} · {e.detail}</span></span>
                  {onWatch && <button type="button" onClick={() => onWatch(e.time_seconds)} aria-label={`Watch ${ERROR_LABELS[e.kind].toLowerCase()} at ${clock(e.time_seconds)}`}
                    className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-3 text-sm font-bold ${pressable}`}
                    style={{ color: ACCENT_INK }}><Play size={14} aria-hidden="true" /> Watch</button>}
                </li>)}
              </ul>
            </details>}
      </Card>
    </section>
  );
}

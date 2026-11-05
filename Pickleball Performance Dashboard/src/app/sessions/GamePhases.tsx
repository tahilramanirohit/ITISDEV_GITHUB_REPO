import { Check } from "lucide-react";
import type { Checkin } from "../../lib/api/capture";
import { ACCENT_INK, ACTION, BORDER, CHECK, INK, INK_2, INK_3, ON_ACTION, SURFACE, SURFACE_2 } from "../theme";
import { pressable } from "../shell/primitives";

export type Phase = "pre" | "in" | "post";

const PHASES: { id: Phase; label: string; hint: string }[] = [
  { id: "pre", label: "Pre-game", hint: "Sleep, readiness, warm-up" },
  { id: "in", label: "In-game", hint: "Result and ratings" },
  { id: "post", label: "Post-game", hint: "Recovery and reflection" },
];

/**
 * A session's three parts in playing order. Each one opens the matching tab
 * (Journal for pre- and post-game, Rate & plan for in-game).
 */
export function GamePhases({ current, done, onOpen }: {
  current: Phase | null; done: Record<Phase, boolean>; onOpen: (phase: Phase) => void;
}) {
  return (
    <nav aria-label="Session steps">
      <ol className="grid grid-cols-3 gap-1.5">
        {PHASES.map((p) => {
          const active = current === p.id;
          const status = done[p.id] ? "Done" : active ? "Now" : "To do";
          return <li key={p.id}>
            <button type="button" onClick={() => onOpen(p.id)} aria-current={active ? "step" : undefined}
              aria-label={`${p.label}: ${status}. ${p.hint}`}
              className={`flex min-h-[56px] w-full flex-col items-start justify-center rounded-[14px] px-2.5 py-2 text-left ${pressable}`}
              style={active ? { background: ACTION, color: ON_ACTION } : done[p.id] ? { background: SURFACE_2, color: INK } : { background: SURFACE, color: INK_2, border: `1px solid ${BORDER}` }}>
              <span className="flex items-center gap-1 text-[11px] font-extrabold" style={{ color: active ? ON_ACTION : done[p.id] ? CHECK : INK_3 }}>
                {done[p.id] && <Check size={12} strokeWidth={3} aria-hidden="true" />}{status}
              </span>
              <span className="text-sm font-extrabold">{p.label}</span>
            </button>
          </li>;
        })}
      </ol>
    </nav>
  );
}

/** One line with the pre-game check-in, shown above the in-game ratings. */
export function PreGameSummary({ checkin, onOpen }: { checkin: Checkin | null; onOpen: () => void }) {
  const parts = checkin ? [
    checkin.sleep_hours != null ? `slept ${Number(checkin.sleep_hours)} h` : null,
    checkin.readiness != null ? `readiness ${checkin.readiness}` : null,
    checkin.warmup_done == null ? null : checkin.warmup_done ? "warmed up" : "no warm-up",
  ].filter(Boolean) : [];
  return (
    <button type="button" onClick={onOpen}
      className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-left text-[13px] ${pressable}`}
      style={{ background: SURFACE_2, color: INK_2 }}>
      <span>
        <b style={{ color: INK }}>Pre-game:</b>{" "}
        {checkin ? <>{parts.length ? parts.join(" · ") : "check-in saved"}
          {checkin.timing_status === "pre_game" && <span style={{ color: ACCENT_INK }}> · logged before play</span>}</>
          : "add sleep, readiness and warm-up before you play"}
      </span>
      <span className="shrink-0 font-extrabold" style={{ color: ACCENT_INK }}>{checkin ? "Edit" : "Add"}</span>
    </button>
  );
}

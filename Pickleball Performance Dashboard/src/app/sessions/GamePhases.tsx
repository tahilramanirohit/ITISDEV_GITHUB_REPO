import { Check } from "lucide-react";
import { ACCENT_INK, ACTION, BORDER, CHECK, INK_2, ON_ACTION, SURFACE, SURFACE_2 } from "../theme";
import { pressable } from "../shell/primitives";
import { ChecklistBar } from "../shell/ChecklistBar";

export type Phase = "pre" | "in" | "post";

const PHASES: { id: Phase; label: string; hint: string }[] = [
  { id: "pre", label: "Pre-game", hint: "Sleep, readiness, warm-up" },
  { id: "in", label: "In-game", hint: "Result and ratings" },
  { id: "post", label: "Post-game", hint: "Recovery and reflection" },
];

const NEXT: Record<Phase, string> = { pre: "Pre-game check-in", in: "Rate your game", post: "Post-game recovery" };

/**
 * A session's three parts in playing order, as one checklist with a progress bar
 * (professor's notes, 22 Nov). Each step opens the matching tab (Journal for pre- and
 * post-game, Rate & plan for in-game); "Next" opens the first one not done yet.
 */
export function GamePhases({ current, done, onOpen }: {
  current: Phase | null; done: Record<Phase, boolean>; onOpen: (phase: Phase) => void;
}) {
  const count = PHASES.filter((p) => done[p.id]).length;
  const next = PHASES.find((p) => !done[p.id]) ?? null;
  return (
    <nav aria-label="Session steps" className="rounded-[18px] p-3" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <ChecklistBar size="lg" label="Game checklist" done={count} total={PHASES.length} />
      <ol className="mt-3 grid grid-cols-3 gap-1.5">
        {PHASES.map((p) => {
          const active = current === p.id;
          const status = done[p.id] ? "Done" : active ? "Now" : "To do";
          return <li key={p.id}>
            <button type="button" onClick={() => onOpen(p.id)} aria-current={active ? "step" : undefined}
              aria-label={`${p.label}: ${status}. ${p.hint}`}
              className={`flex min-h-[40px] w-full items-center justify-center gap-1 rounded-full px-2 text-[13px] font-bold ${pressable}`}
              style={done[p.id] ? { background: SURFACE_2, color: CHECK, outline: active ? `2px solid ${ACTION}` : undefined }
                : active ? { background: ACTION, color: ON_ACTION } : { color: INK_2, border: `1px solid ${BORDER}` }}>
              {done[p.id] && <Check size={14} strokeWidth={3} aria-hidden="true" />}{p.label}
            </button>
          </li>;
        })}
      </ol>
      {next ? <button type="button" onClick={() => onOpen(next.id)} className={`mt-2 min-h-[40px] text-sm font-extrabold ${pressable}`} style={{ color: ACCENT_INK }}>
          Next: {NEXT[next.id]} →</button>
        : <p className="mt-2 text-sm font-extrabold" style={{ color: CHECK }}>All done. Nice game!</p>}
    </nav>
  );
}

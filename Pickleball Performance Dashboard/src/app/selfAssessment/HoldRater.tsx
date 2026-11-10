import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ACTION, INK, INK_2, INK_3, LINE } from "../theme";
import { numStyle } from "../shell/primitives";

const STEP_MS = 320;   // one step while holding
const TAP_MS = 220;    // a shorter press is a tap: one step up

/** A pickleball: yellow with holes. `fill` 0-1 lights the ring around it. */
function Ball({ fill, pressed }: { fill: number; pressed: boolean }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true"
      className="transition-transform duration-100 motion-reduce:transition-none" style={{ transform: pressed ? "scale(0.94)" : "scale(1)" }}>
      <circle cx="52" cy="52" r={r} fill="none" stroke={LINE} strokeWidth="6" />
      {fill > 0 && <circle cx="52" cy="52" r={r} fill="none" stroke={ACTION} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * fill} ${c}`} transform="rotate(-90 52 52)" style={{ transition: "stroke-dasharray 160ms ease-out" }} />}
      <circle cx="52" cy="52" r="38" fill="#f6d33c" stroke="#c9a400" strokeWidth="1.5" />
      {[[52, 28], [36, 38], [68, 38], [30, 56], [52, 50], [74, 56], [40, 72], [64, 72], [52, 82]].map(([x, y]) =>
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.6" fill="#c9a400" opacity="0.85" />)}
      <ellipse cx="40" cy="30" rx="10" ry="5" fill="#fff" opacity="0.35" transform="rotate(-25 40 30)" />
    </svg>
  );
}

/**
 * Press and hold the pickleball to rate: the ring fills one step at a time while you hold,
 * and letting go keeps the value. A quick tap moves one step up. Arrow keys work too
 * (it is a slider for screen readers).
 */
export function HoldRater({ label, min, max, value, onChange, valueText, hint }: {
  label: string; min: number; max: number; value: number | undefined;
  onChange: (v: number) => void;
  /** What the current value means, read aloud and shown beside the number. */
  valueText: (v: number) => string;
  hint?: string;
}) {
  const [live, setLive] = useState<number | undefined>(value);
  const [pressed, setPressed] = useState(false);
  const timer = useRef<number | null>(null);
  const started = useRef(0);
  const current = useRef<number | undefined>(value);
  useEffect(() => { if (!pressed) { setLive(value); current.current = value; } }, [value, pressed]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const set = (v: number) => { current.current = v; setLive(v); };
  const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

  function down(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPressed(true);
    started.current = Date.now();
    // Holding starts from the bottom and climbs, like charging a shot.
    timer.current = window.setInterval(() => {
      const next = Math.min(max, (current.current === undefined || Date.now() - started.current <= STEP_MS * 1.5 ? min : current.current + 1));
      if (next !== current.current) { set(next); buzz(); }
    }, STEP_MS);
  }
  function up() {
    if (!pressed) return;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setPressed(false);
    if (Date.now() - started.current < TAP_MS) {
      // A tap: one step up from the saved value (back to the bottom after the top).
      const next = value === undefined || value >= max ? min : value + 1;
      set(next);
      onChange(next);
      return;
    }
    if (current.current !== undefined) onChange(current.current);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    const base = value ?? min - 1;
    const next = e.key === "ArrowUp" || e.key === "ArrowRight" ? Math.min(max, base + 1)
      : e.key === "ArrowDown" || e.key === "ArrowLeft" ? Math.max(min, base - 1)
      : e.key === "Home" ? min : e.key === "End" ? max : null;
    if (next === null) return;
    e.preventDefault();
    set(next);
    onChange(next);
  }

  const shown = live;
  const fill = shown === undefined ? 0 : (shown - min + (min === 0 ? 0 : 1)) / (max - min + (min === 0 ? 0 : 1));
  return (
    <div className="flex items-center gap-4">
      <button type="button" role="slider" aria-label={label} aria-valuemin={min} aria-valuemax={max}
        aria-valuenow={shown ?? undefined} aria-valuetext={shown === undefined ? "Not rated" : valueText(shown)}
        onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onKeyDown={key}
        onContextMenu={(e) => e.preventDefault()}
        className="shrink-0 touch-none select-none rounded-full outline-offset-4" style={{ WebkitTouchCallout: "none" }}>
        <Ball fill={Math.max(0, Math.min(1, fill))} pressed={pressed} />
      </button>
      <div className="min-w-0" aria-hidden="true">
        <p className="leading-none" style={{ ...numStyle, fontSize: 44, color: shown === undefined ? INK_3 : INK }}>
          {shown ?? "?"}<span className="text-xl" style={{ color: INK_3 }}>/{max}</span></p>
        <p className="mt-1 text-sm font-semibold" style={{ color: shown === undefined ? INK_3 : INK_2 }}>
          {shown === undefined ? hint ?? "Hold the ball, let go to rate" : valueText(shown)}</p>
      </div>
    </div>
  );
}

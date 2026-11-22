import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ACTION, INK, INK_2, INK_3, LINE } from "../theme";
import { numStyle } from "../shell/primitives";

const STEP_MS = 320;   // one step while holding
const TAP_MS = 220;    // a shorter press is a tap: one step up

/** A pickleball: yellow with holes. `fill` 0-1 lights the ring around it. */
export function Ball({ fill, pressed }: { fill: number; pressed: boolean }) {
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

const COUNT_HOLD_MS = 350; // a press shorter than this is a tap: one more

/**
 * The same pickleball as a counter, for counted drills (court tests): tap it once for every good
 * one, or hold it to count up from where you are, faster the longer you hold. Arrow keys work too;
 * the ring fills toward the number of tries (or in laps of 10 for a best-run count).
 */
export function HoldCounter({ label, value, max, outOf, onChange }: {
  label: string; value: number; max: number;
  /** Tries the count is out of, or null for a best run. */
  outOf: number | null;
  onChange: (v: number) => void;
}) {
  const [live, setLive] = useState(value);
  const [pressed, setPressed] = useState(false);
  const holding = useRef(false);
  const timer = useRef<number | null>(null);
  const started = useRef(0);
  const steps = useRef(0);
  const current = useRef(value);
  useEffect(() => { if (!holding.current) { setLive(value); current.current = value; } }, [value]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const set = (v: number) => { current.current = v; setLive(v); };
  const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };
  const stop = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };

  function tick() {
    if (current.current < max) { set(current.current + 1); buzz(); }
    steps.current += 1;
    // Speeds up while held, so a long dink run doesn't take a minute.
    timer.current = window.setTimeout(tick, steps.current < 5 ? 260 : steps.current < 15 ? 140 : 70);
  }
  function down(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    holding.current = true;
    setPressed(true);
    started.current = Date.now();
    steps.current = 0;
    timer.current = window.setTimeout(tick, COUNT_HOLD_MS);
  }
  function up() {
    if (!holding.current) return;
    holding.current = false;
    stop();
    setPressed(false);
    if (Date.now() - started.current < COUNT_HOLD_MS) {
      const next = Math.min(max, value + 1);
      if (next !== value) buzz();
      set(next);
      onChange(next);
      return;
    }
    onChange(current.current);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    const next = e.key === "ArrowUp" || e.key === "ArrowRight" ? value + 1
      : e.key === "ArrowDown" || e.key === "ArrowLeft" ? value - 1
      : e.key === "PageUp" ? value + 5 : e.key === "PageDown" ? value - 5
      : e.key === "Home" ? 0 : e.key === "End" ? max : null;
    if (next === null) return;
    e.preventDefault();
    const v = Math.min(max, Math.max(0, next));
    set(v);
    onChange(v);
  }

  const fill = outOf ? live / outOf : live === 0 ? 0 : (((live - 1) % 10) + 1) / 10;
  return (
    <button type="button" role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={live}
      aria-valuetext={outOf ? `${live} of ${outOf}` : String(live)}
      onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onKeyDown={key}
      onContextMenu={(e) => e.preventDefault()}
      className="shrink-0 touch-none select-none rounded-full outline-offset-4" style={{ WebkitTouchCallout: "none" }}>
      <Ball fill={Math.max(0, Math.min(1, fill))} pressed={pressed} />
    </button>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import {
  COURT_TESTS, formatResult, latestResults, maxValue, type CourtTest, type CourtTestKey, type CourtTestRow,
} from "../../lib/coaching/baselineTests";
import { SKILL_INFO } from "../../lib/coaching/selfAssessment";
import { courtTestErrorText, listCourtTests, saveCourtTests } from "../../lib/api/courtTests";
import { isoDate } from "../../lib/api/buddy";
import { ACCENT_INK, ACTION, ACTION_EDGE, CHECK, INK, INK_2, INK_3, LINE, LINE_STRONG, ON_ACTION, ON_CHECK, PAGE_BG } from "../theme";
import { Notice, cardStyle, numStyle, pressable } from "../shell/primitives";

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** A big −/+ counter: tap + for every good one while you do the drill, or type the number. */
function Counter({ test, value, onChange }: { test: CourtTest; value: number; onChange: (v: number) => void }) {
  const max = maxValue(test);
  const set = (v: number) => onChange(Math.min(max, Math.max(0, Math.round(v))));
  const button = `grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full ${pressable}`;
  return <div>
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={button} style={{ border: `1px solid ${LINE_STRONG}`, color: INK }} disabled={value <= 0}
        onClick={() => set(value - 1)} aria-label={`One less: ${test.label}`}><Minus size={24} aria-hidden="true" /></button>
      <span className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
        <input type="number" inputMode="numeric" min={0} max={max} value={value} aria-label={`${test.label}: ${test.unit}`}
          onChange={(e) => set(Number(e.target.value || 0))} onFocus={(e) => e.target.select()}
          className="shrink-0 bg-transparent text-center text-[clamp(44px,15vw,64px)] leading-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          style={{ ...numStyle, color: INK, width: `${String(value).length + 0.3}ch` }} />
        {test.outOf && <span className="shrink-0 text-xl" style={{ ...numStyle, color: INK_3 }}>/{test.outOf}</span>}
      </span>
      <button type="button" className={button} style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}
        disabled={value >= max} onClick={() => set(value + 1)} aria-label={`One more: ${test.label}`}><Plus size={24} aria-hidden="true" /></button>
    </div>
    <p className="mt-1 text-center text-xs" style={{ color: INK_3 }}>{test.unit}</p>
  </div>;
}

/**
 * Measured court tests (adviser feedback #5): five counted drills as an
 * objective baseline next to the self-ratings. Each save adds new results, so
 * re-testing keeps the history. One test is open at a time.
 */
export function CourtTests({ sb, onSaved, onSkip, aboveTabBar = false }: {
  sb: SupabaseClient;
  /** Called after a successful save with the number of tests saved. */
  onSaved?: (count: number) => void;
  /** Shown as "Skip for now" (onboarding). */
  onSkip?: () => void;
  /** Lift the save bar above the phone tab bar. */
  aboveTabBar?: boolean;
}) {
  const [history, setHistory] = useState<CourtTestRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState<CourtTestKey | null>(COURT_TESTS[0].key);
  const [values, setValues] = useState<Partial<Record<CourtTestKey, number>>>({});
  const [done, setDone] = useState<CourtTestKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    listCourtTests(sb).then((rows) => { if (active) setHistory(rows); })
      .catch((e) => { if (active) { setHistory([]); setLoadError(courtTestErrorText(e)); } });
    return () => { active = false; };
  }, [sb]);

  const latest = useMemo(() => latestResults(history ?? []), [history]);
  const firstTime = (history ?? []).length === 0;

  function change(key: CourtTestKey, v: number) {
    setValues((all) => ({ ...all, [key]: v }));
    setDone((list) => (list.includes(key) ? list : [...list, key]));
    setSaved(null);
  }

  function finishTest(key: CourtTestKey) {
    const next = done.includes(key) ? done : [...done, key];
    setDone(next);
    setSaved(null);
    setOpen(COURT_TESTS.find((t) => !next.includes(t.key))?.key ?? null);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const results = COURT_TESTS.filter((t) => done.includes(t.key)).map((t) => ({ key: t.key, value: values[t.key] ?? 0 }));
      await saveCourtTests(sb, results, isoDate(new Date()));
      setHistory(await listCourtTests(sb));
      setDone([]);
      setValues({});
      setOpen(COURT_TESTS[0].key);
      setSaved(results.length);
      onSaved?.(results.length);
    } catch (e) {
      setError(courtTestErrorText(e));
    } finally {
      setSaving(false);
    }
  }

  if (history === null) return <p className="text-sm" style={{ color: INK_3 }}>Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed" style={{ color: INK_2 }}>
          Count, don't guess. Do them in any order, with a partner, in about 15 minutes. Save any you finish; skip the rest.</p>
        {onSkip && <button type="button" onClick={onSkip} className={`min-h-[44px] shrink-0 rounded-full px-3 text-sm font-bold ${pressable}`}
          style={{ color: ACCENT_INK }}>Skip for now</button>}
      </div>
      {loadError && <Notice tone="warn">{loadError}</Notice>}
      {saved != null && <Notice>Saved {saved} test{saved === 1 ? "" : "s"}. Your results show on the Progress page.</Notice>}

      <ul className="space-y-2.5" aria-label="Court tests">
        {COURT_TESTS.map((test) => {
          const isOpen = open === test.key;
          const isDone = done.includes(test.key);
          const last = latest.get(test.key);
          const value = values[test.key] ?? 0;
          const status = isDone ? `${formatResult(test, value)} today` : last ? `Last ${formatResult(test, last.value)} · ${shortDate(last.tested_on)}` : "Not done yet";
          return <li key={test.key} className="overflow-hidden rounded-[18px]" style={cardStyle}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : test.key)}
              className={`flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left ${pressable}`}>
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black"
                style={isDone ? { background: CHECK, color: ON_CHECK } : { border: `2px solid ${LINE}`, color: INK_3 }}>
                {isDone ? <Check size={15} strokeWidth={3} /> : COURT_TESTS.indexOf(test) + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold" style={{ color: INK }}>{test.label}</span>
                <span className="block text-xs" style={{ color: isDone ? ACCENT_INK : INK_3, fontWeight: isDone ? 700 : 400 }}>
                  {SKILL_INFO[test.skill].label} · {status}</span>
              </span>
              <ChevronDown size={20} aria-hidden="true" className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                style={{ color: INK_3 }} />
            </button>
            {isOpen && <div className="space-y-4 border-t px-4 pb-4 pt-3" style={{ borderColor: LINE }}>
              <p className="text-sm leading-relaxed" style={{ color: INK }}>{test.how}</p>
              <Counter test={test} value={value} onChange={(v) => change(test.key, v)} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => finishTest(test.key)}
                  className={`min-h-[48px] flex-1 rounded-full px-5 text-[15px] font-extrabold ${pressable}`}
                  style={{ border: `1px solid ${LINE_STRONG}`, color: INK }}>
                  {COURT_TESTS.some((t) => t.key !== test.key && !done.includes(t.key)) ? "Done · next test" : "Done"}</button>
                {isDone && <button type="button" className={`min-h-[48px] rounded-full px-4 text-sm font-bold ${pressable}`} style={{ color: INK_2 }}
                  onClick={() => { setDone(done.filter((k) => k !== test.key)); setValues({ ...values, [test.key]: 0 }); }}>Leave out</button>}
              </div>
            </div>}
          </li>;
        })}
      </ul>

      {error && <Notice tone="error">{error}</Notice>}
      <div className={`sticky z-20 -mx-4 px-4 pb-3 pt-2 desktop:bottom-4 ${aboveTabBar ? "bottom-[calc(68px+env(safe-area-inset-bottom))]" : "bottom-0"}`}
        style={{ background: `linear-gradient(to top, ${PAGE_BG} 70%, transparent)`, paddingBottom: aboveTabBar ? undefined : "max(12px, env(safe-area-inset-bottom))" }}>
        <button type="button" disabled={saving || done.length === 0 || !!loadError} onClick={() => void save()}
          className={`min-h-[52px] w-full rounded-full text-base font-extrabold ${pressable}`}
          style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
          {saving ? "Saving…" : `${firstTime ? "Save baseline" : "Save results"} · ${done.length} of ${COURT_TESTS.length} tests`}</button>
      </div>
      <span className="sr-only" aria-live="polite">{done.length} of {COURT_TESTS.length} tests done</span>
    </div>
  );
}

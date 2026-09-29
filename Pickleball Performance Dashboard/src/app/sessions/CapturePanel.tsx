import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "../../lib/api/types";
import { loadCapture, saveCheckin, saveRecovery, saveReflection, type Capture } from "../../lib/api/capture";
import { BLUE_SKY, BORDER, WHITE_DIM } from "../theme";
import { Card, Notice, fieldStyle, labelClass, labelStyle } from "../shell/primitives";

function localDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const optionalNumber = (v: string) => v === "" ? null : Number(v);
const optionalBoolean = (v: string) => v === "" ? null : v === "yes";
const booleanValue = (v: boolean | null) => v === null ? "" : v ? "yes" : "no";

export function CapturePanel({ sb, session, onSessionUpdated }: {
  sb: SupabaseClient; session: SessionRow; onSessionUpdated: () => void;
}) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actualStart, setActualStart] = useState(localDateTime(session.actual_start_at));
  const [warmup, setWarmup] = useState("");
  const [sleep, setSleep] = useState("");
  const [readiness, setReadiness] = useState("");
  const [focus, setFocus] = useState("");
  const [exertion, setExertion] = useState("");
  const [soreness, setSoreness] = useState("");
  const [cooldown, setCooldown] = useState("");
  const [wentWell, setWentWell] = useState("");
  const [changeNext, setChangeNext] = useState("");

  const reload = useCallback(async () => {
    const data = await loadCapture(sb, session.id);
    setCapture(data);
    setWarmup(booleanValue(data.checkin?.warmup_done ?? null));
    setSleep(data.checkin?.sleep_hours?.toString() ?? "");
    setReadiness(data.checkin?.readiness?.toString() ?? "");
    setFocus(data.checkin?.focus ?? "");
    setExertion(data.recovery?.exertion?.toString() ?? "");
    setSoreness(data.recovery?.soreness?.toString() ?? "");
    setCooldown(booleanValue(data.recovery?.cooldown_done ?? null));
    setWentWell(data.reflection?.went_well ?? "");
    setChangeNext(data.reflection?.change_next ?? "");
  }, [sb, session.id]);

  useEffect(() => { void reload().catch((err) => setError(err.message)); }, [reload]);
  useEffect(() => setActualStart(localDateTime(session.actual_start_at)), [session.actual_start_at]);

  async function save(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    try { await action(); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  }

  const select = (id: string, label: string, current: string, change: (v: string) => void,
    values: [string, string][]) => <div>
      <label className={labelClass} style={labelStyle} htmlFor={id}>{label}</label>
      <select id={id} value={current} onChange={(e) => change(e.target.value)} className="w-full rounded-xl px-3 py-2" style={fieldStyle}>
        <option value="">Not recorded</option>
        {values.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
      </select>
    </div>;

  return <section aria-label="Private session context" className="space-y-4">
    <Card accent={BLUE_SKY}>
      <h2 className="text-xl font-bold">Before play · private check-in</h2>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>These entries are context for your report. They are not medical scores and are not shared with a partner.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="actual-start">Actual start of play</label>
          <input id="actual-start" type="datetime-local" value={actualStart} onChange={(e) => setActualStart(e.target.value)}
            className="w-full rounded-xl px-3 py-2" style={fieldStyle} />
          <button type="button" disabled={saving} className="mt-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ border: `1px solid ${BORDER}` }} onClick={() => void save(async () => {
              const { error } = await sb.from("sessions").update({ actual_start_at: actualStart ? new Date(actualStart).toISOString() : null })
                .eq("id", session.id);
              if (error) throw error;
              onSessionUpdated();
            })}>Save start time</button>
        </div>
        {select("warmup", "Warm-up completed", warmup, setWarmup, [["yes", "Yes"], ["no", "No"]])}
        <div><label className={labelClass} style={labelStyle} htmlFor="sleep">Sleep hours</label>
          <input id="sleep" type="number" min="0" max="24" step="0.5" value={sleep} onChange={(e) => setSleep(e.target.value)}
            className="w-full rounded-xl px-3 py-2" style={fieldStyle} /></div>
        {select("readiness", "Readiness (1–5)", readiness, setReadiness,
          [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]))}
        <div className="sm:col-span-2"><label className={labelClass} style={labelStyle} htmlFor="focus">Session focus</label>
          <input id="focus" maxLength={500} value={focus} onChange={(e) => setFocus(e.target.value)}
            className="w-full rounded-xl px-3 py-2" style={fieldStyle} /></div>
      </div>
      <p className="mt-3 text-sm" style={{ color: WHITE_DIM }}>Timing: {capture?.checkin?.timing_status === "pre_game" ? "recorded before play" :
        capture?.checkin?.timing_status === "retrospective" ? "retrospective entry" : "unverified until actual start is entered"}.
        {capture?.checkin && ` Captured ${new Date(capture.checkin.captured_at).toLocaleString()}.`}</p>
      <button type="button" disabled={saving || !capture} className="mt-3 rounded-xl px-4 py-2 font-semibold disabled:opacity-50"
        style={{ background: BLUE_SKY, color: "white" }} onClick={() => void save(() => saveCheckin(sb, capture!.participantId, {
          warmup_done: optionalBoolean(warmup), sleep_hours: optionalNumber(sleep),
          readiness: optionalNumber(readiness), focus: focus.trim() || null,
        }))}>Save check-in</button>
    </Card>

    <Card>
      <h2 className="text-xl font-bold">After play · private context and reflection</h2>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Skipping any entry leaves it missing. Recovery is context only; it does not diagnose health or injury.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {select("exertion", "Exertion (1–10)", exertion, setExertion,
          Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]))}
        {select("soreness", "Soreness (1–5)", soreness, setSoreness,
          [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]))}
        {select("cooldown", "Cooldown completed", cooldown, setCooldown, [["yes", "Yes"], ["no", "No"]])}
      </div>
      <button type="button" disabled={saving || !capture} className="mt-3 rounded-xl px-4 py-2 font-semibold disabled:opacity-50"
        style={{ border: `1px solid ${BORDER}` }} onClick={() => void save(() => saveRecovery(sb, capture!.participantId, {
          exertion: optionalNumber(exertion), soreness: optionalNumber(soreness), cooldown_done: optionalBoolean(cooldown),
        }))}>Save recovery</button>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div><label className={labelClass} style={labelStyle} htmlFor="went-well">What went well?</label>
          <textarea id="went-well" rows={3} maxLength={2000} value={wentWell} onChange={(e) => setWentWell(e.target.value)}
            className="w-full rounded-xl px-3 py-2" style={fieldStyle} /></div>
        <div><label className={labelClass} style={labelStyle} htmlFor="change-next">What will you change next?</label>
          <textarea id="change-next" rows={3} maxLength={2000} value={changeNext} onChange={(e) => setChangeNext(e.target.value)}
            className="w-full rounded-xl px-3 py-2" style={fieldStyle} /></div>
      </div>
      <button type="button" disabled={saving || !capture} className="mt-3 rounded-xl px-4 py-2 font-semibold disabled:opacity-50"
        style={{ border: `1px solid ${BORDER}` }} onClick={() => void save(() => saveReflection(sb, capture!.participantId, {
          went_well: wentWell.trim() || null, change_next: changeNext.trim() || null,
        }))}>Save reflection</button>
    </Card>
    {error && <Notice tone="error">Private capture is unavailable: {error}</Notice>}
  </section>;
}

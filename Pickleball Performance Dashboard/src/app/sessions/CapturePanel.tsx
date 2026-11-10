import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Clock, Minus, Plus } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "../../lib/api/types";
import { loadCapture, saveCheckin, saveRecovery, saveReflection, type Capture } from "../../lib/api/capture";
import { endInjury, injuryErrorText, startInjury } from "../../lib/api/injury";
import { INJURY_AREAS, INJURY_AREA_LABELS, INJURY_DISCLAIMER, type InjuryArea, type InjuryPeriod } from "../../lib/coaching/injury";
import { BORDER, GREEN, INK, PICKLE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Chip, Notice, PrimaryButton, fieldStyle, labelClass, labelStyle, numStyle } from "../shell/primitives";
import { HoldRater } from "../selfAssessment/HoldRater";

const READINESS = ["Drained", "Tired", "Okay", "Good", "Ready to go"];
const SORENESS = ["None", "A little", "Some", "Sore", "Very sore"];
const effortText = (n: number) => n <= 2 ? "Very easy" : n <= 4 ? "Easy" : n <= 6 ? "Moderate" : n <= 8 ? "Hard" : "All out";
const toNumber = (v: string) => v === "" ? undefined : Number(v);

/** One question, in the same card as the rating questions. */
function Question({ title, hint, htmlFor, children, wide = false }: { title: string; hint?: string; htmlFor?: string; children: ReactNode; wide?: boolean }) {
  return <Card className={`min-w-0 !p-4 ${wide ? "sm:col-span-2" : ""}`}>
    {htmlFor ? <label htmlFor={htmlFor} className="block text-base font-bold" style={{ color: INK }}>{title}</label>
      : <h4 className="text-base font-bold" style={{ color: INK }}>{title}</h4>}
    {hint && <p className="text-sm" style={{ color: WHITE_DIM }}>{hint}</p>}
    <div className="mt-3">{children}</div>
  </Card>;
}

/** Yes / No chips; tapping the chosen one again clears it. */
function YesNo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className="flex gap-2" role="group" aria-label={label}>
    {[["yes", "Yes"], ["no", "No"]].map(([v, name]) => <Chip key={v} selected={value === v} onClick={() => onChange(value === v ? "" : v)}>{name}</Chip>)}
  </div>;
}

function localDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const optionalNumber = (v: string) => v === "" ? null : Number(v);
const optionalBoolean = (v: string) => v === "" ? null : v === "yes";
const booleanValue = (v: boolean | null) => v === null ? "" : v ? "yes" : "no";

export type CaptureStep = 0 | 1 | 2;

/**
 * The private pre-game check-in, post-game recovery and reflection.
 * `step` opens a given part (from the session's Pre-game / Post-game strip);
 * `onStepChange` and `onSaved` keep that strip in sync.
 * `injury` is the open injury (null when not injured, undefined while unknown): the post-game
 * step can mark "I'm injured", which pauses goals and hides the player from Buddy.
 */
export function CapturePanel({ sb, session, onSessionUpdated, step: requestedStep, onStepChange, onSaved, injury, onInjuryChanged }: {
  sb: SupabaseClient; session: SessionRow; onSessionUpdated: () => void;
  step?: CaptureStep; onStepChange?: (step: CaptureStep) => void; onSaved?: () => void;
  injury?: InjuryPeriod | null; onInjuryChanged?: () => void;
}) {
  const [step, setStepState] = useState<number>(requestedStep ?? 0);
  const setStep = (next: number) => { setStepState(next); onStepChange?.(next as CaptureStep); };
  const [capture, setCapture] = useState<Capture | null>(null);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
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
  const [injured, setInjured] = useState(false);
  const [injuryArea, setInjuryArea] = useState<InjuryArea | "">("");
  const [injuryNote, setInjuryNote] = useState("");
  useEffect(() => {
    setInjured(!!injury);
    setInjuryArea(injury?.body_area ?? "");
    setInjuryNote(injury?.note ?? "");
  }, [injury]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new session starts at the requested step, else the first
  useEffect(() => { setStepState(requestedStep ?? 0); setError(""); setSavedMessage(""); }, [session.id]);
  useEffect(() => { if (requestedStep != null) setStepState(requestedStep); }, [requestedStep]);

  async function save(action: () => Promise<void>, nextStep?: number) {
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      await action();
      setCapture(await loadCapture(sb, session.id));
      onSaved?.();
      if (nextStep !== undefined) setStep(nextStep);
      else setSavedMessage("Saved. You can open any step to change your answers.");
    }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  }

  async function saveCurrentStep() {
    if (!capture) return;
    if (step === 0) {
      await save(async () => {
        if (actualStart !== localDateTime(session.actual_start_at)) {
          const { error } = await sb.from("sessions").update({ actual_start_at: actualStart ? new Date(actualStart).toISOString() : null })
            .eq("id", session.id);
          if (error) throw error;
          onSessionUpdated();
        }
        await saveCheckin(sb, capture.participantId, {
          warmup_done: optionalBoolean(warmup), sleep_hours: optionalNumber(sleep),
          readiness: optionalNumber(readiness), focus: focus.trim() || null,
        });
      }, 1);
    } else if (step === 1) {
      await save(async () => {
        await saveRecovery(sb, capture.participantId, {
          exertion: optionalNumber(exertion), soreness: optionalNumber(soreness), cooldown_done: optionalBoolean(cooldown),
        });
        if (injury === undefined) return;
        const area = injuryArea || null;
        const note = injuryNote.trim() || null;
        try {
          if (injured && (!injury || injury.body_area !== area || (injury.note ?? null) !== note)) await startInjury(sb, area, note);
          else if (!injured && injury) await endInjury(sb);
          else return;
        } catch (e) {
          throw new Error(injuryErrorText(e));
        }
        onInjuryChanged?.();
      }, 2);
    } else {
      await save(() => saveReflection(sb, capture.participantId, {
        went_well: wentWell.trim() || null, change_next: changeNext.trim() || null,
      }));
    }
  }

  const stepNames = ["Pre-game", "Post-game", "Reflection"];
  const sleepHours = sleep === "" ? null : Number(sleep);
  const setSleepHours = (h: number | null) => setSleep(h === null ? "" : String(h));
  const stepButton = "flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30";

  return <section aria-label="Pre-game and post-game journal">
    <Card className="!p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-extrabold tracking-tight" style={{ color: INK }}>Journal</h2>
        <span className="text-xs font-bold" style={{ color: WHITE_SUB }}>Private · every question optional</span>
      </div>
      <nav aria-label="Questionnaire progress" className="mt-2 flex gap-5 overflow-x-auto border-b" style={{ borderColor: BORDER }}>
        {stepNames.map((name, index) => <button key={name} type="button" aria-current={step === index ? "step" : undefined}
          onClick={() => { setError(""); setSavedMessage(""); setStep(index); }}
          className="-mb-px min-h-[40px] shrink-0 border-b-[3px] py-2 text-sm font-semibold"
          style={step === index ? { color: INK, borderColor: PICKLE } : { color: index < step ? GREEN : WHITE_DIM, borderColor: "transparent" }}>{name}</button>)}
      </nav>
    </Card>

    <div className="mt-4">
      {step === 0 && <>
        <h3 className="text-lg font-extrabold" style={{ color: INK }}>Pre-game check-in</h3>
        <p className="text-sm" style={{ color: WHITE_DIM }}>A quick check before you play. It shapes your plan, nothing else.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Question title="How ready do you feel?">
            <HoldRater label="Readiness, 1 lowest to 5 highest" min={1} max={5} value={toNumber(readiness)}
              onChange={(n) => setReadiness(String(n))} valueText={(n) => READINESS[n - 1]} />
          </Question>
          <Question title="Sleep last night">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Less sleep" disabled={sleepHours === null} className={stepButton} style={{ border: `1px solid ${BORDER}` }}
                onClick={() => setSleepHours(sleepHours !== null && sleepHours > 0 ? sleepHours - 0.5 : null)}><Minus size={16} /></button>
              <span className="min-w-[4.5rem] text-center text-3xl" style={numStyle} aria-live="polite">{sleepHours ?? "–"}<span className="text-base"> h</span></span>
              <button type="button" aria-label="More sleep" disabled={(sleepHours ?? 0) >= 24} className={stepButton} style={{ border: `1px solid ${BORDER}` }}
                onClick={() => setSleepHours(sleepHours === null ? 7 : sleepHours + 0.5)}><Plus size={16} /></button>
            </div>
          </Question>
          <Question title="Warmed up?">
            <YesNo label="Warmed up" value={warmup} onChange={setWarmup} />
          </Question>
          <Question title="When did play start?" htmlFor="actual-start">
            <div className="flex gap-2">
              <input id="actual-start" type="datetime-local" value={actualStart} onChange={(e) => setActualStart(e.target.value)}
                className="min-w-0 flex-1 rounded-xl px-3 py-2" style={fieldStyle} />
              <button type="button" onClick={() => setActualStart(localDateTime(new Date().toISOString()))}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold" style={{ border: `1px solid ${BORDER}`, color: INK }}>
                <Clock size={15} aria-hidden="true" /> Now</button>
            </div>
          </Question>
          <Question title="Focus for today" htmlFor="focus" wide>
            <input id="focus" maxLength={500} value={focus} onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. Get to the kitchen line after the return" className="w-full rounded-xl px-3 py-2" style={fieldStyle} />
          </Question>
        </div>
      </>}
      {step === 1 && <>
        <h3 className="text-lg font-extrabold" style={{ color: INK }}>Post-game recovery</h3>
        <p className="text-sm" style={{ color: WHITE_DIM }}>A hard or sore game makes your next practice lighter.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Question title="How hard was it?">
            <HoldRater label="Effort, 1 lowest to 10 highest" min={1} max={10} value={toNumber(exertion)}
              onChange={(n) => setExertion(String(n))} valueText={effortText} />
          </Question>
          <Question title="How sore are you?">
            <HoldRater label="Soreness, 1 lowest to 5 highest" min={1} max={5} value={toNumber(soreness)}
              onChange={(n) => setSoreness(String(n))} valueText={(n) => SORENESS[n - 1]} />
          </Question>
          <Question title="Cooled down?">
            <YesNo label="Cooled down" value={cooldown} onChange={setCooldown} />
          </Question>
          {injury !== undefined && <Card className="min-w-0 !p-4">
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
              <input type="checkbox" checked={injured} onChange={(e) => setInjured(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
              <span><b className="text-base" style={{ color: INK }}>I'm injured right now</b>
                <span className="block text-sm" style={{ color: WHITE_DIM }}>
                  {injury && !injured ? "Unticking this ends recovery mode when you save, as if you tapped \"I'm back\"."
                    : "Your plan switches to rest and your goals pause until you tap \"I'm back\"."}</span></span>
            </label>
            {injured && <>
              <div className="mt-3 grid gap-3">
                <div><label className={labelClass} style={labelStyle} htmlFor="injury-area">Where (optional)</label>
                  <select id="injury-area" value={injuryArea} onChange={(e) => setInjuryArea(e.target.value as InjuryArea | "")}
                    className="w-full rounded-xl px-3 py-2" style={fieldStyle}>
                    <option value="">Not saying</option>
                    {INJURY_AREAS.map((a) => <option key={a} value={a}>{INJURY_AREA_LABELS[a]}</option>)}
                  </select>
                </div>
                <div><label className={labelClass} style={labelStyle} htmlFor="injury-note">Private note (optional)</label>
                  <input id="injury-note" maxLength={500} value={injuryNote} onChange={(e) => setInjuryNote(e.target.value)}
                    placeholder="What happened" className="w-full rounded-xl px-3 py-2" style={fieldStyle} /></div>
              </div>
              <p className="mt-2 text-xs" style={{ color: WHITE_DIM }}>{INJURY_DISCLAIMER}</p>
            </>}
          </Card>}
        </div>
      </>}
      {step === 2 && <>
        <h3 className="text-lg font-extrabold" style={{ color: INK }}>Reflection</h3>
        <p className="text-sm" style={{ color: WHITE_DIM }}>What worked, and one thing to try next time.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Question title="What went well?" htmlFor="went-well">
            <textarea id="went-well" rows={3} maxLength={2000} value={wentWell} onChange={(e) => setWentWell(e.target.value)}
              placeholder="e.g. My third-shot drops landed in the kitchen" className="w-full rounded-xl px-3 py-2" style={fieldStyle} />
          </Question>
          <Question title="What will you change next?" htmlFor="change-next">
            <textarea id="change-next" rows={3} maxLength={2000} value={changeNext} onChange={(e) => setChangeNext(e.target.value)}
              placeholder="e.g. Move up after my return" className="w-full rounded-xl px-3 py-2" style={fieldStyle} />
          </Question>
        </div>
      </>}
    </div>

    {error && <div className="mt-4"><Notice tone="error">Could not load or save your answers: {error}</Notice></div>}
    {savedMessage && <div className="mt-4" role="status"><Notice>{savedMessage}</Notice></div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <PrimaryButton tone="light" disabled={saving || step === 0} className="disabled:opacity-40"
        onClick={() => { setError(""); setSavedMessage(""); setStep(step - 1); }}>Back</PrimaryButton>
      <PrimaryButton disabled={saving || !capture} className="disabled:opacity-50" onClick={() => void saveCurrentStep()}>
        {saving ? "Saving…" : step === 2 ? "Save reflection" : "Save and continue"}</PrimaryButton>
    </div>
  </section>;
}

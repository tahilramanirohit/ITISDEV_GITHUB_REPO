import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HeartPulse } from "lucide-react";
import { endInjury, injuryErrorText, listInjuries } from "../../lib/api/injury";
import {
  INJURY_AREA_LABELS, INJURY_DISCLAIMER, RECOVERY_PLAN, daysInjured, openInjury, type InjuryPeriod,
} from "../../lib/coaching/injury";
import { ACCENT_INK, INK, INK_2, INK_3, LINE, ON_STRONG, STRONG, SURFACE_2 } from "../theme";
import { Notice, cardStyle, pressable } from "../shell/primitives";

/**
 * The player's injury periods ("I'm injured"). A database without the injury update
 * reads as "not injured", so the rest of the app keeps working; `error` says why.
 */
export function useInjury(sb: SupabaseClient) {
  const [periods, setPeriods] = useState<InjuryPeriod[] | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setPeriods(await listInjuries(sb));
      setError("");
    } catch (e) {
      setPeriods([]);
      setError(injuryErrorText(e));
    }
  }, [sb]);
  useEffect(() => { void reload(); }, [reload]);
  const list = periods ?? [];
  return { periods: list, loaded: periods !== null, open: openInjury(list), error, reload };
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Recovery mode: shown while the player is injured. Goals are paused and Buddy
 * hides them; "I'm back" ends it. `showPlan` lists the rest plan.
 */
export function RecoveryCard({ sb, injury, onChanged, showPlan = true }: {
  sb: SupabaseClient; injury: InjuryPeriod; onChanged: () => void; showPlan?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const days = daysInjured(injury);
  const area = injury.body_area ? INJURY_AREA_LABELS[injury.body_area] : null;

  async function back() {
    setBusy(true);
    setError("");
    try {
      await endInjury(sb);
      onChanged();
    } catch (e) {
      setError(injuryErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Recovery mode" className="rounded-[18px] p-4" style={cardStyle}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: SURFACE_2, color: ACCENT_INK }}>
          <HeartPulse size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold" style={{ color: INK }}>Recovery mode</h2>
          <p className="text-xs" style={{ color: INK_3 }}>
            Since {shortDate(injury.started_on)}{area ? ` · ${area}` : ""}{days > 0 ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm" style={{ color: INK_2 }}>
        <li>Your goal deadlines are paused.</li>
        <li>You're hidden from Buddy.</li>
      </ul>
      {showPlan && <ol aria-label="Rest plan" className="mt-3 border-b" style={{ borderColor: LINE }}>
        {RECOVERY_PLAN.map((step) => <li key={step.title} className="grid grid-cols-[92px_1fr] gap-2 border-t py-2 text-sm" style={{ borderColor: LINE }}>
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: INK_3 }}>{step.day}</span>
          <span><b style={{ color: INK }}>{step.title}</b><span className="block text-[13px]" style={{ color: INK_2 }}>{step.detail}</span></span>
        </li>)}
      </ol>}
      <p className="mt-3 text-xs leading-snug" style={{ color: INK_3 }}>{INJURY_DISCLAIMER}</p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <button type="button" disabled={busy} onClick={() => void back()}
        className={`mt-3 flex min-h-[48px] w-full items-center justify-center rounded-full text-sm font-extrabold ${pressable}`}
        style={{ background: STRONG, color: ON_STRONG }}>{busy ? "Saving…" : "I'm back to playing"}</button>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { endInjury, injuryErrorText, listInjuries } from "../../lib/api/injury";
import {
  INJURY_AREA_LABELS, INJURY_DISCLAIMER, RECOVERY_PLAN, daysInjured, openInjury, type InjuryPeriod,
} from "../../lib/coaching/injury";
import { CHECK, INK, INK_2, INK_3, LINE, SURFACE_2 } from "../theme";
import { Notice, cardStyle } from "../shell/primitives";
import { RecoverySwitch } from "./RecoverySwitch";

/**
 * The player's recovery mode periods (stored as injury periods). A database without the
 * update reads as "off", so the rest of the app keeps working; `error` says why.
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
 * Recovery mode while it is on: the switch (turning it off ends it), what is paused,
 * and, with `showPlan`, the recovery plan.
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
    <section aria-label="Recovery mode" className="rounded-[18px] p-1" style={{ ...cardStyle, borderColor: CHECK }}>
      <RecoverySwitch on busy={busy} onChange={() => void back()}
        status={busy ? "Turning off…" : `Since ${shortDate(injury.started_on)}${area ? ` · ${area}` : ""}${days > 0 ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}`} />
      <div className="px-3 pb-3">
        <ul className="mt-2 flex flex-wrap gap-2 text-[13px] font-semibold">
          <li className="rounded-full px-3 py-1.5" style={{ background: SURFACE_2, color: INK_2 }}>Goals paused</li>
          <li className="rounded-full px-3 py-1.5" style={{ background: SURFACE_2, color: INK_2 }}>Hidden from Buddy</li>
        </ul>
        {showPlan && <ol aria-label="Recovery plan" className="mt-3 border-b" style={{ borderColor: LINE }}>
          {RECOVERY_PLAN.map((step) => <li key={step.title} className="grid grid-cols-[92px_1fr] gap-2 border-t py-2 text-sm" style={{ borderColor: LINE }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: INK_3 }}>{step.day}</span>
            <span><b style={{ color: INK }}>{step.title}</b><span className="block text-[13px]" style={{ color: INK_2 }}>{step.detail}</span></span>
          </li>)}
        </ol>}
        <p className="mt-3 text-xs leading-snug" style={{ color: INK_3 }}>{INJURY_DISCLAIMER}</p>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </div>
    </section>
  );
}

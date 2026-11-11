import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HeartPulse } from "lucide-react";
import { injuryErrorText, startInjury } from "../../lib/api/injury";
import { ACTION, CHECK, INK, INK_3, LINE, ON_CHECK, SURFACE, SURFACE_2 } from "../theme";
import { Notice, cardStyle } from "../shell/primitives";

/**
 * The one Recovery mode control, used on Home, Settings, the Journal and the recovery card.
 * A labelled on/off switch; `status` is a short line under the name (e.g. "Since Nov 11"),
 * never an explanation.
 */
export function RecoverySwitch({ on, onChange, busy = false, status }: {
  on: boolean; onChange: (next: boolean) => void; busy?: boolean; status?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label="Recovery mode" disabled={busy} onClick={() => onChange(!on)}
      className="flex min-h-[60px] w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors disabled:opacity-70"
      style={{ background: on ? SURFACE_2 : SURFACE, border: `1px solid ${on ? CHECK : LINE}` }}>
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors"
        style={on ? { background: CHECK, color: ON_CHECK } : { background: SURFACE_2, color: INK }}>
        <HeartPulse size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold" style={{ color: INK }}>Recovery mode</span>
        {status && <span className="block text-[13px]" style={{ color: INK_3 }}>{status}</span>}
      </span>
      <span aria-hidden="true" className="relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors"
        style={{ background: on ? ACTION : LINE }}>
        <span className="absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none"
          style={{ transform: `translateX(${on ? 25 : 3}px)` }} />
      </span>
    </button>
  );
}

/** Recovery mode while it is off: a card with the switch. Turning it on starts it right away. */
export function RecoveryEntry({ sb, onChanged }: { sb: SupabaseClient; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section aria-label="Recovery mode" className="rounded-[18px] p-1" style={cardStyle}>
      <RecoverySwitch on={false} busy={busy} status={busy ? "Turning on…" : undefined} onChange={async () => {
        setBusy(true); setError("");
        try { await startInjury(sb, null, null); onChanged(); } catch (e) { setError(injuryErrorText(e)); } finally { setBusy(false); }
      }} />
      {error && <div className="p-2"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

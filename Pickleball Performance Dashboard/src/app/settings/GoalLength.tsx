import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_GOAL_WEEKS, MAX_GOAL_WEEKS, weeksLabel } from "../../lib/coaching/goals";
import { saveGoalWeeks } from "../../lib/api/profile";
import { INK, WHITE_DIM } from "../theme";
import { Card, Chip, Notice, PrimaryButton, SectionTitle, fieldStyle } from "../shell/primitives";

const QUICK = [1, 2, 4] as const;

/** How long each set of goals runs: 1, 2 or 4 weeks, or any number of weeks up to 52. */
export function GoalLength({ sb, userId, weeks: initial }: { sb: SupabaseClient; userId: string; weeks: number | null }) {
  const [weeks, setWeeks] = useState<number>(initial ?? DEFAULT_GOAL_WEEKS);
  const [other, setOther] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (initial == null) return;
    setWeeks(initial);
    if (!(QUICK as readonly number[]).includes(initial)) { setOther(true); setDraft(String(initial)); }
  }, [initial]);

  async function save(next: number) {
    setBusy(true); setMessage(""); setError("");
    try {
      await saveGoalWeeks(sb, userId, next);
      setWeeks(next);
      setMessage(`Saved. Your goals now run ${weeksLabel(next)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n > MAX_GOAL_WEEKS) return setError(`Enter a whole number of weeks from 1 to ${MAX_GOAL_WEEKS}.`);
    void save(n);
  }

  return <Card>
    <SectionTitle>Goals</SectionTitle>
    <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>How long should each goal run before you re-rate?</p>
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Goal length">
      {QUICK.map((n) => <Chip key={n} selected={!other && weeks === n} onClick={() => { setOther(false); if (n !== weeks || other) void save(n); }}>
        {weeksLabel(n)}</Chip>)}
      <Chip selected={other} onClick={() => { setOther(true); setDraft(String(weeks)); setMessage(""); }}>Other</Chip>
    </div>
    {other && <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm font-bold" style={{ color: INK }}>Weeks
        <input type="number" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)}
          className="w-28 px-3 py-2 text-base font-normal" style={fieldStyle} />
      </label>
      <PrimaryButton type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryButton>
    </form>}
    {message && <p role="status" className="mt-3 text-sm font-semibold" style={{ color: INK }}>{message}</p>}
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
  </Card>;
}

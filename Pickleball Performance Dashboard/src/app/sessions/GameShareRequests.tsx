import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, X } from "lucide-react";
import { respondGameShare, type GameShare } from "../../lib/api/gameShares";
import { ACTION, ACTION_SOFT, INK, INK_2 } from "../theme";
import { Notice, PrimaryButton } from "../shell/primitives";
import { formatSessionDate } from "./sessionUi";
import { announceBuddyChange } from "../buddy/useBuddyBadge";

/**
 * Games buddies named you in, waiting for your answer. Accepting adds the game (with any
 * video and analysis, read-only) to your Sessions; "Always accept from…" skips the question next time.
 */
export function GameShareRequests({ sb, requests, onChanged }: { sb: SupabaseClient; requests: GameShare[]; onChanged: () => void }) {
  const [always, setAlways] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!requests.length) return null;
  async function answer(r: GameShare, accept: boolean) {
    setBusy(r.id); setError("");
    try { await respondGameShare(sb, r.id, accept, accept && always.has(r.owner_id)); onChanged(); announceBuddyChange(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  return (
    <section aria-label="Games shared with you" className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      {requests.map((r) => {
        const owner = r.owner_name?.split(" ")[0] || "A buddy";
        return (
          <div key={r.id} className="rounded-[20px] p-4" style={{ background: ACTION_SOFT, border: "1px solid color-mix(in srgb, var(--pp-action) 35%, var(--pp-line))", color: INK }}>
            <p className="text-base font-bold">{owner} shared a game with you</p>
            <p className="mt-0.5 text-sm" style={{ color: INK_2 }}>
              {r.title} · {formatSessionDate(r.session_date)}{r.has_video ? " · with video" : ""}</p>
            <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5" style={{ accentColor: ACTION }} checked={always.has(r.owner_id)}
                onChange={() => setAlways((s) => { const n = new Set(s); if (n.has(r.owner_id)) n.delete(r.owner_id); else n.add(r.owner_id); return n; })} />
              Always accept games from {owner}
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <PrimaryButton tone="light" disabled={busy === r.id} onClick={() => void answer(r, false)}><X size={18} aria-hidden="true" /> Decline</PrimaryButton>
              <PrimaryButton disabled={busy === r.id} onClick={() => void answer(r, true)}><Check size={18} aria-hidden="true" /> Add game</PrimaryButton>
            </div>
          </div>
        );
      })}
    </section>
  );
}

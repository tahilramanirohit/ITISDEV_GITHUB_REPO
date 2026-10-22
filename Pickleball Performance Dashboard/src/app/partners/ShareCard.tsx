import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Share2 } from "lucide-react";
import { listPartners, listSessionShares, partnerErrorText, setSessionShared, type PartnerLink } from "../../lib/api/partners";
import { GREEN, INK, WHITE_DIM } from "../theme";
import { Card, Chip, Notice, WidgetHeader } from "../shell/primitives";

/** The owner chooses, per partner, whether this session's video report is shared (requirement M02). */
export function ShareCard({ sb, sessionId }: { sb: SupabaseClient; sessionId: string }) {
  const [partners, setPartners] = useState<PartnerLink[] | null>(null);
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [links, ids] = await Promise.all([listPartners(sb), listSessionShares(sb, sessionId)]);
      setPartners(links.filter((l) => l.status === "active" && l.other_id));
      setShared(new Set(ids));
      setError("");
    } catch (e) {
      setPartners([]);
      setError(partnerErrorText(e));
    }
  }, [sb, sessionId]);
  useEffect(() => { void load(); }, [load]);

  async function toggle(partnerId: string, on: boolean) {
    setBusy(partnerId);
    setError("");
    try {
      await setSessionShared(sb, sessionId, partnerId, on);
      await load();
    } catch (e) {
      setError(partnerErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  if (partners === null) return null;
  return (
    <Card>
      <WidgetHeader title="Share with a partner"
        subtitle="Partners you pick see this video report and can leave notes on the video. Your goals, ratings, notes, journal and practice plan stay private. Stop sharing at any time." />
      {error && <div className="mb-3"><Notice tone="warn">{error}</Notice></div>}
      {partners.length === 0 && !error
        ? <p className="text-sm" style={{ color: WHITE_DIM }}>
            <Share2 size={14} aria-hidden="true" className="mr-1 inline" />
            No partners yet. <a href="#/partners" className="font-bold underline" style={{ color: GREEN }}>Link with a partner</a> to share this session.</p>
        : <div className="flex flex-wrap gap-2" role="group" aria-label="Share this session with">
            {partners.map((p) => {
              const on = shared.has(p.other_id!);
              return <Chip key={p.id} selected={on} label={`${on ? "Stop sharing with" : "Share with"} ${p.other_name}`}
                onClick={() => { if (busy !== p.other_id) void toggle(p.other_id!, !on); }}>
                {p.other_name}{on ? " · shared" : ""}</Chip>;
            })}
          </div>}
      {shared.size > 0 && <p className="mt-3 text-sm" style={{ color: INK }}>
        Shared with {shared.size} partner{shared.size === 1 ? "" : "s"}. Tap a name again to stop sharing.</p>}
    </Card>
  );
}

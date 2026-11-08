import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { getSharedGame, hideSharedGame, type SharedGame } from "../../lib/api/gameShares";
import { signedVideoUrl } from "../../lib/api/sessions";
import { CONTEXT_LABELS, FORMAT_LABELS, type SessionRow } from "../../lib/api/types";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { GREEN, INK, INK_2, WHITE_DIM } from "../theme";
import { Notice, PageHero, Sheet, cardStyle } from "../shell/primitives";
import { ResultView } from "../analysis/ResultView";

/**
 * A game a buddy named you in and you added to your Sessions: read-only, with the video
 * and its analysis. The buddy's own ratings, journal and plan are never included.
 */
export default function SharedGamePage({ sb }: { sb: SupabaseClient }) {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<SharedGame | null>(null);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    getSharedGame(sb, sessionId)
      .then((g) => { if (active) { setGame(g); setError(""); } })
      .catch(() => { if (active) setError("This game isn't shared with you, or the share has ended."); });
    return () => { active = false; };
  }, [sb, sessionId]);

  // Links last 5 minutes and are renewed while the page is open.
  const path = game?.video_path ?? null;
  useEffect(() => {
    if (!path) { setVideoUrl(null); return; }
    let active = true;
    const refresh = () => { signedVideoUrl(sb, path).then((u) => { if (active) setVideoUrl(u); }).catch(() => { if (active) setVideoUrl(null); }); };
    refresh();
    const timer = window.setInterval(refresh, 4 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sb, path]);

  const parsed = useMemo(() => {
    if (!game?.result) return null;
    try { return { ok: true as const, result: parseAnalysisResult(game.result) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [game]);

  const back = <a href="#/sessions" className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold" style={{ color: GREEN }}>
    <ArrowLeft size={16} aria-hidden="true" /> Sessions</a>;
  if (error) return <>{back}<Notice tone="warn">{error}</Notice></>;
  if (!game) return <>{back}<p className="text-sm" style={{ color: WHITE_DIM }}>Loading…</p></>;

  const s = game.session;
  const owner = s.owner_name?.split(" ")[0] || "Your buddy";
  const partners = game.players.filter((p) => p.role === "partner").map((p) => p.display_name);
  const opponents = game.players.filter((p) => p.role === "opponent").map((p) => p.display_name);
  const result = s.match_result === "win" ? `${owner}'s side won` : s.match_result === "loss" ? `${owner}'s side lost` : null;
  return <>
    {back}
    <PageHero eyebrow={`Shared by ${owner}`} title={s.title}
      subtitle={`${new Date(`${s.session_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${CONTEXT_LABELS[s.session_context as SessionRow["session_context"]] ?? s.session_context} · ${FORMAT_LABELS[s.play_format as SessionRow["play_format"]] ?? s.play_format}`} />
    <Sheet className="space-y-4">
      {(partners.length > 0 || opponents.length > 0 || s.match_score) && <div className="rounded-[18px] p-4" style={cardStyle}>
        {(partners.length > 0 || opponents.length > 0) && <p className="text-base" style={{ color: INK }}>
          <b>{[owner, ...partners].join(" & ")}</b>{opponents.length > 0 && <> vs <b>{opponents.join(" & ")}</b></>}</p>}
        {(s.match_score || result) && <p className="mt-1 text-sm" style={{ color: INK_2 }}>{[result, s.match_score].filter(Boolean).join(" · ")}</p>}
      </div>}
      <Notice>Shared by {owner}. You see the video and analysis, not {owner}'s ratings or journal. Tap yourself in the video to see your own shots.</Notice>
      {parsed?.ok ? <ResultView result={parsed.result} videoUrl={videoUrl} sharedBy={owner} />
        : <Notice tone={parsed ? "error" : "info"}>{parsed ? `The analysis could not be read (${parsed.error}).`
          : game.video_path ? "The video is still being analyzed. Check back soon." : `${owner} hasn't added a video for this game.`}</Notice>}
      <button type="button" disabled={removing} onClick={() => { setRemoving(true); void hideSharedGame(sb, s.id).then(() => navigate("/sessions")).catch(() => setRemoving(false)); }}
        className="min-h-[44px] w-full rounded-full text-sm font-bold" style={{ border: "1px solid var(--pp-line-strong)", color: INK }}>
        {removing ? "Removing…" : "Remove from my Sessions"}</button>
    </Sheet>
  </>;
}

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { getSharedReport, partnerErrorText, type SharedReport } from "../../lib/api/partners";
import { signedVideoUrl } from "../../lib/api/sessions";
import { CONTEXT_LABELS, FORMAT_LABELS } from "../../lib/api/types";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { GREEN, WHITE_DIM } from "../theme";
import { Notice, PageHero, Sheet } from "../shell/primitives";
import { ResultView } from "../analysis/ResultView";
import { PeerNotes } from "./PeerNotes";

/** A session a partner shared with you: its video report (no goals, plan or audio) and your notes on it. */
export default function SharedReportPage({ sb }: { sb: SupabaseClient; userId: string }) {
  const { sessionId = "" } = useParams();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSharedReport(sb, sessionId)
      .then((r) => { if (active) { setReport(r); setError(""); } })
      .catch((e) => { if (active) setError(partnerErrorText(e)); });
    return () => { active = false; };
  }, [sb, sessionId]);

  // Links last 5 minutes and are renewed while the page is open; once the share ends, renewal fails.
  const path = report?.video_path ?? null;
  useEffect(() => {
    if (!path) { setVideoUrl(null); return; }
    let active = true;
    const refresh = () => {
      signedVideoUrl(sb, path).then((url) => { if (active) setVideoUrl(url); }).catch(() => { if (active) setVideoUrl(null); });
    };
    refresh();
    const timer = window.setInterval(refresh, 4 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sb, path]);

  const parsed = useMemo(() => {
    if (!report?.result) return null;
    try {
      return { ok: true as const, result: parseAnalysisResult(report.result) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [report]);

  const back = <a href="#/partners" className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold" style={{ color: GREEN }}>
    <ArrowLeft size={16} aria-hidden="true" /> Partners</a>;
  if (error) return <>{back}<Notice tone="warn">{error}</Notice></>;
  if (!report) return <>{back}<p className="text-sm" style={{ color: WHITE_DIM }}>Loading…</p></>;

  const s = report.session;
  const owner = s.owner_name;
  const notes = (controls: Parameters<typeof PeerNotes>[0]["controls"]) =>
    <PeerNotes sb={sb} sessionId={s.id} mode="partner" ownerName={owner} controls={controls} />;
  return <>
    {back}
    <PageHero eyebrow={`Shared by ${owner}`} title={s.title}
      subtitle={`${new Date(`${s.session_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${CONTEXT_LABELS[s.session_context]} · ${FORMAT_LABELS[s.play_format]}`} />
    <Sheet className="space-y-4">
      <Notice>{owner} shared this session's video report with you. Their goals, ratings and practice plan stay private.
        Notes you leave are shown to {owner}.</Notice>
      {parsed?.ok ? <ResultView result={parsed.result} videoUrl={videoUrl} sharedBy={owner} notes={notes} />
        : <>
          <Notice tone={parsed ? "error" : "info"}>{parsed ? `The report could not be read (${parsed.error}).`
            : `There is no video report for this session yet. You can still leave ${owner} a note about the whole session.`}</Notice>
          {notes({ video: null, seek: () => undefined })}
        </>}
    </Sheet>
  </>;
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { getSharedReport, partnerErrorText, rateSharedSkill, type SharedReport } from "../../lib/api/partners";
import { SKILL_INFO, type SelfSkill, type SkillRating } from "../../lib/coaching/selfAssessment";
import { aboutPlayer } from "../../lib/coaching/peerFeedback";
import { SkillRater } from "../selfAssessment/SkillRater";
import { signedVideoUrl } from "../../lib/api/sessions";
import { CONTEXT_LABELS, FORMAT_LABELS } from "../../lib/api/types";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { ACTION, ACTION_EDGE, GREEN, INK, INK_2, ON_ACTION, WHITE_DIM } from "../theme";
import { Notice, PageHero, Sheet, cardStyle, pressable } from "../shell/primitives";
import { ResultView } from "../analysis/ResultView";
import { PeerNotes } from "./PeerNotes";
import type { VideoControls } from "../analysis/ResultView";

/** The shared video without a report (the analysis is not done or failed), so comments can still pin to a second. */
function PlainVideo({ src, owner, children }: { src: string; owner: string; children: (controls: VideoControls) => ReactNode }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const seek = (s: number) => {
    if (!video) return;
    video.currentTime = s;
    video.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return <>
    <section aria-label={`${owner}'s video`} className="space-y-2">
      <h2 className="text-lg font-bold" style={{ color: INK }}>Watch {owner}'s video</h2>
      <video ref={setVideo} src={src} controls playsInline preload="metadata" className="w-full rounded-[16px] bg-black" />
    </section>
    {children({ video, seek })}
  </>;
}

/** Rate the skills the owner asked about, then send them in one go. */
function FeedbackForm({ sb, sessionId, owner, skills, saved, onSent }: {
  sb: SupabaseClient; sessionId: string; owner: string; skills: SelfSkill[]; saved: Partial<Record<SelfSkill, number>>; onSent: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Record<SelfSkill, number>>>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const changed = skills.filter((s) => (draft[s] ?? null) !== (saved[s] ?? null));

  async function send() {
    setBusy(true);
    setError("");
    try {
      for (const skill of changed) await rateSharedSkill(sb, sessionId, skill, draft[skill] ?? null);
      setSent(true);
      onSent();
    } catch (e) {
      setError(partnerErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label={`Rate ${owner}`} className="space-y-3">
    {skills.map((skill) => <SkillRater classic key={skill} skill={skill} value={draft[skill] as SkillRating | undefined}
      question={aboutPlayer(SKILL_INFO[skill].question, owner)}
      onChange={(v) => { setDraft({ ...draft, [skill]: v }); setSent(false); }} />)}
    {error && <Notice tone="error">{error}</Notice>}
    {sent && !changed.length && <Notice>Sent. {owner} sees your ratings next to their own.</Notice>}
    <button type="button" disabled={busy || !changed.length} onClick={() => void send()}
      className={`min-h-[52px] w-full rounded-full text-base font-extrabold ${pressable}`}
      style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
      {busy ? "Sending…" : changed.length ? `Send feedback to ${owner}`
        : skills.every((k) => saved[k] != null) ? "Feedback sent" : "Rate a skill to send"}</button>
  </section>;
}

/**
 * A session a partner shared with you: what they asked you to look at, raters for
 * those skills, the video report when it is shared (never goals, plan or audio),
 * and your notes on it.
 */
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

  const back = <a href="#/players?section=shared" className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold" style={{ color: GREEN }}>
    <ArrowLeft size={16} aria-hidden="true" /> Players</a>;
  if (error) return <>{back}<Notice tone="warn">{error}</Notice></>;
  if (!report) return <>{back}<p className="text-sm" style={{ color: WHITE_DIM }}>Loading…</p></>;

  const s = report.session;
  const owner = s.owner_name;
  const skills = report.focus_skills ?? [];
  const withVideo = report.with_video ?? true;
  const notes = (controls: Parameters<typeof PeerNotes>[0]["controls"]) =>
    <PeerNotes sb={sb} sessionId={s.id} mode="partner" ownerName={owner} controls={controls} skills={skills} />;
  return <>
    {back}
    <PageHero eyebrow={`Shared by ${owner}`} title={s.title}
      subtitle={`${new Date(`${s.session_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${CONTEXT_LABELS[s.session_context]} · ${FORMAT_LABELS[s.play_format]}`} />
    <Sheet className="space-y-4">
      {skills.length > 0 && <div className="rounded-[18px] p-4" style={cardStyle}>
        <p className="text-[17px] leading-snug" style={{ color: INK }}>{owner} asked you to look at{" "}
          {skills.map((k, i) => <span key={k}>{i > 0 && (i === skills.length - 1 ? " and " : ", ")}<b>{SKILL_INFO[k].label}</b></span>)}.</p>
        <p className="mt-1 text-[13px]" style={{ color: INK_2 }}>
          {withVideo ? "Watch the video below, then rate each skill." : "There's no video in this request: rate from what you saw when you played."}
          {" "}{owner}'s own ratings, journal and plan stay private.</p>
      </div>}
      {skills.length > 0 && <FeedbackForm sb={sb} sessionId={s.id} owner={owner} skills={skills} saved={report.my_ratings ?? {}}
        onSent={() => void getSharedReport(sb, sessionId).then(setReport).catch(() => {})} />}
      {skills.length === 0 && <Notice>{owner} shared this session's video report with you. Their goals, ratings and practice plan stay private.
        Comments you leave are shown to {owner}.</Notice>}
      {withVideo && parsed?.ok ? <ResultView result={parsed.result} videoUrl={videoUrl} sharedBy={owner} notes={notes} />
        : withVideo && videoUrl ? <PlainVideo src={videoUrl} owner={owner}>{notes}</PlainVideo>
        : <>
          {withVideo && <Notice tone={parsed ? "error" : "info"}>{parsed ? `The report could not be read (${parsed.error}).`
            : `There is no video for this session yet. You can still leave ${owner} a comment about the whole session.`}</Notice>}
          {notes({ video: null, seek: () => undefined })}
        </>}
    </Sheet>
  </>;
}

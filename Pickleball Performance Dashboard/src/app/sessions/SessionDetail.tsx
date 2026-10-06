import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowLeft, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  deleteSession, finalizeUpload, findPreviousCoachableResult, getSessionBundle, listAnalysisRuns, registerVideo, removeVideo, requestReanalysis, setRawVideoKeep, signedVideoUrl,
  updateSessionDetails, updateSessionGoals, type SessionBundle,
} from "../../lib/api/sessions";
import { CONTEXT_LABELS, FORMAT_LABELS, GOAL_LABELS, KIND_LABELS, sessionKind, type AnalysisRunSummary, type GoalValues, type ImprovementGoal } from "../../lib/api/types";
import { ContractError, parseAnalysisResult } from "../../lib/analysis/contract";
import { analysisProgress, deriveAnalysisState, failureHelp, shouldPoll, stateDescription, STATE_LABELS, type LocalUpload } from "../../lib/analysis/state";
import { config } from "../../lib/config";
import { startResumableUpload, type UploadHandle } from "../../lib/upload/tusUpload";
import { formatBytes, validateVideoFile } from "../../lib/upload/validate";
import {
  DEFAULT_UPLOAD_LIMITS, formatDuration, getUploadLimits, getUploadUsage, limitErrorText, probeVideo, uploadBlocker,
  type UploadLimits, type UploadUsage,
} from "../../lib/upload/limits";
import { listOtherPlayers, saveOtherPlayers, shortId, type OtherPlayer } from "../../lib/api/players";
import { AvatarStack } from "./sessionUi";
import { hasUploadConsent, recordUploadConsent } from "../../lib/api/capture";
import { BLUE_SKY, BORDER, DISPLAY_FONT, LAVENDER, NAVY, NEON, NEON_D, ORANGE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Chip, Notice, SegmentedTabs, fieldStyle, tabPanelProps } from "../shell/primitives";
import { SelfAssessmentPanel } from "../selfAssessment/SelfAssessmentPanel";
import { AnalysisParamsForm, ProgressBar, type AnalysisParams } from "../analysis/AnalysisStatus";
import { CourtCorrection } from "../analysis/CourtCorrection";
import { analysisJobParams, updatedJobParams, type CourtConfirmation } from "../../lib/analysis/courtReview";
import { ResultView } from "../analysis/ResultView";
import type { PreviousSession } from "../analysis/CoachingPanel";
import { GoalFields } from "./GoalFields";
import { CapturePanel } from "./CapturePanel";

const POLL_MS = 3000;

type DetailTab = "plan" | "video" | "journal";

export default function SessionDetail({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const { sessionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<SessionBundle | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [localUpload, setLocalUpload] = useState<LocalUpload>(null);
  const [params, setParams] = useState<AnalysisParams | null>({});
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmedCourt, setConfirmedCourt] = useState<CourtConfirmation | null>(null);
  const [reanalysisFile, setReanalysisFile] = useState<File | null>(null);
  const [reanalysisCourt, setReanalysisCourt] = useState<CourtConfirmation | null>(null);
  const [useAutomaticCourt, setUseAutomaticCourt] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState<PreviousSession | null>(null);
  const [runHistory, setRunHistory] = useState<AnalysisRunSummary[]>([]);
  const [goalDraft, setGoalDraft] = useState<GoalValues | null>(null);
  const [detailsDraft, setDetailsDraft] = useState<{
    title: string; session_date: string; tournament_name: string; tournament_round: string;
    match_result: "win" | "loss" | null; match_score: string; partner: string; opponents: string[];
  } | null>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [tab, setTab] = useState<DetailTab | null>(requestedTab === "plan" || requestedTab === "video" || requestedTab === "journal" ? requestedTab : null);
  const [loadError, setLoadError] = useState("");
  const loadedOnce = useRef(false);
  const [slow, setSlow] = useState(false);
  const [limits, setLimits] = useState<UploadLimits>(DEFAULT_UPLOAD_LIMITS);
  const [usage, setUsage] = useState<UploadUsage | null>(null);
  const [pendingDuration, setPendingDuration] = useState<number | null>(null);
  const [players, setPlayers] = useState<OtherPlayer[]>([]);
  const uploadRef = useRef<UploadHandle | null>(null);
  const inFlight = useRef(false); // guards against double clicks before React re-renders

  const load = useCallback(async () => {
    try {
      setBundle(await getSessionBundle(sb, sessionId));
      loadedOnce.current = true;
      setLoadError("");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Before the first load, show a recoverable error instead of an endless "Loading".
      if (loadedOnce.current) setError(message); else setLoadError(message);
    }
  }, [sb, sessionId]);
  useEffect(() => {
    if (bundle !== undefined) return setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [bundle]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void getUploadLimits(sb).then(setLimits); }, [sb]);
  useEffect(() => { getUploadUsage(sb).then(setUsage).catch(() => setUsage(null)); }, [sb, bundle?.video?.id]);
  useEffect(() => { listOtherPlayers(sb, sessionId).then(setPlayers).catch(() => setPlayers([])); }, [sb, sessionId]);
  useEffect(() => { void hasUploadConsent(sb).then(setConsentConfirmed).catch(() => setConsentConfirmed(false)); }, [sb]);
  const currentRunId = bundle?.job?.current_run_id;
  const runStatus = bundle?.job?.status;
  useEffect(() => {
    if (!currentRunId) { setRunHistory([]); return; }
    let active = true;
    listAnalysisRuns(sb, sessionId).then((runs) => { if (active) setRunHistory(runs); })
      .catch(() => { if (active) setRunHistory([]); });
    return () => { active = false; };
  }, [sb, sessionId, currentRunId, runStatus]);
  useEffect(() => () => uploadRef.current?.abort(), []);

  const state = bundle
    ? deriveAnalysisState({ video: bundle.video, job: bundle.job, result: bundle.result, localUpload })
    : null;

  // Poll while the worker has the job; results are read from the database, so
  // they survive reloads and appear in any tab.
  useEffect(() => {
    if (!state || !shouldPoll(state)) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [state, load]);

  const uploadedPath = bundle?.video?.upload_status === "uploaded" && !bundle.video.raw_video_deleted_at
    && !bundle.video.raw_video_deleting_at ? bundle.video.storage_path : null;
  useEffect(() => {
    if (!uploadedPath) { setVideoUrl(null); return; }
    let active = true;
    const refresh = () => {
      signedVideoUrl(sb, uploadedPath)
        .then((url) => { if (active) setVideoUrl(url); })
        .catch(() => { if (active) setVideoUrl(null); });
    };
    refresh();
    const timer = window.setInterval(refresh, 4 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sb, uploadedPath]);

  const parsed = useMemo(() => {
    if (!bundle?.result) return null;
    try {
      return { ok: true as const, result: parseAnalysisResult(bundle.result.result) };
    } catch (e) {
      return { ok: false as const, error: e instanceof ContractError ? e.message : String(e) };
    }
  }, [bundle?.result]);

  // Progress is optional context: a failed lookup just hides the comparison.
  const currentSession = bundle?.session;
  const hasResult = parsed?.ok === true;
  const sessionKey = currentSession ? `${currentSession.id}|${currentSession.session_date}` : "";
  useEffect(() => {
    if (!currentSession || !hasResult) return setPrevious(null);
    let cancelled = false;
    findPreviousCoachableResult(sb, currentSession)
      .then((found) => {
        if (!cancelled) setPrevious(found ? { label: `${found.session.title} (${found.session.session_date})`, result: found.result } : null);
      })
      .catch(() => { if (!cancelled) setPrevious(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionKey tracks the fields used
  }, [sb, sessionKey, hasResult]);

  async function onFileSelected(file: File, court: CourtConfirmation) {
    if (!bundle || inFlight.current || !config.supabase || !params) return;
    setError("");
    if (!consentConfirmed && !consentChecked) return setError("Confirm recording consent before uploading.");
    const check = validateVideoFile(file, config.maxUploadBytes);
    if (!check.ok) return setError(check.error);
    let video = bundle.video;
    if (video && (video.original_filename !== file.name.slice(0, 255) || video.byte_size !== file.size)) {
      return setError(`An incomplete upload of "${video.original_filename}" (${formatBytes(video.byte_size)}) exists. Select that same file to resume, or remove it first.`);
    }
    inFlight.current = true;
    setLocalUpload({ phase: "uploading", progress: 0 });
    try {
      if (!consentConfirmed) {
        await recordUploadConsent(sb, userId);
        setConsentConfirmed(true);
      }
      if (!video) {
        video = await registerVideo(sb, { ownerId: userId, sessionId: bundle.session.id, file, mimeType: check.mimeType, extension: check.extension, durationS: pendingDuration });
        setBundle({ ...bundle, video });
      }
      uploadRef.current = startResumableUpload(sb, config.supabase.url, {
        file, objectName: video.storage_path, contentType: check.mimeType,
        onProgress: (f) => setLocalUpload({ phase: "uploading", progress: f }),
      });
      await uploadRef.current.done;
      setLocalUpload({ phase: "finalizing", progress: 1 });
      await finalizeUpload(sb, video.id, analysisJobParams(params, court));
    } catch (e) {
      const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      setError(limitErrorText(message) ?? `Upload failed: ${message}. Select the same file again to resume.`);
    } finally {
      uploadRef.current = null;
      inFlight.current = false;
      setLocalUpload(null);
      await load();
    }
  }

  async function run(action: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
      await load();
    }
  }

  if (bundle === undefined) {
    const retry = () => { setLoadError(""); setSlow(false); void load(); };
    if (loadError || slow) {
      return <div className="space-y-4">
        <a href="#/sessions" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: BLUE_SKY }}><ArrowLeft size={16} /> Sessions</a>
        <Notice tone={loadError ? "error" : "warn"}>
          {loadError ? `This session could not be loaded: ${loadError}` : "This session is taking longer than usual to load. Check your connection."}
        </Notice>
        <div className="flex gap-2">
          <button type="button" onClick={retry} className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold" style={{ background: "#16181d", color: "#ffffff" }}><RefreshCw size={14} /> Try again</button>
          <a href="#/sessions" className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold" style={{ border: `1px solid ${BORDER}` }}>Back to sessions</a>
        </div>
      </div>;
    }
    return <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading session">
      <span className="sr-only">Loading session…</span>
      <div className="h-5 w-24 animate-pulse rounded-full" style={{ background: "#e5e7eb" }} />
      <div className="h-36 animate-pulse rounded-2xl" style={{ background: "#e2e5ea" }} />
      <div className="h-12 animate-pulse rounded-2xl" style={{ background: "#e5e7eb" }} />
      <div className="h-64 animate-pulse rounded-2xl" style={{ background: "#eceef2" }} />
    </div>;
  }
  if (bundle === null) {
    return <Notice tone="error">Session not found. It may have been deleted, or it belongs to another account.</Notice>;
  }
  const { session, video, job } = bundle;
  const selfMode = (session.review_mode ?? "video") === "self";
  const activeTab: DetailTab = tab ?? (selfMode && !video ? "plan" : "video");
  const loggingOnly = session.play_format === "wall_practice" || session.play_format === "ball_machine";
  const canChangeVideo = !loggingOnly && (state === "not_uploaded" || state === "upload_incomplete");
  const finished = state === "completed" || state === "insufficient_data" || state === "failed";
  const hasFeedback = state === "completed" || state === "insufficient_data";
  const stepTitle = loggingOnly ? "Practice log · no video analysis"
    : state === "not_uploaded" ? "Add your video"
    : state === "upload_incomplete" ? "Finish uploading your video"
    : state === "queued" ? "Waiting to analyze your video"
    : state === "processing" ? "Analyzing your video"
    : state === "failed" ? "Your video needs attention"
    : hasFeedback ? "Your video review is ready" : "Uploading your video";

  return (
    <div className="space-y-4">
      <a href="#/sessions" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: BLUE_SKY }}><ArrowLeft size={16} /> Sessions</a>

      <section className="rounded-2xl p-5" style={{ background: NAVY, color: "white" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: LAVENDER }}>
              {new Date(`${session.session_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {CONTEXT_LABELS[session.session_context]} · {FORMAT_LABELS[session.play_format]}
            </p>
            <h1 className="mt-1 break-words text-2xl font-extrabold leading-tight" style={{ fontFamily: DISPLAY_FONT }}>{session.title}</h1>
          </div>
          <button type="button" title="Delete session" aria-label="Delete session" disabled={busy || state === "uploading" || state === "processing"}
            onClick={() => { if (window.confirm("Delete this session, its ratings, video and results?")) void run(async () => { await deleteSession(sb, bundle); navigate("/sessions"); }); }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-30" style={{ color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
            <Trash2 size={16} />
          </button>
        </div>
        {(session.tournament_name || session.tournament_round || session.match_result || session.match_score) && (
          <p className="mt-2 text-sm font-semibold" style={{ color: "#ffffff" }}>
            {[session.tournament_name, session.tournament_round, session.match_result === "win" ? "Won" : session.match_result === "loss" ? "Lost" : null, session.match_score].filter(Boolean).join(" · ")}
          </p>
        )}
        {players.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" style={{ color: "#dfe3ff" }}>
          <AvatarStack names={players.map((p) => p.display_name)} size={30} />
          <span>
            {players.some((p) => p.role === "partner") && <>With {players.filter((p) => p.role === "partner").map((p) => p.display_name).join(", ")}{" · "}</>}
            {players.some((p) => p.role === "opponent") && <>vs {players.filter((p) => p.role === "opponent").map((p) => p.display_name).join(" & ")}</>}
          </span>
        </div>}
        {session.notes && <p className="text-sm mt-2" style={{ color: "#dfe3ff" }}>{session.notes}</p>}
        {session.improvement_goals?.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your focus">
            {session.improvement_goals.map((goal: ImprovementGoal) => (
              <li key={goal} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.1)", color: "#ffffff" }}>
                {GOAL_LABELS[goal]}{session[`${goal}_rating`] ? ` · ${session[`${goal}_rating`]}/5` : ""}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="text-sm mt-3 font-semibold underline" style={{ color: LAVENDER }}
          onClick={() => setGoalDraft({
            improvement_goals: session.improvement_goals ?? [],
            positioning_rating: session.positioning_rating ?? null,
            shot_outcomes_rating: session.shot_outcomes_rating ?? null,
            shot_technique_rating: session.shot_technique_rating ?? null,
        })}>Edit focus</button>
        <button type="button" className="ml-4 text-sm mt-3 font-semibold underline" style={{ color: LAVENDER }}
          onClick={() => setDetailsDraft({
            title: session.title, session_date: session.session_date,
            tournament_name: session.tournament_name ?? "", tournament_round: session.tournament_round ?? "",
            match_result: session.match_result ?? null, match_score: session.match_score ?? "",
            partner: players.find((p) => p.role === "partner")?.display_name ?? "",
            opponents: [0, 1].map((i) => players.filter((p) => p.role === "opponent")[i]?.display_name ?? ""),
          })}>Edit details &amp; players</button>
        <p className="mt-3 text-[11px]" style={{ color: "#c7cdff" }}>
          {KIND_LABELS[sessionKind(session)]} · Session ID <span className="font-mono" title={session.id}>{shortId(session.id)}</span> · created {new Date(session.created_at).toLocaleString()}
        </p>
      </section>

      {detailsDraft && (
        <Card accent={BLUE_SKY}>
          <h2 className="text-lg font-extrabold">Edit details &amp; players</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">Name
              <input maxLength={120} value={detailsDraft.title} onChange={(e) => setDetailsDraft({ ...detailsDraft, title: e.target.value })} className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Date
              <input type="date" value={detailsDraft.session_date} onChange={(e) => setDetailsDraft({ ...detailsDraft, session_date: e.target.value })} className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
            </label>
            {sessionKind(session) === "tournament" && <>
              <label className="grid gap-1 text-sm font-semibold">Tournament
                <input maxLength={120} value={detailsDraft.tournament_name} onChange={(e) => setDetailsDraft({ ...detailsDraft, tournament_name: e.target.value })} className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
              </label>
              <label className="grid gap-1 text-sm font-semibold">Round
                <input maxLength={60} value={detailsDraft.tournament_round} onChange={(e) => setDetailsDraft({ ...detailsDraft, tournament_round: e.target.value })} placeholder="e.g. Semifinal" className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
              </label>
              <div className="grid gap-1 text-sm font-semibold">Result
                <div className="flex gap-2">{(["win", "loss"] as const).map((r) => <Chip key={r} selected={detailsDraft.match_result === r}
                  onClick={() => setDetailsDraft({ ...detailsDraft, match_result: detailsDraft.match_result === r ? null : r })}>{r === "win" ? "Won" : "Lost"}</Chip>)}</div>
              </div>
              <label className="grid gap-1 text-sm font-semibold">Score
                <input maxLength={40} value={detailsDraft.match_score} onChange={(e) => setDetailsDraft({ ...detailsDraft, match_score: e.target.value })} placeholder="11-7, 9-11, 11-5" className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
              </label>
            </>}
            {sessionKind(session) !== "solo" && <>
              {session.play_format === "doubles" && <label className="grid gap-1 text-sm font-semibold">Partner
                <input maxLength={80} value={detailsDraft.partner} onChange={(e) => setDetailsDraft({ ...detailsDraft, partner: e.target.value })} className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
              </label>}
              {detailsDraft.opponents.slice(0, session.play_format === "doubles" ? 2 : 1).map((name, i) => <label key={i} className="grid gap-1 text-sm font-semibold">{session.play_format === "doubles" ? `Opponent ${i + 1}` : "Opponent"}
                <input maxLength={80} value={name} onChange={(e) => setDetailsDraft({ ...detailsDraft, opponents: detailsDraft.opponents.map((v, j) => j === i ? e.target.value : v) })} className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
              </label>)}
            </>}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy || !detailsDraft.title.trim()}
              onClick={() => void run(async () => {
                const d = detailsDraft;
                await updateSessionDetails(sb, session.id, {
                  title: d.title.trim(), session_date: d.session_date,
                  ...(sessionKind(session) === "tournament" ? {
                    tournament_name: d.tournament_name.trim() || null, tournament_round: d.tournament_round.trim() || null,
                    match_result: d.match_result, match_score: d.match_score.trim() || null,
                  } : {}),
                });
                if (sessionKind(session) !== "solo") {
                  const next: OtherPlayer[] = [
                    ...(session.play_format === "doubles" ? [{ role: "partner" as const, display_name: d.partner }] : []),
                    ...d.opponents.slice(0, session.play_format === "doubles" ? 2 : 1).map((n) => ({ role: "opponent" as const, display_name: n })),
                  ];
                  await saveOtherPlayers(sb, session.id, next);
                  setPlayers(next.filter((p) => p.display_name.trim()));
                }
                setDetailsDraft(null);
              })}
              className="inline-flex min-h-[44px] items-center rounded-full px-6 text-sm font-bold disabled:opacity-40" style={{ background: BLUE_SKY, color: "#ffffff" }}>Save details</button>
            <button type="button" onClick={() => setDetailsDraft(null)} className="text-sm px-3 py-2" style={{ color: WHITE_DIM }}>Cancel</button>
          </div>
        </Card>
      )}

      {goalDraft && (
        <Card accent={BLUE_SKY}>
          <GoalFields value={goalDraft} onChange={setGoalDraft} />
          <div className="flex gap-2 mt-3">
            <button type="button" disabled={busy || goalDraft.improvement_goals.length === 0}
              onClick={() => void run(async () => {
                await updateSessionGoals(sb, session.id, goalDraft);
                setGoalDraft(null);
              })}
              className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: BLUE_SKY, color: "#ffffff" }}>Save goals</button>
            <button type="button" onClick={() => setGoalDraft(null)} className="text-sm px-3 py-2" style={{ color: WHITE_DIM }}>Cancel</button>
          </div>
        </Card>
      )}

      <SegmentedTabs label="Session views" idBase="session" value={activeTab} onChange={setTab} tabs={[
        { value: "plan", label: "Rate & plan" },
        { value: "video", label: "Video", badge: selfMode ? "optional" : undefined },
        { value: "journal", label: "Journal" },
      ]} />

      {activeTab === "plan" && <div {...tabPanelProps("session", "plan")} className="outline-none"><SelfAssessmentPanel sb={sb} session={session} /></div>}
      {activeTab === "journal" && <div {...tabPanelProps("session", "journal")} className="outline-none"><CapturePanel key={session.id} sb={sb} session={session} onSessionUpdated={() => void load()} /></div>}

      {activeTab === "video" && <div {...tabPanelProps("session", "video")} className="space-y-4 outline-none">
      {selfMode && !video && <Notice tone="info">Video analysis is optional. Your practice plan comes from your ratings in <strong>Rate &amp; plan</strong>. Add a clip here if you also want court positions measured.</Notice>}
      <Card>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: BLUE_SKY }}>Video analysis{state ? ` · ${STATE_LABELS[state]}` : ""}</p>
        <h2 className="text-xl font-bold text-[#16181d] mt-1" style={{ fontFamily: DISPLAY_FONT }}>{stepTitle}</h2>
        <p className="text-sm mt-2 mb-4" style={{ color: WHITE_DIM }}>{loggingOnly
          ? "Wall and ball-machine sessions record your check-in, recovery and reflection without computer-vision analysis."
          : state ? stateDescription(state, job) : ""}</p>
        {hasFeedback && (
          <button type="button" onClick={() => document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 mb-4 text-sm font-bold"
            style={{ background: NEON, color: NEON_D }}>See your feedback <ArrowDown size={16} aria-hidden="true" /></button>
        )}
        {video && (
          <details className="mb-3">
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: BLUE_SKY }}>Research details: upload record, IDs and times</summary>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl p-3 text-sm sm:grid-cols-3" style={{ background: "#f6f7f9", border: `1px solid ${BORDER}` }} aria-label="Upload record">
            <div className="col-span-2 sm:col-span-3"><dt className="sr-only">File</dt><dd className="truncate font-semibold" style={{ color: "#16181d" }}>{video.original_filename}</dd></div>
            <div><dt className="text-xs" style={{ color: WHITE_SUB }}>Upload ID</dt><dd className="font-mono" title={video.id}>{shortId(video.id)}</dd></div>
            <div><dt className="text-xs" style={{ color: WHITE_SUB }}>Size{video.duration_s ? " · length" : ""}</dt><dd>{formatBytes(video.byte_size)}{video.duration_s ? ` · ${formatDuration(video.duration_s)}` : ""}</dd></div>
            <div><dt className="text-xs" style={{ color: WHITE_SUB }}>Registered</dt><dd>{new Date(video.created_at).toLocaleString()}</dd></div>
            <div><dt className="text-xs" style={{ color: WHITE_SUB }}>Upload finished</dt><dd>{video.uploaded_at ? new Date(video.uploaded_at).toLocaleString() : "Not yet"}</dd></div>
            {job && <div><dt className="text-xs" style={{ color: WHITE_SUB }}>Analysis job</dt><dd className="font-mono" title={job.id}>{shortId(job.id)}{job.attempts > 0 ? ` · try ${job.attempts}/${job.max_attempts}` : ""}</dd></div>}
            {job?.finished_at && <div><dt className="text-xs" style={{ color: WHITE_SUB }}>Analysis finished</dt><dd>{new Date(job.finished_at).toLocaleString()}</dd></div>}
          </dl>
          </details>
        )}
        {video?.raw_video_deleted_at && <Notice tone="info">The raw recording has expired and was removed. Your saved report remains available.</Notice>}
        {video?.raw_video_deleting_at && !video.raw_video_deleted_at && <Notice tone="info">The raw recording is being removed. Your saved report remains available.</Notice>}
        {video?.raw_video_expires_at && !video.raw_video_deleted_at && !video.raw_video_deleting_at && (
          <div className="mb-3 text-sm" style={{ color: WHITE_DIM }}>
            <p>{video.raw_video_kept ? "You chose to keep this raw recording." : `Raw recording scheduled for deletion on ${new Date(video.raw_video_expires_at).toLocaleDateString()}.`}</p>
            <button type="button" disabled={busy} className="mt-1 underline disabled:opacity-40"
              style={{ color: BLUE_SKY }}
              onClick={() => void run(() => setRawVideoKeep(sb, video.id, !video.raw_video_kept))}>
              {video.raw_video_kept ? "Resume automatic deletion" : "Keep this recording"}
            </button>
          </div>
        )}
        {localUpload && (
          <div className="space-y-1 mb-3">
            <ProgressBar fraction={localUpload.progress} />
            <p className="text-sm" style={{ color: WHITE_SUB }}>
              {localUpload.phase === "finalizing" ? "Registering upload…" : `${Math.round(localUpload.progress * 100)}% uploaded`}
            </p>
          </div>
        )}
        {state === "processing" && job && job.status === "processing" && (() => {
          const p = analysisProgress(job, Date.now());
          return (
            <div className="space-y-1 mb-3" data-testid="analysis-progress">
              <ProgressBar fraction={p.fraction} label="Analysis progress" />
              <p className="text-sm" style={{ color: WHITE_SUB }}>{p.text}</p>
              {p.stale && (
                <Notice tone="warn">
                  No update from the analyzer for a few minutes. Check that the worker window (start_worker.bat) is still open;
                  if it was closed, start it again and the analysis will be retried.
                </Notice>
              )}
            </div>
          );
        })()}
        {state === "failed" && job?.error_code && (
          <div className="mb-3">
            <Notice tone="error">
              <strong>{failureHelp(job.error_code).title}.</strong> {failureHelp(job.error_code).action}
              {job.error_message && (
                <details className="mt-1">
                  <summary className="cursor-pointer">Technical details</summary>
                  <span className="font-mono">{job.error_code}: {job.error_message}</span>
                </details>
              )}
            </Notice>
          </div>
        )}

        {canChangeVideo && config.trialNoWorker && <Notice tone="info">Video upload is paused on this public trial because analysis is not running online. You can explore the sample dashboard and try session planning and check-in.</Notice>}
        {canChangeVideo && !config.trialNoWorker && (
          <div className="space-y-3">
            <details className="rounded-xl p-3" style={{ border: `1px solid ${BORDER}` }}>
              <summary className="cursor-pointer text-sm font-semibold" style={{ color: BLUE_SKY }}>How to record a usable match</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: WHITE_DIM }}>
                <li>Use a stable tripod behind a baseline, high enough to see players and court lines.</li>
                <li>Keep the full court visible in landscape at 720p or higher and at least 30 fps.</li>
                <li>Use good light and avoid players crossing out of the frame.</li>
                <li>Ask every visible player for recording and upload consent before filming.</li>
              </ul>
            </details>
            {!consentConfirmed && <label className="flex items-start gap-2 text-sm" style={{ color: WHITE_DIM }}>
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
              <span>I confirm that every person visible in this recording agreed to be recorded and uploaded for PicklePro analysis.
                Raw video is automatically removed 30 days after analysis unless I choose to keep it. The report remains saved. <a href="#/privacy" className="underline" style={{ color: BLUE_SKY }}>Data and privacy</a></span>
            </label>}
            <label className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold cursor-pointer"
              style={{ background: params ? NEON : `${NEON}50`, color: NEON_D }}>
              <Upload size={14} /> {state === "upload_incomplete" ? "Resume upload (select the same file)" : "Choose video & review court"}
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" className="hidden"
                disabled={!params || !!localUpload}
                onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  const check = validateVideoFile(f, Math.min(config.maxUploadBytes, limits.max_file_bytes));
                  if (!check.ok) { setError(check.error); return; }
                  setError("");
                  // Resuming the same file skips the new-upload limits; it is already registered.
                  void probeVideo(f).then((meta) => {
                    const blocker = state === "upload_incomplete" ? null : uploadBlocker(f, meta.duration, limits, usage, meta);
                    if (blocker) { setError(blocker); return; }
                    setPendingDuration(meta.duration); setPendingFile(f); setConfirmedCourt(null);
                  });
                }} />
            </label>
            {pendingFile && <CourtCorrection key={`${pendingFile.name}:${pendingFile.size}`} file={pendingFile}
              onConfirm={(court) => {
                setConfirmedCourt(court); setPendingFile(null);
                void onFileSelected(pendingFile, court);
              }} onCancel={() => setPendingFile(null)} />}
            <div className="rounded-2xl p-3 text-sm" style={{ background: "#f6f7f9", border: `1px solid ${BORDER}` }} data-testid="upload-limits">
              <p className="font-semibold" style={{ color: "#16181d" }}>Upload limits</p>
              <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2" style={{ color: WHITE_DIM }}>
                <li>Up to {formatBytes(Math.min(config.maxUploadBytes, limits.max_file_bytes))} per video</li>
                <li>{formatDuration(limits.min_duration_s)} to {formatDuration(limits.max_duration_s)} long</li>
                <li>Landscape, 720p or higher</li>
                <li>{usage ? `${usage.uploadsToday} of ${limits.max_uploads_per_day}` : `Up to ${limits.max_uploads_per_day}`} uploads today</li>
                <li>{usage ? `${usage.storedBytes ? formatBytes(usage.storedBytes) : "0 MB"} of ${formatBytes(limits.max_total_bytes)}` : formatBytes(limits.max_total_bytes)} storage used</li>
              </ul>
              <p className="mt-2 text-xs" style={{ color: WHITE_SUB }}>MP4, MOV, WEBM or AVI, 720p and 30 fps or higher. Trim to a rally clip on your device first. Your upload is private, and raw video is removed 30 days after analysis unless you keep it.</p>
            </div>
            <details className="rounded-xl p-3" style={{ border: `1px solid ${BORDER}` }}>
              <summary className="text-sm font-semibold cursor-pointer" style={{ color: BLUE_SKY }}>Advanced analysis options</summary>
              <div className="mt-3"><AnalysisParamsForm playFormat={session.play_format} onChange={(p, err) => { setParams(p); setParamsError(err); }} /></div>
            </details>
            {state === "upload_incomplete" && video && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !confirmedCourt} onClick={() => void run(() => finalizeUpload(sb, video.id, analysisJobParams(params ?? {}, confirmedCourt!)))}
                  className="rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40" style={{ color: BLUE_SKY, border: `1px solid ${BLUE_SKY}60` }}>
                  Check if the upload finished{!confirmedCourt ? " (review the court first)" : ""}
                </button>
                <button type="button" disabled={busy} onClick={() => void run(() => removeVideo(sb, video))}
                  className="rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40" style={{ color: ORANGE, border: `1px solid ${ORANGE}60` }}>
                  Remove incomplete upload
                </button>
              </div>
            )}
          </div>
        )}

        {finished && job && !video?.raw_video_deleted_at && !video?.raw_video_deleting_at && !config.trialNoWorker && (
          <details className="mt-2">
            <summary className="text-sm font-semibold cursor-pointer" style={{ color: BLUE_SKY }}>Re-run analysis with different inputs</summary>
            <div className="mt-3 space-y-3">
              <AnalysisParamsForm playFormat={session.play_format} onChange={(p, err) => { setParams(p); setParamsError(err); }} />
              <p className="text-sm" style={{ color: WHITE_SUB }}>The saved court setup is kept unless you choose a new correction or automatic mapping.</p>
              <label className="flex items-center gap-2 text-sm" style={{ color: WHITE_DIM }}>
                <input type="checkbox" checked={useAutomaticCourt} onChange={(e) => { setUseAutomaticCourt(e.target.checked); setReanalysisCourt(null); setReanalysisFile(null); }} />
                Use automatic court mapping instead
              </label>
              {!useAutomaticCourt && <label className="block text-sm" style={{ color: WHITE_DIM }}>
                Correct the saved court using the same local video
                <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" className="mt-1 block text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null; e.target.value = "";
                    if (!file) return;
                    if (file.name.slice(0, 255) !== video?.original_filename || file.size !== video?.byte_size) {
                      setError("Choose the same local video used for this upload to correct its court."); return;
                    }
                    setError(""); setReanalysisFile(file);
                  }} />
              </label>}
              {reanalysisFile && !useAutomaticCourt && <CourtCorrection file={reanalysisFile}
                onConfirm={(court) => { setReanalysisCourt(court); setReanalysisFile(null); }}
                onCancel={() => setReanalysisFile(null)} />}
              {reanalysisCourt && <Notice tone="info">New court correction ready for the next analysis run.</Notice>}
              <button type="button" disabled={busy || !params}
                onClick={() => void run(() => requestReanalysis(sb, job.id,
                  updatedJobParams(job.params, params ?? {}, reanalysisCourt, useAutomaticCourt)))}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
                style={{ background: BLUE_SKY, color: "#ffffff" }}>
                <RefreshCw size={14} /> Re-run analysis
              </button>
              <p className="text-sm" style={{ color: WHITE_SUB }}>The previous report remains saved until the new analysis finishes.</p>
            </div>
          </details>
        )}
        {paramsError && <div className="mt-2"><Notice tone="error">{paramsError}</Notice></div>}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </Card>


      {parsed?.ok && job?.status === "failed" && <Notice tone="warn">The reanalysis failed. The report below is from the last completed run.</Notice>}
      {parsed?.ok && (job?.status === "queued" || job?.status === "processing") && <Notice tone="info">A new analysis is in progress. The report below is the last published run.</Notice>}
      {parsed?.ok && <ResultView result={parsed.result} videoUrl={videoUrl} previous={previous} session={session}
        onRateSession={() => { setTab("plan"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onSelectTrack={job && finished && !video?.raw_video_deleted_at && !video?.raw_video_deleting_at && !config.trialNoWorker ? (trackId, timeSeconds) => void run(() => requestReanalysis(sb, job.id, {
          ...job.params, selection: { method: "track_id", track_id: trackId }, selection_time_s: timeSeconds,
        })) : undefined} />}
      {parsed && !parsed.ok && (
        <Notice tone="error">The stored result could not be read ({parsed.error}). It is not shown to avoid presenting it incorrectly.</Notice>
      )}
      {runHistory.length > 0 && <details className="rounded-2xl p-4" style={{ border: `1px solid ${BORDER}` }}>
        <summary className="cursor-pointer text-base font-semibold" style={{ color: BLUE_SKY }}>Research details: analysis history ({runHistory.length} run{runHistory.length === 1 ? "" : "s"})</summary>
        <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Each reanalysis is saved as a separate run. The active report changes only after a new run completes.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {runHistory.map((run) => <li key={run.id} className="flex flex-wrap justify-between gap-2 border-b py-2" style={{ borderColor: BORDER }}>
            <span>Run {run.run_number}{session.active_run_id === run.id ? " · active report" : ""}</span>
            <span style={{ color: WHITE_DIM }}>{run.status}{run.result_status ? ` · ${run.result_status.replaceAll("_", " ")}` : ""} · {run.metric_definition_version}</span>
          </li>)}
        </ul>
      </details>}
      </div>}
    </div>
  );
}

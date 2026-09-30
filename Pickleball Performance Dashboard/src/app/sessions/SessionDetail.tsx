import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowLeft, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  deleteSession, finalizeUpload, findPreviousCoachableResult, getSessionBundle, listAnalysisRuns, registerVideo, removeVideo, requestReanalysis, setRawVideoKeep, signedVideoUrl,
  updateSessionGoals, type SessionBundle,
} from "../../lib/api/sessions";
import { CONTEXT_LABELS, FORMAT_LABELS, GOAL_LABELS, type AnalysisRunSummary, type GoalValues, type ImprovementGoal } from "../../lib/api/types";
import { ContractError, parseAnalysisResult } from "../../lib/analysis/contract";
import { analysisProgress, deriveAnalysisState, failureHelp, shouldPoll, stateDescription, STATE_LABELS, type LocalUpload } from "../../lib/analysis/state";
import { config } from "../../lib/config";
import { startResumableUpload, type UploadHandle } from "../../lib/upload/tusUpload";
import { formatBytes, validateVideoFile } from "../../lib/upload/validate";
import { hasUploadConsent, recordUploadConsent } from "../../lib/api/capture";
import { BLUE_SKY, BORDER, DISPLAY_FONT, LAVENDER, NAVY, NEON, NEON_D, ORANGE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Notice } from "../shell/primitives";
import { AnalysisParamsForm, ProgressBar, type AnalysisParams } from "../analysis/AnalysisStatus";
import { CourtCorrection } from "../analysis/CourtCorrection";
import { analysisJobParams, updatedJobParams, type CourtConfirmation } from "../../lib/analysis/courtReview";
import { ResultView } from "../analysis/ResultView";
import type { PreviousSession } from "../analysis/CoachingPanel";
import { GoalFields } from "./GoalFields";
import { JourneySteps } from "./JourneySteps";
import { CapturePanel } from "./CapturePanel";

const POLL_MS = 3000;

export default function SessionDetail({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const { sessionId = "" } = useParams();
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
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const uploadRef = useRef<UploadHandle | null>(null);
  const inFlight = useRef(false); // guards against double clicks before React re-renders

  const load = useCallback(async () => {
    try {
      setBundle(await getSessionBundle(sb, sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb, sessionId]);

  useEffect(() => { void load(); }, [load]);
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
        video = await registerVideo(sb, { ownerId: userId, sessionId: bundle.session.id, file, mimeType: check.mimeType, extension: check.extension });
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
      setError(`Upload failed: ${e instanceof Error ? e.message : String(e)}. Select the same file again to resume.`);
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

  if (bundle === undefined) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;
  if (bundle === null) {
    return <Notice tone="error">Session not found. It may have been deleted, or it belongs to another account.</Notice>;
  }
  const { session, video, job } = bundle;
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
    : hasFeedback ? "Your result is ready" : "Uploading your video";

  return (
    <div className="space-y-4">
      <a href="#/" className="inline-flex items-center gap-1 text-sm" style={{ color: BLUE_SKY }}><ArrowLeft size={12} /> All sessions</a>

      <section className="p-5 sm:p-8" style={{ background: NAVY, color: "white" }}>
        <p className="text-sm font-bold uppercase tracking-widest" style={{ color: LAVENDER }}>Your video review</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="mt-2">
            <h1 className="break-words font-bold uppercase leading-none" style={{ fontFamily: DISPLAY_FONT, fontSize: "clamp(2.6rem, 5vw, 4.8rem)" }}>{session.title}</h1>
            <p className="text-sm mt-2" style={{ color: "#d4d9e5" }}>
              {session.session_date} · {CONTEXT_LABELS[session.session_context]} · {FORMAT_LABELS[session.play_format]} · {session.performance_scope === "individual" ? "Individual analysis" : "Pair analysis"}
            </p>
            {session.notes && <p className="text-sm mt-2" style={{ color: "#d4d9e5" }}>{session.notes}</p>}
            {session.improvement_goals?.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-bold uppercase tracking-wider" style={{ color: LAVENDER }}>Your focus</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {session.improvement_goals.map((goal: ImprovementGoal) => (
                    <li key={goal} className="text-sm px-2 py-1" style={{ border: "1px solid #64718e", color: "#e8ecf6" }}>
                      {GOAL_LABELS[goal]} · self rating {session[`${goal}_rating`] ?? "not set"}{session[`${goal}_rating`] ? "/5" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button type="button" className="text-sm mt-2 underline" style={{ color: LAVENDER }}
              onClick={() => setGoalDraft({
                improvement_goals: session.improvement_goals ?? [],
                positioning_rating: session.positioning_rating ?? null,
                shot_outcomes_rating: session.shot_outcomes_rating ?? null,
                shot_technique_rating: session.shot_technique_rating ?? null,
            })}>Edit improvement goals</button>
          </div>
          <div className="flex items-center gap-3 mt-2">
            {state && <span className="text-sm font-bold uppercase tracking-wider" style={{ color: state === "failed" || state === "insufficient_data" ? "#ffc19f" : LAVENDER }}>{STATE_LABELS[state]}</span>}
            <button type="button" title="Delete session" disabled={busy || state === "uploading" || state === "processing"}
              onClick={() => { if (window.confirm("Delete this session, its video and results?")) void run(async () => { await deleteSession(sb, bundle); navigate("/"); }); }}
              className="p-2 disabled:opacity-30" style={{ color: "white", border: "1px solid #64718e" }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="mt-6"><JourneySteps current={hasFeedback ? 3 : 2} tone="dark" /></div>
      </section>

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

      <Card accent={BLUE_SKY}>
        <p className="text-sm font-bold uppercase tracking-widest" style={{ color: BLUE_SKY }}>{hasFeedback ? "Step 3 of 3" : "Step 2 of 3"}</p>
        <h2 className="text-xl font-bold text-[#101827] mt-1">{stepTitle}</h2>
        <p className="text-sm mt-2 mb-4" style={{ color: WHITE_DIM }}>{loggingOnly
          ? "Wall and ball-machine sessions record your check-in, recovery and reflection without computer-vision analysis."
          : state ? stateDescription(state, job) : ""}</p>
        {hasFeedback && (
          <button type="button" onClick={() => document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 mb-4 text-sm font-bold"
            style={{ background: NEON, color: NEON_D }}>See your feedback <ArrowDown size={16} aria-hidden="true" /></button>
        )}
        {video && (
          <p className="text-sm mb-3" style={{ color: WHITE_DIM }}>
            {video.original_filename} · {formatBytes(video.byte_size)}
            {job && job.attempts > 0 && ` · attempt ${job.attempts} of ${job.max_attempts}`}
          </p>
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
                Raw video is automatically removed 30 days after analysis unless I choose to keep it. The report remains saved.</span>
            </label>}
            <label className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold cursor-pointer"
              style={{ background: params ? NEON : `${NEON}50`, color: NEON_D }}>
              <Upload size={14} /> {state === "upload_incomplete" ? "Resume upload (select the same file)" : "Choose video & review court"}
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" className="hidden"
                disabled={!params || !!localUpload}
                onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  const check = validateVideoFile(f, config.maxUploadBytes);
                  if (!check.ok) { setError(check.error); return; }
                  setError(""); setPendingFile(f); setConfirmedCourt(null);
                }} />
            </label>
            {pendingFile && <CourtCorrection key={`${pendingFile.name}:${pendingFile.size}`} file={pendingFile}
              onConfirm={(court) => {
                setConfirmedCourt(court); setPendingFile(null);
                void onFileSelected(pendingFile, court);
              }} onCancel={() => setPendingFile(null)} />}
            <p className="text-sm" style={{ color: WHITE_SUB }}>
              MP4, MOV, WEBM or AVI up to {formatBytes(config.maxUploadBytes)}. On the Free plan, choose a short rally clip and trim it on your device before uploading. Keep the clip at 720p, 30 fps or higher. Full-match uploads are not supported yet. Your upload is private.
            </p>
            <details className="rounded-xl p-3" style={{ border: `1px solid ${BORDER}` }}>
              <summary className="text-sm font-semibold cursor-pointer" style={{ color: BLUE_SKY }}>Advanced analysis options</summary>
              <div className="mt-3"><AnalysisParamsForm onChange={(p, err) => { setParams(p); setParamsError(err); }} /></div>
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
              <AnalysisParamsForm onChange={(p, err) => { setParams(p); setParamsError(err); }} />
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

      <CapturePanel key={session.id} sb={sb} session={session} onSessionUpdated={() => void load()} />

      {runHistory.length > 0 && <Card>
        <h2 className="text-lg font-bold text-[#101827]">Analysis history</h2>
        <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Each reanalysis is saved as a separate run. The active report changes only after a new run completes.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {runHistory.map((run) => <li key={run.id} className="flex flex-wrap justify-between gap-2 border-b py-2" style={{ borderColor: BORDER }}>
            <span>Run {run.run_number}{session.active_run_id === run.id ? " · active report" : ""}</span>
            <span style={{ color: WHITE_DIM }}>{run.status}{run.result_status ? ` · ${run.result_status.replaceAll("_", " ")}` : ""} · {run.metric_definition_version}</span>
          </li>)}
        </ul>
      </Card>}

      {parsed?.ok && job?.status === "failed" && <Notice tone="warn">The reanalysis failed. The report below is from the last completed run.</Notice>}
      {parsed?.ok && (job?.status === "queued" || job?.status === "processing") && <Notice tone="info">A new analysis is in progress. The report below is the last published run.</Notice>}
      {parsed?.ok && <ResultView result={parsed.result} videoUrl={videoUrl} previous={previous} session={session}
        onSelectTrack={job && finished && !video?.raw_video_deleted_at && !video?.raw_video_deleting_at && !config.trialNoWorker ? (trackId, timeSeconds) => void run(() => requestReanalysis(sb, job.id, {
          ...job.params, selection: { method: "track_id", track_id: trackId }, selection_time_s: timeSeconds,
        })) : undefined} />}
      {parsed && !parsed.ok && (
        <Notice tone="error">The stored result could not be read ({parsed.error}). It is not shown to avoid presenting it incorrectly.</Notice>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  deleteSession, finalizeUpload, findPreviousCoachableResult, getSessionBundle, registerVideo, removeVideo, requestReanalysis, signedVideoUrl,
  type SessionBundle,
} from "../../lib/api/sessions";
import { CONTEXT_LABELS, FORMAT_LABELS } from "../../lib/api/types";
import { ContractError, parseAnalysisResult } from "../../lib/analysis/contract";
import { deriveAnalysisState, shouldPoll, stateDescription, type LocalUpload } from "../../lib/analysis/state";
import { config } from "../../lib/config";
import { startResumableUpload, type UploadHandle } from "../../lib/upload/tusUpload";
import { formatBytes, validateVideoFile } from "../../lib/upload/validate";
import { BLUE_SKY, BORDER, NEON, NEON_D, ORANGE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Notice, WidgetHeader } from "../shell/primitives";
import { AnalysisParamsForm, AnalysisStateBadge, ProgressBar, type AnalysisParams } from "../analysis/AnalysisStatus";
import { ResultView } from "../analysis/ResultView";
import type { PreviousSession } from "../analysis/CoachingPanel";

const POLL_MS = 3000;

export default function SessionDetail({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<SessionBundle | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [localUpload, setLocalUpload] = useState<LocalUpload>(null);
  const [params, setParams] = useState<AnalysisParams | null>({});
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState<PreviousSession | null>(null);
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

  const uploadedPath = bundle?.video?.upload_status === "uploaded" ? bundle.video.storage_path : null;
  useEffect(() => {
    if (!uploadedPath) return setVideoUrl(null);
    signedVideoUrl(sb, uploadedPath).then(setVideoUrl).catch(() => setVideoUrl(null));
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

  async function onFileSelected(file: File) {
    if (!bundle || inFlight.current || !config.supabase || !params) return;
    setError("");
    const check = validateVideoFile(file, config.maxUploadBytes);
    if (!check.ok) return setError(check.error);
    let video = bundle.video;
    if (video && (video.original_filename !== file.name.slice(0, 255) || video.byte_size !== file.size)) {
      return setError(`An incomplete upload of "${video.original_filename}" (${formatBytes(video.byte_size)}) exists. Select that same file to resume, or remove it first.`);
    }
    inFlight.current = true;
    setLocalUpload({ phase: "uploading", progress: 0 });
    try {
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
      await finalizeUpload(sb, video.id, params as Record<string, unknown>);
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
  const canChangeVideo = state === "not_uploaded" || state === "upload_incomplete";
  const finished = state === "completed" || state === "insufficient_data" || state === "failed";

  return (
    <div className="space-y-4">
      <a href="#/" className="inline-flex items-center gap-1 text-xs" style={{ color: BLUE_SKY }}><ArrowLeft size={12} /> All sessions</a>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">{session.title}</h1>
            <p className="text-xs" style={{ color: WHITE_SUB }}>
              {session.session_date} · {CONTEXT_LABELS[session.session_context]} · {FORMAT_LABELS[session.play_format]} · {session.performance_scope}
            </p>
            {session.notes && <p className="text-xs mt-2" style={{ color: WHITE_DIM }}>{session.notes}</p>}
          </div>
          <div className="flex items-center gap-2">
            {state && <AnalysisStateBadge state={state} />}
            <button type="button" title="Delete session" disabled={busy || state === "uploading" || state === "processing"}
              onClick={() => { if (window.confirm("Delete this session, its video and results?")) void run(async () => { await deleteSession(sb, bundle); navigate("/"); }); }}
              className="p-2 rounded-lg disabled:opacity-30" style={{ color: WHITE_DIM, border: `1px solid ${BORDER}` }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Card>

      <Card accent={BLUE_SKY}>
        <WidgetHeader title="Video & analysis status" subtitle={state ? stateDescription(state, job) : ""} accent={BLUE_SKY} />
        {video && (
          <p className="text-xs mb-3" style={{ color: WHITE_DIM }}>
            {video.original_filename} · {formatBytes(video.byte_size)}
            {job && job.attempts > 0 && ` · attempt ${job.attempts} of ${job.max_attempts}`}
          </p>
        )}
        {localUpload && (
          <div className="space-y-1 mb-3">
            <ProgressBar fraction={localUpload.progress} />
            <p className="text-[11px]" style={{ color: WHITE_SUB }}>
              {localUpload.phase === "finalizing" ? "Registering upload…" : `${Math.round(localUpload.progress * 100)}% uploaded`}
            </p>
          </div>
        )}
        {state === "failed" && job?.error_code && (
          <div className="mb-3"><Notice tone="error"><strong>{job.error_code}</strong>: {job.error_message}</Notice></div>
        )}

        {canChangeVideo && (
          <div className="space-y-3">
            <AnalysisParamsForm onChange={(p, err) => { setParams(p); setParamsError(err); }} />
            <label className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold cursor-pointer"
              style={{ background: params ? NEON : `${NEON}50`, color: NEON_D }}>
              <Upload size={14} /> {state === "upload_incomplete" ? "Resume upload (select the same file)" : "Choose video & upload"}
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" className="hidden"
                disabled={!params || !!localUpload}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFileSelected(f); }} />
            </label>
            <p className="text-[11px]" style={{ color: WHITE_SUB }}>
              MP4, MOV, WEBM or AVI up to {formatBytes(config.maxUploadBytes)}. Uploads go straight to private storage and resume after interruptions.
            </p>
            {state === "upload_incomplete" && video && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void run(() => finalizeUpload(sb, video.id, (params ?? {}) as Record<string, unknown>))}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-40" style={{ color: BLUE_SKY, border: `1px solid ${BLUE_SKY}60` }}>
                  Check if the upload finished
                </button>
                <button type="button" disabled={busy} onClick={() => void run(() => removeVideo(sb, video))}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-40" style={{ color: ORANGE, border: `1px solid ${ORANGE}60` }}>
                  Remove incomplete upload
                </button>
              </div>
            )}
          </div>
        )}

        {finished && job && (
          <details className="mt-2">
            <summary className="text-xs font-semibold cursor-pointer" style={{ color: BLUE_SKY }}>Re-run analysis with different inputs</summary>
            <div className="mt-3 space-y-3">
              <AnalysisParamsForm onChange={(p, err) => { setParams(p); setParamsError(err); }} />
              <button type="button" disabled={busy || !params}
                onClick={() => void run(() => requestReanalysis(sb, job.id, params as Record<string, unknown>))}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
                style={{ background: BLUE_SKY, color: "#071a3e" }}>
                <RefreshCw size={14} /> Re-run analysis
              </button>
              <p className="text-[11px]" style={{ color: WHITE_SUB }}>The current result is replaced when the new run finishes.</p>
            </div>
          </details>
        )}
        {paramsError && <div className="mt-2"><Notice tone="error">{paramsError}</Notice></div>}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </Card>

      {parsed?.ok && <ResultView result={parsed.result} videoUrl={videoUrl} previous={previous} />}
      {parsed && !parsed.ok && (
        <Notice tone="error">The stored result could not be read ({parsed.error}). It is not shown to avoid presenting it incorrectly.</Notice>
      )}
    </div>
  );
}

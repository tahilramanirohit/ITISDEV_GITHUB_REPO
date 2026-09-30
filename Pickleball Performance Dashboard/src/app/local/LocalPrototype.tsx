import { useEffect, useState } from "react";
import { ContractError, parseAnalysisResult, type AnalysisResultV1 } from "../../lib/analysis/contract";
import { config } from "../../lib/config";
import { validateVideoFile } from "../../lib/upload/validate";
import { BLUE_SKY, WHITE_DIM } from "../theme";
import { Card, Notice, WidgetHeader, fieldStyle } from "../shell/primitives";
import { AnalysisParamsForm, ProgressBar, type AnalysisParams } from "../analysis/AnalysisStatus";
import { CourtCorrection } from "../analysis/CourtCorrection";
import type { CourtConfirmation } from "../../lib/analysis/courtReview";
import { ResultView } from "../analysis/ResultView";

type Phase = "idle" | "uploading" | "processing" | "done" | "error";
type Progress = { fraction: number | null; text: string };

/** POST with upload progress (fetch cannot report it). Resolves with status and parsed JSON body. */
function postWithProgress(url: string, body: FormData, onUpload: (fraction: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onUpload(e.loaded / e.total); };
    xhr.upload.onload = () => onUpload(1);
    xhr.onload = () => {
      let parsed: unknown = null;
      try { parsed = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      resolve({ status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new Error(`Could not reach the local analyzer at ${config.cvBackendUrl}. Is it running?`));
    xhr.send(body);
  });
}

/**
 * Developer tool: sends a file to the local FastAPI prototype and renders the
 * result. Nothing is stored; there are no accounts. Use Sessions for the real
 * application flow.
 */
export default function LocalPrototype() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [params, setParams] = useState<AnalysisParams | null>({});
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [court, setCourt] = useState<CourtConfirmation | null>(null);
  const [maxSeconds, setMaxSeconds] = useState(120);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResultV1 | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    if (!file) return setVideoUrl(null);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function analyze() {
    if (!file || !params || !court) return;
    if (court.calibration_frame_s >= maxSeconds) {
      setError("The court frame is after the analysis time limit. Choose an earlier frame or increase the time limit.");
      return;
    }
    setPhase("processing");
    setError("");
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    form.append("calibration", JSON.stringify(court.calibration));
    form.append("calibration_source", court.calibration_source);
    form.append("calibration_frame_s", String(court.calibration_frame_s));
    const q = new URLSearchParams({ max_seconds: String(maxSeconds) });
    if (params.selection?.method === "court_half") q.set("court_half", params.selection.court_half);
    if (params.selection?.method === "track_id") q.set("track_id", String(params.selection.track_id));
    const progressId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    q.set("progress_id", progressId);
    setPhase("uploading");
    setProgress({ fraction: 0, text: "Sending the video to the local analyzer · 0%" });
    let poll: number | undefined;
    const started = Date.now();
    const startPolling = () => {
      if (poll !== undefined) return;
      setPhase("processing");
      setProgress({ fraction: null, text: "Starting the analysis…" });
      poll = window.setInterval(() => {
        fetch(`${config.cvBackendUrl}/analyze/progress/${progressId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((p: { stage: string; progress: number } | null) => {
            if (!p || typeof p.progress !== "number") return;
            let text = `${p.stage === "finishing" ? "Saving the report" : "Finding the players, the court and the ball"} · ${Math.round(p.progress * 100)}%`;
            if (p.progress >= 0.1 && p.progress < 1) {
              const minutes = Math.round(((Date.now() - started) * (1 - p.progress)) / p.progress / 60_000);
              text += minutes < 1 ? " · less than a minute left" : ` · about ${minutes} min left`;
            }
            setProgress({ fraction: p.progress, text });
          })
          .catch(() => { /* an older server without progress: keep the moving bar */ });
      }, 1000);
    };
    try {
      const res = await postWithProgress(`${config.cvBackendUrl}/analyze/video?${q}`, form, (f) => {
        if (f >= 1) startPolling();
        else setProgress({ fraction: f, text: `Sending the video to the local analyzer · ${Math.round(f * 100)}%` });
      });
      const body = res.body as { detail?: unknown } | null;
      if (res.status < 200 || res.status >= 300) throw new Error(body?.detail ? String(body.detail) : `HTTP ${res.status}`);
      setResult(parseAnalysisResult(body));
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setError(e instanceof ContractError ? `Unexpected result format: ${e.message}` : e instanceof Error ? e.message : String(e));
    } finally {
      if (poll !== undefined) window.clearInterval(poll);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <Notice tone="warn">
        <strong>Local prototype.</strong> The video is sent to the FastAPI server at <code>{config.cvBackendUrl}</code> and
        analyzed while you wait. Nothing is saved and there is no sign-in. Analysis stops after the time limit below,
        and the result reports how much of the video was covered.
      </Notice>
      <Card accent={BLUE_SKY}>
        <WidgetHeader title="Analyze a local video" subtitle="Use a handheld or fixed-camera video you have permission to analyze." accent={BLUE_SKY} />
        <div className="space-y-3">
          <input type="file" accept="video/*" aria-label="Video file"
            className="w-full text-sm rounded-lg border p-3 cursor-pointer" style={fieldStyle}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              const check = f ? validateVideoFile(f, 150 * 1024 * 1024) : null;
              setError(check && !check.ok ? check.error : "");
              setFile(check?.ok ? f : null);
              setCourt(null);
            }} />
          {file && !court && <CourtCorrection file={file} onConfirm={setCourt} onCancel={() => setFile(null)} />}
          {court && <p className="text-sm" style={{ color: WHITE_DIM }}>Court mapping confirmed for the chosen fixed-camera frame. The analyzer will reject it if painted lines do not match.</p>}
          <AnalysisParamsForm onChange={(p, err) => { setParams(p); setParamsError(err); }} />
          <label className="flex items-center gap-2 text-sm" style={{ color: WHITE_DIM }}>
            Stop after
            <input type="number" min={5} max={600} value={maxSeconds} className="w-20 rounded-lg px-2 py-1" style={fieldStyle}
              onChange={(e) => setMaxSeconds(Math.max(5, Math.min(600, Number(e.target.value) || 120)))} />
            seconds of video
          </label>
          {paramsError && <Notice tone="error">{paramsError}</Notice>}
          <button type="button" onClick={analyze} disabled={!file || !params || !court || phase === "processing" || phase === "uploading"}
            className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40" style={{ background: BLUE_SKY, color: "#ffffff" }}>
            {phase === "uploading" ? "Sending…" : phase === "processing" ? "Analyzing…" : "Analyze"}
          </button>
          {progress && (
            <div className="space-y-1" data-testid="local-progress">
              <ProgressBar fraction={progress.fraction} label="Analysis progress" />
              <p className="text-sm" style={{ color: WHITE_DIM }}>{progress.text}</p>
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Card>
      {result && <ResultView result={result} videoUrl={videoUrl} experimentalReview />}
    </div>
  );
}

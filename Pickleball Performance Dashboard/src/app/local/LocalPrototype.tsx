import { useEffect, useState } from "react";
import { ContractError, parseAnalysisResult, type AnalysisResultV1 } from "../../lib/analysis/contract";
import { config } from "../../lib/config";
import { validateVideoFile } from "../../lib/upload/validate";
import { BLUE_SKY, WHITE_DIM } from "../theme";
import { Card, Notice, WidgetHeader, fieldStyle } from "../shell/primitives";
import { AnalysisParamsForm, type AnalysisParams } from "../analysis/AnalysisStatus";
import { ResultView } from "../analysis/ResultView";

type Phase = "idle" | "processing" | "done" | "error";

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
  const [maxSeconds, setMaxSeconds] = useState(120);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResultV1 | null>(null);

  useEffect(() => {
    if (!file) return setVideoUrl(null);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function analyze() {
    if (!file || !params) return;
    setPhase("processing");
    setError("");
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    if (params.calibration) form.append("calibration", JSON.stringify(params.calibration));
    const q = new URLSearchParams({ max_seconds: String(maxSeconds) });
    if (params.selection?.method === "court_half") q.set("court_half", params.selection.court_half);
    if (params.selection?.method === "track_id") q.set("track_id", String(params.selection.track_id));
    try {
      const res = await fetch(`${config.cvBackendUrl}/analyze/video?${q}`, { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : `HTTP ${res.status}`);
      setResult(parseAnalysisResult(body));
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setError(e instanceof ContractError ? `Unexpected result format: ${e.message}` : e instanceof Error ? e.message : String(e));
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
        <WidgetHeader title="Analyze a local video" subtitle="Fixed-camera footage you have permission to use." accent={BLUE_SKY} />
        <div className="space-y-3">
          <input type="file" accept="video/*" aria-label="Video file"
            className="w-full text-sm text-white bg-slate-900 rounded-lg border border-slate-800 p-3 cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              const check = f ? validateVideoFile(f, 150 * 1024 * 1024) : null;
              setError(check && !check.ok ? check.error : "");
              setFile(check?.ok ? f : null);
            }} />
          <AnalysisParamsForm onChange={(p, err) => { setParams(p); setParamsError(err); }} />
          <label className="flex items-center gap-2 text-xs" style={{ color: WHITE_DIM }}>
            Stop after
            <input type="number" min={5} max={600} value={maxSeconds} className="w-20 rounded-lg px-2 py-1" style={fieldStyle}
              onChange={(e) => setMaxSeconds(Math.max(5, Math.min(600, Number(e.target.value) || 120)))} />
            seconds of video
          </label>
          {paramsError && <Notice tone="error">{paramsError}</Notice>}
          <button type="button" onClick={analyze} disabled={!file || !params || phase === "processing"}
            className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40" style={{ background: BLUE_SKY, color: "#071a3e" }}>
            {phase === "processing" ? "Analyzing…" : "Analyze"}
          </button>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Card>
      {result && <ResultView result={result} videoUrl={videoUrl} />}
    </div>
  );
}

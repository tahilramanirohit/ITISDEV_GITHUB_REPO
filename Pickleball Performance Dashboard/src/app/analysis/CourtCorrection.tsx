import { useEffect, useRef, useState } from "react";
import { config } from "../../lib/config";
import {
  COURT_LANDMARKS, parseCourtProposal, validateCourtDraft,
  type CourtConfirmation, type CourtDraft, type CourtLandmark,
} from "../../lib/analysis/courtReview";
import { BLUE_SKY, BORDER, WHITE_DIM } from "../theme";
import { Notice, fieldStyle } from "../shell/primitives";

type Still = { url: string; blob: Blob; width: number; height: number; time: number };
const SEGMENTS: [CourtLandmark, CourtLandmark][] = [
  ["near_left_baseline", "near_right_baseline"], ["near_left_kitchen", "near_right_kitchen"],
  ["far_left_kitchen", "far_right_kitchen"], ["far_left_baseline", "far_right_baseline"],
  ["near_left_baseline", "near_left_kitchen"], ["near_right_baseline", "near_right_kitchen"],
  ["near_left_kitchen", "far_left_kitchen"], ["near_right_kitchen", "far_right_kitchen"],
  ["far_left_kitchen", "far_left_baseline"], ["far_right_kitchen", "far_right_baseline"],
];

/**
 * The court preview service runs on the analysis computer at a localhost
 * address. A phone (or any https page) cannot reach it, so automatic
 * detection then happens on the analyzer after upload instead.
 */
export function previewServiceReachable(pageProtocol = typeof location === "undefined" ? "http:" : location.protocol, backend = config.cvBackendUrl): boolean {
  const localBackend = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(backend);
  return !(localBackend && pageProtocol === "https:");
}

export function CourtCorrection({ file, onConfirm, onCancel, onAutomatic }: {
  file: File; onConfirm: (value: CourtConfirmation) => void; onCancel: () => void;
  /** Upload without points; the analyzer finds the court itself. */
  onAutomatic?: () => void;
}) {
  const previewAvailable = previewServiceReachable();
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const [still, setStill] = useState<Still | null>(null);
  const [draft, setDraft] = useState<CourtDraft | null>(null);
  const [active, setActive] = useState<CourtLandmark>("near_left_kitchen");
  const [dragging, setDragging] = useState<CourtLandmark | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next); setStill(null); setDraft(null); setError(""); setNote("");
    return () => URL.revokeObjectURL(next);
  }, [file]);

  async function useFrame() {
    const v = video.current;
    if (!v || !v.videoWidth || !v.videoHeight) return setError("Wait for a readable video frame.");
    const scale = Math.min(1, 1280 / v.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return setError("Could not capture this frame. Try a browser-playable MP4 or MOV.");
    setStill({ url: canvas.toDataURL("image/jpeg", 0.88), blob, width: canvas.width, height: canvas.height, time: v.currentTime });
    setDraft({ image_width: canvas.width, image_height: canvas.height, points: [] });
    setError(""); setNote(previewAvailable ? "Place at least four named painted-court points, or ask the local analyzer to propose them."
      : "Place at least four named painted-court points, or use automatic court finding above.");
  }

  async function detect() {
    if (!still) return;
    setBusy(true); setError("");
    const form = new FormData();
    form.append("frame", still.blob, "court.jpg");
    try {
      const response = await fetch(`${config.cvBackendUrl}/court/preview`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? `Preview failed (${response.status}).`);
      const proposal = parseCourtProposal(data);
      setDraft(proposal);
      setNote("Automatic proposal shown in yellow. Drag any misplaced point, then confirm. This is for a fixed camera view.");
    } catch (e) {
      setError(e instanceof TypeError
        ? "The local court preview service is unavailable. Mark points manually on this frame; the worker will check them against the video."
        : e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  function setPoint(name: CourtLandmark, pixel: [number, number]) {
    if (!draft) return;
    setDraft((current) => current && ({ ...current, points: [
      ...current.points.filter((p) => p.landmark !== name), { landmark: name, pixel },
    ] }));
    setError("");
  }

  function removePoint(name: CourtLandmark) {
    setDraft((current) => current && ({ ...current,
      points: current.points.filter((p) => p.landmark !== name),
    }));
    setError("");
  }

  function pixelAt(e: React.PointerEvent<SVGSVGElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min((still?.width ?? 1) - 1, (e.clientX - r.left) * (still?.width ?? 1) / r.width)),
      Math.max(0, Math.min((still?.height ?? 1) - 1, (e.clientY - r.top) * (still?.height ?? 1) / r.height))];
  }

  async function confirm() {
    if (!draft || !still) return;
    const issue = validateCourtDraft(draft);
    if (issue) return setError(issue);
    setBusy(true); setError("");
    const form = new FormData();
    form.append("frame", still.blob, "court.jpg");
    form.append("calibration", JSON.stringify(draft));
    try {
      if (!previewAvailable) throw new TypeError("preview service not reachable from this device");
      const response = await fetch(`${config.cvBackendUrl}/court/validate`, { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail ?? `Court validation failed (${response.status}).`);
      }
    } catch (e) {
      if (!(e instanceof TypeError)) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); return; }
      setNote("The local preview service is unavailable. Geometry passed the browser check; the worker will reject it if the painted lines do not match.");
    }
    onConfirm({ calibration: draft, calibration_source: "user_confirmed", calibration_frame_s: still.time });
    setBusy(false);
  }

  const issue = draft ? validateCourtDraft(draft) : "Choose a frame first.";
  const handle = Math.max(9, (still?.width ?? 0) / 45);
  const point = (name: CourtLandmark) => draft?.points.find((p) => p.landmark === name)?.pixel;
  return <section aria-label="Review court mapping" className="space-y-3 rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
    <h3 className="text-lg font-bold">Confirm the court before analysis</h3>
    {onAutomatic && <div className="rounded-2xl p-3" style={{ background: "#e3f6ea" }}>
      <p className="text-sm font-bold" style={{ color: "#0b2a1a" }}>Find the court automatically{previewAvailable ? "" : " (recommended on phones)"}</p>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>The analyzer finds the court lines itself after upload. Mark points below only if it gets the court wrong.</p>
      <button type="button" onClick={onAutomatic} className="mt-2 inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-bold"
        style={{ background: "#febc17", color: "#2b2100" }}>Upload and find the court automatically</button>
    </div>}
    <p className="text-sm" style={{ color: WHITE_DIM }}>Use a steady, fixed-camera view with visible painted lines. The correction applies only until the camera moves or cuts. Yellow points are a proposal, not proof that the court was found correctly.</p>
    <video ref={video} src={url} controls preload="metadata" playsInline onLoadedData={() => {
      const v = video.current;
      if (v?.requestVideoFrameCallback) v.requestVideoFrameCallback(() => void useFrame());
      else void useFrame();
    }}
      className="w-full max-h-80 rounded-lg bg-black" aria-label="Video for choosing a court frame" />
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void useFrame()} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ border: `1px solid ${BORDER}` }}>Use current frame</button>
      {previewAvailable && <button type="button" onClick={() => void detect()} disabled={!still || busy}
        className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ border: `1px solid ${BORDER}` }}>
        {busy ? "Checking…" : "Detect court on this frame"}
      </button>}
    </div>
    {still && draft && <>
      <div className="relative max-w-3xl" style={{ aspectRatio: `${still.width}/${still.height}` }}>
        <img src={still.url} alt="Chosen court frame" className="absolute inset-0 h-full w-full rounded-lg" />
        <svg className="absolute inset-0 h-full w-full touch-none" viewBox={`0 0 ${still.width} ${still.height}`}
          aria-label="Draggable court landmarks" onPointerDown={(e) => {
            const chosen = (e.target as Element).getAttribute("data-landmark") as CourtLandmark | null;
            const name = chosen ?? active;
            setActive(name); setDragging(name); setPoint(name, pixelAt(e)); e.currentTarget.setPointerCapture(e.pointerId);
          }} onPointerMove={(e) => { if (dragging) setPoint(dragging, pixelAt(e)); }}
          onPointerUp={(e) => { setDragging(null); e.currentTarget.releasePointerCapture(e.pointerId); }}>
          <rect width={still.width} height={still.height} fill="transparent" />
          {SEGMENTS.map(([a, b]) => {
            const p = point(a), q = point(b);
            return p && q ? <line key={`${a}:${b}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]}
              stroke="#facc15" strokeWidth={handle / 3} strokeDasharray={`${handle} ${handle / 2}`} pointerEvents="none" /> : null;
          })}
          {/* Sized to the frame so handles stay finger-sized when the frame is shown on a phone. */}
          {draft.points.map((p) => <g key={p.landmark} data-landmark={p.landmark}>
            <circle data-landmark={p.landmark} cx={p.pixel[0]} cy={p.pixel[1]} r={handle * 2.2} fill="transparent" />
            <circle data-landmark={p.landmark} cx={p.pixel[0]} cy={p.pixel[1]} r={handle} fill="#facc15" stroke="#111827" strokeWidth={handle / 4} />
            <text data-landmark={p.landmark} x={p.pixel[0] + handle * 1.3} y={p.pixel[1] - handle} fill="#facc15"
              stroke="#111827" strokeWidth={handle / 4} paintOrder="stroke" fontSize={handle * 1.6}>{p.landmark.replaceAll("_", " ")}</text>
          </g>)}
        </svg>
      </div>
      <label className="block text-sm font-semibold" htmlFor="court-point">Point to place or move</label>
      <div className="flex flex-wrap gap-2">
        <select id="court-point" value={active} onChange={(e) => setActive(e.target.value as CourtLandmark)}
          className="w-full max-w-sm rounded-lg px-3 py-2" style={fieldStyle}>
          {COURT_LANDMARKS.map((name) => <option key={name} value={name}>{name.replaceAll("_", " ")}</option>)}
        </select>
        <button type="button" disabled={!point(active)} onClick={() => removePoint(active)}
          className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${BORDER}` }}>
          Remove selected point
        </button>
      </div>
      <p className="text-sm" style={{ color: WHITE_DIM }}>Choose a point name, then tap its position on the frame; drag a yellow handle to correct it. Only mark visible painted intersections. If a corner is outside the image, remove that point instead of guessing its position at the edge.</p>
      <p className="text-sm" style={{ color: WHITE_DIM }}>{draft.points.length} points · frame at {still.time.toFixed(1)} s</p>
    </>}
    {note && <p className="text-sm" style={{ color: WHITE_DIM }}>{note}</p>}
    {error && <Notice tone="warn">{error}</Notice>}
    {issue && still && <p className="text-sm" style={{ color: WHITE_DIM }}>{issue}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!!issue || busy} onClick={() => void confirm()}
        className="rounded-lg px-4 py-2 font-semibold disabled:opacity-40" style={{ background: BLUE_SKY, color: "white" }}>Confirm mapping and continue</button>
      <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2" style={{ border: `1px solid ${BORDER}` }}>Cancel</button>
    </div>
  </section>;
}

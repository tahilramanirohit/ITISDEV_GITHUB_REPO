import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { parseAnalysisResult, ContractError, type AnalysisResultV1 } from "../../lib/analysis/contract";
import {
  LABEL_TYPES, OUTCOMES, TYPE_KEYS, TYPE_NAMES, boxesAt, draftsFromResult, formatTime, newId, parseLabelFile,
  snapToFrame, sortLabels, toLabelFile, typeForKey, LabelFileError, type LabelType, type Outcome, type ShotLabel,
} from "../../lib/analysis/labels";
import { SHOT_INFO } from "../../lib/analysis/shotLabels";
import { BORDER, COBALT, INK, ORANGE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Notice, Pill, WidgetHeader, fieldStyle } from "../shell/primitives";

const NOT_A_SHOT_COLOR = "#66707c";
const typeColor = (t: LabelType) => (t === "not_a_shot" ? NOT_A_SHOT_COLOR : SHOT_INFO[t].color);
const PLAYER_COLORS = ["#66707c", "#293df2", "#0f766e", "#ad2545", "#b5651d", "#6543a4", "#1f7a4d", "#9f1239", "#4f5fd6", "#a94318"];
const playerColor = (p: number | null) => PLAYER_COLORS[(p ?? 0) % PLAYER_COLORS.length];

type Meta = { video: string; labelled_by: string; notes: string; identity_scheme?: "human"; players?: Record<string, string>; tracker_mapping?: Record<string, number> };
type Saved = { labels: ShotLabel[]; meta: Meta };

const storageKey = (file: File) => `picklepro:labels:${file.name}:${file.size}`;

function readSaved(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: Saved) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked; the Download button still works.
  }
}

async function readJson(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const buttonClass = "rounded-lg px-3 py-1.5 text-sm font-semibold min-h-[36px]";
const buttonStyle = { border: `1px solid ${BORDER}`, background: "#fff", color: INK } as const;

export default function LabelPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResultV1 | null>(null);
  const [labels, setLabels] = useState<ShotLabel[]>([]);
  const [meta, setMeta] = useState<Meta>({ video: "", labelled_by: "", notes: "", identity_scheme: "human" });
  const [player, setPlayer] = useState<number | null>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [fpsInput, setFpsInput] = useState("30");
  const [message, setMessage] = useState<{ tone: "info" | "warn" | "error"; text: string } | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);

  const fps = result?.video.fps && result.video.fps > 0 ? result.video.fps : Number(fpsInput) > 0 ? Number(fpsInput) : 30;
  const frame = 1 / fps;
  const selected = labels.find((l) => l.id === selectedId) ?? null;
  const drafts = labels.filter((l) => l.draft).length;

  // Keep the video's object URL for as long as it is shown.
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  // Autosave per video, so closing the tab loses nothing.
  useEffect(() => {
    if (videoFile) writeSaved(storageKey(videoFile), { labels, meta });
  }, [videoFile, labels, meta]);

  const players = useMemo(() => {
    return [1, 2, 3, 4].map((id) => {
      const tracked = (result?.players ?? []).find((p) => p.player_id === meta.tracker_mapping?.[String(id)]);
      return { id, label: meta.players?.[String(id)] ?? `Person ${id}`, thumbnail: tracked?.thumbnail ?? null };
    });
  }, [result, meta.players, meta.tracker_mapping]);

  // ── Loading files ────────────────────────────────────────────────────────
  function onVideo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    const saved = readSaved(storageKey(file));
    if (saved?.labels?.length) {
      setLabels(saved.labels);
      setMeta({ ...saved.meta, video: file.name });
      setMessage({ tone: "info", text: `Restored ${saved.labels.length} labels saved in this browser for ${file.name}.` });
    } else {
      setLabels([]);
      setMeta({ video: file.name, labelled_by: meta.labelled_by, notes: "", identity_scheme: "human" });
      setMessage(null);
    }
  }

  async function onResult(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseAnalysisResult(await readJson(file));
      setResult(parsed);
      const onCourt = (parsed.players ?? []).filter((p) => p.on_court);
      const n = parsed.metrics.shot_classification.value?.shots.length ?? 0;
      setMessage({ tone: "info", text: `Loaded the PicklePro result: ${onCourt.length} tracks, ${n} detected shots. Match tracker IDs to your person labels below before scoring hitter accuracy.` });
    } catch (err) {
      const why = err instanceof ContractError || err instanceof SyntaxError ? err.message : String(err);
      setMessage({ tone: "error", text: `That file is not a PicklePro result: ${why}` });
    }
    e.target.value = "";
  }

  async function onLabels(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { labels: loaded, meta: m } = parseLabelFile(await readJson(file));
      setLabels(loaded);
      setMeta({ video: videoFile?.name ?? m.video, labelled_by: m.labelled_by, notes: m.notes,
        identity_scheme: m.identity_scheme, players: m.players, tracker_mapping: m.tracker_mapping });
      const rough = loaded.filter((l) => l.resolution_s > 0.2).length;
      setMessage({ tone: rough || !m.identity_scheme ? "warn" : "info", text: `Loaded ${loaded.length} labels.` + (rough
        ? ` ${rough} have whole-second times: select each one, find the exact contact frame, and press "Move here".` : "") +
        (!m.identity_scheme ? " This older file treats player numbers as tracker IDs; keep using those IDs for this file." : "") });
    } catch (err) {
      const why = err instanceof LabelFileError || err instanceof SyntaxError ? err.message : String(err);
      setMessage({ tone: "error", text: `Could not read the labels file: ${why}` });
    }
    e.target.value = "";
  }

  function addSuggestions() {
    if (!result) return;
    const extra = draftsFromResult(result, labels, fps, meta.tracker_mapping);
    setLabels((ls) => sortLabels([...ls, ...extra]));
    setMessage({ tone: "info", text: `Added ${extra.length} suggestions from PicklePro's detections (dashed). Check each one: fix the player or type, press Enter to confirm, or Delete to remove it.` });
  }

  // ── Video control ────────────────────────────────────────────────────────
  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(t, v.duration || t));
    v.currentTime = clamped;
    setNow(clamped);
  }, []);

  const step = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    seek(snapToFrame(v.currentTime, fps) + seconds);
  }, [fps, seek]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play(); else v.pause();
  }, []);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate, videoUrl]);

  // ── Editing labels ───────────────────────────────────────────────────────
  const update = useCallback((id: string, patch: Partial<ShotLabel>) => {
    setLabels((ls) => sortLabels(ls.map((l) => (l.id === id ? { ...l, ...patch } : l))));
  }, []);

  const remove = useCallback((id: string) => {
    setLabels((ls) => ls.filter((l) => l.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const currentTime = () => snapToFrame(videoRef.current?.currentTime ?? now, fps);
  const atCurrentFrame = (l: ShotLabel | null) => !!l && Math.abs(l.t - currentTime()) < frame / 2 + 1e-6;

  const applyType = useCallback((type: LabelType) => {
    const t = snapToFrame(videoRef.current?.currentTime ?? 0, fps);
    videoRef.current?.pause();
    if (selected && Math.abs(selected.t - t) < frame / 2 + 1e-6) {
      update(selected.id, { type, player, draft: false, resolution_s: Math.min(selected.resolution_s, 0.1) });
      return;
    }
    const label: ShotLabel = { id: newId(), t, player, type, resolution_s: 0.1 };
    setLabels((ls) => sortLabels([...ls, label]));
    setSelectedId(label.id);
  }, [fps, frame, player, selected, update]);

  const choosePlayer = useCallback((p: number | null) => {
    setPlayer(p);
    if (selected && atCurrentFrame(selected)) update(selected.id, { player: p });
  }, [selected, update, fps]);

  const cycleOutcome = useCallback(() => {
    if (!selected) return;
    const order: (Outcome | undefined)[] = [undefined, ...OUTCOMES];
    update(selected.id, { outcome: order[(order.indexOf(selected.outcome) + 1) % order.length] });
  }, [selected, update]);

  const jumpLabel = useCallback((dir: 1 | -1) => {
    const t = videoRef.current?.currentTime ?? now;
    const sorted = sortLabels(labels);
    const next = dir > 0 ? sorted.find((l) => l.t > t + frame / 2) : [...sorted].reverse().find((l) => l.t < t - frame / 2);
    if (!next) return;
    videoRef.current?.pause();
    seek(next.t);
    setSelectedId(next.id);
    if (next.player !== null) setPlayer(next.player);
  }, [frame, labels, now, seek]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !videoUrl) return;
      const key = e.key;
      let handled = true;
      if (key === " ") togglePlay();
      else if (key === "ArrowLeft") step(e.shiftKey ? -0.5 : -frame);
      else if (key === "ArrowRight") step(e.shiftKey ? 0.5 : frame);
      else if (key === "ArrowUp") jumpLabel(-1);
      else if (key === "ArrowDown") jumpLabel(1);
      else if (/^[0-9]$/.test(key)) choosePlayer(key === "0" ? null : Number(key));
      else if (key === "Enter" && selected) update(selected.id, { draft: false });
      else if ((key === "Delete" || key === "Backspace") && selected) remove(selected.id);
      else if (key === "f" || key === "F") cycleOutcome();
      else if (key === "m" || key === "M") { if (selected) update(selected.id, { t: currentTime(), resolution_s: 0.1 }); }
      else if (key === "[") setRate((r) => Math.max(0.25, r / 2));
      else if (key === "]") setRate((r) => Math.min(2, r * 2));
      else {
        const type = typeForKey(key);
        if (type) applyType(type); else handled = false;
      }
      if (handled) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoUrl, frame, selected, togglePlay, step, jumpLabel, choosePlayer, update, remove, cycleOutcome, applyType]);

  // ── Overlay: player boxes with PicklePro IDs, and labels at this moment ──
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c) {
        const rect = v.getBoundingClientRect();
        if (c.width !== Math.round(rect.width) || c.height !== Math.round(rect.height)) {
          c.width = Math.round(rect.width);
          c.height = Math.round(rect.height);
        }
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          const t = v.currentTime;
          const vw = v.videoWidth || result?.video.width || 1;
          const vh = v.videoHeight || result?.video.height || 1;
          const scale = Math.min(c.width / vw, c.height / vh);
          const ox = (c.width - vw * scale) / 2;
          const oy = (c.height - vh * scale) / 2;
          // Result boxes are in the analysed video's pixels.
          const sx = result ? (vw / result.video.width) * scale : scale;
          const sy = result ? (vh / result.video.height) * scale : scale;
          if (showBoxes) {
            for (const b of boxesAt(result, t)) {
              const [x1, y1, x2, y2] = b.bbox;
              const color = playerColor(b.track_id);
              const active = b.track_id === player;
              ctx.strokeStyle = color;
              ctx.lineWidth = active ? 3 : 1.5;
              ctx.strokeRect(ox + x1 * sx, oy + y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
              ctx.fillStyle = color;
              ctx.font = "bold 14px Inter, sans-serif";
              const tag = `P${b.track_id ?? "?"}`;
              const w = ctx.measureText(tag).width + 8;
              ctx.fillRect(ox + x1 * sx, oy + y1 * sy - 18, w, 18);
              ctx.fillStyle = "#fff";
              ctx.fillText(tag, ox + x1 * sx + 4, oy + y1 * sy - 4);
            }
          }
          const here = labels.filter((l) => Math.abs(l.t - t) <= 0.25);
          here.forEach((l, i) => {
            const text = `${TYPE_NAMES[l.type]} · P${l.player ?? "?"}${l.draft ? " (suggested)" : ""}`;
            ctx.font = "bold 16px Inter, sans-serif";
            const w = ctx.measureText(text).width + 16;
            ctx.fillStyle = typeColor(l.type);
            ctx.globalAlpha = l.draft ? 0.6 : 0.92;
            ctx.fillRect(10, 10 + i * 30, w, 26);
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#fff";
            ctx.fillText(text, 18, 28 + i * 30);
          });
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [result, labels, player, showBoxes]);

  const confirmed = labels.length - drafts;
  const rough = labels.filter((l) => l.resolution_s > 0.2).length;
  const saveName = `${(meta.video || "video").replace(/\.[^.]+$/, "")}.labels.json`;

  return (
    <div className="space-y-4">
      <Card accent={COBALT}>
        <WidgetHeader level="h1" title="Label shots" subtitle="Mark the exact moment of every shot, who hit it and what it was. The labels score PicklePro's shot detection." accent={COBALT} />
        <p className="text-sm mb-3" style={{ color: WHITE_DIM }}>
          Everything stays on this computer: the video is played from your disk and never uploaded. Labels are saved in this
          browser as you go; press <strong>Download labels</strong> to keep a file. Score a result with{" "}
          <code>python -m picklepro.evaluate result.json your.labels.json</code>.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold" style={{ color: WHITE_DIM }}>
            1. Video <span style={{ color: ORANGE }}>(required)</span>
            <input type="file" accept="video/*" onChange={onVideo} className="mt-1 block w-full text-sm" />
          </label>
          <label className="text-sm font-semibold" style={{ color: WHITE_DIM }}>
            2. PicklePro result (optional)
            <input type="file" accept="application/json,.json" onChange={(e) => void onResult(e)} className="mt-1 block w-full text-sm" />
            <span className="block font-normal text-xs mt-1" style={{ color: WHITE_SUB }}>Shows player IDs on the video. Download it from a session's results.</span>
          </label>
          <label className="text-sm font-semibold" style={{ color: WHITE_DIM }}>
            3. Existing labels (optional)
            <input type="file" accept="application/json,.json" onChange={(e) => void onLabels(e)} className="mt-1 block w-full text-sm" />
            <span className="block font-normal text-xs mt-1" style={{ color: WHITE_SUB }}>Continue a labels file, e.g. eval/TestVideoKirk_REAL.labels.json.</span>
          </label>
        </div>
      </Card>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {videoUrl && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef} src={videoUrl} className="w-full block" playsInline preload="auto"
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onSeeked={(e) => setNow(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onClick={togglePlay}
              />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
            </div>

            <Timeline duration={duration} now={now} labels={labels} selectedId={selectedId}
              onSeek={(t) => seek(t)} onPick={(l) => { seek(l.t); setSelectedId(l.id); }} />

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => step(-0.5)} title="Shift + ←">−0.5 s</button>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => step(-frame)} title="←">−1 frame</button>
              <button type="button" className={buttonClass} style={{ ...buttonStyle, background: COBALT, color: "#fff", borderColor: COBALT }} onClick={togglePlay} title="Space">
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => step(frame)} title="→">+1 frame</button>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => step(0.5)} title="Shift + →">+0.5 s</button>
              <label className="text-sm flex items-center gap-1" style={{ color: WHITE_DIM }}>
                Speed
                <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded-md px-1 py-1" style={fieldStyle}>
                  {[0.25, 0.5, 1, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
                </select>
              </label>
              <span className="text-sm font-mono ml-auto" style={{ color: INK }}>
                {formatTime(now)} · frame {Math.round(now * fps)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: WHITE_SUB }}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} disabled={!result} />
                Show player boxes
              </label>
              {!result && (
                <label className="flex items-center gap-1.5">
                  Frames per second
                  <input value={fpsInput} onChange={(e) => setFpsInput(e.target.value)} className="w-16 rounded-md px-1 py-0.5" style={fieldStyle} inputMode="decimal" />
                </label>
              )}
              {result && (
                <button type="button" className={buttonClass} style={buttonStyle} onClick={addSuggestions}>
                  Add PicklePro's detections as suggestions
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Card>
              <h3 className="font-bold mb-2" style={{ color: INK }}>Who hit it? <span className="font-normal text-sm" style={{ color: WHITE_SUB }}>(keys 1–9, 0 = unknown)</span></h3>
              <div className="grid grid-cols-2 gap-2">
                {players.map((p) => (
                  <button key={p.id} type="button" onClick={() => choosePlayer(p.id)} aria-pressed={player === p.id}
                    className="flex items-center gap-2 rounded-lg p-1.5 text-left text-sm"
                    style={{ border: `2px solid ${player === p.id ? playerColor(p.id) : BORDER}`, background: player === p.id ? `${playerColor(p.id)}14` : "#fff" }}>
                    {p.thumbnail
                      ? <img src={p.thumbnail} alt="" className="w-8 h-10 object-cover rounded" />
                      : <span className="w-8 h-10 rounded flex items-center justify-center text-white font-bold" style={{ background: playerColor(p.id) }}>{p.id}</span>}
                    <span><strong>P{p.id}</strong><span className="block text-xs" style={{ color: WHITE_SUB }}>{p.label}</span></span>
                  </button>
                ))}
              </div>
              <label className="block text-xs mt-2" style={{ color: WHITE_SUB }}>
                  Describe people independently of tracker IDs, e.g. "1 = near left, black shirt":
                  <input className="mt-1 w-full rounded-md px-2 py-1 text-sm" style={fieldStyle}
                    value={Object.entries(meta.players ?? {}).map(([k, v]) => `${k} = ${v}`).join("; ")}
                    onChange={(e) => setMeta((m) => ({ ...m, players: Object.fromEntries(e.target.value.split(";")
                      .map((part) => part.split("=").map((s) => s.trim())).filter(([k, v]) => k && v && /^\d+$/.test(k))
                      .map(([k, v]) => [k, v])) }))} />
              </label>
              {result && <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: WHITE_SUB }}>
                {players.map((p) => <label key={p.id}>Person {p.id} matches track
                  <select className="ml-2 rounded px-1 py-1" style={fieldStyle}
                    value={meta.tracker_mapping?.[String(p.id)] ?? ""}
                    onChange={(e) => setMeta((m) => {
                      const mapping = { ...m.tracker_mapping };
                      if (e.target.value) mapping[String(p.id)] = Number(e.target.value);
                      else delete mapping[String(p.id)];
                      return { ...m, tracker_mapping: mapping };
                    })}>
                    <option value="">Unmapped</option>
                    {(result.players ?? []).filter((person) => person.on_court).map((person) =>
                      <option key={person.player_id} value={person.player_id}
                        disabled={Object.entries(meta.tracker_mapping ?? {}).some(([human, track]) => human !== String(p.id) && track === person.player_id)}>
                        Track {person.player_id} ({person.label})
                      </option>)}
                  </select>
                </label>)}
              </div>}
            </Card>

            <Card>
              <h3 className="font-bold mb-2" style={{ color: INK }}>What shot? <span className="font-normal text-sm" style={{ color: WHITE_SUB }}>(adds a label at this frame)</span></h3>
              <div className="grid grid-cols-2 gap-1.5">
                {LABEL_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => applyType(t)}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm font-semibold text-white"
                    style={{ background: typeColor(t) }}>
                    {TYPE_NAMES[t]} <kbd className="text-xs rounded px-1" style={{ background: "rgba(255,255,255,0.25)" }}>{TYPE_KEYS[t].toUpperCase()}</kbd>
                  </button>
                ))}
              </div>
              <details className="mt-3 text-xs" style={{ color: WHITE_SUB }}>
                <summary className="cursor-pointer font-semibold">All keys</summary>
                <ul className="mt-1 space-y-0.5">
                  <li>Space: play / pause · ← →: one frame · Shift+← →: half a second</li>
                  <li>[ ]: slower / faster · ↑ ↓: previous / next label</li>
                  <li>1–9: player (also fixes the selected label at this frame) · 0: unknown player</li>
                  <li>Letter: add a label, or change the selected label at this frame</li>
                  <li>F: cycle fault / error / winner · M: move the selected label to this frame</li>
                  <li>Enter: confirm a suggestion · Delete: remove the selected label</li>
                </ul>
              </details>
            </Card>
          </div>
        </div>
      )}

      {videoUrl && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-bold" style={{ color: INK }}>
              Labels <span className="font-normal text-sm" style={{ color: WHITE_SUB }}>
                {confirmed} confirmed{drafts ? `, ${drafts} suggestions to check (not saved in the file)` : ""}
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} style={buttonStyle}
                onClick={() => { if (window.confirm("Remove all labels for this video?")) { setLabels([]); setSelectedId(null); } }}>
                Clear all
              </button>
              <button type="button" className={buttonClass} style={{ ...buttonStyle, background: COBALT, color: "#fff", borderColor: COBALT }}
                disabled={!confirmed} onClick={() => download(saveName, toLabelFile(labels, meta))}>
                Download labels
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 mb-3">
            <label className="text-sm" style={{ color: WHITE_DIM }}>Labelled by
              <input className="mt-1 w-full rounded-md px-2 py-1" style={fieldStyle} value={meta.labelled_by}
                onChange={(e) => setMeta((m) => ({ ...m, labelled_by: e.target.value }))} placeholder="Name, date" />
            </label>
            <label className="text-sm" style={{ color: WHITE_DIM }}>Notes
              <input className="mt-1 w-full rounded-md px-2 py-1" style={fieldStyle} value={meta.notes}
                onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} placeholder="Camera position, anything unusual" />
            </label>
          </div>
          {rough > 0 && (
            <Notice tone="warn">{rough} label{rough === 1 ? " has" : "s have"} whole-second times. Select it, step to the contact frame, and press Move here (M).</Notice>
          )}
          {labels.length === 0
            ? <p className="text-sm" style={{ color: WHITE_SUB }}>No labels yet. Pause on the frame where the paddle meets the ball, pick the player, then press the shot's key.</p>
            : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ color: WHITE_SUB }}>
                      <th className="py-1 pr-2">Time</th><th className="pr-2">Player</th><th className="pr-2">Shot</th>
                      <th className="pr-2">Outcome</th><th className="pr-2">Note</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {labels.map((l) => (
                      <tr key={l.id} onClick={() => setSelectedId(l.id)}
                        style={{ background: l.id === selectedId ? "#293df214" : undefined, borderTop: `1px solid ${BORDER}`,
                          opacity: l.draft ? 0.75 : 1 }}>
                        <td className="py-1 pr-2 whitespace-nowrap">
                          <button type="button" className="font-mono underline" onClick={() => { seek(l.t); setSelectedId(l.id); }}>
                            {formatTime(l.t)}
                          </button>
                          {l.resolution_s > 0.2 && <span className="ml-1"><Pill color={ORANGE}>±1 s</Pill></span>}
                          {l.draft && <span className="ml-1"><Pill color={WHITE_SUB}>suggested</Pill></span>}
                        </td>
                        <td className="pr-2">
                          <select value={l.player ?? ""} onChange={(e) => update(l.id, { player: e.target.value === "" ? null : Number(e.target.value) })}
                            className="rounded-md px-1 py-0.5" style={fieldStyle} aria-label="Player">
                            <option value="">?</option>
                            {[...new Set([...players.map((p) => p.id), ...(l.player != null ? [l.player] : [])])].map((id) => <option key={id} value={id}>P{id}</option>)}
                          </select>
                        </td>
                        <td className="pr-2">
                          <select value={l.type} onChange={(e) => update(l.id, { type: e.target.value as LabelType })}
                            className="rounded-md px-1 py-0.5" style={{ ...fieldStyle, borderLeft: `4px solid ${typeColor(l.type)}` }} aria-label="Shot type">
                            {LABEL_TYPES.map((t) => <option key={t} value={t}>{TYPE_NAMES[t]}</option>)}
                          </select>
                        </td>
                        <td className="pr-2">
                          <select value={l.outcome ?? ""} onChange={(e) => update(l.id, { outcome: (e.target.value || undefined) as Outcome | undefined })}
                            className="rounded-md px-1 py-0.5" style={fieldStyle} aria-label="Outcome">
                            <option value="">—</option>
                            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                        <td className="pr-2">
                          <input value={l.note ?? ""} onChange={(e) => update(l.id, { note: e.target.value || undefined })}
                            className="w-full min-w-[8rem] rounded-md px-1 py-0.5" style={fieldStyle} aria-label="Note" />
                        </td>
                        <td className="whitespace-nowrap text-right">
                          {l.draft && (
                            <button type="button" className="text-xs font-semibold mr-2" style={{ color: COBALT }} onClick={() => update(l.id, { draft: false })}>Confirm</button>
                          )}
                          <button type="button" className="text-xs font-semibold mr-2" style={{ color: COBALT }} title="M"
                            onClick={() => update(l.id, { t: snapToFrame(videoRef.current?.currentTime ?? now, fps), resolution_s: 0.1 })}>Move here</button>
                          <button type="button" className="text-xs font-semibold" style={{ color: "#ad2545" }} onClick={() => remove(l.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      )}
    </div>
  );
}

function Timeline({ duration, now, labels, selectedId, onSeek, onPick }: {
  duration: number; now: number; labels: ShotLabel[]; selectedId: string | null;
  onSeek: (t: number) => void; onPick: (l: ShotLabel) => void;
}) {
  if (!duration) return null;
  const pos = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;
  return (
    <div className="relative h-9 rounded-lg cursor-pointer select-none" style={{ background: "#fff", border: `1px solid ${BORDER}` }}
      role="slider" aria-label="Video position" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(now)}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * duration);
      }}>
      {labels.map((l) => (
        <button key={l.id} type="button" title={`${formatTime(l.t)} ${TYPE_NAMES[l.type]} P${l.player ?? "?"}`}
          onClick={(e) => { e.stopPropagation(); onPick(l); }}
          className="absolute top-1 bottom-1 w-1.5 -ml-[3px] rounded-sm"
          style={{ left: pos(l.t), background: l.draft ? "transparent" : typeColor(l.type),
            border: l.draft ? `1.5px dashed ${typeColor(l.type)}` : undefined,
            outline: l.id === selectedId ? `2px solid ${INK}` : undefined }} />
      ))}
      <div className="absolute top-0 bottom-0 w-0.5 pointer-events-none" style={{ left: pos(now), background: INK }} />
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart,
  Area, ReferenceLine, Radar, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import {
  Play, Pause, Brain, Target, Users, TrendingUp,
  Activity, Zap, ChevronRight, Clock, Radio, Cpu, X,
} from "lucide-react";

// ── Palette ────────────────────────────────────────────────────────────────
const BLUE_DEEP = "#071a3e";   // page background
const BLUE_MID  = "#0d2554";   // card background
const BLUE_POP  = "#1a5fb4";   // bright interactive blue
const BLUE_SKY  = "#38bdf8";   // sky blue highlight
const NEON      = "#b8f523";   // pickleball neon green
const NEON_D    = "#3d6000";   // dark text on neon bg
const ORANGE    = "#f97316";   // orange accent
const ORANGE_L  = "#fed7aa";   // light orange for text on dark
const WHITE     = "#ffffff";
const WHITE_DIM = "rgba(255,255,255,0.65)";
const WHITE_SUB = "rgba(255,255,255,0.40)";
const BORDER    = "rgba(100,160,255,0.18)";
const CARD_GLOW = "0 0 0 1px rgba(100,160,255,0.15), 0 4px 24px rgba(7,26,62,0.5)";
const VIOLET    = "#a78bfa";

// ── Data ───────────────────────────────────────────────────────────────────
const dinkData = [
  { match: "M1",  rate: 68 }, { match: "M2",  rate: 71 },
  { match: "M3",  rate: 67 }, { match: "M4",  rate: 74 },
  { match: "M5",  rate: 76 }, { match: "M6",  rate: 72 },
  { match: "M7",  rate: 79 }, { match: "M8",  rate: 77 },
  { match: "M9",  rate: 83 }, { match: "M10", rate: 81 },
];

const allRallyData = [
  { shots: 4,  errors: 0, phase: "early" },
  { shots: 6,  errors: 1, phase: "early" },
  { shots: 5,  errors: 0, phase: "early" },
  { shots: 8,  errors: 1, phase: "early" },
  { shots: 7,  errors: 0, phase: "early" },
  { shots: 9,  errors: 1, phase: "early" },
  { shots: 11, errors: 2, phase: "mid"   },
  { shots: 14, errors: 2, phase: "mid"   },
  { shots: 12, errors: 3, phase: "mid"   },
  { shots: 16, errors: 2, phase: "mid"   },
  { shots: 13, errors: 3, phase: "mid"   },
  { shots: 18, errors: 4, phase: "mid"   },
  { shots: 20, errors: 5, phase: "late"  },
  { shots: 23, errors: 6, phase: "late"  },
  { shots: 25, errors: 7, phase: "late"  },
  { shots: 22, errors: 6, phase: "late"  },
  { shots: 28, errors: 8, phase: "late"  },
  { shots: 30, errors: 9, phase: "late"  },
];

type FPoint = { week: string; actual?: number; lower?: number; band?: number };
const forecastData: FPoint[] = [
  { week: "W−8",  actual: 64 }, { week: "W−6", actual: 67 },
  { week: "W−4",  actual: 70 }, { week: "W−2", actual: 73 },
  { week: "Now",  actual: 76, lower: 76, band: 0 },
  { week: "+2w",  lower: 74, band: 4  }, { week: "+4w",  lower: 73, band: 7  },
  { week: "+6w",  lower: 71, band: 10 }, { week: "+8w",  lower: 70, band: 14 },
  { week: "+10w", lower: 68, band: 19 }, { week: "+12w", lower: 67, band: 24 },
];

const playStyleData = [
  { metric: "Dinks (Control)", value: 85, fullMark: 100 },
  { metric: "Drops (Finesse)", value: 78, fullMark: 100 },
  { metric: "Volleys (Reflex)", value: 82, fullMark: 100 },
  { metric: "Lobs (Defense)", value: 65, fullMark: 100 },
  { metric: "Drives (Power)", value: 45, fullMark: 100 },
];

const heatGrid = [
  [0.35, 0.55, 0.85, 0.28, 0.48, 0.18],
  [0.25, 0.42, 0.60, 0.18, 0.28, 0.12],
  [0.70, 0.55, 0.38, 0.10, 0.18, 0.08],
  [0.95, 0.80, 0.50, 0.12, 0.22, 0.08],
];

const WAVE_BARS = [3,6,10,14,18,22,18,26,30,22,18,14,26,18,10,22,30,18,14,10,18,22,14,8,18,26,18,12,8,14,22,18,30,22,14,18,10,6,12,18];

type PlayerDetection = {
  track_id: number;
  bbox: number[];
  confidence: number;
  label: string;
};

type PositionSnapshot = {
  time_seconds: number;
  players: Array<{ track_id: number; label: string; bbox: number[] }>;
};

type AnalysisEvent = {
  time_seconds: number;
  label: string;
  description: string;
  track_id?: number | null;
};

type AnalysisResult = {
  duration_seconds: number;
  frame_count: number;
  fps: number;
  event_timeline: AnalysisEvent[];
  heatmap: number[][];
  player_positions: PositionSnapshot[];
  message: string;
};

const BACKEND_BASE_URL = import.meta.env.VITE_CV_BACKEND_URL ?? "http://localhost:8000";

// ── Post-game summary script (read by Web Speech API) ─────────────────────
// This is a static example of a post-game summary script. In a real application, this would be dynamically generated based on the player's actual performance data and analysis results.
const SUMMARY_TEXT =
  `Welcome back, Alex Garcia. Here is your post-game audio summary for July 8th, 2026. ` +
  `This analysis covers your performance across four key dimensions. ` +

  `Descriptively, your dink success rate reached 81 percent in your most recent match, ` +
  `rising from 67 percent at the start of the 10-match window. ` +
  `You are now within striking distance of your target threshold. ` +

  `From a court positioning standpoint, heatmap data shows 68 percent of your time concentrated in the right-baseline quadrant. ` +
  `Kitchen time stands at 34 percent, which is below your target. ` +
  `The left side of your court remains a recognized vulnerability. ` +

  `On the diagnostic side, a Pearson correlation of 0.97 was detected between rally length and unforced errors. ` +
  `Mistakes escalate sharply in rallies exceeding 18 shots, confirming that late-game physical fatigue, not tactics, is the root cause of your lost points. ` +

  `Looking ahead, your current improvement velocity places your 85 percent volley target approximately 12 weeks away. ` +
  `Your volley success rate of 76 percent is projected to reach the 85 percent goal within 12 weeks under normal training conditions. ` +

  `Here are your three coach recommendations. ` +
  `First, complete Drill Set A, Reset and Recover, before each of your next three sessions to address baseline drive errors in long rallies. ` +
  `Second, join the 4 PM Open Play Queue on July 12th. ` +
  `Your defensive style matches strongly against aggressive opponents, with a projected win rate of 74 percent. ` +
  `Third, add left-side corridor drills twice per week to close the court coverage gap identified in the heatmap. ` +

  `That concludes your post-game summary. Keep pushing, Alex Garcia.`;

const SUMMARY_DURATION_S = 98; // estimated at speech rate 0.92

export type RAGRec = { priority: "HIGH" | "MED" | "LOW"; title: string; body: string };
export type RAGStatus = "idle" | "loading" | "ready" | "error";

// ── Helpers ────────────────────────────────────────────────────────────────
function heatColor(v: number) {
  if (v < 0.5) return `rgba(26,95,180,${0.08 + v * 0.6})`;
  return `rgba(184,245,35,${0.3 + (v - 0.5) * 1.2})`;
}

// ── Card ──────────────────────────────────────────────────────────────────
function Card({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: BLUE_MID,
        boxShadow: CARD_GLOW,
        borderTop: accent ? `3px solid ${accent}` : `1px solid ${BORDER}`,
        border: accent ? undefined : `1px solid ${BORDER}`,
      }}
    >
      {children}
    </div>
  );
}

// ── Section Banner ────────────────────────────────────────────────────────
function SectionBanner({ n, eyebrow, title, subtitle, bg, accent }: {
  n: string; eyebrow: string; title: string; subtitle: string; bg: string; accent: string;
}) {
  return (
    <div className="rounded-2xl px-6 py-4 mb-5 flex items-start gap-4" style={{ background: bg, border: `1px solid ${accent}40` }}>
      <div
        className="rounded-xl w-12 h-12 flex items-center justify-center flex-shrink-0 font-mono font-bold text-lg"
        style={{ background: accent, color: accent === NEON ? NEON_D : WHITE }}
      >
        {n}
      </div>
      <div>
        <div className="text-xs font-bold tracking-widest mb-0.5" style={{ color: accent }}>{eyebrow}</div>
        <div className="font-bold text-lg text-white" style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.04em" }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: WHITE_DIM }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Widget Header ─────────────────────────────────────────────────────────
function WidgetHeader({ title, subtitle, accent }: { title: string; subtitle: string; accent?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-semibold text-sm text-white mb-0.5" style={{ fontSize: "0.9rem" }}>{title}</h3>
      {accent
        ? <div className="flex items-center gap-1.5 mt-1">
            <div className="h-0.5 w-4 rounded" style={{ background: accent }} />
            <p className="text-xs" style={{ color: WHITE_DIM }}>{subtitle}</p>
          </div>
        : <p className="text-xs" style={{ color: WHITE_DIM }}>{subtitle}</p>
      }
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, suffix = "" }: {
  active?: boolean; payload?: any[]; label?: string; suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-2xl" style={{ background: "#0a1f4e", borderColor: BORDER }}>
      {label && <div className="font-bold mb-1.5 text-white">{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color ?? NEON }} />
          <span style={{ color: WHITE_DIM }}>{p.name}:</span>
          <span className="font-bold text-white">{typeof p.value === "number" ? `${p.value.toFixed(p.value < 10 ? 1 : 0)}${suffix}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Goal Setting Modal Component ──────────────────────────────────────────
function GoalSettingModal({
  isOpen,
  onClose,
  currentGoals,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentGoals: { dinkTarget: number; kitchenTarget: number; volleyTarget: number; focusArea: string };
  onSave: (goals: { dinkTarget: number; kitchenTarget: number; volleyTarget: number; focusArea: string }) => void;
}) {
  const [dinkTarget, setDinkTarget] = useState(currentGoals.dinkTarget);
  const [kitchenTarget, setKitchenTarget] = useState(currentGoals.kitchenTarget);
  const [volleyTarget, setVolleyTarget] = useState(currentGoals.volleyTarget);
  const [focusArea, setFocusArea] = useState(currentGoals.focusArea);

  useEffect(() => {
    setDinkTarget(currentGoals.dinkTarget);
    setKitchenTarget(currentGoals.kitchenTarget);
    setVolleyTarget(currentGoals.volleyTarget);
    setFocusArea(currentGoals.focusArea);
  }, [currentGoals, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4">
      <div
        className="relative w-full max-w-lg p-6 rounded-2xl animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: BLUE_MID,
          border: `1px solid ${NEON}50`,
          boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 20px ${NEON}20`,
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl" style={{ background: `${NEON}20`, border: `1px solid ${NEON}50` }}>
            <Target size={22} color={NEON} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.04em" }}>
              SET PERFORMANCE GOALS
            </h2>
            <p className="text-xs" style={{ color: WHITE_DIM }}>
              Establish technical baselines for Preparation & Personal Informatics tracking.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Primary Focus Area */}
          <div>
            <label className="block text-xs font-bold mb-2 text-white/80">PRIMARY TACTICAL FOCUS AREA</label>
            <select
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              className="w-full bg-black/30 border text-sm rounded-xl px-4 py-2.5 outline-none text-white transition-colors cursor-pointer"
              style={{ borderColor: BORDER }}
            >
              <option value="Left-Side Coverage" className="bg-[#071a3e]">Left-Side Court Coverage</option>
              <option value="Third-Shot Drops" className="bg-[#071a3e]">Third-Shot Drop Accuracy</option>
              <option value="Drive Consistency" className="bg-[#071a3e]">Drive Consistency under Pressure</option>
              <option value="Kitchen-Line Dominance" className="bg-[#071a3e]">Kitchen-Line Control & Positioning</option>
            </select>
          </div>

          {/* Sliders for Quantitative Targets */}
          <div className="space-y-4 pt-2">
            {/* Dink Target */}
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-white/80">DINK SUCCESS TARGET</span>
                <span style={{ color: NEON }} className="font-mono text-sm">{dinkTarget}%</span>
              </div>
              <input
                type="range" min="50" max="95" value={dinkTarget}
                onChange={(e) => setDinkTarget(Number(e.target.value))}
                className="w-full cursor-pointer"
                style={{ accentColor: NEON }}
              />
            </div>

            {/* Kitchen Time Target */}
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-white/80">KITCHEN TIME TARGET</span>
                <span style={{ color: ORANGE }} className="font-mono text-sm">{kitchenTarget}%</span>
              </div>
              <input
                type="range" min="15" max="70" value={kitchenTarget}
                onChange={(e) => setKitchenTarget(Number(e.target.value))}
                className="w-full cursor-pointer"
                style={{ accentColor: ORANGE }}
              />
            </div>

            {/* Volley Target */}
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-white/80">VOLLEY SUCCESS TARGET</span>
                <span style={{ color: VIOLET }} className="font-mono text-sm">{volleyTarget}%</span>
              </div>
              <input
                type="range" min="60" max="98" value={volleyTarget}
                onChange={(e) => setVolleyTarget(Number(e.target.value))}
                className="w-full cursor-pointer"
                style={{ accentColor: VIOLET }}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-xs font-bold transition-all hover:bg-white/10"
            style={{ color: WHITE_DIM, border: `1px solid ${BORDER}` }}
          >
            CANCEL
          </button>
          <button
            onClick={() => {
              onSave({ dinkTarget, kitchenTarget, volleyTarget, focusArea });
              onClose();
            }}
            className="flex-1 py-3 rounded-xl text-xs font-bold transition-all active:scale-[0.98] hover:brightness-110"
            style={{ background: NEON, color: NEON_D, boxShadow: `0 0 18px ${NEON}50`, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.06em", fontSize: "0.95rem" }}
          >
            SAVE & UPDATE DASHBOARD →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Waveform Widget ───────────────────────────────────────────────────────
function AudioWidget({
  summaryText    = SUMMARY_TEXT,
  summaryDurationS = SUMMARY_DURATION_S,
  ragStatus      = "idle" as RAGStatus,
  onRegenerate,
}: {
  summaryText?:     string;
  summaryDurationS?: number;
  ragStatus?:       RAGStatus;
  onRegenerate?:    () => void;
}) {
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const waveRef        = useRef<HTMLDivElement>(null);
  const wasPlayingRef  = useRef(false);
  const charOffsetRef  = useRef(0);
  const keepAliveRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startSpeechRef = useRef<(fromChar: number) => void>(() => {});
  const speechStartTimeRef  = useRef<number>(0);
  const speechStartRatioRef = useRef<number>(0);
  // Keep a stable ref to the current summaryText for closures
  const summaryTextRef = useRef(summaryText);
  const durationRef    = useRef(summaryDurationS);
  useEffect(() => { summaryTextRef.current = summaryText; durationRef.current = summaryDurationS; }, [summaryText, summaryDurationS]);

  // Reset audio when summary text changes (new AI generation arrived)
  useEffect(() => {
    window.speechSynthesis.cancel();
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
    setPlaying(false);
    setProgress(0);
    charOffsetRef.current = 0;
  }, [summaryText]);

  function stopKeepalive() {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
  }

  function makeUtterance(fromChar: number): SpeechSynthesisUtterance {
    const text = summaryTextRef.current;
    let start = fromChar;
    while (start > 0 && text[start - 1] !== " ") start--;
    const utt = new SpeechSynthesisUtterance(text.slice(start));
    utt.rate  = 0.92;
    utt.pitch = 1.05;
    utt.lang  = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const pick = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("google"))
              || voices.find(v => v.lang === "en-US")
              || voices[0];
    if (pick) utt.voice = pick;
    utt.onboundary = (ev) => { charOffsetRef.current = start + ev.charIndex; };
    utt.onend = () => { stopKeepalive(); charOffsetRef.current = 0; setProgress(1); setPlaying(false); };
    utt.onerror = (e) => {
      if ((e as SpeechSynthesisErrorEvent).error !== "interrupted") { stopKeepalive(); setPlaying(false); }
    };
    return utt;
  }

  function startSpeech(fromChar: number) {
    window.speechSynthesis.cancel();
    const startRatio = fromChar / summaryTextRef.current.length;
    speechStartRatioRef.current = startRatio;
    setPlaying(true);
    setTimeout(() => {
      speechStartTimeRef.current = Date.now();
      const utt = makeUtterance(fromChar);
      window.speechSynthesis.speak(utt);
      stopKeepalive();
      keepAliveRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    }, 50);
  }

  startSpeechRef.current = startSpeech;

  function togglePlay() {
    if (playing) {
      window.speechSynthesis.cancel();
      stopKeepalive();
      setPlaying(false);
    } else {
      const from = progress >= 1 ? 0 : charOffsetRef.current;
      if (progress >= 1) { charOffsetRef.current = 0; setProgress(0); }
      startSpeech(from);
    }
  }

  useEffect(() => () => { window.speechSynthesis.cancel(); stopKeepalive(); }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - speechStartTimeRef.current) / 1000;
      const startR  = speechStartRatioRef.current;
      const ratio   = startR + (elapsed / durationRef.current) * (1 - startR);
      const clamped = Math.min(0.99, ratio);
      setProgress(clamped);
      charOffsetRef.current = Math.floor(clamped * summaryTextRef.current.length);
    }, 150);
    return () => clearInterval(id);
  }, [playing]);

  function seekFromClientX(clientX: number) {
    if (!waveRef.current) return;
    const rect  = waveRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    charOffsetRef.current = Math.floor(ratio * summaryTextRef.current.length);
    setProgress(ratio);
  }

  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    wasPlayingRef.current = playing;
    if (playing) { window.speechSynthesis.cancel(); stopKeepalive(); setPlaying(false); }
    setDragging(true);
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    seekFromClientX(cx);
  }

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      seekFromClientX(cx);
    };
    const onUp = () => {
      setDragging(false);
      if (wasPlayingRef.current) startSpeechRef.current(charOffsetRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend",  onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend",  onUp);
    };
  }, [dragging]);

  const filled  = Math.floor(progress * WAVE_BARS.length);
  const MAX_H   = 32;
  const elapsed = Math.round(progress * summaryDurationS);
  const total   = summaryDurationS;
  const isLoading = ragStatus === "loading";

  return (
    <div
      className="rounded-2xl px-5 py-4 flex flex-col gap-2.5 min-w-[300px]"
      style={{
        background: "linear-gradient(135deg,#0a2a6e 0%,#0d3a90 60%,#0f2560 100%)",
        border: `1px solid ${NEON}50`,
        boxShadow: `0 0 20px ${NEON}18`,
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: `${NEON}25`, border: `1px solid ${NEON}50` }}>
            <Radio size={10} color={NEON} />
            <span className="font-mono text-[10px] font-bold tracking-widest" style={{ color: NEON }}>
              {ragStatus === "loading" ? "GENERATING…" : ragStatus === "ready" ? "RAG · AI SUMMARY" : "RAG COACH ACTIVE"}
            </span>
          </div>
          {ragStatus === "ready" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: `${VIOLET}30`, color: VIOLET, border: `1px solid ${VIOLET}50` }}>
              AI-GENERATED
            </span>
          )}
          {ragStatus === "error" && (
            <span className="text-[10px]" style={{ color: ORANGE_L }}>Static fallback active</span>
          )}
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:opacity-80 disabled:opacity-40"
            style={{ background: `${NEON}20`, color: NEON, border: `1px solid ${NEON}40` }}
          >
            <Zap size={9} /> {isLoading ? "…" : "REGENERATE"}
          </button>
        )}
      </div>

      <div className="text-xs font-semibold text-white">Post-Game Audio Summary</div>

      {isLoading ? (
        <div className="flex items-center gap-3 py-2">
          <div className="rounded-full flex items-center justify-center flex-shrink-0 opacity-40"
            style={{ width: 38, height: 38, background: NEON }}>
            <Play size={16} color={NEON_D} fill={NEON_D} />
          </div>
          <div className="flex-1 flex items-end gap-[2px]" style={{ height: MAX_H + 2 }}>
            {WAVE_BARS.map((h, i) => (
              <div key={i} className="rounded-full flex-1" style={{
                height: h,
                background: "rgba(255,255,255,0.12)",
                animation: `pulse 1.4s ease-in-out ${(i % 5) * 0.12}s infinite alternate`,
              }} />
            ))}
          </div>
          <span className="font-mono text-[10px] flex-shrink-0" style={{ color: WHITE_SUB }}>--:-- / --:--</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95 hover:scale-105"
            style={{ width: 38, height: 38, background: NEON, boxShadow: `0 0 14px ${NEON}80` }}
          >
            {playing ? <Pause size={16} color={NEON_D} fill={NEON_D} /> : <Play size={16} color={NEON_D} fill={NEON_D} />}
          </button>

          <div
            ref={waveRef}
            onMouseDown={onPointerDown}
            onTouchStart={onPointerDown}
            className="flex items-end gap-[2px] flex-1"
            style={{ height: MAX_H + 2, cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
          >
            {WAVE_BARS.map((h, i) => {
              const isFilled = i < filled;
              const isHead   = i === filled;
              const isActive = playing && Math.abs(i - filled) <= 1;
              return (
                <div
                  key={i}
                  className="rounded-full flex-1"
                  style={{
                    height: isActive ? Math.min(h * 1.35, MAX_H) : isHead ? Math.min(h * 1.2, MAX_H) : h,
                    background: isFilled ? NEON : isHead ? WHITE : "rgba(255,255,255,0.18)",
                    boxShadow: isFilled ? `0 0 4px ${NEON}80` : isHead ? `0 0 6px rgba(255,255,255,0.7)` : "none",
                    transition: "height 0.08s ease, background 0.1s ease",
                  }}
                />
              );
            })}
          </div>

          <span className="font-mono text-[10px] flex-shrink-0" style={{ color: WHITE_DIM }}>
            {Math.floor(elapsed / 60).toString().padStart(2, "0")}:
            {(elapsed % 60).toString().padStart(2, "0")}
            <span style={{ color: WHITE_SUB }}>
              {" / "}
              {Math.floor(total / 60).toString().padStart(2, "0")}:
              {(total % 60).toString().padStart(2, "0")}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Court Heatmap ─────────────────────────────────────────────────────────
function CourtHeatmap() {
  const COLS = 6, ROWS = 4;
  const cw = 100 / COLS, ch = 100 / ROWS;
  return (
    <div style={{ maxWidth: 230, margin: "0 auto" }}>
      <svg viewBox="0 0 100 100" width="100%" style={{ aspectRatio: "3/4", display: "block" }} preserveAspectRatio="xMidYMid meet">
        <rect x={0} y={0} width={100} height={100} rx={2} fill="#e8f4ff" />
        {heatGrid.map((row, ri) =>
          row.map((val, ci) => (
            <rect key={`${ri}-${ci}`} x={ci * cw} y={ri * ch} width={cw} height={ch} fill={heatColor(val)} />
          ))
        )}
        <rect x={0} y={0} width={100} height={100} fill="none" stroke="#0d4a8a" strokeWidth={1.2} rx={2} />
        <rect x={0} y={0} width={100} height={2.5} fill={NEON} rx={1} />
        <line x1={0} y1={21} x2={100} y2={21} stroke="#0d4a8a" strokeWidth={0.8} />
        <line x1={0} y1={79} x2={100} y2={79} stroke="#0d4a8a" strokeWidth={0.8} />
        <line x1={50} y1={21} x2={50} y2={79} stroke="#0d4a8a" strokeWidth={0.5} strokeDasharray="2,1.5" />
        <text x={50} y={13} textAnchor="middle" fill="#2a5c00" fontSize={5} fontFamily="'Barlow Condensed',sans-serif" fontWeight={700}>KITCHEN</text>
        <text x={50} y={52} textAnchor="middle" fill="#0d3a70" fontSize={4} fontFamily="'Barlow Condensed',sans-serif" fontWeight={700}>TRANSITION</text>
        <text x={50} y={91} textAnchor="middle" fill="#0d3a70" fontSize={4} fontFamily="'Barlow Condensed',sans-serif" fontWeight={700}>BASELINE</text>
        <text x={2.5} y={91} fill="#0d3a70" fontSize={3.5} fontFamily="JetBrains Mono">L</text>
        <text x={94.5} y={91} fill="#0d3a70" fontSize={3.5} fontFamily="JetBrains Mono">R</text>
      </svg>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px]" style={{ color: WHITE_SUB }}>Low</span>
        <div className="flex-1 h-1.5 rounded-full" style={{ background: "linear-gradient(to right,rgba(26,95,180,0.12),rgba(26,95,180,0.6),rgba(184,245,35,0.85))" }} />
        <span className="text-[10px]" style={{ color: WHITE_SUB }}>High</span>
      </div>
    </div>
  );
}

// ── Action Card ───────────────────────────────────────────────────────────
function ActionCard({ icon: Icon, priority, accentColor, accentTextColor, title, body }: {
  icon: React.ComponentType<{ size: number; color: string }>;
  priority: string; accentColor: string; accentTextColor: string;
  title: string; body: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      onClick={() => setExpanded(e => !e)}
      className="w-full text-left rounded-xl p-4 transition-all duration-200 group"
      style={{
        background: expanded ? `${accentColor}15` : "rgba(255,255,255,0.04)",
        border: `1px solid ${expanded ? accentColor : BORDER}`,
        borderLeft: `4px solid ${accentColor}`,
        boxShadow: expanded ? `0 0 16px ${accentColor}25` : "none",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg flex-shrink-0 mt-0.5" style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}40` }}>
          <Icon size={15} color={accentColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: accentColor, color: accentTextColor }}>
              {priority}
            </span>
            <span className="text-sm font-semibold text-white">{title}</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: WHITE_DIM }}>{body}</p>
        </div>
        <ChevronRight
          size={14} color={WHITE_SUB}
          style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0, marginTop: 2 }}
        />
      </div>
    </button>
  );
}

// ── CV Replay ─────────────────────────────────────────────────────────────
const CV_EVENTS = [
  { time: 8,  tag: "DINK",   label: "Dink Shot",     player: "P#01", color: NEON,      textColor: NEON_D },
  { time: 22, tag: "ERROR",  label: "Drive Error",   player: "P#01", color: ORANGE,    textColor: WHITE  },
  { time: 38, tag: "RESET",  label: "Reset Shot",    player: "P#02", color: BLUE_SKY,  textColor: "#0c3f6e" },
  { time: 48, tag: "FAULT",  label: "NVZ Fault",     player: "P#01", color: "#f43f5e", textColor: WHITE  },
  { time: 62, tag: "ERNE",   label: "Erne Attempt",  player: "P#02", color: VIOLET,    textColor: WHITE  },
  { time: 72, tag: "WINNER", label: "Volley Winner", player: "P#02", color: NEON,      textColor: NEON_D },
  { time: 85, tag: "ERROR",  label: "Drive Error",   player: "P#01", color: ORANGE,    textColor: WHITE  },
];

// ── CV Replay Widget with Video Preview & Bounding Box Overlay ────────────
function CVReplayWidget({
  onUpload,
  analysisStatus,
  analysisResult,
  analysisError,
  selectedFile,
}: {
  onUpload: (file: File) => void;
  analysisStatus: "idle" | "uploading" | "processing" | "ready" | "error";
  analysisResult: AnalysisResult | null;
  analysisError: string;
  selectedFile: File | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // 1. Create a local URL for the selected video file to preview it instantly
  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url); // Clean up memory
    } else {
      setVideoUrl(null);
    }
  }, [selectedFile]);

  // 2. Draw bounding boxes on canvas synced to video time
  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !analysisResult || !analysisResult.player_positions.length) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas dimensions to rendered video display size
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentTime = video.currentTime;
    const videoWidth = video.videoWidth || 1;
    const videoHeight = video.videoHeight || 1;

    const scaleX = canvas.width / videoWidth;
    const scaleY = canvas.height / videoHeight;

    // Find the snapshot closest to the video's current playback time
    const snapshot = analysisResult.player_positions.reduce((prev, curr) => {
      return Math.abs(curr.time_seconds - currentTime) < Math.abs(prev.time_seconds - currentTime)
        ? curr
        : prev;
    }, analysisResult.player_positions[0]);

    if (snapshot && Math.abs(snapshot.time_seconds - currentTime) < 0.5) {
      snapshot.players.forEach((player) => {
        const [x1, y1, x2, y2] = player.bbox;

        // Scale bounding box to display dimensions
        const boxX = x1 * scaleX;
        const boxY = y1 * scaleY;
        const boxWidth = (x2 - x1) * scaleX;
        const boxHeight = (y2 - y1) * scaleY;

        // Draw Bounding Box (Neon Green)
        ctx.strokeStyle = "#b8f523";
        ctx.lineWidth = 3;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // Draw Player Label Header
        const labelText = `Player #${player.track_id ?? "1"}`;
        ctx.fillStyle = "#b8f523";
        ctx.fillRect(boxX, Math.max(0, boxY - 22), ctx.measureText(labelText).width + 12, 22);

        ctx.fillStyle = "#071a3e";
        ctx.font = "bold 12px Inter, sans-serif";
        ctx.fillText(labelText, boxX + 6, Math.max(14, boxY - 6));
      });
    }
  }, [analysisResult]);

  // Request Animation Frame loop for smooth box animation while video plays
  useEffect(() => {
    let animId: number;
    const loop = () => {
      drawOverlay();
      animId = requestAnimationFrame(loop);
    };

    if (analysisStatus === "ready" && videoUrl) {
      animId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animId);
  }, [analysisStatus, videoUrl, drawOverlay]);

  return (
    <Card accent={BLUE_SKY} className="mt-4">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <WidgetHeader
          title="Video Analysis & Live Bounding Box Tracking"
          subtitle="Upload match footage to generate court tracking, player detections, and CV event timelines."
          accent={BLUE_SKY}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Left Column: Upload Controls & Video Player */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: WHITE_SUB }}>
              Upload Match Video
            </div>
            <input
              type="file"
              accept="video/*"
              className="w-full text-sm text-white bg-slate-900 rounded-lg border border-slate-800 p-3 cursor-pointer"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
              }}
            />
            <div className="mt-3 text-xs" style={{ color: WHITE_DIM }}>
              Supported: MP4, MOV, AVI. Maximum 150MB scanned for pass.
            </div>
          </div>

          {/* Interactive Video Player Container with Canvas Overlay */}
          <div className="relative rounded-2xl border border-white/10 bg-black overflow-hidden min-h-[220px] flex items-center justify-center">
            {videoUrl ? (
              <div className="relative w-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full max-h-[420px] object-contain block"
                  onLoadedMetadata={drawOverlay}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                />
              </div>
            ) : (
              <p className="text-sm p-8 text-center" style={{ color: WHITE_DIM }}>
                No video loaded. Select a file above to display the video player preview.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Status & Live Analysis Preview */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: WHITE_SUB }}>
              Analysis Status
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Selected file</span>
                <span className="font-mono text-xs truncate max-w-[180px]" style={{ color: selectedFile ? NEON : WHITE_SUB }}>
                  {selectedFile ? selectedFile.name : "None"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Current state</span>
                <span className="font-mono font-bold" style={{ color: analysisStatus === "error" ? ORANGE : NEON }}>
                  {analysisStatus}
                </span>
              </div>
              {analysisError ? (
                <div className="rounded-xl bg-[#681d0b] px-3 py-2 text-[11px]" style={{ color: WHITE }}>
                  {analysisError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: WHITE_SUB }}>
              Live Analysis Preview
            </div>
            {analysisStatus === "idle" ? (
              <p className="text-sm" style={{ color: WHITE_DIM }}>
                Upload a video to start analysis and populate player bounding boxes.
              </p>
            ) : analysisStatus === "uploading" ? (
              <p className="text-sm" style={{ color: NEON }}>Uploading video to backend...</p>
            ) : analysisStatus === "processing" ? (
              <p className="text-sm" style={{ color: NEON }}>Processing video frames & tracking positions…</p>
            ) : analysisStatus === "ready" && analysisResult ? (
              <div className="space-y-3">
                <div className="text-[11px] text-white/70">Analysis complete</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-900/80 p-3">
                    <div className="text-[10px] uppercase tracking-widest" style={{ color: WHITE_SUB }}>
                      Duration
                    </div>
                    <div className="font-bold text-white">{analysisResult.duration_seconds.toFixed(1)}s</div>
                  </div>
                  <div className="rounded-xl bg-slate-900/80 p-3">
                    <div className="text-[10px] uppercase tracking-widest" style={{ color: WHITE_SUB }}>
                      Frames
                    </div>
                    <div className="font-bold text-white">{analysisResult.frame_count}</div>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900/80 p-3">
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: WHITE_SUB }}>
                    Latest Event
                  </div>
                  <div className="mt-1 text-xs text-white">
                    {analysisResult.event_timeline[analysisResult.event_timeline.length - 1]?.description ?? "No events detected."}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: WHITE_DIM }}>
                No analysis result available yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Event Timeline */}
      {analysisResult ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="font-semibold uppercase tracking-widest mb-3 text-xs" style={{ color: WHITE }}>
            Detected Action Event Timeline
          </div>
          <div className="grid gap-2 max-h-[260px] overflow-y-auto pr-1">
            {analysisResult.event_timeline.map((event, index) => (
              <div key={index} className="rounded-xl border border-white/10 bg-[#06172f]/80 p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold font-mono tracking-wider" style={{ color: NEON }}>
                    {event.label}
                  </div>
                  <div className="text-xs text-white mt-0.5">{event.description}</div>
                </div>
                <span className="font-mono text-xs px-2 py-1 rounded bg-white/10" style={{ color: BLUE_SKY }}>
                  {event.time_seconds.toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ── Login Page ────────────────────────────────────────────────────────────
const DEMO_ACCOUNT = {
  email: "coach@picklepro.app",
  password: "demo123",
};

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail]       = useState(DEMO_ACCOUNT.email);
  const [password, setPassword] = useState(DEMO_ACCOUNT.password);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showPw, setShowPw]     = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Please enter your email and password."); return; }

    const normalizedEmail = email.trim().toLowerCase();
    const isDemoAccount = normalizedEmail === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password;

    if (!isDemoAccount) {
      setError("Try the demo account below to continue.");
      return;
    }

    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 1200);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: `linear-gradient(160deg, #071a3e 0%, #0a2258 55%, #071a3e 100%)`, fontFamily: "'Inter', sans-serif" }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(100,160,255,0.05)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="absolute rounded-full"
          style={{ width: 480, height: 480, top: "-10%", left: "-8%", background: `radial-gradient(circle, ${NEON}10 0%, transparent 70%)` }} />
        <div className="absolute rounded-full"
          style={{ width: 400, height: 400, bottom: "-5%", right: "-5%", background: `radial-gradient(circle, ${BLUE_POP}20 0%, transparent 70%)` }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: NEON, boxShadow: `0 0 32px ${NEON}60` }}
            >
              <svg viewBox="0 0 20 30" width="28" height="34" fill="none">
                <path d="M10 1C5.5 1 1.5 4.5 1.5 9.5C1.5 14.5 5 17.5 10 17.5C15 17.5 18.5 14.5 18.5 9.5C18.5 4.5 14.5 1 10 1Z" fill={NEON_D} />
                <line x1="5" y1="7"  x2="15" y2="7"  stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
                <line x1="4" y1="10" x2="16" y2="10" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
                <line x1="5" y1="13" x2="15" y2="13" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
                <path d="M7.5 17.5 L8.5 20 L11.5 20 L12.5 17.5Z" fill={NEON_D} />
                <rect x="8" y="19.5" width="4" height="9.5" rx="2" fill={NEON_D} />
                <line x1="8.2" y1="22"   x2="11.8" y2="22"   stroke={NEON} strokeWidth="0.7" strokeOpacity="0.55" />
                <line x1="8.2" y1="24.5" x2="11.8" y2="24.5" stroke={NEON} strokeWidth="0.7" strokeOpacity="0.55" />
                <line x1="8.2" y1="27"   x2="11.8" y2="27"   stroke={NEON} strokeWidth="0.7" strokeOpacity="0.55" />
              </svg>
            </div>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: "2.8rem", letterSpacing: "0.06em", lineHeight: 1, color: WHITE }}>
              Pickle<span style={{ color: NEON }}>Pro</span>
            </span>
          </div>
          <p className="text-sm text-center" style={{ color: WHITE_DIM }}>
            Personal Informatics Dashboard · MCO Prototype
          </p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{ background: BLUE_MID, border: `1px solid ${BORDER}`, boxShadow: `0 24px 64px rgba(7,26,62,0.7), 0 0 0 1px rgba(100,160,255,0.1)` }}
        >
          <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.04em", fontSize: "1.4rem" }}>
            Sign in to your account
          </h2>
          <p className="text-xs mb-6" style={{ color: WHITE_SUB }}>Welcome back, Coach is ready.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: WHITE_DIM }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={DEMO_ACCOUNT.email}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${email ? NEON + "60" : BORDER}`,
                  color: WHITE,
                  boxShadow: email ? `0 0 0 3px ${NEON}12` : "none",
                }}
                onFocus={e => { e.target.style.border = `1px solid ${NEON}80`; e.target.style.boxShadow = `0 0 0 3px ${NEON}15`; }}
                onBlur={e =>  { e.target.style.border = `1px solid ${email ? NEON + "60" : BORDER}`; e.target.style.boxShadow = "none"; }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold" style={{ color: WHITE_DIM }}>Password</label>
                <button type="button" className="text-xs transition-colors hover:text-white" style={{ color: BLUE_SKY }}>
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={DEMO_ACCOUNT.password}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all pr-11"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid ${password ? BLUE_SKY + "60" : BORDER}`,
                    color: WHITE,
                  }}
                  onFocus={e => { e.target.style.border = `1px solid ${BLUE_SKY}80`; e.target.style.boxShadow = `0 0 0 3px ${BLUE_SKY}12`; }}
                  onBlur={e =>  { e.target.style.border = `1px solid ${password ? BLUE_SKY + "60" : BORDER}`; e.target.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono px-1"
                  style={{ color: WHITE_SUB }}
                >
                  {showPw ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setRemember(r => !r)}
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: remember ? NEON : "rgba(255,255,255,0.06)",
                  border: `1px solid ${remember ? NEON : BORDER}`,
                  boxShadow: remember ? `0 0 8px ${NEON}50` : "none",
                }}
              >
                {remember && (
                  <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                    <path d="M1 4L4 7L10 1" stroke={NEON_D} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span className="text-xs" style={{ color: WHITE_DIM }}>Remember me for 30 days</span>
            </div>

            {error && (
              <div className="rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2"
                style={{ background: `${ORANGE}18`, border: `1px solid ${ORANGE}50`, color: ORANGE_L }}>
                <span>⚠</span> {error}
              </div>
            )}

            <div
              className="rounded-xl px-3.5 py-3 text-xs"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold" style={{ color: WHITE }}>Demo account</div>
                  <div style={{ color: WHITE_SUB }}>Email: {DEMO_ACCOUNT.email}</div>
                  <div style={{ color: WHITE_SUB }}>Password: {DEMO_ACCOUNT.password}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setEmail(DEMO_ACCOUNT.email); setPassword(DEMO_ACCOUNT.password); setError(""); }}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.06)", color: NEON }}
                >
                  Use demo
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3.5 font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-70 mt-2"
              style={{
                background: loading ? `${NEON}80` : NEON,
                color: NEON_D,
                boxShadow: loading ? "none" : `0 0 24px ${NEON}50`,
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: "1rem",
                letterSpacing: "0.08em",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke={NEON_D} strokeWidth="2" strokeDasharray="20 15" />
                  </svg>
                  SIGNING IN…
                </span>
              ) : "SIGN IN →"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: BORDER }} />
            <span className="text-[10px] font-mono" style={{ color: WHITE_SUB }}>OR CONTINUE WITH</span>
            <div className="flex-1 h-px" style={{ background: BORDER }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Google", icon: "G" },
              { label: "Apple",  icon: "🍎" },
            ].map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                className="rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all hover:bg-white/10"
                style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: WHITE_DIM }}
              >
                <span className="font-bold" style={{ color: WHITE }}>{icon}</span> {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] mt-6" style={{ color: WHITE_SUB }}>
          Don&apos;t have an account?{" "}
          <button type="button" className="font-semibold transition-colors hover:text-white" style={{ color: NEON }}>
            Request access
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Play Style Profiling Widget ───────────────────────────────────────────
function PlayStyleWidget() {
  return (
    <Card accent={NEON} className="h-full flex flex-col">
      <WidgetHeader
        title="Light Skill Assessment: Play Style Profile"
        subtitle="Aggregated CV shot classifications identifying dominant play style."
        accent={NEON}
      />
      
      <div className="flex-1 flex flex-col md:flex-row items-center gap-4">
        {/* Radar Chart */}
        <div className="w-full md:w-1/2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={playStyleData}>
              <PolarGrid key="pg" stroke="rgba(100,160,255,0.15)" />
              <PolarAngleAxis
                key="pa"
                dataKey="metric"
                tick={{ fill: WHITE_DIM, fontSize: 10, fontFamily: "Inter" }}
              />
              <PolarRadiusAxis key="pr" angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                key="radar-player"
                name="Player"
                dataKey="value"
                stroke={NEON}
                strokeWidth={2}
                fill={NEON}
                fillOpacity={0.25}
              />
              <Tooltip
                key="tt"
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-xl border px-3 py-2 text-xs shadow-2xl" style={{ background: "#0a1f4e", borderColor: BORDER }}>
                      <div className="font-bold text-white mb-1">{d.metric}</div>
                      <div style={{ color: WHITE_DIM }}>Frequency/Success: <strong style={{ color: NEON }}>{d.value}%</strong></div>
                    </div>
                  );
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Assessment Text Box */}
        <div className="w-full md:w-1/2 flex flex-col justify-center">
          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
            <div className="text-[10px] font-bold tracking-widest mb-1" style={{ color: NEON }}>
              ALGORITHMIC CLASSIFICATION
            </div>
            <h4 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.04em" }}>
              DOMINANT STYLE: DEFENSIVE / CONTROL
            </h4>
            <p className="text-xs leading-relaxed" style={{ color: WHITE_DIM }}>
              Your shot distribution relies heavily on <span className="font-bold text-white">Dinks (85%)</span> and <span className="font-bold text-white">Volleys (82%)</span>, indicating a tactical preference for extending rallies at the non-volley zone rather than relying on baseline power.
            </p>
            
            <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: BORDER }}>
              <span className="text-[10px]" style={{ color: WHITE_SUB }}>Estimated Skill Tier:</span>
              <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-white/10 text-white">
                INTERMEDIATE
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App({ userEmail, onSignOut }: { userEmail?: string; onSignOut?: () => void }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);

  const [playerGoals, setPlayerGoals] = useState({
    dinkTarget: 80,
    kitchenTarget: 45,
    volleyTarget: 85,
    focusArea: "Left-Side Coverage",
  });

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string>("");

  // ── RAG state ────────────────────────────────────────────────────────────
  const [ragStatus,  setRagStatus]  = useState<RAGStatus>("idle");
  const [ragSummary, setRagSummary] = useState<string>(SUMMARY_TEXT);
  const [ragRecs,    setRagRecs]    = useState<RAGRec[] | null>(null);
  const [ragError,   setRagError]   = useState<string>("");
  // Estimate TTS duration from text length (≈11.5 chars/sec at rate 0.92)
  const ragDuration = Math.round(ragSummary.length / 11.5);

  const playerGoalsRef = useRef(playerGoals);
  useEffect(() => { playerGoalsRef.current = playerGoals; }, [playerGoals]);

  async function uploadAndAnalyzeVideo(file: File) {
    setCvFile(file);
    setAnalysisStatus("uploading");
    setAnalysisError("");
    setAnalysisResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/analyze/video?max_frames=180`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Video analysis failed.");
      }

      setAnalysisStatus("processing");
      const result = await response.json() as AnalysisResult;
      setAnalysisResult(result);
      setAnalysisStatus("ready");
    } catch (error) {
      console.error("Video analysis error", error);
      setAnalysisStatus("error");
      setAnalysisError(error instanceof Error ? error.message : String(error));
    }
  }

 const generateRAG = async () => {
    setRagStatus("loading");
    setRagError("");
    try {
      const goals = playerGoalsRef.current;
      
      // Make a secure POST request to the FastAPI backend RAG endpoint
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/rag-coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerGoals: goals,
          metrics: { 
            avgDinkRate: 81, 
            unforcedErrors: 4.8, 
            kitchenTime: 34, 
            volleyRate: 76 
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update state with the backend's generated insights
      setRagSummary(data.summary);
      setRagRecs(data.recommendations);
      setRagStatus("ready");
      
    } catch (e) {
      console.error("[RAG]", e);
      setRagStatus("error");
      setRagError(e instanceof Error ? e.message : "Backend connection failed.");
    }
  };

  useEffect(() => {
    if (loggedIn) generateRAG();
  }, [loggedIn]);

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

  const axisStyle = {
    tick: { fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: WHITE_DIM },
    axisLine: false as const,
    tickLine: false as const,
  };

  return (
    <div style={{ background: `linear-gradient(160deg, #071a3e 0%, #0a2258 50%, #071a3e 100%)`, minHeight: "100vh", color: WHITE, fontFamily: "'Inter',sans-serif" }}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: "rgba(7,26,62,0.95)", backdropFilter: "blur(12px)", borderColor: BORDER }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-2 pr-5 border-r" style={{ borderColor: BORDER }}>
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: NEON, boxShadow: `0 0 18px ${NEON}80` }}
              >
                <svg viewBox="0 0 20 30" width="24" height="30" fill="none">
                  <path
                    d="M10 1C5.5 1 1.5 4.5 1.5 9.5C1.5 14.5 5 17.5 10 17.5C15 17.5 18.5 14.5 18.5 9.5C18.5 4.5 14.5 1 10 1Z"
                    fill={NEON_D}
                  />
                  <line x1="5" y1="7" x2="15" y2="7" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
                  <line x1="4" y1="10" x2="16" y2="10" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
                  <line x1="5" y1="13" x2="15" y2="13" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
                  <path d="M7.5 17.5 L8.5 20 L11.5 20 L12.5 17.5Z" fill={NEON_D} />
                  <rect x="8" y="19.5" width="4" height="9.5" rx="2" fill={NEON_D} />
                  <line x1="8.2" y1="22" x2="11.8" y2="22" stroke={NEON} strokeWidth="0.7" strokeOpacity="0.55" />
                  <line x1="8.2" y1="24.5" x2="11.8" y2="24.5" stroke={NEON} strokeWidth="0.7" strokeOpacity="0.55" />
                  <line x1="8.2" y1="27" x2="11.8" y2="27" stroke={NEON} strokeWidth="0.7" strokeOpacity="0.55" />
                </svg>
              </div>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: "2.6rem", letterSpacing: "0.06em", lineHeight: 1, color: WHITE }}>
                Pickle<span style={{ color: NEON }}>Pro</span>
              </span>
            </div>
            <div
              className="w-13 h-13 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
              style={{
                width: 52, height: 52,
                background: `linear-gradient(135deg,${BLUE_POP},${BLUE_SKY})`,
                boxShadow: `0 0 16px ${BLUE_SKY}60`,
                color: WHITE, fontFamily: "'Barlow Condensed',sans-serif", fontSize: "1.1rem",
              }}
            >
              AG
            </div>
            <div>
              <h1 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "1.25rem", letterSpacing: "0.05em", lineHeight: 1, color: WHITE }}>
                ALEX GARCIA
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                <span>
                  <span className="font-bold" style={{ color: NEON }}>18W</span>
                  <span style={{ color: WHITE_SUB }}> — </span>
                  <span className="font-bold" style={{ color: ORANGE }}>7L</span>
                  <span style={{ color: WHITE_SUB }}> this month</span>
                </span>
                <span style={{ color: BORDER }}>|</span>
                <span style={{ color: WHITE_DIM }}><Clock size={10} className="inline mr-1" />Last match: Jul 8, 2026</span>
                <span style={{ color: BORDER }}>|</span>
                <span className="font-mono font-bold px-2 py-0.5 rounded-md" style={{ background: `${BLUE_POP}40`, color: BLUE_SKY, border: `1px solid ${BLUE_SKY}50` }}>
                  SKILL: INTERMEDIATE
                </span>
              </div>
            </div>
          </div>
          <AudioWidget
            summaryText={ragSummary}
            summaryDurationS={ragDuration}
            ragStatus={ragStatus}
            onRegenerate={generateRAG}
          />
          <button
            onClick={() => setLoggedIn(false)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:bg-white/10 flex-shrink-0"
            style={{ color: WHITE_DIM, border: `1px solid ${BORDER}` }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">

        {/* ── CURRENT PERFORMANCE & GOAL BUTTON HEADER ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] font-bold font-mono tracking-widest uppercase mb-0.5" style={{ color: NEON }}>
              PREPARATION & GOAL TRACKING
            </div>
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.04em" }}>
              CURRENT PERFORMANCE BASELINE
            </h2>
            <p className="text-xs mt-0.5" style={{ color: WHITE_DIM }}>
              Active Focus: <span className="font-bold" style={{ color: WHITE }}>{playerGoals.focusArea}</span>
            </p>
          </div>

          <button
            onClick={() => setIsGoalModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 hover:scale-[1.02]"
            style={{ color: NEON, border: `1px solid ${NEON}60`, background: `${NEON}15`, boxShadow: `0 0 12px ${NEON}20` }}
          >
            <Target size={15} color={NEON} />
            ADJUST GOALS & TARGETS
          </button>
        </div>

        {/* ── KPI STRIP ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Avg Dink Rate", value: "76.4%", sub: `Target: ${playerGoals.dinkTarget}%`,
              bg: `linear-gradient(135deg,${NEON_D},#2a5000)`, border: NEON, valueColor: NEON, subColor: "#a8d840",
            },
            {
              label: "Unforced Err/Match", value: "4.8", sub: "↓ Improving trend",
              bg: `linear-gradient(135deg,#0d3a90,${BLUE_POP})`, border: BLUE_SKY, valueColor: BLUE_SKY, subColor: "rgba(56,189,248,0.7)",
            },
            {
              label: "Kitchen Time", value: "34%", sub: `Target: ${playerGoals.kitchenTarget}%`,
              bg: `linear-gradient(135deg,#7c2400,#c04000)`, border: ORANGE, valueColor: ORANGE_L, subColor: "rgba(254,215,170,0.7)",
            },
            {
              label: "Target Goal", value: `${playerGoals.volleyTarget}% Volley`, sub: "Est. +12 weeks",
              bg: `linear-gradient(135deg,#3b0764,#6d28d9)`, border: VIOLET, valueColor: "#ddd6fe", subColor: "rgba(221,214,254,0.6)",
            },
          ].map(({ label, value, sub, bg, border, valueColor, subColor }) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: bg, border: `1px solid ${border}50`, boxShadow: `0 4px 20px rgba(0,0,0,0.3)` }}>
              <div className="text-xs font-medium mb-1" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</div>
              <div className="text-2xl font-bold" style={{ color: valueColor, fontFamily: "'Barlow Condensed',sans-serif" }}>{value}</div>
              <div className="text-[10px] mt-0.5" style={{ color: subColor }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ══ 01 DESCRIPTIVE ══════════════════════════════════════════ */}
        <section>
          <SectionBanner
            n="01" eyebrow="DESCRIPTIVE ANALYTICS" title="What Happened?"
            subtitle="Performance baseline from the last 10 matches — primary technical metrics and court positioning."
            bg="linear-gradient(135deg,#0d2e7a,#0a2258)" accent={NEON}
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Widget A — Dink Rate */}
            <Card className="lg:col-span-3" accent={NEON}>
              <WidgetHeader
                title="Consistency is Key: Dink Success Rate"
                subtitle="Tracks primary technical metric over recent games to establish a performance baseline."
                accent={NEON}
              />
              <div className="flex items-center gap-5 mb-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-1 rounded-full" style={{ background: NEON, boxShadow: `0 0 6px ${NEON}` }} />
                  <span className="text-[11px] text-white">Dink Rate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 border-t-2 border-dashed" style={{ borderColor: ORANGE }} />
                  <span className="text-[11px]" style={{ color: ORANGE }}>{playerGoals.dinkTarget}% Target</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dinkData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid key="grid" strokeDasharray="3 4" stroke="rgba(100,160,255,0.1)" vertical={false} />
                  <XAxis key="x" dataKey="match" {...axisStyle} />
                  <YAxis key="y" domain={[0, 100]} {...axisStyle} tickFormatter={v => `${v}%`} width={34} />
                  <Tooltip key="tt" content={(p) => <ChartTip {...p} suffix="%" />} />
                  <ReferenceLine key="ref" y={playerGoals.dinkTarget} stroke={ORANGE} strokeDasharray="5 3" strokeWidth={2} />
                  <Line
                    key="line-dink-rate"
                    type="monotone" dataKey="rate" name="Dink Rate"
                    stroke={NEON} strokeWidth={3}
                    dot={{ fill: BLUE_MID, stroke: NEON, strokeWidth: 2.5, r: 5 }}
                    activeDot={{ fill: NEON, r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Widget B — Court Heatmap */}
            <Card className="lg:col-span-2" accent={BLUE_SKY}>
              <WidgetHeader
                title="Court Dominance: Positioning Heatmap"
                subtitle="Spatial time-on-court distribution to recognize positioning vulnerabilities."
                accent={BLUE_SKY}
              />
              <CourtHeatmap />
              <div className="flex items-start gap-2 mt-4 rounded-xl p-3" style={{ background: `${ORANGE}20`, border: `1px solid ${ORANGE}50` }}>
                <Activity size={13} color={ORANGE} className="flex-shrink-0 mt-0.5" />
                <p className="text-xs font-medium leading-snug" style={{ color: ORANGE_L }}>
                  Right-baseline overuse detected — left-side exposure vulnerability flagged.
                </p>
              </div>
            </Card>
          </div>
        </section>

        {/* ══ 01.5 SKILL PROFILING ═════════════════════════════════════ */}
        <section>
          <SectionBanner
            n="SP" eyebrow="SKILL & PLAY STYLE ASSESSMENT" title="Who Are You on the Court?"
            subtitle="Evaluating your dominant tactical characteristics based on CV shot classification data."
            bg="linear-gradient(135deg,#093020,#0d4a30)" accent={NEON}
          />
          <PlayStyleWidget />
        </section>

        {/* ══ 02 DIAGNOSTIC ════════════════════════════════════════════ */}
        <section>
          <SectionBanner
            n="02" eyebrow="DIAGNOSTIC ANALYTICS" title="Why Did It Happen?"
            subtitle="Correlating computer vision shot counts with unforced error frequency to isolate long-rally fatigue."
            bg="linear-gradient(135deg,#4a1800,#7c2800)" accent={ORANGE}
          />
          <Card accent={ORANGE}>
            <WidgetHeader
              title="Fatigue vs. Focus: Unforced Errors by Rally Duration"
              subtitle="X: Rally Length (shots) · Y: Unforced Errors · Color-coded by game phase · No dual axis."
              accent={ORANGE}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-4">
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 24 }}>
                    <CartesianGrid key="grid" strokeDasharray="3 4" stroke="rgba(100,160,255,0.08)" />
                    <XAxis
                      key="x"
                      dataKey="shots" type="number" name="Rally Length" domain={[2, 35]}
                      {...axisStyle}
                      label={{ value: "Rally Length (Shots)", position: "insideBottom", offset: -14, fontSize: 10, fill: WHITE_DIM, fontFamily: "Inter" }}
                    />
                    <YAxis
                      key="y"
                      dataKey="errors" type="number" name="Errors" domain={[-0.5, 11]}
                      {...axisStyle} width={28}
                      label={{ value: "Unforced Errors", angle: -90, position: "insideLeft", fontSize: 10, fill: WHITE_DIM, fontFamily: "Inter" }}
                    />
                    <Tooltip
                      key="tt"
                      cursor={{ strokeDasharray: "3 3", stroke: BORDER }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="rounded-xl border px-3 py-2 text-xs shadow-2xl" style={{ background: "#0a1f4e", borderColor: BORDER }}>
                            <div className="font-bold text-white mb-1">Rally: {d.shots} shots</div>
                            <div style={{ color: WHITE_DIM }}>Errors: <strong className="text-white">{d.errors}</strong></div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine key="ref" x={18} stroke={ORANGE} strokeDasharray="4 3" strokeWidth={1.5} strokeOpacity={0.7} />
                    <Scatter
                      key="scatter-rally"
                      name="Rally"
                      data={allRallyData}
                      shape={(props: any) => {
                        const { cx, cy, payload } = props;
                        const fill = payload.phase === "early" ? NEON
                                   : payload.phase === "mid"   ? BLUE_SKY
                                   : ORANGE;
                        return (
                          <circle cx={cx} cy={cy} r={7} fill={fill}
                            stroke={WHITE} strokeWidth={0.8} strokeOpacity={0.3} />
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center gap-4">
                <div className="text-xs font-bold text-white mb-1">GAME PHASE</div>
                {[
                  { label: "Early Game", sub: "Shots 4–10",  color: NEON,     textColor: NEON_D },
                  { label: "Mid Game",   sub: "Shots 11–18", color: BLUE_SKY, textColor: "#0c3f6e" },
                  { label: "Late Game",  sub: "Shots 19+",   color: ORANGE,   textColor: "#7c2800" },
                ].map(({ label, sub, color }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
                    <div>
                      <div className="text-xs font-bold text-white">{label}</div>
                      <div className="text-[10px]" style={{ color: WHITE_SUB }}>{sub}</div>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl p-3 mt-1" style={{ background: `${ORANGE}25`, border: `1px solid ${ORANGE}50` }}>
                  <div className="text-[10px] font-bold mb-0.5" style={{ color: ORANGE }}>FATIGUE THRESHOLD</div>
                  <div className="text-xl font-bold text-white">18 shots</div>
                  <div className="text-[10px] mt-0.5" style={{ color: ORANGE_L }}>Errors escalate sharply past this rally length.</div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <CVReplayWidget
          onUpload={uploadAndAnalyzeVideo}
          analysisStatus={analysisStatus}
          analysisResult={analysisResult}
          analysisError={analysisError}
          selectedFile={cvFile}
        />

        {/* ══ 03 PREDICTIVE ════════════════════════════════════════════ */}
        <section>
          <SectionBanner
            n="03" eyebrow="PREDICTIVE ANALYTICS" title="What's Likely to Happen?"
            subtitle="Historical improvement velocity projected forward — sets realistic expectations for hitting the next skill goal."
            bg="linear-gradient(135deg,#2e1065,#4c1d95)" accent={VIOLET}
          />
          <Card accent={VIOLET}>
            <WidgetHeader
              title="Skill Progression Forecast: Projected Weeks to Target Metric"
              subtitle={`Time series forecast with shaded confidence interval. Target: ${playerGoals.volleyTarget}% Volley Success Rate.`}
              accent={VIOLET}
            />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-4">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={forecastData} margin={{ top: 10, right: 60, left: 0, bottom: 5 }}>
                    <CartesianGrid key="grid" strokeDasharray="3 4" stroke="rgba(100,160,255,0.08)" vertical={false} />
                    <XAxis key="x" dataKey="week" {...axisStyle} />
                    <YAxis key="y" domain={[55, 100]} {...axisStyle} tickFormatter={v => `${v}%`} width={36} />
                    <Tooltip
                      key="tt"
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const lower  = payload.find(p => p.name === "lower")?.value  as number | undefined;
                        const band   = payload.find(p => p.name === "band")?.value   as number | undefined;
                        const actual = payload.find(p => p.name === "actual")?.value as number | undefined;
                        return (
                          <div className="rounded-xl border px-3 py-2 text-xs shadow-2xl" style={{ background: "#0a1f4e", borderColor: BORDER }}>
                            <div className="font-bold text-white mb-1">{label}</div>
                            {actual != null && <div style={{ color: WHITE_DIM }}>Volley Rate: <strong className="text-white">{actual}%</strong></div>}
                            {lower != null && band != null && band > 0 && (
                              <>
                                <div style={{ color: VIOLET }}>Upper: <strong className="text-white">{(lower + band).toFixed(0)}%</strong></div>
                                <div style={{ color: VIOLET }}>Lower: <strong className="text-white">{lower.toFixed(0)}%</strong></div>
                              </>
                            )}
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      key="ref"
                      y={playerGoals.volleyTarget} stroke={NEON} strokeWidth={2} strokeDasharray="5 3"
                      label={{ value: `Target: ${playerGoals.volleyTarget}%`, position: "right", fontSize: 10, fill: NEON, fontFamily: "Inter,sans-serif", fontWeight: 700 }}
                    />
                    <Area key="area-lower" type="monotone" dataKey="lower" stackId="ci" stroke="none" fill="transparent" name="lower" legendType="none" />
                    <Area key="area-band"  type="monotone" dataKey="band"  stackId="ci" stroke="none" fill={VIOLET} fillOpacity={0.18} name="band" legendType="none" />
                    <Line
                      key="line-actual"
                      type="monotone" dataKey="actual" name="actual"
                      stroke={BLUE_SKY} strokeWidth={3} connectNulls={false}
                      dot={{ fill: BLUE_MID, stroke: BLUE_SKY, strokeWidth: 2.5, r: 5 }}
                      activeDot={{ fill: BLUE_SKY, r: 6, strokeWidth: 0 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center gap-3">
                <div className="text-xs font-bold text-white mb-1">PROJECTIONS</div>
                {[
                  { label: "Current",       value: "76%",     color: BLUE_SKY },
                  { label: "Best Case",     value: "+6 wks",  color: NEON },
                  { label: "Expected",      value: "+12 wks", color: VIOLET },
                  { label: "Conservative",  value: "+18 wks", color: WHITE_SUB },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border-b pb-2.5" style={{ borderColor: BORDER }}>
                    <div className="text-[10px]" style={{ color: WHITE_SUB }}>{label}</div>
                    <div className="text-lg font-bold" style={{ color, fontFamily: "'Barlow Condensed',sans-serif" }}>{value}</div>
                  </div>
                ))}
                <div className="rounded-xl p-2.5 text-[10px] mt-1" style={{ background: `${VIOLET}25`, border: `1px solid ${VIOLET}50`, color: "#ddd6fe" }}>
                  5× sessions/week moves best-case to ~4 weeks.
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* ══ 04 PRESCRIPTIVE ══════════════════════════════════════════ */}
        <section>
          <SectionBanner
            n="04" eyebrow="PRESCRIPTIVE ANALYTICS" title="What Should We Do Next?"
            subtitle="Generated via RAG pipeline — synthesises all prior analytics into a concrete action plan and matchmaking recommendations."
            bg={`linear-gradient(135deg,${NEON_D},#2a5000)`} accent={NEON}
          />
          <Card accent={NEON}>
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
             <WidgetHeader
                title="Recommended Action Plan & Matchmaking"
                subtitle={ragStatus === "ready"
                  ? `AI-generated via RAG · Secure Backend Retrieval · claude-3-haiku`
                  : "Powered by Automated Coach Agent · Strategy docs retrieved"}
                accent={NEON}
              />
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {ragStatus === "loading" && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: `${VIOLET}20`, border: `1px solid ${VIOLET}50` }}>
                    <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="3.5" stroke={VIOLET} strokeWidth="1.5" strokeDasharray="12 8" />
                    </svg>
                    <span className="font-mono text-[10px] font-bold" style={{ color: VIOLET }}>GENERATING RECOMMENDATIONS…</span>
                  </div>
                )}
                {ragStatus === "ready" && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: `${VIOLET}20`, border: `1px solid ${VIOLET}50` }}>
                    <Brain size={11} color={VIOLET} />
                    <span className="font-mono text-[10px] font-bold" style={{ color: VIOLET }}>AI-GENERATED</span>
                  </div>
                )}
                {ragStatus === "error" && ragError && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg max-w-xs"
                    style={{ background: `${ORANGE}15`, border: `1px solid ${ORANGE}40` }}>
                    <span className="text-[10px]" style={{ color: ORANGE_L }}>{ragError}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ background: `${NEON}20`, border: `1px solid ${NEON}60`, boxShadow: `0 0 12px ${NEON}20` }}>
                  <Brain size={13} color={NEON} />
                  <span className="text-[10px] font-bold tracking-widest" style={{ color: NEON }}>RAG · COACH-V2.1</span>
                </div>
                <button
                  onClick={generateRAG}
                  disabled={ragStatus === "loading"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:opacity-80 disabled:opacity-40"
                  style={{ background: `${NEON}15`, color: NEON, border: `1px solid ${NEON}40` }}
                >
                  <Zap size={10} />{ragStatus === "loading" ? "…" : "REGENERATE"}
                </button>
              </div>
            </div>

            {/* AI recommendations or skeleton while loading */}
            <div className="flex flex-col gap-3">
              {ragStatus === "loading" ? (
                [0, 1, 2].map(i => (
                  <div key={i} className="rounded-xl p-4 animate-pulse"
                    style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                    <div className="h-2.5 rounded w-1/4 mb-2" style={{ background: "rgba(255,255,255,0.1)" }} />
                    <div className="h-2 rounded w-3/4 mb-1.5" style={{ background: "rgba(255,255,255,0.07)" }} />
                    <div className="h-2 rounded w-1/2" style={{ background: "rgba(255,255,255,0.05)" }} />
                  </div>
                ))
              ) : ragRecs ? (
                ragRecs.map((rec, i) => {
                  const colors = [
                    { accent: NEON,     text: NEON_D,     icon: Target },
                    { accent: ORANGE,   text: WHITE,       icon: Users },
                    { accent: BLUE_SKY, text: "#0c3f6e",   icon: TrendingUp },
                  ];
                  const c = colors[i % colors.length];
                  return (
                    <ActionCard
                      key={i}
                      icon={c.icon}
                      priority={rec.priority}
                      accentColor={c.accent}
                      accentTextColor={c.text}
                      title={rec.title}
                      body={rec.body}
                    />
                  );
                })
              ) : (
                <>
                  <ActionCard
                    icon={Target} priority="HIGH" accentColor={NEON} accentTextColor={NEON_D}
                    title="Reset & Recover: Drill Set A"
                    body="Baseline drive errors spiked in rallies longer than 18 shots. Focus on Drill Set A (Reset & Recover) — 3×15 min per session for 3 sessions to improve mid-rally composure and reset positioning."
                  />
                  <ActionCard
                    icon={Users} priority="HIGH" accentColor={ORANGE} accentTextColor={WHITE}
                    title="Join the 4:00 PM Open-Play Queue"
                    body="Your defensive play style is a 78% match for aggressive opponents. Projected win rate: 74%. Join the 4:00 PM Open-Play Queue on Jul 12 to gain competitive experience against suitable matchups."
                  />
                  <ActionCard
                    icon={TrendingUp} priority="MED" accentColor={BLUE_SKY} accentTextColor="#0c3f6e"
                    title={`Targeted ${playerGoals.focusArea} Drill`}
                    body={`Heatmap shows 68% court time in right-baseline quadrant. Add split-step drills targeting the left-center corridor — 2×/week to address your active '${playerGoals.focusArea}' priority.`}
                  />
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t text-[10px]" style={{ borderColor: BORDER, color: WHITE_SUB }}>
              <div className="flex items-center gap-1.5">
                <Clock size={10} />
                {ragStatus === "ready"
                  ? `AI inference: ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`
                  : "Last inference: Jul 9, 2026 — 09:14 AM"}
              </div>
              <div className="flex items-center gap-1.5">
                <Zap size={10} />
                {ragStatus === "ready"
                  ? `Retrieval successful · claude-3-haiku`
                  : "Retrieval k=12 · Confidence: 91.4% · coach-v2.1"}
              </div>
            </div>
          </Card>
        </section>
      </main>

      {/* ── GOAL SETTING MODAL ───────────────────────────────────────── */}
      <GoalSettingModal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        currentGoals={playerGoals}
        onSave={(newGoals) => setPlayerGoals(newGoals)}
      />

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t mt-8 py-4 px-6" style={{ borderColor: BORDER, background: "rgba(7,26,62,0.8)" }}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[10px]" style={{ color: WHITE_SUB }}>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: "0.1em", color: WHITE_DIM }}>
            PICKLEBALL PERSONAL INFORMATICS · MCO PROTOTYPE
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: NEON }} />
            Data Pipeline: Live · Session: 2026-07-09 · RAG Active
          </div>
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Minus, Play, Square, Target, Volume2 } from "lucide-react";
import type { AnalysisResultV1 } from "../../lib/analysis/contract";
import { buildCoachingReport, coachingSpeechText, compareProgress, type CoachingItem, type ProgressRow } from "../../lib/analysis/coaching";
import { BLUE_SKY, BORDER, NEON, ORANGE_L, WHITE_DIM } from "../theme";
import { Card, WidgetHeader } from "../shell/primitives";

export type PreviousSession = { label: string; result: AnalysisResultV1 };

const itemStyle = { background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` };

function FocusItem({ item, index }: { item: CoachingItem; index: number }) {
  return (
    <li className="rounded-xl p-3" style={itemStyle}>
      <p className="text-sm font-semibold text-white">{index + 1}. {item.title}</p>
      <p className="mt-1 text-sm text-white">{item.observation}</p>
      {item.why && <p className="mt-1 text-xs" style={{ color: WHITE_DIM }}>{item.why}</p>}
      {item.drill && (
        <div className="mt-2 rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
          <p className="text-xs font-semibold" style={{ color: NEON }}>Drill: {item.drill.name}</p>
          <p className="mt-0.5 text-xs text-white">{item.drill.how}</p>
        </div>
      )}
      {item.target && (
        <p className="mt-2 flex gap-1.5 text-xs font-semibold" style={{ color: BLUE_SKY }}>
          <Target size={12} className="mt-0.5 flex-shrink-0" /> {item.target}
        </p>
      )}
      <p className="mt-1 text-xs" style={{ color: WHITE_DIM }}>Evidence: {item.evidence}</p>
    </li>
  );
}

const CHANGE = {
  better: { color: NEON, text: "Improved", Icon: ArrowUpRight },
  worse: { color: ORANGE_L, text: "Worse", Icon: ArrowDownRight },
  same: { color: WHITE_DIM, text: "About the same", Icon: Minus },
} as const;

function ProgressTable({ rows, label }: { rows: ProgressRow[]; label: string }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-white">Progress since {label}</p>
      <table className="mt-1 w-full text-xs">
        <thead>
          <tr style={{ color: WHITE_DIM }}>
            <th className="py-1 text-left font-normal">Measure</th>
            <th className="py-1 text-right font-normal">Before</th>
            <th className="py-1 text-right font-normal">Now</th>
            <th className="py-1 text-right font-normal">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { color, text, Icon } = CHANGE[row.change];
            return (
              <tr key={row.label} className="border-t" style={{ borderColor: BORDER }}>
                <td className="py-1 text-white">{row.label}</td>
                <td className="py-1 text-right font-mono" style={{ color: WHITE_DIM }}>{row.before}</td>
                <td className="py-1 text-right font-mono text-white">{row.after}</td>
                <td className="py-1 text-right" style={{ color }}>
                  <span className="inline-flex items-center gap-1"><Icon size={12} /> {text}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px]" style={{ color: WHITE_DIM }}>
        Differences can also come from the opponent, the format, or the camera angle, not only from your play.
      </p>
    </div>
  );
}

export function CoachingPanel({ result, previous }: { result: AnalysisResultV1; previous?: PreviousSession | null }) {
  const report = useMemo(() => buildCoachingReport(result), [result]);
  const progress = useMemo(() => previous ? compareProgress(result, previous.result) : null, [result, previous]);
  const speechText = coachingSpeechText(report);
  const [playing, setPlaying] = useState(false);
  const speechAvailable = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(() => {
    setPlaying(false);
    return () => { if (speechAvailable) window.speechSynthesis.cancel(); };
  }, [speechText, speechAvailable]);

  function toggleAudio() {
    if (!speechAvailable || !speechText) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }

  return (
    <Card accent={report.available ? NEON : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <WidgetHeader title="Gameplay feedback" subtitle="Practice plan based on measured player positions." />
        {report.available && (
          <button type="button" onClick={toggleAudio} disabled={!speechAvailable}
            aria-label={playing ? "Stop audio coaching" : "Play audio coaching"}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ color: "#071a3e", background: NEON }}>
            {playing ? <Square size={14} /> : <Play size={14} />}
            {playing ? "Stop audio" : "Play audio coaching"}
            <Volume2 size={14} />
          </button>
        )}
      </div>
      <p className="text-sm text-white">{report.introduction}</p>
      {report.strengths.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-white">What's working</p>
          <ul className="mt-1 space-y-1">
            {report.strengths.map((item) => (
              <li key={item.title} className="flex gap-2 text-sm text-white">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: NEON }} />
                <span><strong>{item.title}.</strong> {item.observation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.focus.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-white">Focus for your next session</p>
          <ol className="mt-1 space-y-3">
            {report.focus.map((item, index) => <FocusItem key={item.title} item={item} index={index} />)}
          </ol>
        </div>
      )}
      {progress && previous && <ProgressTable rows={progress} label={previous.label} />}
      {report.available && !progress && (
        <p className="mt-3 text-xs" style={{ color: WHITE_DIM }}>
          Record and analyze another session with the same camera setup to track progress against these targets.
        </p>
      )}
      <p className="mt-3 text-xs" style={{ color: WHITE_DIM }}>{report.limitation}</p>
      {report.available && !speechAvailable && <p className="mt-2 text-xs" style={{ color: WHITE_DIM }}>Audio coaching is unavailable in this browser.</p>}
    </Card>
  );
}

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Minus, Target } from "lucide-react";
import type { AnalysisResultV1 } from "../../lib/analysis/contract";
import { buildCoachingReport, compareProgress, type CoachingItem, type ProgressRow } from "../../lib/analysis/coaching";
import { BLUE_SKY, BORDER, NEON, ORANGE_L, WHITE_DIM } from "../theme";
import { Card, WidgetHeader } from "../shell/primitives";

export type PreviousSession = { label: string; result: AnalysisResultV1 };

const itemStyle = { background: "var(--pp-surface-2)", border: `1px solid ${BORDER}` };

function FocusItem({ item, index }: { item: CoachingItem; index: number }) {
  return (
    <li className="rounded-xl p-3" style={itemStyle}>
      <p className="text-sm font-semibold text-ink">{index + 1}. {item.title}</p>
      <p className="mt-1 text-sm text-ink">{item.observation}</p>
      {item.why && <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>{item.why}</p>}
      {item.drill && (
        <div className="mt-2 rounded-lg p-2" style={{ background: "var(--pp-surface-2)" }}>
          <p className="text-sm font-semibold" style={{ color: NEON }}>Drill: {item.drill.name}</p>
          <p className="mt-0.5 text-sm text-ink">{item.drill.how}</p>
        </div>
      )}
      {item.target && (
        <p className="mt-2 flex gap-1.5 text-sm font-semibold" style={{ color: BLUE_SKY }}>
          <Target size={12} className="mt-0.5 flex-shrink-0" /> {item.target}
        </p>
      )}
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Evidence: {item.evidence}</p>
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
      <p className="text-sm font-semibold text-ink">Progress since {label}</p>
      <table className="mt-1 w-full text-sm">
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
                <td className="py-1 text-ink">{row.label}</td>
                <td className="py-1 text-right font-mono" style={{ color: WHITE_DIM }}>{row.before}</td>
                <td className="py-1 text-right font-mono text-ink">{row.after}</td>
                <td className="py-1 text-right" style={{ color }}>
                  <span className="inline-flex items-center gap-1"><Icon size={12} /> {text}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>
        Differences can also come from the opponent, the format, or the camera angle, not only from your play.
      </p>
    </div>
  );
}

export function CoachingPanel({ result, previous, onRateSession }: {
  result: AnalysisResultV1; previous?: PreviousSession | null;
  /** Offered when the video cannot support advice: plan from the player's own ratings instead. */
  onRateSession?: () => void;
}) {
  const report = useMemo(() => buildCoachingReport(result), [result]);
  const devMock = result.provenance.pipeline_version === "dev-mock";
  const progress = useMemo(() => previous ? compareProgress(result, previous.result) : null, [result, previous]);

  return (
    <Card accent={report.available ? NEON : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <WidgetHeader title="What to practice next" subtitle={devMock ? "Example practice plan using sample data."
          : report.available ? "Practice plan based on court positioning observed in your video." : "No video-based practice plan yet."} />
      </div>
      <p className="text-sm text-ink">{devMock ? "Example only: these findings do not describe your play." : report.introduction}</p>
      {!report.available && !devMock && onRateSession && (
        <div className="mt-3 rounded-[14px] p-3" style={{ background: "var(--pp-accent-soft)" }}>
          <p className="text-sm font-semibold text-ink">Rate this session to get a plan from your own assessment.</p>
          <button type="button" onClick={onRateSession} className="mt-2 inline-flex min-h-[44px] items-center rounded-[12px] px-4 text-sm font-bold" style={{ background: "var(--pp-strong)", color: "var(--pp-on-strong)" }}>
            Rate this session
          </button>
        </div>
      )}
      {report.strengths.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-ink">What's working</p>
          <ul className="mt-1 space-y-1">
            {report.strengths.map((item) => (
              <li key={item.title} className="flex gap-2 text-sm text-ink">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: NEON }} />
                <span><strong>{item.title}.</strong> {item.observation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.focus.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-ink">Focus for your next session</p>
          <ol className="mt-1 space-y-3">
            {report.focus.map((item, index) => <FocusItem key={item.title} item={item} index={index} />)}
          </ol>
        </div>
      )}
      {progress && previous && <ProgressTable rows={progress} label={previous.label} />}
      {report.available && !progress && (
        <p className="mt-3 text-sm" style={{ color: WHITE_DIM }}>
          Record and analyze another session with a similar view and play format to track progress against these targets.
        </p>
      )}
      <p className="mt-3 text-sm" style={{ color: WHITE_DIM }}>{report.limitation}</p>
    </Card>
  );
}

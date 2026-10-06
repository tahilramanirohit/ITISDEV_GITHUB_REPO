import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, ChevronRight, ClipboardCheck } from "lucide-react";
import { listSessions, type SessionListItem } from "../../lib/api/sessions";
import { listSelfAssessments, type SelfAssessment } from "../../lib/api/selfAssessment";
import { CONTEXT_LABELS, FORMAT_LABELS, type SessionRow } from "../../lib/api/types";
import { deriveAnalysisState, STATE_LABELS, type AnalysisUiState } from "../../lib/analysis/state";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { BORDER, CARD_GLOW, DISPLAY_FONT, GREEN, GREEN_BG, INK, ORANGE, ROSE, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";

export const reviewMode = (session: SessionRow) => session.review_mode ?? "video";

/** Sessions plus self-assessments. Self-assessments are optional: a missing table just hides them. */
export function useSessionsData(sb: SupabaseClient) {
  const [items, setItems] = useState<SessionListItem[] | null>(null);
  const [assessments, setAssessments] = useState<SelfAssessment[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    listSessions(sb).then(setItems).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    listSelfAssessments(sb).then(setAssessments).catch(() => setAssessments([]));
  }, [sb]);
  useEffect(load, [load]);
  return { items, assessments, error, reload: load };
}

const STATE_TONE: Record<AnalysisUiState, string> = {
  not_uploaded: WHITE_SUB, uploading: GREEN, upload_incomplete: ORANGE, queued: GREEN,
  processing: GREEN, completed: GREEN, insufficient_data: ORANGE, failed: ROSE,
};

export function sessionStatus(item: SessionListItem, assessment: SelfAssessment | undefined): { text: string; color: string } {
  if (reviewMode(item.session) === "self" && !item.video) {
    if (!assessment) return { text: "Rate yourself", color: ORANGE };
    const report = buildSelfReport({ ratings: assessment.ratings, goals: item.session.improvement_goals ?? [] });
    return report.available ? { text: `Plan ready · ${report.overall?.toFixed(1)}/5`, color: GREEN } : { text: "Finish rating", color: ORANGE };
  }
  const state = deriveAnalysisState({ video: item.video, job: item.job, result: item.result });
  return { text: STATE_LABELS[state], color: STATE_TONE[state] };
}

function dateParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
    month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
  };
}

export function SessionCard({ item, assessment }: { item: SessionListItem; assessment?: SelfAssessment }) {
  const { session } = item;
  const date = dateParts(session.session_date);
  const status = sessionStatus(item, assessment);
  const video = reviewMode(session) === "video" || !!item.video;
  const Icon = video ? Camera : ClipboardCheck;
  return (
    <a href={`#/sessions/${session.id}`} className="flex items-center gap-3 rounded-3xl p-3 pr-4 transition-transform active:scale-[0.99]"
      style={{ background: WHITE, border: `1px solid ${BORDER}`, boxShadow: CARD_GLOW }}>
      <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl" style={{ background: GREEN_BG, color: GREEN }}>
        <span className="text-[10px] font-bold tracking-wider">{date.month}</span>
        <span className="text-xl font-extrabold leading-none" style={{ fontFamily: DISPLAY_FONT }}>{date.day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold" style={{ color: INK }}>{session.title}</span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: WHITE_DIM }}>
          <Icon size={13} aria-hidden="true" />
          {video ? "Video" : "Self-assessment"} · {CONTEXT_LABELS[session.session_context]} · {FORMAT_LABELS[session.play_format]}
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: status.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />{status.text}
          {item.result?.data_origin === "test_fixture" && <span style={{ color: ROSE }}> · TEST DATA</span>}
        </span>
      </span>
      <ChevronRight size={18} style={{ color: WHITE_SUB }} aria-hidden="true" />
    </a>
  );
}

export function EmptySessions() {
  return (
    <div className="rounded-3xl border-2 border-dashed p-6 text-center" style={{ borderColor: BORDER }}>
      <p className="text-base font-bold" style={{ color: INK }}>No sessions yet</p>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Log your first game. Rating yourself takes about two minutes, no video needed.</p>
      <a href="#/new" className="mt-4 inline-flex min-h-[44px] items-center rounded-2xl px-5 text-sm font-bold" style={{ background: INK, color: WHITE }}>
        Log a session
      </a>
    </div>
  );
}

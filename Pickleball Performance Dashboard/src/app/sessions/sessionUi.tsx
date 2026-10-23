import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, ClipboardCheck, Trophy, User } from "lucide-react";
import { listSessions, type SessionListItem } from "../../lib/api/sessions";
import { listSelfAssessments, type SelfAssessment } from "../../lib/api/selfAssessment";
import { initials, listAllOtherPlayers, type OtherPlayer } from "../../lib/api/players";
import { CONTEXT_LABELS, FORMAT_LABELS, KIND_LABELS, sessionKind, type SessionRow } from "../../lib/api/types";
import { deriveAnalysisState, STATE_LABELS, type AnalysisUiState } from "../../lib/analysis/state";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { BLUE, BLUE_BG, BORDER, INK, ORANGE, ROSE, SUCCESS, WHITE, WHITE_DIM, WHITE_SUB, YELLOW, YELLOW_BG, YELLOW_INK } from "../theme";

export const reviewMode = (session: SessionRow) => session.review_mode ?? "video";

/** Consecutive weeks, ending this week or last, with at least one session. */
export function weekStreak(dates: string[], today = new Date()): number {
  const weekIndex = (d: Date) => Math.floor((d.getTime() / 86400000 + 3) / 7); // weeks start on Monday
  const weeks = new Set(dates.map((iso) => weekIndex(new Date(`${iso}T12:00:00Z`))));
  let current = weekIndex(today);
  if (!weeks.has(current)) current -= 1;
  let streak = 0;
  while (weeks.has(current)) { streak += 1; current -= 1; }
  return streak;
}


/** Sessions, self-assessments and named players. The last two are optional: a failed lookup just hides them. */
export function useSessionsData(sb: SupabaseClient) {
  const [items, setItems] = useState<SessionListItem[] | null>(null);
  const [assessments, setAssessments] = useState<SelfAssessment[]>([]);
  const [players, setPlayers] = useState<Map<string, OtherPlayer[]>>(new Map());
  const [error, setError] = useState("");
  const load = useCallback(() => {
    listSessions(sb).then(setItems).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    listSelfAssessments(sb).then(setAssessments).catch(() => setAssessments([]));
    listAllOtherPlayers(sb).then(setPlayers).catch(() => setPlayers(new Map()));
  }, [sb]);
  useEffect(load, [load]);
  return { items, assessments, players, error, reload: load };
}

const STATE_TONE: Record<AnalysisUiState, string> = {
  not_uploaded: WHITE_SUB, uploading: BLUE, upload_incomplete: ORANGE, queued: BLUE,
  processing: BLUE, completed: SUCCESS, insufficient_data: ORANGE, failed: ROSE,
};

export function sessionStatus(item: SessionListItem, assessment: SelfAssessment | undefined): { text: string; color: string } {
  if (reviewMode(item.session) === "self" && !item.video) {
    if (!assessment) return { text: "Rate yourself", color: ORANGE };
    const report = buildSelfReport({ ratings: assessment.ratings, goals: item.session.improvement_goals ?? [], playFormat: item.session.play_format });
    return report.available ? { text: "Plan ready", color: SUCCESS } : { text: "Finish rating", color: ORANGE };
  }
  const state = deriveAnalysisState({ video: item.video, job: item.job, result: item.result });
  return { text: STATE_LABELS[state], color: STATE_TONE[state] };
}

export function formatSessionDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);
}

/** Small round initials, stacked like a club member list. */
export function AvatarStack({ names, max = 4, size = 28 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  const colors = [BLUE_BG, YELLOW_BG, "#e7f6ee", "#fde8ef"];
  return (
    <span className="flex items-center" aria-label={names.join(", ")}>
      {shown.map((name, i) => (
        <span key={`${name}-${i}`} aria-hidden="true" className="flex items-center justify-center rounded-full font-bold"
          style={{ width: size, height: size, fontSize: size * 0.38, background: colors[i % colors.length], color: INK,
            border: `2px solid ${WHITE}`, marginLeft: i ? -size * 0.28 : 0 }}>{initials(name)}</span>
      ))}
      {names.length > max && <span className="ml-1 text-xs font-semibold" style={{ color: WHITE_SUB }}>+{names.length - max}</span>}
    </span>
  );
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  // Short values (numbers, Won/Lost) read big like a sports stat; words wrap at a smaller size instead of being cut off.
  const short = value.length <= 7;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium" style={{ color: WHITE_SUB }}>{label}</p>
      <p className={`${short ? "text-lg" : "text-sm"} break-words font-extrabold leading-tight tracking-tight`} style={{ color: INK }}>{value}</p>
      {caption && <p className="truncate text-[11px]" style={{ color: WHITE_SUB }}>{caption}</p>}
    </div>
  );
}

/** One session as a Strava-style activity: who, when, a row of stats, and who played. */
export function SessionCard({ item, assessment, players = [], you = "You" }: {
  item: SessionListItem; assessment?: SelfAssessment; players?: OtherPlayer[]; you?: string;
}) {
  const { session } = item;
  const status = sessionStatus(item, assessment);
  const kind = sessionKind(session);
  const video = reviewMode(session) === "video" || !!item.video;
  const report = assessment ? buildSelfReport({ ratings: assessment.ratings, goals: session.improvement_goals ?? [], playFormat: session.play_format }) : null;
  const KindIcon = kind === "tournament" ? Trophy : kind === "solo" ? User : video ? Camera : ClipboardCheck;

  const stats: { label: string; value: string; caption?: string }[] = [];
  if (session.match_result) stats.push({ label: "Result", value: session.match_result === "win" ? "Won" : "Lost", caption: session.match_score ?? undefined });
  else if (session.match_score) stats.push({ label: "Score", value: session.match_score });
  else if (assessment?.games_played) stats.push({ label: "Games won", value: `${assessment.games_won ?? 0} of ${assessment.games_played}` });
  if (report?.available && report.overall != null) stats.push({ label: "Self rating", value: `${report.overall.toFixed(1)}/5` });
  if (report?.focus[0]) stats.push({ label: "Focus", value: report.focus[0].label });
  else if (video) stats.push({ label: "Video", value: status.text });
  const names = [you, ...players.map((p) => p.display_name)];

  return (
    <a href={`#/sessions/${session.id}`} className="block rounded-2xl p-4 transition-shadow hover:shadow-md"
      style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: kind === "tournament" ? YELLOW : BLUE_BG, color: kind === "tournament" ? YELLOW_INK : BLUE }}>
            <KindIcon size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold" style={{ color: INK }}>{KIND_LABELS[kind]}{session.tournament_round ? ` · ${session.tournament_round}` : ""}</span>
            <span className="block truncate text-xs" style={{ color: WHITE_SUB }}>{formatSessionDate(session.session_date)} · {FORMAT_LABELS[session.play_format]} · {CONTEXT_LABELS[session.session_context]}</span>
          </span>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${status.color}14`, color: status.color }}>{status.text}</span>
      </div>
      <h3 className="mt-3 truncate text-base font-extrabold tracking-tight" style={{ color: INK }}>{session.title}</h3>
      {session.tournament_name && session.tournament_name !== session.title && <p className="truncate text-xs" style={{ color: WHITE_DIM }}>{session.tournament_name}</p>}
      {stats.length > 0 && <div className="mt-3 grid grid-cols-3 gap-3 border-t pt-3" style={{ borderColor: BORDER }}>
        {stats.slice(0, 3).map((s) => <Stat key={s.label} label={s.label} value={s.value} caption={s.caption} />)}
      </div>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <AvatarStack names={names} />
        <span className="text-xs font-semibold" style={{ color: BLUE }}>{status.text === "Rate yourself" ? "Rate now" : "Open"} →</span>
      </div>
      {item.result?.data_origin === "test_fixture" && <p className="mt-2 text-xs font-bold" style={{ color: ROSE }}>TEST DATA</p>}
    </a>
  );
}

export function EmptySessions() {
  return (
    <div className="rounded-2xl border-2 border-dashed p-6 text-center" style={{ borderColor: BORDER, background: WHITE }}>
      <p className="text-base font-bold" style={{ color: INK }}>No sessions yet</p>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Log your first game. Rating yourself takes about two minutes, no video needed.</p>
      <a href="#/new" className="mt-4 inline-flex min-h-[44px] items-center rounded-full px-6 text-sm font-bold" style={{ background: BLUE, color: WHITE }}>
        Log a session
      </a>
    </div>
  );
}

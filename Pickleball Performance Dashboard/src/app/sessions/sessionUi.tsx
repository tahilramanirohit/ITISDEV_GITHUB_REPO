import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Camera, ClipboardCheck, Trophy, User } from "lucide-react";
import { listSessions, type SessionListItem } from "../../lib/api/sessions";
import type { GameShare } from "../../lib/api/gameShares";
import { listSelfAssessments, type SelfAssessment } from "../../lib/api/selfAssessment";
import { initials, listAllOtherPlayers, type OtherPlayer } from "../../lib/api/players";
import { CONTEXT_LABELS, FORMAT_LABELS, KIND_LABELS, sessionKind, type SessionRow } from "../../lib/api/types";
import { deriveAnalysisState, STATE_LABELS, type AnalysisUiState } from "../../lib/analysis/state";
import { buildSelfReport } from "../../lib/coaching/selfAssessment";
import { BLUE, BLUE_BG, BORDER, INK, NUM_FONT, ORANGE, ROSE, SUCCESS, WHITE, WHITE_DIM, WHITE_SUB, YELLOW_BG, alpha } from "../theme";

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
  const colors = [BLUE_BG, YELLOW_BG, "var(--pp-accent-soft)", "color-mix(in srgb, var(--pp-danger) 12%, transparent)"];
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

/** First game of a score like "11-7, 9-11", our points first. */
function firstGame(score?: string | null): [number, number] | null {
  const m = score?.match(/(\d{1,2})\s*[-–:]\s*(\d{1,2})/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * One session as a Design B list row: a W/L badge, the title, when and who, rating dots
 * with status pills, and the score. Sits inside a `SessionList` panel.
 */
export function SessionCard({ item, assessment, players = [], you = "You" }: {
  item: SessionListItem; assessment?: SelfAssessment; players?: OtherPlayer[]; you?: string;
}) {
  const { session } = item;
  const status = sessionStatus(item, assessment);
  const kind = sessionKind(session);
  const video = reviewMode(session) === "video" || !!item.video;
  const report = assessment ? buildSelfReport({ ratings: assessment.ratings, goals: session.improvement_goals ?? [], playFormat: session.play_format }) : null;
  const KindIcon = kind === "tournament" ? Trophy : kind === "solo" ? User : video ? Camera : ClipboardCheck;
  const score = firstGame(session.match_score);
  const won = session.match_result ? session.match_result === "win" : score ? score[0] > score[1] : null;
  const rating = report?.available && report.overall != null ? report.overall : null;
  const others = players.map((p) => p.display_name).filter(Boolean);
  const named = (role: OtherPlayer["role"]) => players.filter((p) => p.role === role).map((p) => p.display_name.split(" ")[0]).filter(Boolean);
  const partners = named("partner"), opponents = named("opponent");
  const who = partners.length ? `with ${partners.join(" & ")}` : opponents.length ? `vs ${opponents.join(" & ")}` : CONTEXT_LABELS[session.session_context];
  const meta = [formatSessionDate(session.session_date), FORMAT_LABELS[session.play_format], who];
  const pill = "inline-flex min-h-[26px] items-center gap-1 rounded-full px-2.5 text-xs font-bold";
  return (
    <a href={`#/sessions/${session.id}`} className="flex min-h-[64px] w-full items-center gap-3 py-3 pl-4 pr-3 text-left transition-colors hover:bg-sunken">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-sm font-extrabold"
        style={won === true ? { background: "var(--pp-action)", color: "var(--pp-on-action)" }
          : won === false ? { background: "var(--pp-hero)", color: "var(--pp-on-hero)" } : { background: "var(--pp-surface-2)", color: WHITE_SUB }}>
        {won == null ? <KindIcon size={20} aria-hidden="true" /> : <><span aria-hidden="true">{won ? "W" : "L"}</span><span className="sr-only">{won ? "Won" : "Lost"}</span></>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold" style={{ color: INK }}>{session.title}</span>
        <span className="block text-sm" style={{ color: WHITE_SUB }} aria-label={[you, ...others].join(", ")}>{meta.join(" · ")}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {rating != null && <span role="img" aria-label={`Self rating ${rating.toFixed(1)} of 5`} className="mr-0.5 inline-flex gap-[3px]">
            {[1, 2, 3, 4, 5].map((n) => <i key={n} className="h-[7px] w-[7px] rounded-full" style={{ background: n <= Math.round(rating) ? "var(--pp-action)" : "var(--pp-line-strong)" }} />)}
          </span>}
          <span className={pill} style={{ background: alpha(status.color, 14), color: status.color }}>{status.text}</span>
          {kind === "tournament" && <span className={pill} style={{ background: "var(--pp-surface-2)", color: INK }}>
            <Trophy size={13} aria-hidden="true" />{KIND_LABELS[kind]}{session.tournament_round ? ` · ${session.tournament_round}` : ""}</span>}
          {item.result?.data_origin === "test_fixture" && <span className={pill} style={{ color: ROSE }}>TEST DATA</span>}
        </span>
      </span>
      {score && <span className="shrink-0 text-xl font-bold leading-none" style={{ fontFamily: NUM_FONT, color: won ? "var(--pp-green)" : INK }}
        title={session.match_score ?? undefined}>{score[0]}–{score[1]}</span>}
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pp-line-strong)" strokeWidth="2.2" strokeLinecap="round" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>
    </a>
  );
}

/** Design B list panel: rows separated by hairlines, with the yellow stripe down the left edge. */
export function SessionList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="overflow-hidden rounded-[20px] [&>li+li]:border-t"
      style={{ background: WHITE, border: `1px solid ${BORDER}`, boxShadow: "inset 5px 0 0 var(--pp-action)", borderColor: BORDER }}>
      {children}
    </ul>
  );
}

export function EmptySessions() {
  return (
    <div className="rounded-[14px] border-2 border-dashed p-6 text-center" style={{ borderColor: BORDER, background: WHITE }}>
      <p className="text-base font-bold" style={{ color: INK }}>No sessions yet</p>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Log your first game. Rating yourself takes about two minutes, no video needed.</p>
      <a href="#/new" className="mt-4 inline-flex min-h-[44px] items-center rounded-[12px] px-6 text-sm font-bold" style={{ background: "var(--pp-strong)", color: "var(--pp-on-strong)" }}>
        Log a session
      </a>
    </div>
  );
}

/** A game a buddy shared with you, as a list row that opens the read-only shared view. */
export function SharedGameRow({ share }: { share: GameShare }) {
  const score = firstGame(share.match_score);
  const won = share.match_result ? share.match_result === "win" : score ? score[0] > score[1] : null;
  const owner = share.owner_name?.split(" ")[0] || "A buddy";
  const pill = "inline-flex min-h-[26px] items-center gap-1 rounded-full px-2.5 text-xs font-bold";
  return (
    <a href={`#/shared-game/${share.session_id}`} className="flex min-h-[64px] w-full items-center gap-3 py-3 pl-4 pr-3 text-left transition-colors hover:bg-sunken">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-sm font-extrabold"
        style={won === true ? { background: "var(--pp-action)", color: "var(--pp-on-action)" }
          : won === false ? { background: "var(--pp-hero)", color: "var(--pp-on-hero)" } : { background: "var(--pp-surface-2)", color: WHITE_SUB }}>
        {won == null ? <User size={20} aria-hidden="true" /> : <><span aria-hidden="true">{won ? "W" : "L"}</span><span className="sr-only">{won ? "Won" : "Lost"}</span></>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold" style={{ color: INK }}>{share.title}</span>
        <span className="block text-sm" style={{ color: WHITE_SUB }}>{formatSessionDate(share.session_date)} · {FORMAT_LABELS[share.play_format as SessionRow["play_format"]] ?? share.play_format}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={pill} style={{ background: "color-mix(in srgb, var(--pp-green) 18%, var(--pp-surface))", color: "var(--pp-green)" }}>Shared by {owner}</span>
          {share.has_video && <span className={pill} style={{ background: "var(--pp-surface-2)", color: INK }}><Camera size={13} aria-hidden="true" />Video</span>}
        </span>
      </span>
      {score && <span className="shrink-0 text-xl font-bold leading-none" style={{ fontFamily: NUM_FONT, color: won ? "var(--pp-green)" : INK }}
        title={share.match_score ?? undefined}>{score[0]}–{score[1]}</span>}
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pp-line-strong)" strokeWidth="2.2" strokeLinecap="round" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>
    </a>
  );
}

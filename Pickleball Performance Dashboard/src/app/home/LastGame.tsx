import { useEffect, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, Play, Video } from "lucide-react";
import { getSessionBundle, signedVideoUrl, type SessionListItem } from "../../lib/api/sessions";
import type { OtherPlayer } from "../../lib/api/players";
import { parseAnalysisResult } from "../../lib/analysis/contract";
import { formatClock } from "../../lib/analysis/shotLabels";
import { chosenPlayer, lastGameReview, type LastGameReview } from "../../lib/coaching/lastGameReview";
import { deriveAnalysisState } from "../../lib/analysis/state";
import { TopCourtHeatmap } from "../analysis/TopCourtHeatmap";
import { ACTION, HERO, INK, LINE, ON_ACTION, ON_HERO, PAGE_BG, SURFACE } from "../theme";
import { numStyle, pressable } from "../shell/primitives";
import { formatSessionDate } from "../sessions/sessionUi";

/** "11-9" (first game, our score first) as two numbers, or null when there is no usable score. */
export function parseScore(score?: string | null): [number, number] | null {
  const m = score?.match(/(\d{1,2})\s*[-–:]\s*(\d{1,2})/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** True when the game's uploaded video file can still be played. */
export const hasPlayableVideo = (item: SessionListItem) => {
  const v = item.video;
  return !!v && v.upload_status === "uploaded" && !v.raw_video_deleted_at && !v.raw_video_deleting_at;
};

/**
 * The game Home features: the newest game with a video you can still play (so Shot replay
 * and Heatmap show), otherwise the newest game. `items` is newest first.
 */
export function homeFeaturedGame(items: SessionListItem[]): SessionListItem | undefined {
  return items.find(hasPlayableVideo) ?? items[0];
}

type Props = { item: SessionListItem; players: OtherPlayer[]; you: string; rating: number | null };

function teams({ item, players, you }: Props) {
  const score = parseScore(item.session.match_score);
  const partner = players.find((p) => p.role === "partner")?.display_name;
  const opponents = players.filter((p) => p.role === "opponent").map((p) => firstName(p.display_name)).filter(Boolean);
  const us = [you, partner && firstName(partner)].filter(Boolean).join(" / ").toUpperCase();
  const them = (opponents.join(" / ") || "OPPONENTS").toUpperCase();
  const won = item.session.match_result ? item.session.match_result === "win" : score ? score[0] > score[1] : null;
  return { score, us, them, won };
}

/** The two-row broadcast scoreboard: team names, points, the winner's points in yellow. */
function ScoreRows(props: Props) {
  const { score, us, them, won } = teams(props);
  const row = (name: string, points: number | undefined, lead: boolean) => (
    <span className="flex w-max overflow-hidden rounded-[8px] text-[15px] leading-none" style={{ ...numStyle, fontWeight: 700 }}>
      <span className="px-2 py-1.5" style={{ background: HERO, color: lead ? ON_HERO : "#c6d3ca" }}>{name}</span>
      {points != null && <span className="px-2.5 py-1.5" style={lead ? { background: ACTION, color: ON_ACTION } : { background: SURFACE, color: INK }}>{points}</span>}
    </span>
  );
  return <span className="flex flex-col gap-1.5">{row(us, score?.[0], won !== false)}{row(them, score?.[1], won === false)}</span>;
}

/** The last game as a broadcast-style scoreboard on a drawn court, linking to the session. */
export function LastGame(props: Props) {
  const { item, rating } = props;
  const { session } = item;
  const { score } = teams(props);
  return (
    <a href={`#/sessions/${session.id}`} aria-label={`Last game: ${session.title}${score ? `, ${score[0]} to ${score[1]}` : ""}. Open it.`}
      className={`relative block h-[150px] overflow-hidden rounded-[18px] ${pressable}`} style={{ background: "var(--pp-court-blue)", border: `1px solid ${LINE}` }}>
      <svg aria-hidden="true" viewBox="0 0 340 150" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <rect width="340" height="150" fill="var(--pp-court-green)" />
        <path d="M70 18 H270 L330 150 H10 Z" fill="var(--pp-court-blue)" />
        <g fill="none" stroke={ON_HERO} strokeOpacity=".85" strokeWidth="2.5"><path d="M70 18 H270 L330 150 H10 Z" /><path d="M170 18 V60 M170 96 V150 M52 60 H288 M35 96 H305" /></g>
        <rect x="58" y="74" width="224" height="8" fill={HERO} opacity=".7" />
      </svg>
      <span className="absolute left-2.5 top-2.5"><ScoreRows {...props} /></span>
      <span className="absolute bottom-2.5 left-2.5 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-extrabold" style={{ background: ACTION, color: ON_ACTION }}>
        Last game · {formatSessionDate(session.session_date, { weekday: "short" })}
      </span>
      {rating != null && <span className="absolute bottom-2.5 right-2.5 rounded-full px-3 py-1.5 text-[13px] font-bold" style={{ background: HERO, color: ON_HERO }}>
        Rated <span style={{ ...numStyle, fontSize: 16 }}>{rating.toFixed(1)}</span></span>}
    </a>
  );
}

type View = "replay" | "heat";
const VIEW_KEY = "picklepro.home.lastGameView";
const readView = (): View => { try { return window.localStorage.getItem(VIEW_KEY) === "replay" ? "replay" : "heat"; } catch { return "heat"; } };
const savedPlayer = (sessionId: string): number | null => {
  try { const v = window.localStorage.getItem(`picklepro:me:${sessionId}`); return v != null && /^\d+$/.test(v) ? Number(v) : null; } catch { return null; }
};

/**
 * Loads the last game's video and, when it has been analyzed (measured results only), the review.
 * Null when the game has no uploaded video, so Home keeps the drawn court.
 */
function useReview(sb: SupabaseClient, item: SessionListItem) {
  const [state, setState] = useState<{ review: LastGameReview | null; videoPath: string | null } | null>(null);
  const id = item.session.id;
  const uploaded = item.video?.upload_status === "uploaded";
  const measured = item.result?.data_origin === "measured" && item.result.result_status === "ok";
  useEffect(() => {
    setState(null);
    if (!uploaded) return;
    let active = true;
    getSessionBundle(sb, id).then((bundle) => {
      if (!active || !bundle) return;
      let review: LastGameReview | null = null;
      if (measured && bundle.result?.result) {
        try {
          const result = parseAnalysisResult(bundle.result.result);
          review = lastGameReview(result, chosenPlayer(result, savedPlayer(id)));
        } catch { /* An unreadable result: show the video without a heatmap. */ }
      }
      const v = bundle.video;
      const videoPath = v && v.upload_status === "uploaded" && !v.raw_video_deleted_at && !v.raw_video_deleting_at ? v.storage_path : null;
      if (review || videoPath) setState({ review, videoPath });
    }).catch(() => { /* Keep the drawn court. */ });
    return () => { active = false; };
  }, [sb, id, uploaded, measured]);
  return state;
}

/** Why there's no heatmap yet, in plain words. */
function heatmapWaiting(item: SessionListItem): string {
  switch (deriveAnalysisState({ video: item.video, job: item.job, result: item.result })) {
    case "queued": return "Your video is waiting for the analyzer. Your heatmap appears here once it's analyzed.";
    case "processing": return "Analyzing your video… Your heatmap appears here when it's done.";
    case "failed": return "We couldn't analyze this video. Open the full review to try again.";
    case "insufficient_data": return "The video didn't show enough of the court to map where you stood.";
    default: return "No heatmap for this video yet.";
  }
}

/**
 * Home "Last game" for a game with an analyzed video: the score, then a switch between
 * Shot replay (the video, with jump-to-moment chips) and Heatmap (the court from above,
 * where the player stood). Any other game shows the drawn court.
 */
export function LastGameCard({ sb, ...props }: Props & { sb: SupabaseClient }) {
  const data = useReview(sb, props.item);
  const [saved, setSaved] = useState<View>(readView);
  const [picked, setPicked] = useState<View | null>(null);
  // Until there's a heatmap, open on the video (it works as soon as it's uploaded); a tap always wins.
  const view: View = picked ?? (data && !data.review ? "replay" : saved);
  const setView = (next: View) => { setPicked(next); setSaved(next); };
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoPath = data?.videoPath ?? null;
  useEffect(() => {
    if (view !== "replay" || !videoPath) { setVideoUrl(null); return; }
    let active = true;
    signedVideoUrl(sb, videoPath).then((url) => { if (active) setVideoUrl(url); }).catch(() => { if (active) setVideoUrl(null); });
    return () => { active = false; };
  }, [sb, view, videoPath]);
  if (!data) return <div className="space-y-3"><LastGame {...props} />
    {!props.item.video && <a href={`#/sessions/${props.item.session.id}?tab=video`} className={`flex min-h-[56px] items-center gap-3 rounded-[18px] px-3.5 py-3 ${pressable}`}
      style={{ background: "var(--pp-action-soft)", border: "1px solid color-mix(in srgb, var(--pp-action) 35%, var(--pp-line))", color: INK }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ background: ACTION, color: ON_ACTION }}><Video size={20} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><b className="block text-[15px]">Add a video of this game</b>
        <span className="block text-sm" style={{ color: "var(--pp-ink-2)" }}>Unlocks Shot replay and Heatmap here.</span></span>
      <ChevronRight size={18} aria-hidden="true" style={{ color: "var(--pp-line-strong)" }} />
    </a>}
  </div>;

  const { review } = data;
  const { session } = props.item;
  const choose = (next: View) => { setView(next); try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* this visit only */ } };
  const videoHref = (t?: number) => `#/sessions/${session.id}?tab=video${t != null ? `&t=${Math.floor(t)}` : ""}`;
  const share = review?.kitchenLineShare != null ? Math.round(review.kitchenLineShare * 100) : null;
  const where = share != null
    ? `You spent ${share}% of ${review?.window === "rallies" ? "rallies" : "the video"} at the kitchen line`
    : "Where you stood during the game";
  const tabs: [View, string, ReactNode][] = [
    ["replay", "Shot replay", <Play key="p" size={16} fill="currentColor" aria-hidden="true" />],
    ["heat", "Heatmap", <svg key="h" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14" /><circle cx="8" cy="10" r="2" fill="currentColor" /></svg>],
  ];

  return (
    <section aria-label="Last game" className="flex flex-col gap-3 rounded-[22px] p-3" style={{ background: HERO, color: ON_HERO, borderTop: `4px solid ${ACTION}` }}>
      <div className="flex items-start justify-between gap-2">
        <ScoreRows {...props} />
        <a href={videoHref()} className="flex min-h-[44px] flex-col items-end text-right text-[13px] leading-snug" style={{ color: "#c6d3ca" }}>
          <b className="inline-flex items-center text-sm" style={{ color: ACTION }}>Full review <ChevronRight size={15} aria-hidden="true" /></b>
          {formatSessionDate(session.session_date, { weekday: "short" })}{props.rating != null ? ` · Rated ${props.rating.toFixed(1)}` : ""}
        </a>
      </div>
      <div role="tablist" aria-label="Last game view" className="grid grid-cols-2 gap-0.5 rounded-full p-1" style={{ background: PAGE_BG }}>
        {tabs.map(([value, label, icon]) => (
          <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => choose(value)}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-full text-[15px] font-bold ${pressable}`}
            style={view === value ? { background: ACTION, color: ON_ACTION } : { color: "#c6d3ca" }}>{icon}{label}</button>
        ))}
      </div>

      {view === "heat" && !review ? <div role="tabpanel" aria-label="Heatmap" className="grid aspect-[2/1] w-full place-items-center rounded-[16px] px-6 text-center text-[15px]"
        style={{ background: PAGE_BG, color: "#c6d3ca" }}>{heatmapWaiting(props.item)}</div>
      : view === "heat" && review ? <div role="tabpanel" aria-label="Heatmap" className="flex flex-col gap-2.5">
        <a href={videoHref()} className="block overflow-hidden rounded-[16px]" aria-label={`${where}. Open the full review.`}>
          <TopCourtHeatmap value={review.heatmap} nearSide={review.nearSide} label={`Court from above. ${where}.`} />
        </a>
        {share != null
          ? <p className="flex items-center gap-3"><span className="text-[34px] leading-none" style={{ ...numStyle, color: ACTION }}>{share}%</span>
              <span className="text-[15px] leading-snug"><b className="block">of {review.window === "rallies" ? "rallies" : "the video"} at the kitchen line</b>
                <span style={{ color: "#c6d3ca" }}>From your video. Tap for the full review.</span></span></p>
          : <p className="text-[15px]" style={{ color: "#c6d3ca" }}>Where you stood, from your video.</p>}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "#c6d3ca" }} aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc17" }} />Where you stood most</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff8a65" }} />At the back</span>
        </p>
      </div> : <div role="tabpanel" aria-label="Shot replay" className="flex flex-col gap-2.5">
        {videoPath
          ? videoUrl
            ? <video src={`${videoUrl}#t=0.1`} controls playsInline preload="metadata" className="block aspect-video w-full rounded-[16px] bg-black" aria-label="Your last game's video" />
            : <div className="grid aspect-video w-full place-items-center rounded-[16px] text-sm" style={{ background: PAGE_BG, color: "#c6d3ca" }}>Loading your video…</div>
          : <a href={videoHref()} className="grid aspect-video w-full place-items-center rounded-[16px] px-6 text-center text-sm" style={{ background: PAGE_BG, color: "#c6d3ca" }}>
              The video file was removed after its storage period. Your results are still in the full review.</a>}
        {review && review.moments.length > 0 && <>
          <p className="text-sm font-bold" style={{ color: "#c6d3ca" }}>Jump to a moment</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {review.moments.map((m) => (
              <a key={`${m.time}-${m.label}`} href={videoHref(m.time)} className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${pressable}`}
                style={{ background: SURFACE, border: `1px solid ${LINE}`, color: INK }}>
                <b style={{ ...numStyle, fontSize: 15, color: m.tone === "good" ? ACTION : "#ff8a65" }}>{formatClock(m.time)}</b>{m.label}</a>
            ))}
          </div>
        </>}
      </div>}
    </section>
  );
}

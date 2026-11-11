import { useCallback, useEffect, useRef, useState } from "react";
import type { BallSnapshot, BounceEvent, CourtLinesSnapshot, PositionSnapshot, ShotEvent } from "../../lib/analysis/contract";
import { SHOT_INFO, formatClock } from "../../lib/analysis/shotLabels";
import { INK, WHITE_DIM } from "../theme";

const YOU = "#293df2";
const OTHER = "#ffffff";
// Canvas drawing cannot read CSS variables, so the overlay keeps plain colours.
const TAG_INK = "#121a15";
const BALL = "#ff8a1f";
const COURT = "rgba(255, 236, 64, 0.85)";
const TRAIL_S = 0.6;
const SHOT_LABEL_S = 1.0;
const BOUNCE_S = 0.5;
/** Below this video width (phones) the overlay switches to small corner brackets and a caption bar. */
const COMPACT_BELOW_PX = 480;

/** Phone video tags: "Opponent 2" becomes "Opp 2" to fit small players. The caption bar keeps the full label. */
function shortLabel(label: string): string {
  return label.replace(/^Opponent\b/, "Opp");
}

function nearest<T extends { time_seconds: number }>(items: T[], time: number, tol = 0.25): T | null {
  if (!items.length) return null;
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time_seconds < time) lo = mid + 1;
    else hi = mid;
  }
  const a = items[lo];
  const b = items[Math.max(0, lo - 1)];
  const found = Math.abs(b.time_seconds - time) < Math.abs(a.time_seconds - time) ? b : a;
  return Math.abs(found.time_seconds - time) <= tol ? found : null;
}

/** The latest snapshot at or before `time` (court lines stay valid until replaced). */
function latest<T extends { time_seconds: number }>(items: T[], time: number): T | null {
  let found: T | null = null;
  for (const item of items) {
    if (item.time_seconds > time + 1e-3) break;
    found = item;
  }
  return found;
}

export type JumpRequest = { time: number; id: number } | null;

/**
 * Video player with what the analysis saw drawn on top: court lines, player
 * boxes ("You" for the selected player), the ball with a short trail, and the
 * estimated shot name at each detected hit. Adapted from the original
 * CVReplayWidget overlay.
 *
 * On phones the video is small, so the overlay is lighter: corner brackets instead
 * of full boxes, small name tags, and the shot name in a bar under the video.
 */
export function VideoOverlayPlayer({
  src,
  positions,
  ballPositions = [],
  courtLines = [],
  shots = [],
  bounces = [],
  selectedTrackId,
  playerNames,
  onSelectTrack,
  jump = null,
  onVideoElement,
}: {
  src: string | null;
  positions: PositionSnapshot[];
  ballPositions?: BallSnapshot[];
  courtLines?: CourtLinesSnapshot[];
  shots?: ShotEvent[];
  bounces?: BounceEvent[];
  selectedTrackId?: number | null;
  /** Labels by track id: names, or "Partner" / "Opponent 1". Players without one show as "You" or "Player 3". */
  playerNames?: Record<number, string>;
  onSelectTrack?: (trackId: number, timeSeconds: number) => void;
  jump?: JumpRequest;
  /** Gives the page the video element, e.g. to pin a note at the current time. Pass a stable function. */
  onVideoElement?: (video: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const setVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    onVideoElement?.(video);
  }, [onVideoElement]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [compact, setCompact] = useState(false);
  // The shot named in the caption bar (phones): the latest hit at or before the playhead.
  const [captionShot, setCaptionShot] = useState<ShotEvent | null>(null);
  const captionRef = useRef<ShotEvent | null>(null);
  const compactRef = useRef(false);
  const isMe = useCallback((trackId: number | null | undefined, flagged: boolean) =>
    selectedTrackId != null ? trackId === selectedTrackId : flagged, [selectedTrackId]);
  const givenName = useCallback((trackId: number | null | undefined) =>
    (trackId != null ? playerNames?.[trackId] : undefined) || null, [playerNames]);
  const hasSelected = positions.some((s) => s.players.some((p) => p.selected)) || selectedTrackId != null;

  // Each jump is applied once. A jump that arrives before the video has loaded (for example
  // a Home moment chip opening this page at "?t=47") waits for the video's metadata.
  const appliedJump = useRef<number | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!jump || !video || appliedJump.current === jump.id) return;
    const go = () => {
      appliedJump.current = jump.id;
      // Start a moment early so the shot can be seen developing.
      video.currentTime = Math.max(0, jump.time - 1.0);
      void video.play().catch(() => undefined);
      video.scrollIntoView?.({ behavior: "smooth", block: "center" });
    };
    if (video.readyState >= 1) { go(); return; }
    video.addEventListener("loadedmetadata", go, { once: true });
    return () => video.removeEventListener("loadedmetadata", go);
  }, [jump, src]);

  function selectPlayer(event: React.MouseEvent<HTMLCanvasElement>) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!onSelectTrack || !video || !canvas || !video.videoWidth) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const offX = (canvas.width - video.videoWidth * scale) / 2;
    const offY = (canvas.height - video.videoHeight * scale) / 2;
    const x = ((event.clientX - rect.left) * canvas.width / rect.width - offX) / scale;
    const y = ((event.clientY - rect.top) * canvas.height / rect.height - offY) / scale;
    const matches = nearest(positions, video.currentTime)?.players.filter((player) => {
      const [x1, y1, x2, y2] = player.bbox;
      return player.track_id != null && x >= x1 && x <= x2 && y >= y1 && y <= y2;
    }) ?? [];
    if (matches.length !== 1 || matches[0].track_id == null) return;
    onSelectTrack(matches[0].track_id, video.currentTime);
  }

  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showLabels || !video.videoWidth) return;

    // object-contain letterboxing: compute the drawn video rectangle.
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const offX = (canvas.width - video.videoWidth * scale) / 2;
    const offY = (canvas.height - video.videoHeight * scale) / 2;
    const px = (x: number) => offX + x * scale;
    const py = (y: number) => offY + y * scale;
    const t = video.currentTime;
    const small = canvas.width < COMPACT_BELOW_PX;
    if (small !== compactRef.current) { compactRef.current = small; setCompact(small); }
    const fontPx = small ? 9 : Math.max(12, Math.round(canvas.width / 55));
    const padX = small ? 4 : 6;
    const padY = small ? 2 : 4;

    const tagSize = (text: string) => {
      ctx.font = `${small ? 600 : "bold"} ${fontPx}px Inter, sans-serif`;
      return { w: ctx.measureText(text).width + padX * 2, h: fontPx + padY * 2 };
    };
    // `y` is the tag's bottom edge.
    const tag = (text: string, x: number, y: number, bg: string, fg: string) => {
      const { w, h } = tagSize(text);
      const tx = Math.min(Math.max(0, x), canvas.width - w);
      const ty = Math.max(0, y - h);
      ctx.fillStyle = bg;
      ctx.fillRect(tx, ty, w, h);
      ctx.fillStyle = fg;
      ctx.fillText(text, tx + padX, ty + h - padY - 1);
    };

    // Corner brackets: the box's four corners only, so the player stays visible.
    const brackets = (x: number, y: number, w: number, h: number) => {
      const lx = w * 0.22;
      const ly = h * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, y + ly); ctx.lineTo(x, y); ctx.lineTo(x + lx, y);
      ctx.moveTo(x + w - lx, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + ly);
      ctx.moveTo(x + w, y + h - ly); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - lx, y + h);
      ctx.moveTo(x + lx, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - ly);
      ctx.stroke();
    };

    // Court lines, as the analysis mapped them for this moment.
    const court = latest(courtLines, t);
    if (court?.lines.length) {
      ctx.strokeStyle = COURT;
      ctx.lineWidth = small ? 1 : 2;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of court.lines) {
        ctx.moveTo(px(x1), py(y1));
        ctx.lineTo(px(x2), py(y2));
      }
      ctx.stroke();
    }

    // Players. On phones, tags that would overlap move below the player or are left out,
    // so the chosen player is placed first.
    const snapshot = nearest(positions, t);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const overlaps = (r: { x: number; y: number; w: number; h: number }) =>
      placed.some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
    const ordered = [...(snapshot?.players ?? [])].sort((a, b) =>
      Number(isMe(b.track_id, !!b.selected)) - Number(isMe(a.track_id, !!a.selected)));
    for (const player of ordered) {
      const [x1, y1, x2, y2] = player.bbox;
      const you = isMe(player.track_id, !!player.selected);
      const given = givenName(player.track_id);
      const bx = px(x1), by = py(y1), bw = (x2 - x1) * scale, bh = (y2 - y1) * scale;
      ctx.strokeStyle = you ? YOU : OTHER;
      if (small) {
        if (you) {
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = YOU;
          ctx.fillRect(bx, by, bw, bh);
          ctx.globalAlpha = 1;
        }
        ctx.lineWidth = you ? 2 : 1.5;
        brackets(bx, by, bw, bh);
        // Named players get a tag. Unlabelled ones (off court, e.g. a referee) get brackets only.
        if (!you && !given) continue;
        const text = shortLabel(given ?? "You");
        const { w, h } = tagSize(text);
        const x = Math.min(Math.max(0, bx), canvas.width - w);
        const spots = [Math.max(0, by - 2 - h), by + bh + 2].filter((y) => y + h <= canvas.height);
        const spot = spots.map((y) => ({ x, y, w, h })).find((r) => !overlaps(r));
        if (!spot) continue;
        placed.push(spot);
        tag(text, spot.x, spot.y + h, you ? YOU : "rgba(0, 0, 0, 0.6)", "#ffffff");
        continue;
      }
      ctx.lineWidth = you ? 4 : 2;
      ctx.strokeRect(bx, by, bw, bh);
      const name = given ?? (you ? "You" : player.track_id != null ? `Player ${player.track_id}` : "Player");
      tag(name, bx, by, you ? YOU : OTHER, you ? "#ffffff" : TAG_INK);
    }

    // Ball with a short trail of where it was just seen.
    const trail = ballPositions.filter((b) => b.time_seconds <= t + 0.05 && b.time_seconds >= t - TRAIL_S);
    trail.forEach((b, i) => {
      const [x1, y1, x2, y2] = b.bbox;
      const r = Math.max(small ? 2 : 3, ((x2 - x1) * scale) / 2);
      ctx.fillStyle = BALL;
      ctx.globalAlpha = 0.2 + (0.8 * (i + 1)) / trail.length;
      ctx.beginPath();
      ctx.arc(px((x1 + x2) / 2), py((y1 + y2) / 2), i === trail.length - 1 ? r + (small ? 1 : 2) : r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    const ball = nearest(ballPositions, t);
    if (ball) {
      const [x1, y1, x2, y2] = ball.bbox;
      ctx.strokeStyle = BALL;
      ctx.lineWidth = small ? 1.5 : 3;
      ctx.beginPath();
      ctx.arc(px((x1 + x2) / 2), py((y1 + y2) / 2), Math.max(small ? 5 : 8, (x2 - x1) * scale), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bounces: a ring where the ball landed.
    for (const bounce of bounces) {
      if (t < bounce.time_seconds || t > bounce.time_seconds + BOUNCE_S) continue;
      const seen = nearest(ballPositions, bounce.time_seconds, 0.06);
      if (!seen) continue;
      const [x1, , x2, y2] = seen.bbox;
      ctx.strokeStyle = bounce.in_court === false ? "#ff4d6d" : "#ffffff";
      ctx.lineWidth = small ? 1.5 : 2;
      ctx.beginPath();
      ctx.ellipse(px((x1 + x2) / 2), py(y2), small ? 11 : 18, small ? 4.5 : 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Phones: the shot name goes in the bar under the video, so nothing covers the court.
    if (small) {
      let last: ShotEvent | null = null;
      for (const s of shots) {
        if (s.time_seconds > t) break;
        last = s;
      }
      if (last !== captionRef.current) { captionRef.current = last; setCaptionShot(last); }
      return;
    }

    // The estimated shot name, shown for a moment after each hit.
    const shot = [...shots].reverse().find((s) => t >= s.time_seconds && t <= s.time_seconds + SHOT_LABEL_S);
    if (shot) {
      const info = SHOT_INFO[shot.shot_type];
      const hitterBox = nearest(positions, shot.time_seconds)?.players.find((p) => p.track_id === shot.hitter_track_id);
      const mine = isMe(shot.hitter_track_id, shot.by_selected_player);
      const given = givenName(shot.hitter_track_id);
      const who = given ? `${given}: ` : mine ? "You: " : shot.hitter_track_id != null ? `P${shot.hitter_track_id}: ` : "";
      const x = hitterBox ? px(hitterBox.bbox[2]) + 6 : 12;
      const y = hitterBox ? py(hitterBox.bbox[1]) + fontPx * 2 : fontPx * 2 + 12;
      tag(`${who}${info.name}?`, x, y, info.color, "#ffffff");
    }
  }, [positions, ballPositions, courtLines, shots, bounces, showLabels, isMe, givenName]);

  const myName = givenName(selectedTrackId ?? positions.flatMap((s) => s.players).find((p) => p.selected)?.track_id) ?? "You";
  const captionWho = captionShot
    ? givenName(captionShot.hitter_track_id)
      ?? (isMe(captionShot.hitter_track_id, captionShot.by_selected_player) ? "You"
        : captionShot.hitter_track_id != null ? `Player ${captionShot.hitter_track_id}` : "")
    : "";

  useEffect(() => {
    let animId = 0;
    const loop = () => {
      drawOverlay();
      animId = requestAnimationFrame(loop);
    };
    if (src) animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [src, drawOverlay]);

  return (
    <div className="space-y-2">
      <div className={`relative rounded-[14px] border overflow-hidden min-h-[220px] flex items-center justify-center ${src ? "border-line bg-black" : "border-line bg-surface"}`}>
        {src ? (
          <div className="relative w-full flex items-center justify-center">
            <video ref={setVideo} src={src} controls playsInline className="w-full max-h-[480px] object-contain block" onLoadedMetadata={drawOverlay} />
            <canvas ref={canvasRef} onClick={selectPlayer}
              className={`absolute top-0 left-0 w-full h-full ${onSelectTrack ? "cursor-crosshair" : "pointer-events-none"}`} />
          </div>
        ) : (
          <p className="text-base p-8 text-center" style={{ color: WHITE_DIM }}>Video preview unavailable.</p>
        )}
      </div>
      {src && compact && showLabels && shots.length > 0 && (
        <p aria-label="Latest shot" className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-sm" style={{ color: INK }}>
          {captionShot ? <>
            <span className="tabular-nums" style={{ color: WHITE_DIM }}>{formatClock(captionShot.time_seconds)}</span>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: SHOT_INFO[captionShot.shot_type].color }}>
              {SHOT_INFO[captionShot.shot_type].name}?</span>
            <span className="truncate">{captionWho}</span>
          </> : <span style={{ color: WHITE_DIM }}>Shot names show here as the video plays.</span>}
        </p>
      )}
      {src && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ul aria-label="What the colours mean" className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: INK }}>
            {hasSelected && <LegendItem color={YOU} label={myName} />}
            <LegendItem color="#9aa3b2" label="Other players" />
            {ballPositions.length > 0 && <LegendItem color={BALL} label="Ball" round />}
            {courtLines.some((c) => c.lines.length) && <LegendItem color="#e5c800" label="Court lines found" />}
          </ul>
          <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: INK }}>
            <input type="checkbox" className="h-5 w-5" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            Show labels on video
          </label>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, round = false }: { color: string; label: string; round?: boolean }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={round ? "rounded-full" : "rounded-sm"}
        style={{ width: 14, height: 14, background: color, display: "inline-block" }} />
      {label}
    </li>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { BallSnapshot, BounceEvent, CourtLinesSnapshot, PositionSnapshot, ShotEvent } from "../../lib/analysis/contract";
import { SHOT_INFO } from "../../lib/analysis/shotLabels";
import { INK, WHITE_DIM } from "../theme";

const YOU = "#293df2";
const OTHER = "#ffffff";
const BALL = "#ff8a1f";
const COURT = "rgba(255, 236, 64, 0.85)";
const TRAIL_S = 0.6;
const SHOT_LABEL_S = 1.0;
const BOUNCE_S = 0.5;

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
 */
export function VideoOverlayPlayer({
  src,
  positions,
  ballPositions = [],
  courtLines = [],
  shots = [],
  bounces = [],
  selectedTrackId,
  onSelectTrack,
  jump = null,
}: {
  src: string | null;
  positions: PositionSnapshot[];
  ballPositions?: BallSnapshot[];
  courtLines?: CourtLinesSnapshot[];
  shots?: ShotEvent[];
  bounces?: BounceEvent[];
  selectedTrackId?: number | null;
  onSelectTrack?: (trackId: number, timeSeconds: number) => void;
  jump?: JumpRequest;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const hasSelected = positions.some((s) => s.players.some((p) => p.selected)) || selectedTrackId != null;

  useEffect(() => {
    const video = videoRef.current;
    if (!jump || !video) return;
    // Start a moment early so the shot can be seen developing.
    video.currentTime = Math.max(0, jump.time - 1.0);
    void video.play().catch(() => undefined);
    video.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [jump]);

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
    const fontPx = Math.max(12, Math.round(canvas.width / 55));

    const tag = (text: string, x: number, y: number, bg: string, fg: string) => {
      ctx.font = `bold ${fontPx}px Inter, sans-serif`;
      const w = ctx.measureText(text).width + 12;
      const h = fontPx + 8;
      const tx = Math.min(Math.max(0, x), canvas.width - w);
      const ty = Math.max(0, y - h);
      ctx.fillStyle = bg;
      ctx.fillRect(tx, ty, w, h);
      ctx.fillStyle = fg;
      ctx.fillText(text, tx + 6, ty + h - 6);
    };

    // Court lines, as the analysis mapped them for this moment.
    const court = latest(courtLines, t);
    if (court?.lines.length) {
      ctx.strokeStyle = COURT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of court.lines) {
        ctx.moveTo(px(x1), py(y1));
        ctx.lineTo(px(x2), py(y2));
      }
      ctx.stroke();
    }

    // Players.
    const snapshot = nearest(positions, t);
    for (const player of snapshot?.players ?? []) {
      const [x1, y1, x2, y2] = player.bbox;
      const you = player.selected || (selectedTrackId != null && player.track_id === selectedTrackId);
      ctx.strokeStyle = you ? YOU : OTHER;
      ctx.lineWidth = you ? 4 : 2;
      ctx.strokeRect(px(x1), py(y1), (x2 - x1) * scale, (y2 - y1) * scale);
      const name = you ? "You" : onSelectTrack && player.track_id != null ? `Player ${player.track_id}` : "Player";
      tag(name, px(x1), py(y1), you ? YOU : OTHER, you ? "#ffffff" : INK);
    }

    // Ball with a short trail of where it was just seen.
    const trail = ballPositions.filter((b) => b.time_seconds <= t + 0.05 && b.time_seconds >= t - TRAIL_S);
    trail.forEach((b, i) => {
      const [x1, y1, x2, y2] = b.bbox;
      const r = Math.max(3, ((x2 - x1) * scale) / 2);
      ctx.fillStyle = BALL;
      ctx.globalAlpha = 0.2 + (0.8 * (i + 1)) / trail.length;
      ctx.beginPath();
      ctx.arc(px((x1 + x2) / 2), py((y1 + y2) / 2), i === trail.length - 1 ? r + 2 : r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    const ball = nearest(ballPositions, t);
    if (ball) {
      const [x1, y1, x2, y2] = ball.bbox;
      ctx.strokeStyle = BALL;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px((x1 + x2) / 2), py((y1 + y2) / 2), Math.max(8, (x2 - x1) * scale), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bounces: a ring where the ball landed.
    for (const bounce of bounces) {
      if (t < bounce.time_seconds || t > bounce.time_seconds + BOUNCE_S) continue;
      const seen = nearest(ballPositions, bounce.time_seconds, 0.06);
      if (!seen) continue;
      const [x1, , x2, y2] = seen.bbox;
      ctx.strokeStyle = bounce.in_court === false ? "#ff4d6d" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px((x1 + x2) / 2), py(y2), 18, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The estimated shot name, shown for a moment after each hit.
    const shot = [...shots].reverse().find((s) => t >= s.time_seconds && t <= s.time_seconds + SHOT_LABEL_S);
    if (shot) {
      const info = SHOT_INFO[shot.shot_type];
      const hitterBox = nearest(positions, shot.time_seconds)?.players.find((p) => p.track_id === shot.hitter_track_id);
      const who = shot.by_selected_player ? "You: " : "";
      const x = hitterBox ? px(hitterBox.bbox[2]) + 6 : 12;
      const y = hitterBox ? py(hitterBox.bbox[1]) + fontPx * 2 : fontPx * 2 + 12;
      tag(`${who}${info.name}?`, x, y, info.color, "#ffffff");
    }
  }, [positions, ballPositions, courtLines, shots, bounces, selectedTrackId, showLabels, onSelectTrack]);

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
      <div className={`relative rounded-2xl border overflow-hidden min-h-[220px] flex items-center justify-center ${src ? "border-[#d6d5ce] bg-black" : "border-[#d6d5ce] bg-white"}`}>
        {src ? (
          <div className="relative w-full flex items-center justify-center">
            <video ref={videoRef} src={src} controls playsInline className="w-full max-h-[480px] object-contain block" onLoadedMetadata={drawOverlay} />
            <canvas ref={canvasRef} onClick={selectPlayer}
              className={`absolute top-0 left-0 w-full h-full ${onSelectTrack ? "cursor-crosshair" : "pointer-events-none"}`} />
          </div>
        ) : (
          <p className="text-base p-8 text-center" style={{ color: WHITE_DIM }}>Video preview unavailable.</p>
        )}
      </div>
      {src && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ul aria-label="What the colours mean" className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: INK }}>
            {hasSelected && <LegendItem color={YOU} label="You" />}
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

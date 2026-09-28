import { useCallback, useEffect, useRef } from "react";
import type { BallSnapshot, PositionSnapshot } from "../../lib/analysis/contract";
import { WHITE_DIM } from "../theme";

function nearest<T extends { time_seconds: number }>(items: T[], time: number): T | null {
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
  return Math.abs(found.time_seconds - time) <= 0.25 ? found : null;
}

/**
 * Video player with detection boxes drawn over it, synced to playback time.
 * Adapted from the original CVReplayWidget overlay.
 */
export function VideoOverlayPlayer({
  src,
  positions,
  ballPositions = [],
  selectedTrackId,
}: {
  src: string | null;
  positions: PositionSnapshot[];
  ballPositions?: BallSnapshot[];
  selectedTrackId?: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas dimensions to rendered video display size
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if ((!positions.length && !ballPositions.length) || !video.videoWidth) return;

    // object-contain letterboxing: compute the drawn video rectangle.
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const offX = (canvas.width - video.videoWidth * scale) / 2;
    const offY = (canvas.height - video.videoHeight * scale) / 2;

    const t = video.currentTime;
    const snapshot = nearest(positions, t);

    ctx.font = "bold 12px Inter, sans-serif";
    for (const player of snapshot?.players ?? []) {
      const [x1, y1, x2, y2] = player.bbox;
      const selected = selectedTrackId != null && player.track_id === selectedTrackId;
      const color = selected ? "#b8f523" : "#38bdf8";
      const bx = offX + x1 * scale;
      const by = offY + y1 * scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeRect(bx, by, (x2 - x1) * scale, (y2 - y1) * scale);
      const label = player.track_id != null ? `Track #${player.track_id}` : "Detection";
      ctx.fillStyle = color;
      ctx.fillRect(bx, Math.max(0, by - 20), ctx.measureText(label).width + 10, 20);
      ctx.fillStyle = "#071a3e";
      ctx.fillText(label, bx + 5, Math.max(14, by - 6));
    }
    const ball = nearest(ballPositions, t);
    if (ball) {
      const [x1, y1, x2, y2] = ball.bbox;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.strokeRect(offX + x1 * scale, offY + y1 * scale,
        Math.max(4, (x2 - x1) * scale), Math.max(4, (y2 - y1) * scale));
    }
  }, [positions, ballPositions, selectedTrackId]);

  // Request Animation Frame loop for smooth box animation while video plays
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
    <div className="relative rounded-2xl border border-white/10 bg-black overflow-hidden min-h-[220px] flex items-center justify-center">
      {src ? (
        <div className="relative w-full flex items-center justify-center">
          <video ref={videoRef} src={src} controls className="w-full max-h-[420px] object-contain block" onLoadedMetadata={drawOverlay} />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
        </div>
      ) : (
        <p className="text-sm p-8 text-center" style={{ color: WHITE_DIM }}>Video preview unavailable.</p>
      )}
    </div>
  );
}

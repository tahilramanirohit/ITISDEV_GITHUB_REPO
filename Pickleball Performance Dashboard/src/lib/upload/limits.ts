import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBytes } from "./validate";

/** Mirrors public.video_upload_limits(); used when the database cannot be asked. */
export type UploadLimits = {
  max_file_bytes: number;
  min_duration_s: number;
  max_duration_s: number;
  max_total_bytes: number;
  max_uploads_per_day: number;
};
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  max_file_bytes: 50_000_000, min_duration_s: 10, max_duration_s: 300, max_total_bytes: 1_000_000_000, max_uploads_per_day: 5,
};
export type UploadUsage = { storedBytes: number; uploadsToday: number };

export async function getUploadLimits(sb: SupabaseClient): Promise<UploadLimits> {
  try {
    const { data, error } = await sb.rpc("video_upload_limits");
    if (error || !data || typeof data !== "object") return DEFAULT_UPLOAD_LIMITS;
    return { ...DEFAULT_UPLOAD_LIMITS, ...(data as Partial<UploadLimits>) };
  } catch {
    return DEFAULT_UPLOAD_LIMITS;
  }
}

export async function getUploadUsage(sb: SupabaseClient, now = Date.now()): Promise<UploadUsage> {
  const { data, error } = await sb.from("video_assets").select("byte_size,created_at,raw_video_deleted_at");
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as { byte_size: number; created_at: string; raw_video_deleted_at: string | null }[];
  const kept = rows.filter((r) => !r.raw_video_deleted_at);
  return {
    storedBytes: kept.reduce((sum, r) => sum + (r.byte_size ?? 0), 0),
    uploadsToday: kept.filter((r) => now - new Date(r.created_at).getTime() < 86_400_000).length,
  };
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}

/** Why this file cannot be uploaded under the limits, or null when it can. */
export function uploadBlocker(file: { size: number }, durationS: number | null, limits: UploadLimits, usage: UploadUsage | null): string | null {
  if (file.size > limits.max_file_bytes) return `This video is ${formatBytes(file.size)}. The limit is ${formatBytes(limits.max_file_bytes)} per video.`;
  if (durationS != null && durationS < limits.min_duration_s) return `This clip is ${formatDuration(durationS)}. Use at least ${formatDuration(limits.min_duration_s)} so a rally is visible.`;
  if (durationS != null && durationS > limits.max_duration_s) return `This clip is ${formatDuration(durationS)}. Trim it to ${formatDuration(limits.max_duration_s)} or less before uploading.`;
  if (usage && usage.uploadsToday >= limits.max_uploads_per_day) return `You have used today's ${limits.max_uploads_per_day} uploads. Try again tomorrow.`;
  if (usage && usage.storedBytes + file.size > limits.max_total_bytes) {
    return `This would go over your ${formatBytes(limits.max_total_bytes)} video storage (${formatBytes(usage.storedBytes)} used). Remove an old video, or wait for raw videos to expire after 30 days.`;
  }
  return null;
}

/** Explains a limit the database refused. */
export function limitErrorText(message: string): string | null {
  if (message.includes("video_too_large")) return "This video is over the size limit.";
  if (message.includes("video_duration_out_of_range")) return "This clip is too short or too long for analysis.";
  if (message.includes("video_storage_quota_exceeded")) return "Your video storage is full. Remove an old video first.";
  if (message.includes("video_daily_limit_reached")) return "You have reached today's upload limit. Try again tomorrow.";
  return null;
}

/** Reads a local video's length from its metadata; null when the browser cannot tell. */
export function probeVideoDuration(file: Blob, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return resolve(null);
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => { window.clearTimeout(timer); URL.revokeObjectURL(url); video.removeAttribute("src"); resolve(value); };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

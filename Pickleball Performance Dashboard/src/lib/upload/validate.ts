export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"] as const;
const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-msvideo": "avi",
};

export type FileCheck = { ok: true; mimeType: string; extension: string } | { ok: false; error: string };

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function validateVideoFile(file: { name: string; size: number; type: string }, maxBytes: number): FileCheck {
  // Some browsers report an empty type for .mov/.avi; fall back to the extension.
  let type = file.type;
  if (!type) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    type = Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? "";
  }
  if (!(ALLOWED_VIDEO_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "Unsupported file type. Upload MP4, MOV, WEBM or AVI video." };
  }
  if (file.size <= 0) return { ok: false, error: "The file is empty." };
  if (file.size > maxBytes) {
    return { ok: false, error: `File is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.` };
  }
  return { ok: true, mimeType: type, extension: EXTENSIONS[type] };
}

/** Must match the video_assets_path_convention check constraint. */
export function buildStoragePath(ownerId: string, sessionId: string, videoId: string, extension: string): string {
  return `${ownerId}/${sessionId}/${videoId}.${extension}`;
}

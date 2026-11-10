import type { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_BUCKET, finalizeUpload } from "./sessions";
import type { AnalysisJobRow } from "./types";

/**
 * One video per buddy game (update 15). In a game logged from a buddy session, the player
 * who asked to play uploads the video; the other player adds a copy of it to their own
 * session and gets their own analysis, without uploading.
 */
export type BuddyGameVideo =
  | { role: null }
  | { role: "asker"; other_name: string; my_video_allowed: boolean | null }
  | { role: "asked"; other_name: string; allowed: boolean;
      video: { id: string; original_filename: string; byte_size: number; duration_s: number | null } | null };

/** Null for games not played as a buddy session, and before update 15. */
export async function getBuddyGameVideo(sb: SupabaseClient, sessionId: string): Promise<BuddyGameVideo | null> {
  const { data, error } = await sb.rpc("buddy_session_video", { p_session_id: sessionId });
  if (error || !data || typeof data !== "object") return null;
  return data as BuddyGameVideo;
}

/** Adds the other player's video: registers the copy, copies the file in Storage, then starts the analysis. */
export async function addBuddyGameVideo(sb: SupabaseClient, sessionId: string, params: Record<string, unknown>): Promise<AnalysisJobRow> {
  const { data, error } = await sb.rpc("add_buddy_session_video", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  const { video, source_path } = data as { video: { id: string; storage_path: string }; source_path: string };
  const copy = await sb.storage.from(VIDEO_BUCKET).copy(source_path, video.storage_path);
  if (copy.error) {
    // Undo the registration so the player can try again.
    await sb.from("video_assets").delete().eq("id", video.id);
    throw new Error(`copy_failed: ${copy.error.message}`);
  }
  return finalizeUpload(sb, video.id, params);
}

/** The uploader's switch: let the other player add this video. */
export async function setBuddyCanUse(sb: SupabaseClient, videoId: string, allowed: boolean): Promise<void> {
  const { error } = await sb.rpc("set_buddy_can_use", { p_video_id: videoId, p_allowed: allowed });
  if (error) throw new Error(error.message);
}

export function buddyVideoErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/add_buddy_session_video|set_buddy_can_use|schema cache|PGRST20[02]/i.test(message)) {
    return "Adding a buddy's video needs a database update. Run supabase/scripts/pickleproapp_upgrade_15.sql in the Supabase SQL Editor.";
  }
  if (message.includes("turned off sharing")) return "The other player turned off sharing this video.";
  if (message.includes("no video of this game")) return "There is no video of this game to add yet.";
  if (message.includes("already has a video")) return "This session already has a video.";
  if (message.includes("video_storage_quota_exceeded")) return "Your video storage is full. Remove an old video first.";
  if (message.includes("video_daily_limit_reached")) return "You have reached today's video limit. Try again tomorrow.";
  if (message.startsWith("copy_failed")) return "The video could not be copied. Try again in a moment.";
  return message.replace(/^buddy: /, "").replace(/^./, (c) => c.toUpperCase());
}

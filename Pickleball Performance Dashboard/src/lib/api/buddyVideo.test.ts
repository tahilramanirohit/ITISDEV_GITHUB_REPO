import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addBuddyGameVideo, buddyVideoErrorText, getBuddyGameVideo } from "./buddyVideo";

function fakeSb(copyError: { message: string } | null = null) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "add_buddy_session_video") return { data: { video: { id: "v2", storage_path: "bo/s2/v2.mp4" }, source_path: "ana/s1/v1.mp4" }, error: null };
    if (fn === "finalize_video_upload") return { data: { id: "j2", status: "queued" }, error: null };
    if (fn === "buddy_session_video") return { data: { role: "asked", other_name: "Ana", allowed: true, video: null }, error: null };
    return { data: null, error: { message: `unexpected ${fn}` } };
  });
  const copy = vi.fn(async () => ({ data: copyError ? null : { path: "bo/s2/v2.mp4" }, error: copyError }));
  const eq = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ delete: () => ({ eq }) }));
  return { sb: { rpc, from, storage: { from: () => ({ copy }) } } as unknown as SupabaseClient, rpc, copy, eq };
}

describe("buddy game video", () => {
  it("copies the asker's file into the player's folder, then starts the analysis", async () => {
    const { sb, rpc, copy } = fakeSb();
    const job = await addBuddyGameVideo(sb, "s2", { players_on_court: 4 });
    expect(copy).toHaveBeenCalledWith("ana/s1/v1.mp4", "bo/s2/v2.mp4");
    expect(rpc).toHaveBeenCalledWith("finalize_video_upload", { p_video_id: "v2", p_params: { players_on_court: 4 } });
    expect(job).toEqual({ id: "j2", status: "queued" });
  });

  it("removes the registration when the copy fails, so the player can try again", async () => {
    const { sb, rpc, eq } = fakeSb({ message: "network" });
    const err = await addBuddyGameVideo(sb, "s2", {}).catch((e) => e);
    expect(eq).toHaveBeenCalledWith("id", "v2");
    expect(rpc).not.toHaveBeenCalledWith("finalize_video_upload", expect.anything());
    expect(buddyVideoErrorText(err)).toBe("The video could not be copied. Try again in a moment.");
  });

  it("reads who uploads, and is null before the database update", async () => {
    expect(await getBuddyGameVideo(fakeSb().sb, "s2")).toEqual({ role: "asked", other_name: "Ana", allowed: true, video: null });
    const missing = { rpc: async () => ({ data: null, error: { message: "Could not find the function public.buddy_session_video" } }) } as unknown as SupabaseClient;
    expect(await getBuddyGameVideo(missing, "s2")).toBeNull();
    expect(buddyVideoErrorText(new Error("buddy: the other player turned off sharing this video"))).toBe("The other player turned off sharing this video.");
  });
});

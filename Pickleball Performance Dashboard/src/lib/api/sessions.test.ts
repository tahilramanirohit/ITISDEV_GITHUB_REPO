import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeVideo, signedVideoUrl } from "./sessions";
import type { VideoAssetRow } from "./types";

describe("private video URLs", () => {
  it("expires a signed URL after at most five minutes", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "signed" }, error: null });
    const sb = { storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) } } as unknown as SupabaseClient;
    expect(await signedVideoUrl(sb, "owner/session/video.mp4")).toBe("signed");
    expect(createSignedUrl).toHaveBeenCalledWith("owner/session/video.mp4", 300);
  });
});

describe("removing a video", () => {
  const video = { id: "video-1", storage_path: "owner/session/video-1.mp4" } as VideoAssetRow;

  function client(removeError: { message: string } | null) {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: removeError });
    const sb = {
      storage: { from: vi.fn().mockReturnValue({ remove }) },
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq }) }),
    } as unknown as SupabaseClient;
    return { sb, eq, remove };
  }

  it("deletes the file, then the row", async () => {
    const { sb, eq, remove } = client(null);
    await removeVideo(sb, video);
    expect(remove).toHaveBeenCalledWith(["owner/session/video-1.mp4"]);
    expect(eq).toHaveBeenCalledWith("id", "video-1");
  });

  it("keeps the row when the file cannot be deleted", async () => {
    const { sb, eq } = client({ message: "network down" });
    await expect(removeVideo(sb, video)).rejects.toThrow(/network down/);
    expect(eq).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedVideoUrl } from "./sessions";

describe("private video URLs", () => {
  it("expires a signed URL after at most five minutes", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "signed" }, error: null });
    const sb = { storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) } } as unknown as SupabaseClient;
    expect(await signedVideoUrl(sb, "owner/session/video.mp4")).toBe("signed");
    expect(createSignedUrl).toHaveBeenCalledWith("owner/session/video.mp4", 300);
  });
});

import { describe, expect, it } from "vitest";
import type { SessionListItem } from "../../lib/api/sessions";
import { homeFeaturedGame } from "./LastGame";

const game = (id: string, video?: Partial<NonNullable<SessionListItem["video"]>>): SessionListItem => ({
  session: { id } as SessionListItem["session"],
  video: video ? ({ upload_status: "uploaded", raw_video_deleted_at: null, raw_video_deleting_at: null, ...video } as SessionListItem["video"]) : null,
  job: null,
  result: null,
});

describe("homeFeaturedGame", () => {
  it("features the newest game that has a playable video", () => {
    expect(homeFeaturedGame([game("new"), game("withVideo", {}), game("older", {})])?.session.id).toBe("withVideo");
  });

  it("skips videos that are not uploaded or were deleted", () => {
    const items = [game("uploading", { upload_status: "uploading" } as never), game("deleted", { raw_video_deleted_at: "2026-11-01" }), game("plain")];
    expect(homeFeaturedGame(items)?.session.id).toBe("uploading");
  });

  it("uses the newest game when none has a video", () => {
    expect(homeFeaturedGame([game("a"), game("b")])?.session.id).toBe("a");
    expect(homeFeaturedGame([])).toBeUndefined();
  });
});

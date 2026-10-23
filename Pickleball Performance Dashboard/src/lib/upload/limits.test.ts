import { describe, expect, it } from "vitest";
import { DEFAULT_UPLOAD_LIMITS, formatDuration, limitErrorText, uploadBlocker } from "./limits";

const lim = DEFAULT_UPLOAD_LIMITS;
describe("upload limits", () => {
  it("accepts a normal clip", () => {
    expect(uploadBlocker({ size: 20_000_000 }, 90, lim, { storedBytes: 0, uploadsToday: 0 })).toBeNull();
    expect(uploadBlocker({ size: 20_000_000 }, null, lim, null)).toBeNull();
  });
  it("explains each limit", () => {
    expect(uploadBlocker({ size: 60_000_000 }, 90, lim, null)).toContain("50 MB per video");
    expect(uploadBlocker({ size: 1 }, 5, lim, null)).toContain("at least 10 s");
    expect(uploadBlocker({ size: 1 }, 400, lim, null)).toContain("5 min or less");
    expect(uploadBlocker({ size: 1 }, 60, lim, { storedBytes: 0, uploadsToday: 5 })).toContain("today's 5 uploads");
    expect(uploadBlocker({ size: 20_000_000 }, 60, lim, { storedBytes: 990_000_000, uploadsToday: 0 })).toContain("1.0 GB video storage");
  });
  it("asks for landscape video at 720p or higher", () => {
    expect(uploadBlocker({ size: 1 }, 60, lim, null, { width: 1080, height: 1920 })).toContain("landscape");
    expect(uploadBlocker({ size: 1 }, 60, lim, null, { width: 854, height: 480 })).toContain("480p");
    expect(uploadBlocker({ size: 1 }, 60, lim, null, { width: 1280, height: 720 })).toBeNull();
    expect(uploadBlocker({ size: 1 }, 60, lim, null, { width: null, height: null })).toBeNull();
  });

  it("formats durations and database errors", () => {
    expect(formatDuration(75)).toBe("1 min 15 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(limitErrorText("ERROR: video_daily_limit_reached")).toContain("today's upload limit");
    expect(limitErrorText("other")).toBeNull();
  });
});

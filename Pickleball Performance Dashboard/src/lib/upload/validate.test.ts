import { describe, expect, it } from "vitest";
import { buildStoragePath, validateVideoFile } from "./validate";

const MB = 1024 * 1024;

describe("validateVideoFile", () => {
  it("accepts supported videos within the limit", () => {
    expect(validateVideoFile({ name: "a.mp4", size: 10 * MB, type: "video/mp4" }, 50 * MB))
      .toEqual({ ok: true, mimeType: "video/mp4", extension: "mp4" });
  });
  it("falls back to the extension when the browser gives no type", () => {
    expect(validateVideoFile({ name: "clip.MOV", size: MB, type: "" }, 50 * MB)).toMatchObject({ ok: true, mimeType: "video/quicktime" });
  });
  it("rejects oversize, empty and non-video files", () => {
    expect(validateVideoFile({ name: "a.mp4", size: 51 * MB, type: "video/mp4" }, 50 * MB)).toMatchObject({ ok: false });
    expect(validateVideoFile({ name: "a.mp4", size: 0, type: "video/mp4" }, 50 * MB)).toMatchObject({ ok: false });
    expect(validateVideoFile({ name: "a.png", size: 10, type: "image/png" }, 50 * MB)).toMatchObject({ ok: false });
  });
});

it("builds the storage path required by the database constraint", () => {
  expect(buildStoragePath("u", "s", "v", "mp4")).toBe("u/s/v.mp4");
});

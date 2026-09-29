import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_UPLOAD_MB, FREE_MAX_UPLOAD_MB, getConfig } from "./config";

describe("getConfig", () => {
  it("disables sample-data preview and local prototype in production builds by default", () => {
    const cfg = getConfig({ DEV: false, PROD: true });
    expect(cfg.designPreviewEnabled).toBe(false);
    expect(cfg.localPrototypeEnabled).toBe(false);
    expect(cfg.supabase).toBeNull();
  });

  it("enables dev tools in development or when explicitly requested", () => {
    expect(getConfig({ DEV: true }).designPreviewEnabled).toBe(true);
    expect(getConfig({ DEV: false, VITE_ENABLE_DESIGN_PREVIEW: "true" }).designPreviewEnabled).toBe(true);
    expect(getConfig({ DEV: false, VITE_ENABLE_LOCAL_PROTOTYPE: "true" }).localPrototypeEnabled).toBe(true);
  });

  it("offers dev mode only in development builds", () => {
    expect(getConfig({ DEV: true }).devModeEnabled).toBe(true);
    expect(getConfig({ DEV: false, PROD: true, VITE_ENABLE_DESIGN_PREVIEW: "true" }).devModeEnabled).toBe(false);
  });

  it("requires both Supabase URL and anon key", () => {
    expect(getConfig({ VITE_SUPABASE_URL: "https://x.supabase.co" }).supabase).toBeNull();
    expect(getConfig({ VITE_SUPABASE_URL: "https://x.supabase.co/", VITE_SUPABASE_ANON_KEY: "anon" }).supabase)
      .toEqual({ url: "https://x.supabase.co", anonKey: "anon" });
  });

  it("enforces the Free plan's 50 decimal MB limit even with an oversized setting", () => {
    expect(getConfig({}).maxUploadBytes).toBe(DEFAULT_MAX_UPLOAD_MB * 1_000_000);
    expect(getConfig({ VITE_MAX_UPLOAD_MB: "9999" }).maxUploadBytes).toBe(FREE_MAX_UPLOAD_MB * 1_000_000);
    expect(getConfig({ VITE_MAX_UPLOAD_MB: "nope" }).maxUploadBytes).toBe(DEFAULT_MAX_UPLOAD_MB * 1_000_000);
  });

  it("keeps public trial mode off unless explicitly enabled", () => {
    expect(getConfig({}).trialNoWorker).toBe(false);
    expect(getConfig({ VITE_TRIAL_NO_WORKER: "true" }).trialNoWorker).toBe(true);
  });
});

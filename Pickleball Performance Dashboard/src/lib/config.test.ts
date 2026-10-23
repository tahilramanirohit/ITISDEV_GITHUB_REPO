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

  it("offers real guest mode only when explicitly enabled", () => {
    expect(getConfig({ DEV: false }).guestModeEnabled).toBe(false);
    expect(getConfig({ DEV: false, VITE_ENABLE_GUEST_MODE: "true" }).guestModeEnabled).toBe(true);
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

describe("Supabase settings", () => {
  const jwt = (role: string) => `x.${btoa(JSON.stringify({ iss: "supabase", role })).replace(/=+$/, "")}.sig`;
  const url = "https://abcdefghijkl.supabase.co";

  it("is configured with a URL and the public anon key", () => {
    const cfg = getConfig({ VITE_SUPABASE_URL: `${url}/`, VITE_SUPABASE_ANON_KEY: jwt("anon") });
    expect(cfg.supabase).toEqual({ url, anonKey: jwt("anon") });
    expect(cfg.supabaseProblems).toEqual([]);
  });

  it("names each missing value", () => {
    expect(getConfig({}).supabaseProblems).toEqual([
      "VITE_SUPABASE_URL is missing or empty.", "VITE_SUPABASE_ANON_KEY is missing or empty.",
    ]);
  });

  it("refuses the secret service-role key in the browser", () => {
    for (const key of [jwt("service_role"), "sb_secret_abc123"]) {
      const cfg = getConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key });
      expect(cfg.supabase).toBeNull();
      expect(cfg.supabaseProblems[0]).toMatch(/service-role/);
    }
  });

  it("rejects a URL that is not a web address and tolerates quotes", () => {
    expect(getConfig({ VITE_SUPABASE_URL: "abcdefghijkl", VITE_SUPABASE_ANON_KEY: jwt("anon") }).supabase).toBeNull();
    expect(getConfig({ VITE_SUPABASE_URL: `"${url}"`, VITE_SUPABASE_ANON_KEY: `'${jwt("anon")}'` }).supabase?.url).toBe(url);
  });
});

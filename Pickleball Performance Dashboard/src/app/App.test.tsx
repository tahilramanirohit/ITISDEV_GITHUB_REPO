import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import App from "./App";
import { getConfig } from "../lib/config";

// Values that only exist in the sample-data design preview.
const SAMPLE_MARKERS = ["ALEX GARCIA", "76.4%", "18W", "Pearson", "+12 wks", "DOMINANT STYLE", "coach@picklepro.app"];

const prodConfig = getConfig({ DEV: false });
const devConfig = getConfig({ DEV: true });

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function expectNoSampleData() {
  const text = document.body.textContent ?? "";
  for (const marker of SAMPLE_MARKERS) expect(text).not.toContain(marker);
}

describe("application entry point", () => {
  it("without Supabase, production shows setup instructions and no fabricated numbers", async () => {
    render(<App cfg={prodConfig} sb={null} />);
    expect(await screen.findByText("Supabase is not configured")).toBeTruthy();
    expect(screen.queryByText(/Design preview/)).toBeNull();
    expectNoSampleData();
  });

  it("the old demo login no longer exists", async () => {
    render(<App cfg={prodConfig} sb={null} />);
    await screen.findByText("Supabase is not configured");
    expect(document.body.textContent).not.toContain("demo123");
    expect(screen.queryByText(/Demo account/i)).toBeNull();
  });

  it("the shot labelling page works without Supabase or an account", async () => {
    window.location.hash = "#/label";
    render(<App cfg={prodConfig} sb={null} />);
    expect(await screen.findByText("Label shots", { selector: "h2, h3, [class*='font']" })).toBeTruthy();
    expect(screen.getByLabelText(/1\. Video/)).toBeTruthy();
    expect(screen.queryByText("Supabase is not configured")).toBeNull();
  });

  it("production builds refuse the design-preview route", async () => {
    window.location.hash = "#/design-preview";
    render(<App cfg={prodConfig} sb={null} />);
    expect(await screen.findByText(/not available in this build/)).toBeTruthy();
    expectNoSampleData();
  });

  it("the design preview, when enabled, is visibly labelled as sample data", async () => {
    window.location.hash = "#/design-preview";
    render(<App cfg={devConfig} sb={null} />);
    expect(await screen.findByText(/DESIGN PREVIEW — sample data/, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getAllByText("SAMPLE DATA").length).toBeGreaterThanOrEqual(4);
  });
});

// Minimal stand-in for the Supabase client: signed out until signInAnonymously().
function fakeSupabase({ rpcError = null as { message: string } | null } = {}) {
  let listener: ((event: string, session: unknown) => void) | null = null;
  const empty = { data: [], error: null };
  const query: any = new Proxy({}, {
    get: (_t, prop) => prop === "then" ? (resolve: (v: unknown) => void) => resolve(empty) : () => query,
  });
  const sb = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn((cb: typeof listener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      }),
      signInAnonymously: vi.fn(async () => {
        listener?.("SIGNED_IN", { user: { id: "guest", is_anonymous: true } });
        return { error: null };
      }),
      signOut: vi.fn(async () => { listener?.("SIGNED_OUT", null); return { error: null }; }),
    },
    rpc: vi.fn(async () => ({ data: 4, error: rpcError })),
    from: vi.fn(() => query),
  };
  return sb;
}

describe("dev mode entry", () => {
  it("lets a public trial visitor enter a private guest session without seeding mock data", async () => {
    const sb = fakeSupabase();
    const cfg = getConfig({ DEV: false, VITE_ENABLE_GUEST_MODE: "true" });
    render(<App cfg={cfg} sb={sb as unknown as SupabaseClient} />);
    fireEvent.click(await screen.findByRole("button", { name: /Try with my own video/ }));
    expect(await screen.findByText("Private guest")).toBeTruthy();
    expect(sb.auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Leave guest session" })).toBeTruthy();
  });

  it("is hidden in production builds by default", async () => {
    render(<App cfg={{ ...prodConfig, supabase: { url: "x", anonKey: "y" } }} sb={fakeSupabase() as unknown as SupabaseClient} />);
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: /Try PicklePro with sample sessions/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Explore sample dashboard" })).toBeNull();
  });

  it("links to the labelled sample dashboard in a trial build", async () => {
    const cfg = getConfig({ DEV: false, VITE_ENABLE_DESIGN_PREVIEW: "true", VITE_TRIAL_NO_WORKER: "true" });
    render(<App cfg={cfg} sb={fakeSupabase() as unknown as SupabaseClient} />);
    expect((await screen.findByRole("link", { name: "Explore sample dashboard" })).getAttribute("href"))
      .toBe("#/design-preview");
    expect(screen.getByText(/Video analysis is not running on this public trial/)).toBeTruthy();
  });

  it("offers guest testing on an explicitly enabled production preview", async () => {
    const sb = fakeSupabase();
    const previewConfig = getConfig({ DEV: false, PROD: true, VITE_ENABLE_DEV_MODE: "true" });
    render(<App cfg={previewConfig} sb={sb as unknown as SupabaseClient} />);
    fireEvent.click(await screen.findByRole("button", { name: /Try PicklePro with sample sessions/ }));
    expect(await screen.findByText("Dev mode (mock data)")).toBeTruthy();
    expect(sb.auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("signs in as a guest, seeds mock sessions, and enters the app", async () => {
    const sb = fakeSupabase();
    render(<App cfg={devConfig} sb={sb as unknown as SupabaseClient} />);
    fireEvent.click(await screen.findByRole("button", { name: /Try PicklePro with sample sessions/ }));
    expect(await screen.findByText("Dev mode (mock data)")).toBeTruthy();
    expect(sb.auth.signInAnonymously).toHaveBeenCalledOnce();
    const [fn, args] = sb.rpc.mock.calls[0] as unknown as [string, { p_sessions: unknown[] }];
    expect(fn).toBe("seed_dev_mock_data");
    expect(args.p_sessions.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Exit dev mode" })).toBeTruthy();
  });

  it("explains how to fix a missing database function and stays signed out", async () => {
    const sb = fakeSupabase({ rpcError: { message: "Could not find the function public.seed_dev_mock_data" } });
    render(<App cfg={devConfig} sb={sb as unknown as SupabaseClient} />);
    fireEvent.click(await screen.findByRole("button", { name: /Try PicklePro with sample sessions/ }));
    expect(await screen.findByText(/Apply the database migrations/)).toBeTruthy();
    await waitFor(() => expect(sb.auth.signOut).toHaveBeenCalled());
  });
});

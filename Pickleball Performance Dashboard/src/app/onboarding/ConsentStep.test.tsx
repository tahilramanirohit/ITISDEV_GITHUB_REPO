import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ConsentStep } from "./ConsentStep";
import { AnalyticsGate, OnboardingGate } from "./OnboardingGate";
import type { PlayerProfile } from "../../lib/api/profile";
afterEach(cleanup);
it("defaults optional choices off and upserts the same profile identity", async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const onDone = vi.fn();
  const sb = { from: () => ({ upsert }) } as unknown as SupabaseClient;
  render(<ConsentStep sb={sb} userId="u1" profile={{ display_name: "Sam" } as PlayerProfile} onDone={onDone} />);
  expect((screen.getByRole("switch", { name: "Keep my profile and games" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("switch", { name: "Performance analytics · optional" }).getAttribute("aria-checked")).toBe("false");
  fireEvent.click(screen.getByRole("switch", { name: "Help our research · optional" }));
  fireEvent.click(screen.getByRole("button", { name: "Agree and continue" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", display_name: "Sam", analytics_opt_in: false, research_opt_in: true, data_consent_version: "2026-11-08-v1", data_consent_at: expect.any(String) }), { onConflict: "id" });
});
it("stays on consent after save failure", async () => {
  const onDone = vi.fn();
  render(<ConsentStep sb={{ from: () => ({ upsert: async () => ({ error: new Error("missing migration") }) }) } as unknown as SupabaseClient} userId="u1" profile={null} onDone={onDone} />);
  fireEvent.click(screen.getByRole("button", { name: "Agree and continue" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
});
it("requires consent before onboarding even for an existing player", async () => {
  const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "u1", display_name: "Sam", onboarding_completed_at: "2026-10-01" }, error: null }) }) }) }) } as unknown as SupabaseClient;
  render(<MemoryRouter><OnboardingGate sb={sb} userId="u1" skip={false}><div>Private dashboard</div></OnboardingGate></MemoryRouter>);
  expect(await screen.findByText("Before we start, your data.")).toBeTruthy();
  expect(screen.queryByText("Private dashboard")).toBeNull();
});
it("does not mount optional analytics when off or unavailable", async () => {
  const mounted = vi.fn();
  function Reads() { mounted(); return <div>Trends</div>; }
  const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { analytics_opt_in: false }, error: null }) }) }) }) } as unknown as SupabaseClient;
  render(<AnalyticsGate sb={sb} userId="u1"><Reads /></AnalyticsGate>);
  expect(await screen.findByText(/Performance analytics is off/)).toBeTruthy();
  expect(mounted).not.toHaveBeenCalled();
});

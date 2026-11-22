import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OnboardingGate, profileErrorDetail } from "./OnboardingGate";

afterEach(cleanup);

function failingSb(error: Record<string, unknown>) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error }) };
  return { from: () => q, rpc: async () => ({ data: null, error: null }), storage: { from: () => ({}) },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
}

describe("OnboardingGate", () => {
  it("keeps the app closed when the profile cannot be read, and shows why", async () => {
    render(<MemoryRouter><OnboardingGate sb={failingSb({ code: "PGRST106", message: "The schema must be one of the following: graphql_public" })} userId="u1" skip={false}>
      <p>The app</p></OnboardingGate></MemoryRouter>);
    expect(await screen.findByText("We couldn't load your data choices. Please try again.")).toBeTruthy();
    expect(screen.getByText(/Details: PGRST106: The schema must be one of the following/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();
  });

  it("words errors without a code or message", () => {
    expect(profileErrorDetail(new TypeError("Failed to fetch"))).toBe("Failed to fetch");
    expect(profileErrorDetail({ code: "42501", message: "permission denied for table profiles" })).toBe("42501: permission denied for table profiles");
    expect(profileErrorDetail(null)).toBe("");
  });
});

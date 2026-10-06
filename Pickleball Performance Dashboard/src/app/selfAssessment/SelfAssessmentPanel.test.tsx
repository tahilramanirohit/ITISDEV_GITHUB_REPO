import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "../../lib/api/types";
import { SelfAssessmentPanel } from "./SelfAssessmentPanel";

afterEach(cleanup);

const session = {
  id: "s1", owner_id: "u1", title: "Tuesday match", session_date: "2026-10-06", session_context: "casual_match",
  play_format: "doubles", performance_scope: "individual", review_mode: "self", notes: null,
  improvement_goals: ["shot_technique"], positioning_rating: null, shot_outcomes_rating: null, shot_technique_rating: null,
  actual_start_at: null, actual_end_at: null, created_at: "2026-10-06T10:00:00Z", updated_at: "2026-10-06T10:00:00Z",
} as SessionRow;

/** Chainable stand-in for the few Supabase queries the panel makes. */
function fakeSupabase() {
  const upserts: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    let pending: Record<string, unknown> | null = null;
    const q: any = {
      select: () => q, eq: () => q, order: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: (row: Record<string, unknown>) => { pending = row; upserts.push(row); return q; },
      single: async () => ({ data: { ...pending, updated_at: "now" }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: table === "sessions" ? [session] : [], error: null }),
    };
    return q;
  });
  return { sb: { from } as unknown as SupabaseClient, upserts };
}

describe("SelfAssessmentPanel", () => {
  it("rates skills without a video and shows a practice plan", async () => {
    const { sb, upserts } = fakeSupabase();
    window.scrollTo = vi.fn();
    render(<SelfAssessmentPanel sb={sb} session={session} />);
    fireEvent.click(await screen.findByRole("radio", { name: /^Serve 4 of 5/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Dinking 2 of 5/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Volleys & hands 3 of 5/ }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Many" }));
    fireEvent.click(screen.getByRole("button", { name: "See my practice plan" }));

    expect(await screen.findByText("Your practice plan")).toBeTruthy();
    expect(screen.getByText("Build your dinking")).toBeTruthy();
    expect(screen.getAllByText(/Cross-court dink count/).length).toBeGreaterThan(0);
    expect(upserts[0]).toMatchObject({ session_id: "s1", ratings: { serve: 4, dinking: 2, volleys: 3 }, unforced_errors: "many" });
  });

  it("asks for at least three ratings before saving", async () => {
    const { sb, upserts } = fakeSupabase();
    render(<SelfAssessmentPanel sb={sb} session={session} />);
    fireEvent.click(await screen.findByRole("radio", { name: /^Serve 4 of 5/ }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "See my practice plan" }));
    expect(await screen.findByText(/Rate at least 3 skills/)).toBeTruthy();
    expect(upserts).toHaveLength(0);
  });
});

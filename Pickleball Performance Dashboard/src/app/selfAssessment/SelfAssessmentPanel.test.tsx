import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/** Sets a hold-to-rate slider with the keyboard: Home is the lowest value, then one step per arrow. */
function setSlider(name: RegExp, steps: number) {
  const slider = screen.getByRole("slider", { name });
  fireEvent.keyDown(slider, { key: "Home" });
  for (let i = 0; i < steps; i++) fireEvent.keyDown(slider, { key: "ArrowRight" });
  return slider;
}

describe("SelfAssessmentPanel", () => {
  it("counts shots as successes out of 10, with arrow keys or by holding the pickleball", async () => {
    const { sb } = fakeSupabase();
    render(<SelfAssessmentPanel sb={sb} session={session} />);
    const serve = await screen.findByRole("slider", { name: /^Serve: Out of 10 serves, how many went in\?/ });
    expect(serve.getAttribute("aria-valuetext")).toBe("Not rated");
    fireEvent.keyDown(serve, { key: "End" });
    expect(serve.getAttribute("aria-valuetext")).toBe("10 in · 0 errors · 100%");
    fireEvent.keyDown(serve, { key: "ArrowLeft" });
    expect(serve.getAttribute("aria-valuenow")).toBe("9");

    // Holding fills the ring from 0, one step at a time; letting go keeps the value. A quick tap adds one.
    vi.useFakeTimers();
    try {
      const dinks = screen.getByRole("slider", { name: /^Dinking:/ });
      fireEvent.pointerDown(dinks, { pointerId: 1 });
      act(() => { vi.advanceTimersByTime(1300); });
      fireEvent.pointerUp(dinks, { pointerId: 1 });
      expect(dinks.getAttribute("aria-valuenow")).toBe("3");
      fireEvent.pointerDown(dinks, { pointerId: 1 });
      fireEvent.pointerUp(dinks, { pointerId: 1 });
      expect(dinks.getAttribute("aria-valuenow")).toBe("4");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rates court and game skills 1 to 5 and explains each term", async () => {
    const { sb } = fakeSupabase();
    render(<SelfAssessmentPanel sb={sb} session={session} />);
    fireEvent.click(await screen.findByRole("button", { name: "What is third-shot drop?" }));
    expect(screen.getByText(/A drop is a soft, arcing shot/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const kitchen = setSlider(/^Moving up to the net rating, 1 lowest to 5 highest/, 0);
    expect(kitchen.getAttribute("aria-valuenow")).toBe("1");
    fireEvent.keyDown(kitchen, { key: "End" });
    expect(kitchen.getAttribute("aria-valuenow")).toBe("5");
  });

  it("asks singles players about placement, not a partner", async () => {
    const { sb } = fakeSupabase();
    render(<SelfAssessmentPanel sb={sb} session={{ ...session, play_format: "singles" }} />);
    await screen.findByRole("slider", { name: /^Serve:/ });
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Shot choice & placement")).toBeTruthy();
    expect(screen.queryByText(/partner/i)).toBeNull();
  });

  it("rates skills without a video and shows a practice plan", async () => {
    const { sb, upserts } = fakeSupabase();
    render(<SelfAssessmentPanel sb={sb} session={session} />);
    await screen.findByRole("slider", { name: /^Serve:/ });
    setSlider(/^Serve:/, 7);           // 7 of 10 → 4/5
    setSlider(/^Dinking:/, 3);         // 3 of 10 → 2/5
    setSlider(/^Volleys & hands:/, 5); // 5 of 10 → 3/5
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Many" }));
    fireEvent.click(screen.getByRole("button", { name: "See my practice plan" }));

    expect(await screen.findByText("This week's drill")).toBeTruthy();
    expect(screen.getByText("Build your dinking")).toBeTruthy();
    expect(screen.getAllByText(/Cross-court dink count/).length).toBeGreaterThan(0);
    expect(upserts[0]).toMatchObject({ session_id: "s1", ratings: { serve: 4, dinking: 2, volleys: 3 },
      shot_results: { serve: 7, dinking: 3, volleys: 5 }, unforced_errors: "many" });
    expect(screen.getByText("You got 3 of 10 dinks in.")).toBeTruthy();
  });

  it("asks for at least three ratings before saving", async () => {
    const { sb, upserts } = fakeSupabase();
    render(<SelfAssessmentPanel sb={sb} session={session} />);
    await screen.findByRole("slider", { name: /^Serve:/ });
    setSlider(/^Serve:/, 7);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    // Not enough coverage: the button is disabled and the reason is explained.
    expect((screen.getByRole("button", { name: "See my practice plan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at least 3 skills that came up/)).toBeTruthy();
    expect(upserts).toHaveLength(0);
  });
});

it("derives result counts from score while preserving individual manual overrides", async () => {
  const { sb } = fakeSupabase();
  render(<SelfAssessmentPanel sb={sb} session={session} />);
  await screen.findByRole("slider", { name: /^Serve:/ });
  expect(screen.queryByLabelText("Score (optional)")).toBeNull(); // the result is asked in Wrap-up only
  fireEvent.click(screen.getByRole("button", { name: "Wrap-up" }));
  fireEvent.change(screen.getByLabelText("Score (optional)"), { target: { value: "11-7, 9-11, 11-5" } });
  expect(screen.getAllByText("AUTO")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Won" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Fewer games won" }));
  expect(screen.getAllByText("AUTO")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Score (optional)"), { target: { value: "7-11" } });
  expect(screen.getByRole("button", { name: "Lost" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getAllByText("AUTO")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Score (optional)"), { target: { value: "unreadable" } });
  expect(screen.queryByText("AUTO")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Shots" }));
  expect(screen.getAllByText("Hold the ball, let go to rate").length).toBeGreaterThan(0);
});

it("lets a player clear accidental optional counts and keep zero wins", async () => {
  const { sb } = fakeSupabase();
  render(<SelfAssessmentPanel sb={sb} session={session} />);
  await screen.findByRole("slider", { name: /^Serve:/ });
  fireEvent.click(screen.getByRole("button", { name: "Wrap-up" }));
  fireEvent.click(screen.getByRole("button", { name: "More games played" }));
  fireEvent.click(screen.getByRole("button", { name: "More games won" }));
  fireEvent.click(screen.getByRole("button", { name: "Fewer games won" }));
  expect(screen.getByRole("button", { name: "Fewer games won" }).getAttribute("disabled")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Fewer games played" }));
  expect(screen.queryByRole("button", { name: "More games won" })).toBeNull();
});

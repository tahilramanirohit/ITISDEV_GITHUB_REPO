import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { initials } from "../../lib/api/players";
import type { SessionListItem } from "../../lib/api/sessions";
import { SessionCard, weekStreak } from "./sessionUi";

afterEach(cleanup);

const base = {
  id: "s1", owner_id: "u1", title: "City Open semi", session_date: "2026-10-04", session_context: "tournament", play_format: "doubles",
  performance_scope: "individual", review_mode: "self", notes: null, improvement_goals: [], positioning_rating: null,
  shot_outcomes_rating: null, shot_technique_rating: null, actual_start_at: null, actual_end_at: null,
  created_at: "2026-10-04T10:00:00Z", updated_at: "", tournament_name: "City Open", tournament_round: "Semifinal",
  match_result: "win", match_score: "11-7, 11-9",
} as SessionListItem["session"];

describe("SessionCard", () => {
  it("shows a tournament match like an activity: result, players and status", () => {
    render(<SessionCard item={{ session: base, video: null, job: null, result: null }} you="Kirk"
      players={[{ role: "partner", display_name: "Ana Reyes" }, { role: "opponent", display_name: "Ben Cruz" }]} />);
    expect(screen.getByText("Tournament · Semifinal")).toBeTruthy();
    expect(screen.getByText("Won")).toBeTruthy();
    expect(screen.getByText("11-7, 11-9")).toBeTruthy();
    expect(screen.getByLabelText("Kirk, Ana Reyes, Ben Cruz")).toBeTruthy();
    expect(screen.getByText("Rate yourself")).toBeTruthy();
  });
});

describe("helpers", () => {
  it("makes avatar initials", () => {
    expect(initials("Ana Reyes")).toBe("AR");
    expect(initials("kirk")).toBe("KI");
    expect(initials("  ")).toBe("?");
  });
  it("counts consecutive weeks with a session", () => {
    const today = new Date("2026-10-07T12:00:00Z");
    expect(weekStreak(["2026-10-06", "2026-09-30", "2026-09-22"], today)).toBe(3);
    expect(weekStreak(["2026-09-01"], today)).toBe(0);
  });
});

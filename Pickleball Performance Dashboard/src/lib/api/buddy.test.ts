import { describe, expect, it } from "vitest";
import {
  buddyErrorText, buddyLevel, freeTimeProblem, logBuddySessionHref, meetupProblem, nextFreeTime, sortByLevel, suggestBuddies, upcomingBuddySessions,
  type BuddyDetails, type BuddyPlayer, type BuddyRequest,
} from "./buddy";

const player = (name: string, level: BuddyPlayer["level"]): BuddyPlayer => ({
  player_id: name, display_name: name, level, usual_format: null, request_id: null, request_status: null, request_direction: null,
});

describe("buddy levels", () => {
  it("maps old and new profile answers like the database does", () => {
    expect(buddyLevel("New to the game")).toBe("beginner");
    expect(buddyLevel("Beginner (2.0–2.5)")).toBe("beginner");
    expect(buddyLevel("Novice")).toBe("novice");
    expect(buddyLevel("Intermediate (3.0–3.5)")).toBe("intermediate");
    expect(buddyLevel("Advanced (4.0+)")).toBe("advanced");
    expect(buddyLevel("Not sure")).toBeNull();
    expect(buddyLevel(null)).toBeNull();
  });

  it("lists players closest to your level first, unknown levels last", () => {
    const list = [player("Zed", "advanced"), player("Amy", null), player("Bo", "novice"), player("Cy", "intermediate")];
    expect(sortByLevel(list, "novice").map((p) => p.display_name)).toEqual(["Bo", "Cy", "Zed", "Amy"]);
    expect(sortByLevel(list, null).map((p) => p.display_name)).toEqual(["Bo", "Cy", "Zed", "Amy"]);
  });
});

describe("free times", () => {
  const today = new Date(2026, 9, 22);
  it("accepts several valid dates and times", () => {
    expect(freeTimeProblem([{ date: "2026-10-23", start: "08:00", end: "10:00" },
      { date: "2026-10-25", start: "18:30", end: "20:00" }], today)).toBeNull();
  });
  it("explains what is wrong, like the database check", () => {
    expect(freeTimeProblem([], today)).toMatch(/at least one/);
    expect(freeTimeProblem([{ date: "2026-10-21", start: "08:00", end: "10:00" }], today)).toMatch(/passed/);
    expect(freeTimeProblem([{ date: "2027-03-01", start: "08:00", end: "10:00" }], today)).toMatch(/90 days/);
    expect(freeTimeProblem([{ date: "2026-10-23", start: "10:00", end: "09:00" }], today)).toMatch(/before the end/);
    expect(freeTimeProblem(Array.from({ length: 11 }, () => ({ date: "2026-10-23", start: "08:00", end: "09:00" })), today)).toMatch(/at most 10/);
  });
});

describe("error messages", () => {
  it("shows the database's own explanation without its prefix", () => {
    expect(buddyErrorText(new Error("buddy: there is already an open request between you and this player")))
      .toBe("There is already an open request between you and this player");
  });
  it("names the missing database update", () => {
    expect(buddyErrorText(new Error("Could not find the function public.buddy_players without parameters in the schema cache")))
      .toMatch(/pickleproapp_upgrade_4\.sql/);
  });
});

describe("meetup place", () => {
  it("needs a city and a location, within their limits", () => {
    expect(meetupProblem({ city: "Makati", location: "Ayala Triangle courts" })).toBeNull();
    expect(meetupProblem({ city: "  ", location: "x" })).toMatch(/city/);
    expect(meetupProblem({ city: "Makati", location: "" })).toMatch(/where to meet/);
    expect(meetupProblem({ city: "x".repeat(61), location: "x" })).toMatch(/60/);
  });
  it("names update 5 when the database does not have it yet", () => {
    expect(buddyErrorText(new Error("Could not find the function public.send_buddy_request(p_city, p_format, p_location, p_purpose, p_slots, p_to) in the schema cache")))
      .toMatch(/pickleproapp_upgrade_5\.sql/);
  });
});

describe("cancelling a session", () => {
  it("names update 6 when the database does not have it yet", () => {
    expect(buddyErrorText(new Error("Could not find the function public.cancel_buddy_session(p_reason, p_request_id) in the schema cache")))
      .toMatch(/pickleproapp_upgrade_6\.sql/);
  });
});

describe("logging a buddy session", () => {
  const today = new Date(2026, 10, 5); // 5 Nov 2026, local time
  const request = {
    id: "r1", direction: "outgoing", other_player_id: "k", other_name: "Kyle", other_level: "intermediate",
    purpose: "competition", play_format: "doubles", city: "Makati", location: "Court 3", status: "accepted",
    created_at: "", responded_at: null,
    slots: [{ date: "2026-11-08", start: "09:00", end: "11:00" }, { date: "2026-11-01", start: "09:00", end: "10:00" }, { date: "2026-11-06", start: "18:00", end: "19:00" }],
  } as BuddyRequest;

  it("finds the next free time from today", () => {
    expect(nextFreeTime(request, today)?.date).toBe("2026-11-06");
    expect(nextFreeTime({ slots: [{ date: "2026-11-01", start: "09:00", end: "10:00" }] }, today)).toBeNull();
    expect(upcomingBuddySessions([request, { ...request, id: "r2", status: "pending" }], today).map((u) => u.request.id)).toEqual(["r1"]);
  });

  it("links to New session with the buddy filled in", () => {
    const href = logBuddySessionHref(request, today);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("#/new?")).toBe(true);
    expect(Object.fromEntries(params)).toEqual({ mode: "self", with: "Kyle", date: "2026-11-06", context: "casual_match", format: "doubles", buddy: "r1" });
    // After every free time has passed, use the latest one; "either" leaves the format alone.
    const past = new URLSearchParams(logBuddySessionHref({ ...request, purpose: "practice", play_format: "either" }, new Date(2026, 11, 1)).split("?")[1]);
    expect(Object.fromEntries(past)).toEqual({ mode: "self", with: "Kyle", date: "2026-11-08", context: "practice", buddy: "r1" });
  });
});

describe("buddy suggestions", () => {
  const p = (name: string, level: BuddyPlayer["level"], extra: Partial<BuddyPlayer> = {}): BuddyPlayer => ({
    player_id: name, display_name: name, level, usual_format: null, request_id: null, request_status: null, request_direction: null, ...extra,
  });
  const d = (id: string, game_rating: number | null, looking_for: BuddyDetails["looking_for"], strong_skills: BuddyDetails["strong_skills"] = []) =>
    [id, { player_id: id, game_rating, looking_for, strong_skills }] as const;
  const players = [p("Ana", "intermediate"), p("Ben", "intermediate"), p("Cy", "advanced"), p("Dee", "intermediate"), p("Eve", "intermediate", { request_status: "pending" }), p("Fin", "intermediate")];
  const details = new Map<string, BuddyDetails>([
    d("Ana", 3.5, ["practice"]), d("Ben", 3, ["practice", "competition"], ["dinking"]), d("Cy", 4.5, ["practice"]),
    d("Dee", 3.5, ["casual_game"]), d("Eve", 3.5, ["practice"]), d("Fin", null, ["practice"]),
  ]);
  const me = { gameRating: 3.5, lookingFor: ["practice"] as BuddyDetails["looking_for"], focusSkills: ["dinking"] as BuddyDetails["strong_skills"], level: "intermediate" as const };

  it("suggests similar-rated players who want the same thing, strongest at your focus first", () => {
    expect(suggestBuddies(players, details, me).map((s) => [s.player.display_name, s.reason])).toEqual([
      ["Ben", "Strong at dinking, your focus"],
      ["Ana", "Similar game rating"],
      ["Fin", "Same level"],
    ]);
  });
  it("leaves out players too far apart, looking for something else, or already asked", () => {
    const names = suggestBuddies(players, details, me, 10).map((s) => s.player.display_name);
    expect(names).not.toContain("Cy");
    expect(names).not.toContain("Dee");
    expect(names).not.toContain("Eve");
  });
  it("suggests nobody until you say what you are looking for", () => {
    expect(suggestBuddies(players, details, { ...me, lookingFor: [] })).toEqual([]);
  });
});

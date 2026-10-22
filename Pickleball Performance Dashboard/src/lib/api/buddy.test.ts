import { describe, expect, it } from "vitest";
import { buddyErrorText, buddyLevel, freeTimeProblem, meetupProblem, sortByLevel, type BuddyPlayer } from "./buddy";

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

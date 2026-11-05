import { describe, expect, it } from "vitest";
import type { BuddyLink, BuddyRequest } from "../api/buddy";
import type { PartnerLink, SharedSession } from "../api/partners";
import { buildPeople, feedbackDue, recentSessions } from "./people";

const req = (id: string, other: string, status: BuddyRequest["status"], dates: string[]): BuddyRequest => ({
  id, direction: "outgoing", other_player_id: other, other_name: other.toUpperCase(), other_level: "novice", purpose: "practice",
  play_format: "doubles", slots: dates.map((date) => ({ date, start: "08:00", end: "10:00" })), city: null, location: null, status,
  created_at: "", responded_at: null,
});
const partner = (other: string, status: PartnerLink["status"] = "active", direction: PartnerLink["direction"] = "sent"): PartnerLink => ({
  id: `l-${other}`, status, direction, other_id: other, other_name: other.toUpperCase(), other_level: null, invite_code: null,
  created_at: "", expires_at: "", linked_at: status === "active" ? "2026-10-01T00:00:00Z" : null,
});
const shared = (owner: string, extra: Partial<SharedSession> = {}): SharedSession => ({
  session_id: `${owner}-s`, owner_id: owner, owner_name: owner, title: "Game", session_date: "2026-10-30", session_context: "casual_match",
  play_format: "doubles", has_report: false, my_notes: 0, shared_at: "", focus_skills: ["dinking"], my_ratings: 0, ...extra,
});

describe("people: buddies and partners together", () => {
  const today = new Date(2026, 10, 5);

  it("merges a buddy who is also a partner, counts games, shares both ways and what waits on you", () => {
    const people = buildPeople({
      requests: [req("r1", "a", "accepted", ["2026-10-20"]), req("r2", "a", "called_off", ["2026-10-27"]), req("r3", "b", "pending", ["2026-11-20"])],
      links: [partner("a"), partner("c"), partner("b", "pending")],
      sessions: [{ id: "s1", title: "G1", session_date: "2026-10-20", buddy_request_id: "r1" },
        { id: "s2", title: "G2", session_date: "2026-10-27", buddy_request_id: "r2" }, { id: "s3", title: "Solo", session_date: "2026-11-01" }],
      shares: [{ session_id: "s1", partner_id: "a" }, { session_id: "s2", partner_id: "a" }],
      sharedWithMe: [shared("a"), shared("a", { session_id: "a2", my_ratings: 1 }), shared("c", { focus_skills: [], has_report: true, my_notes: 1 })],
      today,
    });
    // b is only a pending request and a pending invite: not one of "my people" yet.
    expect(people.map((p) => p.id)).toEqual(["a", "c"]);
    const a = people[0];
    expect(a.partner?.id).toBe("l-a");
    expect([a.gamesTogether, a.lastPlayed, a.askedThem, a.theyShared.length, a.waitingOnYou.length]).toEqual([2, "2026-10-27", 2, 2, 1]);
    expect(people[1].waitingOnYou).toEqual([]);
  });

  it("puts someone waiting on you first, then the next game, then the latest played", () => {
    const people = buildPeople({
      requests: [req("r1", "x", "accepted", ["2026-11-09"]), req("r2", "y", "accepted", ["2026-11-07"]), req("r3", "z", "accepted", ["2026-10-01"])],
      links: [partner("w")], sessions: [], shares: [], sharedWithMe: [shared("w")], today,
    });
    expect(people.map((p) => p.id)).toEqual(["w", "y", "x", "z"]);
    expect(people[1].next?.date).toBe("2026-11-07");
    expect(people[3].next).toBeNull();
  });

  it("knows when feedback is still due and lists recent sessions newest first", () => {
    expect(feedbackDue(shared("a", { my_ratings: 1 }))).toBe(false);
    expect(feedbackDue(shared("a", { focus_skills: [], has_report: true, my_notes: 0 }))).toBe(true);
    expect(feedbackDue(shared("a", { focus_skills: [], has_report: false }))).toBe(false);
    expect(recentSessions([{ id: "1", title: "", session_date: "2026-10-01" }, { id: "2", title: "", session_date: "2026-10-09" }], 1).map((s) => s.id)).toEqual(["2"]);
  });

  it("with a buddy list, lists every buddy (even without a game) and drops sessions with players no longer buddies", () => {
    const link = (other: string): BuddyLink => ({ id: `b-${other}`, status: "active", direction: "sent", other_id: other,
      other_name: other.toUpperCase(), other_level: null, created_at: "", responded_at: "2026-10-01T00:00:00Z" });
    const people = buildPeople({
      buddies: [link("a"), { ...link("p"), status: "pending" }],
      requests: [req("r1", "x", "accepted", ["2026-10-20"]), req("r2", "a", "accepted", ["2026-11-20"])],
      links: [], sessions: [], shares: [], sharedWithMe: [], today,
    });
    // a: a buddy with a session; p: only a waiting buddy request; x: removed as a buddy, so the old session is not listed.
    expect(people.map((p) => p.id)).toEqual(["a"]);
    expect(people[0].buddy?.id).toBe("b-a");
    expect(people[0].buddySessions.map((r) => r.id)).toEqual(["r2"]);
  });
});

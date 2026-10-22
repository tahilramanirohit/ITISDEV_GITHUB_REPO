import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import BuddyPage from "./BuddyPage";

afterEach(cleanup);

type Fake = { profile: Record<string, unknown>; players: unknown[]; requests: unknown[] };

function fakeSb(state: Fake) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "buddy_players") return { data: state.players, error: null };
    if (fn === "my_buddy_requests") return { data: state.requests, error: null };
    if (fn === "send_buddy_request") return { data: "new-id", error: null };
    if (fn === "respond_buddy_request") return { data: null, error: null };
    if (fn === "invite_buddy_as_partner") return { data: "p1", error: null };
    if (fn === "cancel_buddy_session") {
      state.requests = state.requests.map((r) => ((r as { id: string }).id === args?.p_request_id
        ? { ...(r as object), status: "called_off", cancelled_by_me: true, cancel_reason: args?.p_reason, cancelled_at: "2026-10-24T09:00:00Z" } : r));
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn} ${JSON.stringify(args)}` } };
  });
  const update = vi.fn((values: Record<string, unknown>) => ({
    eq: vi.fn(async () => { Object.assign(state.profile, values); return { data: null, error: null }; }),
  }));
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }),
    update,
  }));
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, update };
}

const me = { id: "me", display_name: "Kim", self_level: "Novice", is_adult_confirmed: true, buddy_visible: true };

describe("Buddy", () => {
  it("asks first-time users to confirm 18+ and whether to be listed", async () => {
    const { sb, update } = fakeSb({ profile: { ...me, is_adult_confirmed: false, buddy_visible: false }, players: [], requests: [] });
    render(<BuddyPage sb={sb} userId="me" />);
    const go = await screen.findByRole("button", { name: "Continue" });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I confirm I am 18 or older."));
    fireEvent.click(go);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ is_adult_confirmed: true, buddy_visible: true }));
    expect(await screen.findByText("You are listed in Buddy")).toBeTruthy();
  });

  it("lists available players with their level and filters by level", async () => {
    const { sb } = fakeSb({ profile: { ...me }, requests: [], players: [
      { player_id: "a", display_name: "Ana", level: "advanced", usual_format: "doubles", request_id: null, request_status: null, request_direction: null },
      { player_id: "b", display_name: "Ben", level: "novice", usual_format: null, request_id: null, request_status: null, request_direction: null },
    ] });
    render(<BuddyPage sb={sb} userId="me" />);
    const list = await screen.findByRole("list", { name: "Available players" });
    const names = within(list).getAllByText(/^(Ana|Ben)$/).map((n) => n.textContent);
    expect(names).toEqual(["Ben", "Ana"]); // closest to my level (novice) first
    expect(within(list).getByText("Advanced · usually doubles")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(within(screen.getByRole("list", { name: "Available players" })).queryByText("Ben")).toBeNull();
  });

  it("sends a request only after purpose, format, city, location and free times are answered", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, requests: [], players: [
      { player_id: "b", display_name: "Ben", level: "novice", usual_format: null, request_id: null, request_status: null, request_direction: null },
    ] });
    render(<BuddyPage sb={sb} userId="me" />);
    fireEvent.click(await screen.findByRole("button", { name: "Buddy up" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    expect(await screen.findByText("Choose a purpose.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Casual game" }));
    fireEvent.click(screen.getByRole("button", { name: "Doubles" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    expect(await screen.findByText("Enter the city.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("City"), { target: { value: " Makati " } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    expect(await screen.findByText("Enter where to meet, such as a court name.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Ayala Triangle courts" } });
    fireEvent.click(screen.getByRole("button", { name: "Add another date or time" }));
    expect(screen.getAllByLabelText("Date")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("send_buddy_request", expect.objectContaining({
      p_to: "b", p_purpose: "casual_game", p_format: "doubles", p_city: "Makati", p_location: "Ayala Triangle courts",
      p_slots: [expect.objectContaining({ start: "17:00", end: "19:00" }), expect.objectContaining({ start: "17:00", end: "19:00" })],
    })));
    expect(await screen.findByText(/Request sent to Ben. Follow it under Requests/)).toBeTruthy();
  });

  it("shows requests waiting for an answer with accept and decline", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, players: [], requests: [
      { id: "r1", direction: "incoming", other_player_id: "c", other_name: "Cy", other_level: "intermediate", purpose: "practice",
        play_format: "singles", slots: [{ date: "2026-10-25", start: "08:00", end: "10:00" }], city: "Pasig",
        location: "Capitol Commons court 2", status: "pending",
        created_at: "2026-10-22T00:00:00Z", responded_at: null },
    ] });
    render(<BuddyPage sb={sb} userId="me" />);
    // Opens on the Requests tab because someone is waiting for an answer.
    expect(await screen.findByText("Wants to buddy up with you (1)")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Requests/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("1 new")).toBeTruthy();
    expect(screen.getByText("Practice / drills")).toBeTruthy();
    expect(screen.getByText("Capitol Commons court 2, Pasig")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_buddy_request", { p_request_id: "r1", p_accept: true }));
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  });

  const session = (extra: Record<string, unknown> = {}) => ({
    id: "s1", direction: "outgoing", other_player_id: "c", other_name: "Cy", other_level: "intermediate", purpose: "casual_game",
    play_format: "doubles", slots: [{ date: "2026-10-25", start: "08:00", end: "10:00" }], city: "Pasig",
    location: "Capitol Commons court 2", status: "accepted", created_at: "2026-10-22T00:00:00Z", responded_at: "2026-10-22T01:00:00Z",
    ...extra,
  });

  it("cancels an accepted buddy session with a reason the other player will see", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, players: [], requests: [session()] });
    render(<BuddyPage sb={sb} userId="me" />);
    fireEvent.click(await screen.findByRole("tab", { name: "Requests" }));
    expect(screen.getByText("Your buddies")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel buddy session" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep session" }));
    expect(screen.queryByRole("form", { name: "Cancel buddy session with Cy" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel buddy session" }));
    expect(screen.getByText(/Cy will see that you cancelled/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bad weather" }));
    expect((screen.getByLabelText("Reason (optional)") as HTMLTextAreaElement).value).toBe("Bad weather");
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Bad weather, courts are flooded " } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel session" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("cancel_buddy_session",
      { p_request_id: "s1", p_reason: "Bad weather, courts are flooded" }));
    expect(await screen.findByText("Cancelled sessions")).toBeTruthy();
    expect(screen.queryByText("Your buddies")).toBeNull();
    expect(screen.getByText(/^You cancelled/)).toBeTruthy();
    expect(screen.getByText("Bad weather, courts are flooded")).toBeTruthy();
  });

  it("invites an accepted buddy to be a partner", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, players: [], requests: [session()] });
    render(<BuddyPage sb={sb} userId="me" />);
    fireEvent.click(await screen.findByRole("tab", { name: "Requests" }));
    fireEvent.click(screen.getByRole("button", { name: "Invite as partner" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("invite_buddy_as_partner", { p_player: "c" }));
  });

  it("shows when the other player cancelled, with or without a reason", async () => {
    const { sb } = fakeSb({ profile: { ...me }, players: [], requests: [
      session({ status: "called_off", cancelled_by_me: false, cancel_reason: null, cancelled_at: "2026-10-24T09:00:00Z" }),
    ] });
    render(<BuddyPage sb={sb} userId="me" />);
    fireEvent.click(await screen.findByRole("tab", { name: "Requests" }));
    expect(screen.getByText(/^Cy cancelled/)).toBeTruthy();
    expect(screen.getByText("No reason given")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel buddy session" })).toBeNull();
    expect(screen.queryByText(/No requests yet/)).toBeNull();
  });

  it("switches between Available and Requests", async () => {
    const { sb } = fakeSb({ profile: { ...me }, requests: [], players: [
      { player_id: "b", display_name: "Ben", level: "novice", usual_format: null, request_id: null, request_status: null, request_direction: null },
    ] });
    render(<BuddyPage sb={sb} userId="me" />);
    expect(await screen.findByRole("tab", { name: "Available" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Available players" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
    expect(screen.getByText(/No requests yet/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Available players" })).toBeNull();
  });
});

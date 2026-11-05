import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import PlayersPage from "./PlayersPage";

afterEach(cleanup);

type Row = Record<string, unknown>;
type Fake = {
  profile: Row; players?: Row[]; requests?: Row[]; details?: Row[]; listing?: Row;
  links?: Row[]; shared?: Row[]; sessions?: Row[]; shares?: Row[];
};

const link = (extra: Row): Row => ({ id: "l1", status: "active", direction: "sent", other_id: "q", other_name: "Quinn",
  other_level: "advanced", invite_code: null, created_at: "2026-10-20T00:00:00Z", expires_at: "2026-12-27T00:00:00Z",
  linked_at: "2026-10-21T00:00:00Z", ...extra });
const buddySession = (extra: Row = {}): Row => ({
  id: "s1", direction: "outgoing", other_player_id: "c", other_name: "Cy", other_level: "intermediate", purpose: "casual_game",
  play_format: "doubles", slots: [{ date: "2026-10-25", start: "08:00", end: "10:00" }], city: "Pasig",
  location: "Capitol Commons court 2", status: "accepted", created_at: "2026-10-22T00:00:00Z", responded_at: "2026-10-22T01:00:00Z",
  ...extra,
});
const ben = { player_id: "b", display_name: "Ben", level: "novice", usual_format: null, request_id: null, request_status: null, request_direction: null };

/** A query chain that resolves to rows, whatever filters are applied. */
function rows(data: Row[]) {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit"]) chain[k] = () => chain;
  chain.then = (ok: (v: unknown) => void) => ok({ data, error: null });
  return chain;
}

function fakeSb(state: Fake) {
  state.links ??= []; state.shared ??= []; state.requests ??= []; state.players ??= [];
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    switch (fn) {
      case "buddy_players": return { data: state.players, error: null };
      case "my_buddy_requests": return { data: state.requests, error: null };
      case "my_partners": return { data: state.links, error: null };
      case "shared_with_me": return { data: state.shared, error: null };
      case "send_buddy_request": case "respond_buddy_request": case "invite_buddy_as_partner": return { data: "x", error: null };
      case "buddy_player_details": return state.details ? { data: state.details, error: null } : { data: null, error: { message: "missing" } };
      case "my_buddy_listing": return state.listing ? { data: [{ ...state.listing, looking_for: state.profile.buddy_looking_for ?? [] }], error: null }
        : { data: null, error: { message: "missing" } };
      case "cancel_buddy_session":
        state.requests = state.requests!.map((r) => (r.id === args?.p_request_id
          ? { ...r, status: "called_off", cancelled_by_me: true, cancel_reason: args?.p_reason, cancelled_at: "2026-10-24T09:00:00Z" } : r));
        return { data: null, error: null };
      case "create_partner_invite":
        state.links = [...state.links!, link({ id: "c1", status: "pending", other_id: null, other_name: null, other_level: null, invite_code: "K7P4QX9M", linked_at: null })];
        return { data: [{ id: "c1", invite_code: "K7P4QX9M", expires_at: "2026-10-29T00:00:00Z" }], error: null };
      case "redeem_partner_code":
        if (args?.p_code !== "ABCDEFGH") return { data: null, error: { message: "partners: this code is not valid or has expired; ask for a new one" } };
        state.links = [...state.links!, link({ id: "l2", other_id: "r", other_name: "Rex", direction: "received" })];
        return { data: "l2", error: null };
      case "respond_partner_invite": case "end_partnership":
        state.links = state.links!.map((l) => l.id === args?.p_id ? { ...l, status: fn === "end_partnership" ? "ended" : "active" } : l)
          .filter((l) => l.status !== "ended");
        return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn} ${JSON.stringify(args)}` } };
  });
  const update = vi.fn((values: Row) => ({
    eq: vi.fn(async () => { Object.assign(state.profile, values); return { data: null, error: null }; }),
  }));
  const from = vi.fn((table: string) => {
    if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }), update };
    if (table === "sessions") return rows(state.sessions ?? []);
    if (table === "report_shares") return rows(state.shares ?? []);
    return rows([]); // injury_periods: not injured
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, update };
}

const me = { id: "me", display_name: "Kim", self_level: "Novice", is_adult_confirmed: true, buddy_visible: true };
const show = (sb: SupabaseClient, path = "/players") => render(<MemoryRouter initialEntries={[path]}><PlayersPage sb={sb} userId="me" /></MemoryRouter>);

describe("Players: Find", () => {
  it("lets a player say what they look for, filters by purpose and suggests close matches", async () => {
    const players = [ben, { ...ben, player_id: "c", display_name: "Cy", level: "advanced" }];
    const { sb, update } = fakeSb({ profile: { ...me, buddy_looking_for: [] }, players,
      details: [{ player_id: "b", looking_for: ["practice"], game_rating: 2.5, strong_skills: [] },
        { player_id: "c", looking_for: ["competition"], game_rating: 4.5, strong_skills: ["dinking"] }],
      listing: { game_rating: 2.5, strong_skills: [] } });
    show(sb, "/players?section=find");
    expect(await screen.findByText(/Pick what you're looking for above/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "I'm looking for" })).getByRole("button", { name: "Practice" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ buddy_looking_for: ["practice"] }));
    const suggested = await screen.findByRole("region", { name: "Suggested for you" });
    expect(within(suggested).getByText("Ben")).toBeTruthy();
    expect(within(suggested).queryByText("Cy")).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "Filter by purpose" })).getByRole("button", { name: "Competition prep" }));
    const list = screen.getByRole("list", { name: "Available players" });
    expect(within(list).queryByText("Ben")).toBeNull();
    expect(within(list).getByText("Cy")).toBeTruthy();
    fireEvent.click(within(suggested).getByRole("button", { name: "Ask Ben" }));
    expect(await screen.findByRole("form", { name: "Buddy up with Ben" })).toBeTruthy();
  });

  it("asks first-time users to confirm 18+ and whether to be listed", async () => {
    const { sb, update } = fakeSb({ profile: { ...me, is_adult_confirmed: false, buddy_visible: false } });
    show(sb, "/players?section=find");
    const go = await screen.findByRole("button", { name: "Continue" });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I confirm I am 18 or older."));
    fireEvent.click(go);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ is_adult_confirmed: true, buddy_visible: true }));
    expect(await screen.findByText("You are listed in Buddy")).toBeTruthy();
  });

  it("lists available players by closeness to your level, filters by level and sends a complete request", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, players: [
      { ...ben, player_id: "a", display_name: "Ana", level: "advanced", usual_format: "doubles" }, ben] });
    show(sb, "/players?section=find");
    const list = await screen.findByRole("list", { name: "Available players" });
    expect(within(list).getAllByText(/^(Ana|Ben)$/).map((n) => n.textContent)).toEqual(["Ben", "Ana"]);
    expect(within(list).getByText("Advanced · usually doubles")).toBeTruthy();
    fireEvent.click(within(list).getAllByRole("button", { name: "Buddy up" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    expect(await screen.findByText("Choose a purpose.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Casual game" }));
    fireEvent.click(screen.getByRole("button", { name: "Doubles" }));
    fireEvent.change(screen.getByLabelText("City"), { target: { value: " Makati " } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Ayala Triangle courts" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("send_buddy_request", expect.objectContaining({
      p_to: "b", p_purpose: "casual_game", p_format: "doubles", p_city: "Makati", p_location: "Ayala Triangle courts" })));
    expect(await screen.findByText(/Request sent to Ben. Follow it in Inbox/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(within(screen.getByRole("list", { name: "Available players" })).queryByText("Ben")).toBeNull();
  });
});

describe("Players: Inbox", () => {
  it("opens on Inbox when something is waiting, and accepts a buddy request", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, requests: [buddySession({ id: "r1", direction: "incoming", status: "pending",
      purpose: "practice", play_format: "singles", responded_at: null })] });
    show(sb);
    expect(await screen.findByText("Wants to play with you (1)")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Inbox/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Inbox (1)" })).toBeTruthy();
    expect(screen.getByText("Practice / drills")).toBeTruthy();
    expect(screen.getByText("Capitol Commons court 2, Pasig")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_buddy_request", { p_request_id: "r1", p_accept: true }));
  });

  it("puts partner invites and feedback asked of you in the same inbox", async () => {
    const shared = { session_id: "x1", owner_id: "q", owner_name: "Quinn", title: "Sunday doubles", session_date: "2026-10-18",
      session_context: "casual_match", play_format: "doubles", has_report: true, my_notes: 0, shared_at: "", focus_skills: ["dinking"], my_ratings: 0 };
    const { sb, rpc } = fakeSb({ profile: { ...me }, shared: [shared],
      links: [link({}), link({ id: "i1", status: "pending", direction: "received", other_id: "r", other_name: "Rex", linked_at: null })] });
    show(sb);
    expect(await screen.findByText("Wants to be your partner (1)")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Inbox (2)" })).toBeTruthy();
    const due = screen.getByRole("list", { name: "Feedback asked of you" });
    expect(within(due).getByRole("link", { name: "Quinn: Sunday doubles" }).getAttribute("href")).toBe("#/shared/x1");
    expect(within(due).getByText("Rate and send feedback")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_partner_invite", { p_id: "i1", p_accept: true }));
    expect(await screen.findByText("You and Rex are now partners.")).toBeTruthy();
  });

  it("shows when the other player cancelled, with or without a reason", async () => {
    const { sb } = fakeSb({ profile: { ...me }, requests: [
      buddySession({ status: "called_off", cancelled_by_me: false, cancel_reason: null, cancelled_at: "2026-10-24T09:00:00Z" })] });
    show(sb, "/players?section=inbox");
    expect(await screen.findByText(/^Cy cancelled/)).toBeTruthy();
    expect(screen.getByText("No reason given")).toBeTruthy();
    expect(screen.queryByText(/Nothing waiting/)).toBeNull();
  });
});

describe("Players: My people", () => {
  it("shows a buddy who is also a partner once, with what you've done together and who sees what", async () => {
    const { sb } = fakeSb({ profile: { ...me }, requests: [buddySession({ other_player_id: "q", other_name: "Quinn" })],
      links: [link({})], players: [{ ...ben, player_id: "q", display_name: "Quinn" }],
      sessions: [{ id: "m1", title: "Doubles with Quinn", session_date: "2026-10-25", buddy_request_id: "s1" },
        { id: "m2", title: "Solo drills", session_date: "2026-10-28", buddy_request_id: null }],
      shares: [{ session_id: "m1", partner_id: "q" }] });
    show(sb);
    const people = await screen.findByRole("list", { name: "My people" });
    expect(within(people).getAllByRole("heading", { name: "Quinn" })).toHaveLength(1);
    expect(within(people).getByText("Partner")).toBeTruthy();
    const stats = within(people).getByLabelText("You and Quinn");
    expect(within(stats).getByText("Games together").nextSibling?.textContent).toBe("1");
    expect(within(stats).getByText("You asked them").nextSibling?.textContent).toBe("1");
    expect(within(stats).getByText("They asked you").nextSibling?.textContent).toBe("0");
    expect(within(people).getByText(/sees only the sessions you share/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Who sees what" })).toBeTruthy();
    // The past buddy session was logged: a link to it, no second "Log this session", no cancelling the past.
    expect(within(people).getByRole("link", { name: /Logged: Doubles with Quinn/ }).getAttribute("href")).toBe("#/sessions/m1");
    expect(within(people).queryByRole("link", { name: /Log this session/ })).toBeNull();
    expect(within(people).queryByRole("button", { name: "Cancel buddy session" })).toBeNull();
    // Ask for feedback: pick one of your sessions, which opens its Ask sheet for Quinn.
    fireEvent.click(within(people).getByRole("button", { name: "Ask for feedback" }));
    const pick = within(people).getByRole("list", { name: "Ask Quinn about" });
    expect(within(pick).getAllByRole("link").map((a) => a.getAttribute("href")))
      .toEqual(["#/sessions/m2?tab=plan&ask=q", "#/sessions/m1?tab=plan&ask=q"]);
  });

  it("invites a buddy to be a partner from their card, and cancels a buddy session with a reason", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, requests: [buddySession({ slots: [{ date: "2099-01-10", start: "08:00", end: "10:00" }] })] });
    show(sb);
    const people = await screen.findByRole("list", { name: "My people" });
    expect(within(people).getByText(/sees your Buddy listing only/)).toBeTruthy();
    expect(within(people).getByText(/not on the Buddy list right now/)).toBeTruthy();
    fireEvent.click(within(people).getByRole("button", { name: "Invite as partner" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("invite_buddy_as_partner", { p_player: "c" }));
    expect(await screen.findByText(/Partner invite sent to Cy/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel buddy session" }));
    fireEvent.click(screen.getByRole("button", { name: "Bad weather" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel session" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("cancel_buddy_session", { p_request_id: "s1", p_reason: "Bad weather" }));
    expect(await screen.findByText(/No one yet/)).toBeTruthy();
  });

  it("asks before unlinking a partner", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, links: [link({})] });
    show(sb);
    fireEvent.click(await screen.findByRole("button", { name: "Unlink partner" }));
    expect(screen.getByText(/hidden from both\s+of you right away/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep partner" }));
    expect(rpc).not.toHaveBeenCalledWith("end_partnership", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Unlink partner" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Unlink Quinn" })).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("end_partnership", { p_id: "l1" }));
    expect(await screen.findByText("You unlinked Quinn.")).toBeTruthy();
  });

  it("creates an invite code and links with one, explaining a wrong code", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me } });
    show(sb, "/players?section=people");
    expect(await screen.findByText(/No one yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create an invite code" }));
    const codes = await screen.findByRole("list", { name: "Your unused invite codes" });
    expect(within(codes).getByText("K7P4-QX9M")).toBeTruthy();
    const input = screen.getByLabelText("Have a code?");
    fireEvent.change(input, { target: { value: "zzzz-zzzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByText("This code is not valid or has expired; ask for a new one")).toBeTruthy();
    fireEvent.change(input, { target: { value: "abcd-efgh" } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("redeem_partner_code", { p_code: "ABCDEFGH" }));
    expect(await screen.findByText("Linked. You are now partners.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "My people" })).getByText("Rex")).toBeTruthy();
  });
});

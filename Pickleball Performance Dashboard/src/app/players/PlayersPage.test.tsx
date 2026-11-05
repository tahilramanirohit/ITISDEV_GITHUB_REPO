import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import PlayersPage from "./PlayersPage";

afterEach(cleanup);

type Row = Record<string, unknown>;
type Fake = {
  profile: Row; players?: Row[]; requests?: Row[]; details?: Row[]; listing?: Row;
  links?: Row[]; shared?: Row[]; sessions?: Row[]; shares?: Row[]; peerRatings?: Row[];
  /** The buddy list (upgrade 12); leave out to test a database before that update. */
  buddies?: Row[];
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
  chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok, bad);
  return chain;
}

function fakeSb(state: Fake) {
  state.links ??= []; state.shared ??= []; state.requests ??= []; state.players ??= [];
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    switch (fn) {
      case "buddy_players": return { data: state.players, error: null };
      case "my_buddy_requests": return { data: state.requests, error: null };
      case "my_partners": return { data: state.links, error: null };
      case "my_buddies": return state.buddies ? { data: state.buddies, error: null } : { data: null, error: { message: "Could not find the function public.my_buddies" } };
      case "add_buddy":
        state.buddies = [...state.buddies!, { id: `add-${args?.p_player}`, status: "pending", direction: "sent", other_id: args?.p_player,
          other_name: "Ben", other_level: "novice", created_at: "", responded_at: null }];
        return { data: "x", error: null };
      case "respond_buddy":
        state.buddies = state.buddies!.map((b) => b.id === args?.p_id ? { ...b, status: args?.p_accept ? "active" : "declined" } : b)
          .filter((b) => b.status !== "declined");
        return { data: null, error: null };
      case "remove_buddy":
        state.buddies = state.buddies!.filter((b) => b.other_id !== args?.p_player);
        state.requests = state.requests!.filter((q) => q.other_player_id !== args?.p_player);
        return { data: null, error: null };
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
    if (table === "peer_ratings") return rows(state.peerRatings ?? []);
    return rows([]); // injury_periods: not injured
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, update };
}

const buddy = (id: string, name: string, extra: Row = {}): Row => ({ id: `bl-${id}`, status: "active", direction: "sent", other_id: id,
  other_name: name, other_level: "novice", created_at: "2026-10-01T00:00:00Z", responded_at: "2026-10-02T00:00:00Z", ...extra });
const me = { id: "me", display_name: "Kim", self_level: "Novice", is_adult_confirmed: true, buddy_visible: true };
const show = (sb: SupabaseClient, path = "/players") => render(<MemoryRouter initialEntries={[path]}><PlayersPage sb={sb} userId="me" /></MemoryRouter>);

describe("Players: Find", () => {
  it("lets a player say what they look for, filters by purpose and suggests close matches", async () => {
    const players = [ben, { ...ben, player_id: "c", display_name: "Cy", level: "advanced" }];
    const { sb, update, rpc } = fakeSb({ profile: { ...me, buddy_looking_for: [] }, players,
      details: [{ player_id: "b", looking_for: ["practice"], game_rating: 2.5, strong_skills: [] },
        { player_id: "c", looking_for: ["competition"], game_rating: 4.5, strong_skills: ["dinking"] }],
      listing: { game_rating: 2.5, strong_skills: [] }, buddies: [] });
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
    // Adding a suggested player sends a buddy request (no game yet); they then leave the suggestions.
    fireEvent.click(within(suggested).getByRole("button", { name: "Add Ben as a buddy" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_buddy", { p_player: "b" }));
    expect(await screen.findByText(/Buddy request sent to Ben/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Filter by purpose" })).getByRole("button", { name: "All purposes" }));
    expect(within(screen.getByRole("list", { name: "Available players" })).getByText("Buddy request sent")).toBeTruthy();
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

  it("lists available players by closeness to your level, filters by level, and adds or accepts buddies", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, players: [
      { ...ben, player_id: "a", display_name: "Ana", level: "advanced", usual_format: "doubles" }, ben],
      buddies: [buddy("a", "Ana", { status: "pending", direction: "received", responded_at: null })] });
    show(sb, "/players?section=find");
    const list = await screen.findByRole("list", { name: "Available players" });
    expect(within(list).getAllByText(/^(Ana|Ben)$/).map((n) => n.textContent)).toEqual(["Ben", "Ana"]);
    expect(within(list).getByText("Advanced · usually doubles")).toBeTruthy();
    expect(within(list).queryByRole("button", { name: "Buddy up" })).toBeNull(); // asking to play happens from My partners
    fireEvent.click(within(list).getByRole("button", { name: "Accept buddy" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_buddy", { p_id: "bl-a", p_accept: true }));
    fireEvent.click(within(screen.getByRole("list", { name: "Available players" })).getByRole("button", { name: "Add buddy" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_buddy", { p_player: "b" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(within(screen.getByRole("list", { name: "Available players" })).queryByText("Ben")).toBeNull();
  });

  it("before the buddy-list update, still offers Buddy up with the full request", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, players: [ben] });
    show(sb, "/players?section=find");
    fireEvent.click(await screen.findByRole("button", { name: "Buddy up" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    expect(await screen.findByText("Choose a purpose.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Casual game" }));
    fireEvent.click(screen.getByRole("button", { name: "Doubles" }));
    fireEvent.change(screen.getByLabelText("City"), { target: { value: " Makati " } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Ayala Triangle courts" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Ben" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("send_buddy_request", expect.objectContaining({
      p_to: "b", p_purpose: "casual_game", p_format: "doubles", p_city: "Makati", p_location: "Ayala Triangle courts" })));
  });
});

describe("Players: answers and shared sessions", () => {
  it("opens on My partners when someone is waiting for an answer, and accepts a buddy request", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, requests: [buddySession({ id: "r1", direction: "incoming", status: "pending",
      purpose: "practice", play_format: "singles", responded_at: null })] });
    show(sb);
    expect(await screen.findByText("Wants to play with you (1)")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "My partners (1)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Practice / drills")).toBeTruthy();
    expect(screen.getByText("Capitol Commons court 2, Pasig")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_buddy_request", { p_request_id: "r1", p_accept: true }));
  });

  it("accepts a buddy request from My partners", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, buddies: [buddy("j", "Jun", { status: "pending", direction: "received", responded_at: null })] });
    show(sb);
    expect(await screen.findByText("Wants to be your buddy (1)")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "My partners (1)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_buddy", { p_id: "bl-j", p_accept: true }));
    expect(await screen.findByText("You and Jun are buddies.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "My partners" })).getByRole("heading", { name: "Jun" })).toBeTruthy();
  });

  it("accepts a video partner invite, and counts feedback asked of you on the Shared tab", async () => {
    const shared = { session_id: "x1", owner_id: "q", owner_name: "Quinn", title: "Sunday doubles", session_date: "2026-10-18",
      session_context: "casual_match", play_format: "doubles", has_report: true, my_notes: 0, shared_at: "", focus_skills: ["dinking"], my_ratings: 0 };
    const { sb, rpc } = fakeSb({ profile: { ...me }, shared: [shared],
      links: [link({}), link({ id: "i1", status: "pending", direction: "received", other_id: "r", other_name: "Rex", linked_at: null })] });
    show(sb);
    expect(await screen.findByText("Wants to be your video partner (1)")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Shared (1)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_partner_invite", { p_id: "i1", p_accept: true }));
    expect(await screen.findByText("You and Rex are now video partners.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Shared (1)" }));
    const due = screen.getByRole("list", { name: "Feedback asked of you" });
    expect(within(due).getByRole("link", { name: "Quinn: Sunday doubles" }).getAttribute("href")).toBe("#/shared/x1");
    expect(within(due).getByText("Rate and send feedback")).toBeTruthy();
  });

  it("shows a shared session to both players: the partner opens the shared report, the owner their own video", async () => {
    // Rohit's side: he shared "videotest" with Carla, with the video, asking about dinking; she rated it.
    const { sb } = fakeSb({ profile: { ...me }, links: [link({ other_id: "carla", other_name: "Carla" })],
      sessions: [{ id: "v1", title: "videotest", session_date: "2026-11-04" }],
      shares: [{ session_id: "v1", partner_id: "carla", focus_skills: ["dinking"], with_video: true }],
      peerRatings: [{ session_id: "v1", author_id: "carla" }] });
    show(sb, "/players?section=shared");
    const mine = await screen.findByRole("list", { name: "Sessions you shared" });
    const card = within(mine).getByRole("link", { name: "You shared videotest with Carla" });
    expect(card.getAttribute("href")).toBe("#/sessions/v1?tab=video");
    expect(within(card).getByText(/Carla sent feedback/)).toBeTruthy();
    cleanup();

    // Carla's side: the same session under "Shared with you" (already rated), opening Rohit's report and video.
    const { sb: carla } = fakeSb({ profile: { ...me, display_name: "Carla" }, links: [link({ other_id: "rohit", other_name: "Rohit" })],
      shared: [{ session_id: "v1", owner_id: "rohit", owner_name: "Rohit", title: "videotest", session_date: "2026-11-04",
        session_context: "practice", play_format: "doubles", has_report: true, my_notes: 0, shared_at: "", focus_skills: ["dinking"], my_ratings: 1, with_video: true }] });
    show(carla, "/players?section=shared");
    const theirs = await screen.findByRole("list", { name: "Sessions shared with you" });
    expect(within(theirs).getByRole("link", { name: "Rohit: videotest" }).getAttribute("href")).toBe("#/shared/v1");
    expect(within(theirs).getByText(/with video/)).toBeTruthy();
  });

  it("shows when the other player cancelled, with or without a reason", async () => {
    const { sb } = fakeSb({ profile: { ...me }, requests: [
      buddySession({ status: "called_off", cancelled_by_me: false, cancel_reason: null, cancelled_at: "2026-10-24T09:00:00Z" })] });
    show(sb, "/players?section=partners");
    expect(await screen.findByText(/^Cy cancelled/)).toBeTruthy();
    expect(screen.getByText("No reason given")).toBeTruthy();
  });
});

describe("Players: My partners", () => {
  it("shows a buddy who is also a partner once, with what you've done together and who sees what", async () => {
    const { sb } = fakeSb({ profile: { ...me }, requests: [buddySession({ other_player_id: "q", other_name: "Quinn" })],
      links: [link({})], players: [{ ...ben, player_id: "q", display_name: "Quinn" }],
      sessions: [{ id: "m1", title: "Doubles with Quinn", session_date: "2026-10-25", buddy_request_id: "s1" },
        { id: "m2", title: "Solo drills", session_date: "2026-10-28", buddy_request_id: null }],
      shares: [{ session_id: "m1", partner_id: "q" }] });
    show(sb);
    const people = await screen.findByRole("list", { name: "My partners" });
    expect(within(people).getAllByRole("heading", { name: "Quinn" })).toHaveLength(1);
    expect(within(people).getByText("Video partner")).toBeTruthy();
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

  it("asks a buddy to play (even while hidden from the list), partners for video feedback, cancels a session and removes the buddy", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, buddies: [buddy("c", "Cy")],
      requests: [buddySession({ slots: [{ date: "2099-01-10", start: "08:00", end: "10:00" }] })] });
    show(sb);
    const people = await screen.findByRole("list", { name: "My partners" });
    expect(within(people).getByText(/buddies since/)).toBeTruthy();
    expect(within(people).getByText(/sees your Buddy listing only/)).toBeTruthy();
    // Cy is not listed in Find, but buddies can still ask each other to play.
    fireEvent.click(within(people).getByRole("button", { name: "Ask to play" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Cy" }));
    expect(await screen.findByText("Choose a purpose.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Practice / drills" }));
    fireEvent.click(screen.getByRole("button", { name: "Singles" }));
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Pasig" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Court 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Cy" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("send_buddy_request", expect.objectContaining({ p_to: "c", p_purpose: "practice" })));

    fireEvent.click(within(screen.getByRole("list", { name: "My partners" })).getByRole("button", { name: "Partner for video feedback" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("invite_buddy_as_partner", { p_player: "c" }));
    expect(await screen.findByText(/Video partner invite sent to Cy/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel buddy session" }));
    fireEvent.click(screen.getByRole("button", { name: "Bad weather" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel session" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("cancel_buddy_session", { p_request_id: "s1", p_reason: "Bad weather" }));

    fireEvent.click(await screen.findByRole("button", { name: "Remove buddy" }));
    expect(screen.getByText(/Requests still waiting are withdrawn/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Remove Cy" })).getByRole("button", { name: "Remove buddy" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("remove_buddy", { p_player: "c" }));
    expect(await screen.findByText(/No buddies yet/)).toBeTruthy();
  });

  it("asks before ending a video partnership", async () => {
    const { sb, rpc } = fakeSb({ profile: { ...me }, links: [link({})] });
    show(sb);
    fireEvent.click(await screen.findByRole("button", { name: "Stop video partnership" }));
    expect(screen.getByText(/hidden from both\s+of you right away/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep partner" }));
    expect(rpc).not.toHaveBeenCalledWith("end_partnership", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Stop video partnership" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Unlink Quinn" })).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("end_partnership", { p_id: "l1" }));
    expect(await screen.findByText("You unlinked Quinn.")).toBeTruthy();
  });

  it("has no partner codes: video partners come from buddies, and the steps are explained", async () => {
    const { sb } = fakeSb({ profile: { ...me } });
    show(sb, "/players?section=partners");
    expect(await screen.findByText(/No buddies yet. Add players as buddies under Find/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create an invite code" })).toBeNull();
    const how = screen.getByRole("region", { name: "Who sees what" });
    expect(within(how).getByText(/1\. Buddy/)).toBeTruthy();
    expect(within(how).getByText(/2\. Video partner/)).toBeTruthy();
  });
});

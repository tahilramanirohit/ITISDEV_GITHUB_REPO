import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import PartnersPage from "./PartnersPage";

afterEach(cleanup);

type Link = Record<string, unknown>;
const link = (extra: Link): Link => ({ id: "l1", status: "active", direction: "sent", other_id: "q", other_name: "Quinn",
  other_level: "advanced", invite_code: null, created_at: "2026-10-20T00:00:00Z", expires_at: "2026-10-27T00:00:00Z",
  linked_at: "2026-10-21T00:00:00Z", ...extra });

function fakeSb(state: { links: Link[]; shared: Link[] }) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "my_partners") return { data: state.links, error: null };
    if (fn === "shared_with_me") return { data: state.shared, error: null };
    if (fn === "create_partner_invite") {
      const row = link({ id: "c1", status: "pending", other_id: null, other_name: null, other_level: null, invite_code: "K7P4QX9M", linked_at: null });
      state.links = [...state.links, row];
      return { data: [{ id: "c1", invite_code: "K7P4QX9M", expires_at: "2026-10-29T00:00:00Z" }], error: null };
    }
    if (fn === "redeem_partner_code") {
      if (args?.p_code !== "ABCDEFGH") return { data: null, error: { message: "partners: this code is not valid or has expired; ask for a new one" } };
      state.links = [...state.links, link({ id: "l2", other_id: "r", other_name: "Rex", direction: "received" })];
      return { data: "l2", error: null };
    }
    if (fn === "respond_partner_invite" || fn === "end_partnership") {
      state.links = state.links.map((l) => l.id === args?.p_id ? { ...l, status: fn === "end_partnership" ? "ended" : "active" } : l)
        .filter((l) => l.status !== "ended");
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  });
  return { sb: { rpc } as unknown as SupabaseClient, rpc };
}

describe("Partners", () => {
  it("creates an invite code to send", async () => {
    const { sb } = fakeSb({ links: [], shared: [] });
    render(<PartnersPage sb={sb} userId="me" />);
    expect(await screen.findByText(/No partners yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create an invite code" }));
    const codes = await screen.findByRole("list", { name: "Your unused invite codes" });
    expect(within(codes).getByText("K7P4-QX9M")).toBeTruthy();
    expect(within(codes).getByText(/works once/)).toBeTruthy();
  });

  it("links with a code someone sent, and explains a wrong code", async () => {
    const { sb, rpc } = fakeSb({ links: [], shared: [] });
    render(<PartnersPage sb={sb} userId="me" />);
    const input = await screen.findByLabelText("Have a code?");
    fireEvent.change(input, { target: { value: "zzzz-zzzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByText("This code is not valid or has expired; ask for a new one")).toBeTruthy();
    fireEvent.change(input, { target: { value: "abcd-efgh" } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("redeem_partner_code", { p_code: "ABCDEFGH" }));
    expect(await screen.findByText("Linked. You are now partners.")).toBeTruthy();
    expect(screen.getByText("Rex")).toBeTruthy();
  });

  it("accepts an invite from a buddy", async () => {
    const { sb, rpc } = fakeSb({ links: [link({ id: "i1", status: "pending", direction: "received", other_name: "Rex", linked_at: null })], shared: [] });
    render(<PartnersPage sb={sb} userId="me" />);
    expect(await screen.findByText("Wants to be your partner (1)")).toBeTruthy();
    expect(screen.getByText("1 new")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_partner_invite", { p_id: "i1", p_accept: true }));
    expect(await screen.findByText("You and Rex are now partners.")).toBeTruthy();
  });

  it("asks before unlinking and says what happens to shared sessions", async () => {
    const { sb, rpc } = fakeSb({ links: [link({})], shared: [] });
    render(<PartnersPage sb={sb} userId="me" />);
    fireEvent.click(await screen.findByRole("button", { name: "Unlink" }));
    expect(screen.getByText(/hidden from both\s+of you right away/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep partner" }));
    expect(rpc).not.toHaveBeenCalledWith("end_partnership", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Unlink Quinn" })).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("end_partnership", { p_id: "l1" }));
    expect(await screen.findByText("You unlinked Quinn.")).toBeTruthy();
  });

  it("lists sessions partners shared, linking to each report", async () => {
    const { sb } = fakeSb({ links: [link({})], shared: [{ session_id: "s1", owner_id: "q", owner_name: "Quinn", title: "Sunday doubles",
      session_date: "2026-10-18", session_context: "casual_match", play_format: "doubles", has_report: true, my_notes: 2, shared_at: "" }] });
    render(<PartnersPage sb={sb} userId="me" />);
    fireEvent.click(await screen.findByRole("tab", { name: /Shared with you/ }));
    const item = screen.getByRole("link", { name: "Quinn: Sunday doubles" });
    expect(item.getAttribute("href")).toBe("#/shared/s1");
    expect(within(item).getByText("2 notes from you")).toBeTruthy();
  });
});

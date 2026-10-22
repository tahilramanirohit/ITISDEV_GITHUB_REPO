import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PeerNotes } from "./PeerNotes";
import { ShareCard } from "./ShareCard";

afterEach(cleanup);

const note = (extra: Record<string, unknown> = {}) => ({ id: "n1", author_id: "q", author_name: "Quinn", mine: false, video_time_s: "42.50",
  body: "You stayed back after the return.", created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z", ...extra });

function fakeSb(notes: Record<string, unknown>[]) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "session_peer_notes") return { data: notes, error: null };
    if (fn === "add_peer_note") {
      notes.push(note({ id: "n2", mine: true, author_name: "Rex", video_time_s: args?.p_video_time_s, body: args?.p_body }));
      return { data: "n2", error: null };
    }
    if (fn === "delete_peer_note") { notes.splice(notes.findIndex((n) => n.id === args?.p_id), 1); return { data: null, error: null }; }
    return { data: null, error: { message: `unexpected ${fn}` } };
  });
  return { sb: { rpc } as unknown as SupabaseClient, rpc };
}

describe("Peer notes", () => {
  it("lets a partner pin a note at the paused moment of the video", async () => {
    const { sb, rpc } = fakeSb([]);
    const video = document.createElement("video");
    Object.defineProperty(video, "currentTime", { value: 65.3, writable: true });
    render(<PeerNotes sb={sb} sessionId="s1" mode="partner" ownerName="Pia" controls={{ video, seek: vi.fn() }} />);
    expect(await screen.findByText(/Pia sees your notes in their report/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: " Step in on the third shot " } });
    fireEvent.click(screen.getByRole("button", { name: "Add note at 1:05" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_peer_note", { p_session_id: "s1", p_video_time_s: 65.3, p_body: "Step in on the third shot" }));
    expect(await screen.findByText("Step in on the third shot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("shows the owner every note, jumps to its moment, and deletes after confirming", async () => {
    const { sb, rpc } = fakeSb([note()]);
    const seek = vi.fn();
    render(<PeerNotes sb={sb} sessionId="s1" mode="owner" controls={{ video: document.createElement("video"), seek }} />);
    expect(await screen.findByText("Partner notes (1)")).toBeTruthy();
    expect(screen.getByText("Quinn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull(); // owners cannot edit a partner's words
    fireEvent.click(screen.getByRole("button", { name: "Watch at 0:42" }));
    expect(seek).toHaveBeenCalledWith(42.5);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this note?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("delete_peer_note", { p_id: "n1" }));
  });

  it("stays hidden on the owner's report when there are no notes", async () => {
    const { sb, rpc } = fakeSb([]);
    const { container } = render(<PeerNotes sb={sb} sessionId="s1" mode="owner" controls={{ video: null, seek: vi.fn() }} />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("Share card", () => {
  it("shares a session with a chosen partner and can stop sharing", async () => {
    const shares: string[] = [];
    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "my_partners") return { data: [{ id: "l1", status: "active", direction: "sent", other_id: "q", other_name: "Quinn" }], error: null };
      if (fn === "share_session") { shares.push(String(args?.p_partner_id)); return { data: null, error: null }; }
      if (fn === "unshare_session") { shares.splice(0); return { data: null, error: null }; }
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    const from = vi.fn(() => ({ select: () => ({ eq: async () => ({ data: shares.map((partner_id) => ({ partner_id })), error: null }) }) }));
    render(<ShareCard sb={{ rpc, from } as unknown as SupabaseClient} sessionId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Share with Quinn" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("share_session", { p_session_id: "s1", p_partner_id: "q" }));
    expect(await screen.findByText(/Shared with 1 partner/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing with Quinn" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("unshare_session", { p_session_id: "s1", p_partner_id: "q" }));
  });
});

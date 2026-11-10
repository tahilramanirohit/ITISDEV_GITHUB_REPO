import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PeerNotes } from "./PeerNotes";

afterEach(cleanup);

const note = (extra: Record<string, unknown> = {}) => ({ id: "n1", author_id: "q", author_name: "Quinn", mine: false, video_time_s: "42.50",
  body: "You stayed back after the return.", created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z", ...extra });

function fakeSb(notes: Record<string, unknown>[], shares: Record<string, unknown>[] = []) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "session_peer_notes") return { data: notes, error: null };
    if (fn === "add_peer_note") {
      notes.push(note({ id: "n2", mine: true, author_name: "Rex", video_time_s: args?.p_video_time_s, body: args?.p_body }));
      return { data: "n2", error: null };
    }
    if (fn === "delete_peer_note") { notes.splice(notes.findIndex((n) => n.id === args?.p_id), 1); return { data: null, error: null }; }
    return { data: null, error: { message: `unexpected ${fn}` } };
  });
  const from = () => ({ select: () => ({ eq: async () => ({ data: shares, error: null }) }) });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc };
}

describe("Peer notes", () => {
  it("lets a partner pin a comment at the paused second of the video", async () => {
    const { sb, rpc } = fakeSb([]);
    const video = document.createElement("video");
    Object.defineProperty(video, "currentTime", { value: 65.3, writable: true });
    render(<PeerNotes sb={sb} sessionId="s1" mode="partner" ownerName="Pia" controls={{ video, seek: vi.fn() }} />);
    expect(await screen.findByText(/Pia and their partners on this video see every comment/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: " Step in on the third shot " } });
    fireEvent.click(screen.getByRole("button", { name: "Comment at 1:05" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_peer_note", { p_session_id: "s1", p_video_time_s: 65.3, p_body: "Step in on the third shot" }));
    expect(await screen.findByText("Step in on the third shot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("shows the owner every comment, jumps to its second, and deletes after confirming", async () => {
    const { sb, rpc } = fakeSb([note()]);
    const seek = vi.fn();
    render(<PeerNotes sb={sb} sessionId="s1" mode="owner" controls={{ video: document.createElement("video"), seek }} />);
    expect(await screen.findByText("Comments (1)")).toBeTruthy();
    expect(screen.getByText("Quinn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull(); // owners cannot edit a partner's words
    fireEvent.click(screen.getByRole("button", { name: "Watch at 0:42" }));
    expect(seek).toHaveBeenCalledWith(42.5);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this comment?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("delete_peer_note", { p_id: "n1" }));
  });

  it("lets a partner tag a comment with a skill the owner asked about", async () => {
    const { sb, rpc } = fakeSb([]);
    render(<PeerNotes sb={sb} sessionId="s1" mode="partner" ownerName="Pia" controls={{ video: null, seek: vi.fn() }} skills={["dinking"]} />);
    fireEvent.change(await screen.findByLabelText("Comment"), { target: { value: "Paddle up" } });
    fireEvent.click(screen.getByRole("button", { name: "Dinking" }));
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_peer_note", { p_session_id: "s1", p_video_time_s: null, p_body: "Paddle up", p_skill: "dinking" }));
  });

  it("lets the owner comment on their shared video and edit their own comment", async () => {
    const { sb, rpc } = fakeSb([note()], [{ partner_id: "q" }]);
    const video = document.createElement("video");
    Object.defineProperty(video, "currentTime", { value: 43, writable: true });
    render(<PeerNotes sb={sb} sessionId="s1" mode="owner" controls={{ video, seek: vi.fn() }} />);
    expect(await screen.findByText(/You and the partners you shared it with see every comment/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "About which skill" })).toBeNull(); // owners do not tag
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "What should I have done here?" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment at 0:43" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_peer_note", { p_session_id: "s1", p_video_time_s: 43, p_body: "What should I have done here?" }));
    expect(await screen.findByText("What should I have done here?")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1); // only their own comment
  });

  it("shows the owner the comment box once the session is shared, even before any comment", async () => {
    const { sb } = fakeSb([], [{ partner_id: "q" }]);
    render(<PeerNotes sb={sb} sessionId="s1" mode="owner" controls={{ video: null, seek: vi.fn() }} />);
    expect(await screen.findByRole("button", { name: "Add comment" })).toBeTruthy();
    expect(screen.getByText("No comments yet.")).toBeTruthy();
  });

  it("stays hidden on the owner's report when the session is not shared and has no comments", async () => {
    const { sb, rpc } = fakeSb([]);
    const { container } = render(<PeerNotes sb={sb} sessionId="s1" mode="owner" controls={{ video: null, seek: vi.fn() }} />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

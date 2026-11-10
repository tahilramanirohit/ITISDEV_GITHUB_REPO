import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import SharedReportPage from "./SharedReportPage";

afterEach(cleanup);

function renderAt(rpc: ReturnType<typeof vi.fn>) {
  const sb = { rpc, storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "blob:x" }, error: null }) }) } };
  render(<MemoryRouter initialEntries={["/shared/s1"]}><Routes>
    <Route path="/shared/:sessionId" element={<SharedReportPage sb={sb as unknown as SupabaseClient} userId="me" />} />
  </Routes></MemoryRouter>);
}

describe("Shared report", () => {
  it("says who shared it and what stays private, and still takes notes without a video report", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "shared_report") return { data: { session: { id: "s1", title: "Sunday doubles", session_date: "2026-10-18",
        session_context: "casual_match", play_format: "doubles", owner_id: "p", owner_name: "Pia" }, result: null, video_path: null }, error: null };
      if (fn === "session_peer_notes") return { data: [], error: null };
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    renderAt(rpc);
    expect(await screen.findByRole("heading", { name: "Sunday doubles" })).toBeTruthy();
    expect(screen.getByText("Shared by Pia")).toBeTruthy();
    expect(screen.getByText(/Their goals, ratings and practice plan stay private/)).toBeTruthy();
    expect(screen.getByText(/There is no video for this session yet/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Add comment" })).toBeTruthy();
  });

  it("shows the shared video for comments even when there is no analysis report", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "shared_report") return { data: { session: { id: "s1", title: "Open play", session_date: "2026-10-18",
        session_context: "casual_match", play_format: "doubles", owner_id: "p", owner_name: "Pia" }, result: null,
        video_path: "p/s1/v.mp4", with_video: true }, error: null };
      if (fn === "session_peer_notes") return { data: [], error: null };
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    renderAt(rpc);
    expect(await screen.findByRole("heading", { name: "Watch Pia's video" })).toBeTruthy();
    expect(screen.queryByText(/There is no video/)).toBeNull();
    expect(await screen.findByRole("button", { name: /^Comment at 0:00$/ })).toBeTruthy();
  });

  it("shows what the owner asked about and sends ratings for those skills only", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "shared_report") return { data: { session: { id: "s1", title: "Wall drills", session_date: "2026-10-18",
        session_context: "practice", play_format: "wall_practice", owner_id: "p", owner_name: "Pia" }, result: null, video_path: null,
        focus_skills: ["dinking", "serve"], with_video: false, my_ratings: {} }, error: null };
      if (fn === "session_peer_notes" || fn === "rate_shared_skill") return { data: fn === "rate_shared_skill" ? null : [], error: null };
      return { data: null, error: { message: `unexpected ${fn}` } };
    });
    renderAt(rpc);
    expect(await screen.findByText(/Pia asked you to look at/)).toBeTruthy();
    expect(screen.getByText(/rate from what you saw when you played/)).toBeTruthy();
    expect(screen.getByText("How reliable and deep were Pia's serves?")).toBeTruthy();
    expect(screen.queryByText(/There is no video/)).toBeNull(); // ratings only: no video promised
    const dinking = screen.getByRole("slider", { name: /^Dinking rating/ });
    fireEvent.keyDown(dinking, { key: "ArrowRight" });
    fireEvent.keyDown(dinking, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback to Pia" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rate_shared_skill", { p_session_id: "s1", p_skill: "dinking", p_rating: 2 }));
    expect(rpc).not.toHaveBeenCalledWith("rate_shared_skill", expect.objectContaining({ p_skill: "serve" }));
  });

  it("explains when the session is no longer shared", async () => {
    renderAt(vi.fn(async () => ({ data: null, error: { message: "partners: this session is not shared with you" } })));
    expect(await screen.findByText("This session is not shared with you")).toBeTruthy();
  });
});

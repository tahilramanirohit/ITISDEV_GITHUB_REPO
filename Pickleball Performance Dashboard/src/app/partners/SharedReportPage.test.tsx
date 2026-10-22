import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/There is no video report for this session yet/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Add note" })).toBeTruthy();
  });

  it("explains when the session is no longer shared", async () => {
    renderAt(vi.fn(async () => ({ data: null, error: { message: "partners: this session is not shared with you" } })));
    expect(await screen.findByText("This session is not shared with you")).toBeTruthy();
  });
});

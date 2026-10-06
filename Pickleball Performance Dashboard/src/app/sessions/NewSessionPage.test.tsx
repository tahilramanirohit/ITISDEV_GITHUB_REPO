import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import NewSessionPage from "./NewSessionPage";

afterEach(cleanup);

function fakeSupabase(profile: Record<string, unknown> | null = null) {
  const inserts: { table: string; row: unknown }[] = [];
  const from = vi.fn((table: string) => {
    let pending: unknown = null;
    const q: any = {
      select: () => q, eq: () => q, in: () => q, delete: () => q,
      maybeSingle: async () => ({ data: table === "profiles" ? profile : null, error: null }),
      insert: (row: unknown) => { pending = row; inserts.push({ table, row }); return q; },
      single: async () => ({ data: { id: "new-session", ...(pending as object) }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    };
    return q;
  });
  return { sb: { from } as unknown as SupabaseClient, inserts };
}

function renderPage(sb: SupabaseClient) {
  render(<MemoryRouter initialEntries={["/new?mode=self"]}><Routes>
    <Route path="/new" element={<NewSessionPage sb={sb} userId="u1" />} />
    <Route path="/sessions/:id" element={<p>Opened session</p>} />
  </Routes></MemoryRouter>);
}

describe("NewSessionPage", () => {
  it("logs a tournament match with its result and named players", async () => {
    const { sb, inserts } = fakeSupabase();
    renderPage(sb);
    fireEvent.click(await screen.findByRole("button", { name: "Tournament" }));
    fireEvent.change(screen.getByLabelText("Tournament"), { target: { value: "Manila Open" } });
    fireEvent.click(screen.getByRole("button", { name: "Semifinal" }));
    fireEvent.click(screen.getByRole("button", { name: "Won" }));
    fireEvent.change(screen.getByLabelText("Score"), { target: { value: "11-7, 11-9" } });
    fireEvent.change(screen.getByLabelText("Partner name"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Opponent 1 name"), { target: { value: "Ben" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Shot outcomes" }));
    fireEvent.click(screen.getByRole("button", { name: "Start rating" }));

    expect(await screen.findByText("Opened session")).toBeTruthy();
    expect(inserts[0]).toMatchObject({ table: "sessions", row: {
      title: "Manila Open", session_context: "tournament", play_format: "doubles", review_mode: "self",
      tournament_name: "Manila Open", tournament_round: "Semifinal", match_result: "win", match_score: "11-7, 11-9",
    } });
    await waitFor(() => expect(inserts[1]).toMatchObject({ table: "session_participants", row: [
      { session_id: "new-session", role: "partner", display_name: "Ana" },
      { session_id: "new-session", role: "opponent", display_name: "Ben" },
    ] }));
  });

  it("starts from saved default settings and sends no tournament fields for solo practice", async () => {
    const { sb, inserts } = fakeSupabase({ id: "u1", main_goals: ["shot_technique"], default_session_kind: "solo", default_play_format: "ball_machine" });
    renderPage(sb);
    await waitFor(() => expect(screen.getByRole("button", { name: "Solo practice" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: "Ball machine" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Partner name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start rating" }));
    expect(await screen.findByText("Opened session")).toBeTruthy();
    const row = inserts[0].row as Record<string, unknown>;
    expect(row).toMatchObject({ play_format: "ball_machine", improvement_goals: ["shot_technique"] });
    expect("tournament_name" in row).toBe(false);
    expect(inserts).toHaveLength(1);
  });
});

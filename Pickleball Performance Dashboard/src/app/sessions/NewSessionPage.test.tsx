import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import NewSessionPage, { buddyPreset } from "./NewSessionPage";

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

function renderPage(sb: SupabaseClient, url = "/new?mode=self") {
  render(<MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/new" element={<NewSessionPage sb={sb} userId="u1" />} />
    <Route path="/sessions/:id" element={<p>Opened session</p>} />
  </Routes></MemoryRouter>);
}

describe("NewSessionPage", () => {
  it("logs a tournament match with its result and named players", async () => {
    const { sb, inserts } = fakeSupabase();
    renderPage(sb);
    fireEvent.click(await screen.findByRole("button", { name: /^Tournament/ }));
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
    await waitFor(() => expect(screen.getByRole("button", { name: /^Solo practice/ }).getAttribute("aria-pressed")).toBe("true"));
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

describe("logging a buddy session", () => {
  it("fills in the buddy, format and date from the Buddy link", async () => {
    const { sb } = fakeSupabase({ id: "u1", default_session_kind: "solo", default_play_format: "wall_practice" });
    renderPage(sb, "/new?mode=self&with=Kyle&date=2026-11-06&context=practice&format=doubles");
    expect(await screen.findByLabelText("Partner name")).toHaveProperty("value", "Kyle");
    // The saved defaults (solo practice) do not override the buddy session.
    await waitFor(() => expect(screen.getByLabelText("Partner name")).toHaveProperty("value", "Kyle"));
  });

  it("puts a singles buddy in as the opponent and ignores bad values", () => {
    expect(buddyPreset(new URLSearchParams("with=Mia&format=singles&date=nope&context=tournament")))
      .toEqual({ name: "Mia", format: "singles", date: undefined, context: undefined, requestId: undefined });
    // The buddy session's id links the logged session; anything else is ignored.
    expect(buddyPreset(new URLSearchParams("with=Mia&buddy=3f2b6c1e-8a4d-4b7e-9c1a-2d3e4f5a6b7c"))?.requestId).toBe("3f2b6c1e-8a4d-4b7e-9c1a-2d3e4f5a6b7c");
    expect(buddyPreset(new URLSearchParams("with=Mia&buddy=drop table"))?.requestId).toBeUndefined();
    expect(buddyPreset(new URLSearchParams("mode=self"))).toBeNull();
  });
});

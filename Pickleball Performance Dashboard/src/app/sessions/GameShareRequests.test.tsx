import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameShare } from "../../lib/api/gameShares";
import { GameShareRequests } from "./GameShareRequests";

afterEach(cleanup);

const request: GameShare = {
  id: "t1", session_id: "s1", status: "pending", owner_id: "kirk", owner_name: "Kirk Orino", title: "Saturday open play",
  session_date: "2026-11-07", session_context: "casual_match", play_format: "doubles", match_result: "win", match_score: "11-7",
  has_video: true, created_at: "2026-11-07T10:00:00Z",
};

describe("GameShareRequests", () => {
  it("adds the game and remembers 'always accept' for that buddy", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const onChanged = vi.fn();
    render(<GameShareRequests sb={{ rpc } as unknown as SupabaseClient} requests={[request]} onChanged={onChanged} />);
    expect(screen.getByText("Kirk shared a game with you")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Always accept games from Kirk"));
    fireEvent.click(screen.getByRole("button", { name: /Add game/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_game_tag", { p_id: "t1", p_accept: true, p_always: true }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("declines without trusting the buddy", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    render(<GameShareRequests sb={{ rpc } as unknown as SupabaseClient} requests={[request]} onChanged={() => {}} />);
    fireEvent.click(screen.getByLabelText("Always accept games from Kirk"));
    fireEvent.click(screen.getByRole("button", { name: /Decline/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_game_tag", { p_id: "t1", p_accept: false, p_always: false }));
  });

  it("shows nothing when no game is waiting", () => {
    const { container } = render(<GameShareRequests sb={{} as SupabaseClient} requests={[]} onChanged={() => {}} />);
    expect(container.textContent).toBe("");
  });
});

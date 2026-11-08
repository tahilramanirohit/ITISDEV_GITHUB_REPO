import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listGameShares, matchBuddy, tagBuddiesInGame } from "./gameShares";

const buddies = [
  { other_id: "r", other_name: "Rohit Ramani", status: "active" as const },
  { other_id: "k1", other_name: "Kyle Tan", status: "active" as const },
  { other_id: "k2", other_name: "Kyle Lim", status: "active" as const },
  { other_id: "p", other_name: "Paolo Cruz", status: "pending" as const },
];

describe("matchBuddy", () => {
  it("matches a full name or a first name only one buddy has, ignoring case and spaces", () => {
    expect(matchBuddy("rohit", buddies)).toEqual({ id: "r", name: "Rohit Ramani" });
    expect(matchBuddy("  ROHIT   ramani ", buddies)).toEqual({ id: "r", name: "Rohit Ramani" });
    expect(matchBuddy("Kyle Lim", buddies)).toEqual({ id: "k2", name: "Kyle Lim" });
  });
  it("doesn't guess when a first name is shared, the buddy isn't active, or nothing is typed", () => {
    expect(matchBuddy("Kyle", buddies)).toBeNull();
    expect(matchBuddy("Paolo", buddies)).toBeNull();
    expect(matchBuddy("", buddies)).toBeNull();
    expect(matchBuddy("Ana", buddies)).toBeNull();
  });
});

describe("game share calls", () => {
  it("sends the chosen buddies and skips the call when there are none", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const sb = { rpc } as unknown as SupabaseClient;
    expect(await tagBuddiesInGame(sb, "s1", [])).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(await tagBuddiesInGame(sb, "s1", ["r"])).toBe(1);
    expect(rpc).toHaveBeenCalledWith("tag_buddies_in_game", { p_session_id: "s1", p_players: ["r"] });
  });
  it("returns null instead of failing when the database doesn't have game shares yet", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "function does not exist" } }) } as unknown as SupabaseClient;
    expect(await listGameShares(sb)).toBeNull();
  });
});

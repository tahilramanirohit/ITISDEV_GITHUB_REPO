import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnalysisParamsForm, defaultPlayersOnCourt } from "./AnalysisStatus";

afterEach(cleanup);

describe("players on court", () => {
  it("starts from the session's format: 2 for singles, 4 otherwise", () => {
    expect(defaultPlayersOnCourt("singles")).toBe(2);
    expect(defaultPlayersOnCourt("doubles")).toBe(4);
    expect(defaultPlayersOnCourt(undefined)).toBe(4);
  });

  it("tells the analyzer the player count, even when the form is left untouched", () => {
    const onChange = vi.fn();
    render(<AnalysisParamsForm playFormat="singles" onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ players_on_court: 2 }), null);
    fireEvent.click(screen.getByRole("button", { name: "Doubles" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ players_on_court: 4 }), null);
  });

  it("leaves the count out where the upload card shows its own toggle", () => {
    const onChange = vi.fn();
    render(<AnalysisParamsForm playFormat="doubles" showPlayers={false} onChange={onChange} />);
    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty("players_on_court");
    expect(screen.queryByRole("button", { name: "Doubles" })).toBeNull();
  });
});

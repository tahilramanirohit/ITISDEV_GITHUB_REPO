import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GamePhases } from "./GamePhases";
import { ChecklistBar } from "../shell/ChecklistBar";

afterEach(cleanup);

describe("Game checklist", () => {
  it("shows how much of the game's checklist is done, and opens the next step", () => {
    const onOpen = vi.fn();
    render(<GamePhases current="in" done={{ pre: true, in: false, post: false }} onOpen={onOpen} />);
    const bar = screen.getByRole("progressbar", { name: "Game checklist" });
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("3");
    expect(bar.getAttribute("aria-valuetext")).toBe("1 of 3 done");
    expect(screen.getByRole("button", { name: /^Pre-game: Done/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next: Rate your game →" }));
    expect(onOpen).toHaveBeenCalledWith("in");
    fireEvent.click(screen.getByRole("button", { name: /^Post-game: To do/ }));
    expect(onOpen).toHaveBeenCalledWith("post");
  });

  it("says when everything is done", () => {
    render(<GamePhases current={null} done={{ pre: true, in: true, post: true }} onOpen={vi.fn()} />);
    expect(screen.getByText("All done. Nice game!")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Game checklist" }).getAttribute("aria-valuetext")).toBe("3 of 3 done");
  });

  it("a compact bar keeps a label for screen readers and its own count", () => {
    render(<ChecklistBar bare label="Skills rated" done={4} total={10} count="4 of 10 rated" />);
    const bar = screen.getByRole("progressbar", { name: "Skills rated" });
    expect(bar.getAttribute("aria-valuetext")).toBe("4 of 10 rated");
    expect(screen.getByText("4 of 10 rated")).toBeTruthy();
  });
});

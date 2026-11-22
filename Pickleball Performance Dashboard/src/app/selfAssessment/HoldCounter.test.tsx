import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { HoldCounter } from "./HoldRater";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Harness({ max = 20, outOf = 20 as number | null, start = 0 }) {
  const [v, setV] = useState(start);
  return <><HoldCounter label="Count serves" value={v} max={max} outOf={outOf} onChange={setV} /><output>{v}</output></>;
}
const ball = () => screen.getByRole("slider", { name: "Count serves" });
const shown = () => Number(screen.getByRole("status").textContent);

describe("HoldCounter (pickleball counter)", () => {
  it("a tap adds one, from where the count is", () => {
    render(<Harness start={4} />);
    fireEvent.pointerDown(ball()); fireEvent.pointerUp(ball());
    expect(shown()).toBe(5);
    expect(ball().getAttribute("aria-valuetext")).toBe("5 of 20");
  });

  it("holding counts up from the current count, faster the longer it is held, and never past the tries", () => {
    vi.useFakeTimers();
    render(<Harness start={3} />);
    fireEvent.pointerDown(ball());
    act(() => { vi.advanceTimersByTime(350); });  // first step after the tap window
    expect(ball().getAttribute("aria-valuenow")).toBe("4");
    act(() => { vi.advanceTimersByTime(260 * 4); }); // 4 more at the slow pace
    expect(ball().getAttribute("aria-valuenow")).toBe("8");
    act(() => { vi.advanceTimersByTime(140 * 10 + 70 * 20); }); // faster: hits the cap of 20
    expect(ball().getAttribute("aria-valuenow")).toBe("20");
    fireEvent.pointerUp(ball());
    expect(shown()).toBe(20);
  });

  it("works with the keyboard, within 0 and the cap", () => {
    render(<Harness max={200} outOf={null} start={0} />);
    fireEvent.keyDown(ball(), { key: "ArrowDown" });
    expect(shown()).toBe(0);
    fireEvent.keyDown(ball(), { key: "PageUp" });
    fireEvent.keyDown(ball(), { key: "ArrowUp" });
    expect(shown()).toBe(6);
    expect(ball().getAttribute("aria-valuetext")).toBe("6");
    fireEvent.keyDown(ball(), { key: "End" });
    expect(shown()).toBe(200);
  });
});

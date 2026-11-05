import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HashRouter } from "react-router";
import { AppShell } from "./AppShell";

afterEach(cleanup);

describe("navigation", () => {
  it("has one Players tab (buddies and partners) that shows how many answers are waiting", () => {
    render(<HashRouter><AppShell tabs badges={{ "#/players": 3 }}><p>content</p></AppShell></HashRouter>);
    const links = screen.getAllByRole("link", { name: /Players/ });
    expect(links.length).toBe(2); // the sidebar and the phone tab bar
    expect(links.every((l) => l.getAttribute("href") === "#/players")).toBe(true);
    expect(screen.getAllByText("3")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Players, 3 waiting" })).toBeTruthy(); // phone tab bar
    expect(screen.getAllByText(", 3 waiting").length).toBeGreaterThan(0); // sidebar
    expect(screen.queryByRole("link", { name: /^(Buddy|Partners)/ })).toBeNull();
  });

  it("hides the badge when nothing is waiting", () => {
    render(<HashRouter><AppShell tabs badges={{ "#/players": 0 }}><p>content</p></AppShell></HashRouter>);
    expect(screen.queryByText(/waiting/)).toBeNull();
  });
});

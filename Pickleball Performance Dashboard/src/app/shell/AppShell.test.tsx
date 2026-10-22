import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HashRouter } from "react-router";
import { AppShell } from "./AppShell";

afterEach(cleanup);

describe("navigation", () => {
  it("has a Buddy section that shows how many requests are waiting", () => {
    render(<HashRouter><AppShell tabs badges={{ "#/buddy": 2 }}><p>content</p></AppShell></HashRouter>);
    const links = screen.getAllByRole("link", { name: /Buddy/ });
    expect(links.length).toBe(2); // the sidebar and the phone tab bar
    expect(links.every((l) => l.getAttribute("href") === "#/buddy")).toBe(true);
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Buddy, 2 waiting" })).toBeTruthy(); // phone tab bar
    expect(screen.getAllByText(", 2 waiting").length).toBeGreaterThan(0); // sidebar
  });

  it("hides the badge when nothing is waiting", () => {
    render(<HashRouter><AppShell tabs badges={{ "#/buddy": 0 }}><p>content</p></AppShell></HashRouter>);
    expect(screen.queryByText(/waiting/)).toBeNull();
  });
});

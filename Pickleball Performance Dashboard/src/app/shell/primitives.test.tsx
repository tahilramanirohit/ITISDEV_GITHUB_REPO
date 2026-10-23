import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { PasswordInput, SegmentedTabs, tabPanelProps } from "./primitives";
import { STATE_LABELS, stateDescription } from "../../lib/analysis/state";

afterEach(cleanup);

function Tabs() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return <>
    <SegmentedTabs label="Views" idBase="t" value={value} onChange={setValue}
      tabs={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Gamma" }]} />
    <div {...tabPanelProps("t", value)}>Panel {value}</div>
  </>;
}

describe("SegmentedTabs", () => {
  it("follows the tabs pattern: one tab stop, arrow keys, linked panel", () => {
    render(<Tabs />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(alpha.id);
    expect(alpha.getAttribute("aria-controls")).toBe(screen.getByRole("tabpanel").id);

    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Beta" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel b");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tab", { name: "Gamma" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Alpha" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("video status wording", () => {
  it("does not promise a practice plan when an analysis finishes", () => {
    expect(STATE_LABELS.completed).toBe("Video review ready");
    expect(stateDescription("completed", null)).not.toMatch(/what to practice next/i);
    expect(stateDescription("not_uploaded", null)).toContain("fixed camera");
  });
});

describe("password field", () => {
  it("shows and hides the password", () => {
    render(<label>Password<PasswordInput defaultValue="secret12" /></label>);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });
});

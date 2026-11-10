import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PhoneViewToggle, markPhoneView } from "./PhoneView";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  document.documentElement.removeAttribute("data-phone-view");
});

describe("PhoneViewToggle", () => {
  it("opens the app in a phone frame and closes again", () => {
    window.history.replaceState(null, "", "/#/progress");
    render(<PhoneViewToggle />);
    fireEvent.click(screen.getByRole("button", { name: /phone view/i }));
    const frame = screen.getByTitle("PicklePro on a phone") as HTMLIFrameElement;
    expect(frame.src).toContain("?phone=1#/progress");
    fireEvent.click(screen.getByRole("button", { name: /back to desktop/i }));
    expect(screen.queryByTitle("PicklePro on a phone")).toBeNull();
  });

  it("hides itself inside the phone frame and marks the page", () => {
    window.history.replaceState(null, "", "/?phone=1#/");
    markPhoneView();
    expect(document.documentElement.hasAttribute("data-phone-view")).toBe(true);
    const { container } = render(<PhoneViewToggle />);
    expect(container.innerHTML).toBe("");
  });
});

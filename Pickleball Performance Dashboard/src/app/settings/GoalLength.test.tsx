import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoalLength } from "./GoalLength";

afterEach(cleanup);

function fakeSb(error: { message: string } | null = null) {
  const eq = vi.fn(async () => ({ error }));
  const update = vi.fn(() => ({ eq }));
  return { sb: { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient, update };
}

describe("GoalLength", () => {
  it("saves a quick choice or any number of weeks", async () => {
    const { sb, update } = fakeSb();
    render(<GoalLength sb={sb} userId="me" weeks={4} />);
    expect(screen.getByRole("button", { name: "4 weeks" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "2 weeks" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ goal_weeks: 2 }));
    expect(await screen.findByText("Saved. Your goals now run 2 weeks.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Weeks"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/from 1 to 52/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Weeks"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ goal_weeks: 6 }));
  });

  it("names the database update when the column is missing", async () => {
    const { sb } = fakeSb({ message: "Could not find the 'goal_weeks' column of 'profiles' in the schema cache" });
    render(<GoalLength sb={sb} userId="me" weeks={4} />);
    fireEvent.click(screen.getByRole("button", { name: "1 week" }));
    expect(await screen.findByText(/pickleproapp_upgrade_13\.sql/)).toBeTruthy();
  });
});

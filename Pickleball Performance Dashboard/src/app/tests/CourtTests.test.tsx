import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CourtTests } from "./CourtTests";

afterEach(cleanup);

function fakeSb(rows: Record<string, unknown>[] = []) {
  const insert = vi.fn(async (values: Record<string, unknown>[]) => {
    rows.push(...values.map((v, i) => ({ id: `n${i}`, created_at: "2026-11-05T10:00:00Z", ...v })));
    return { error: null };
  });
  const order2 = { limit: async () => ({ data: rows, error: null }) };
  const from = vi.fn(() => ({ select: () => ({ order: () => ({ order: () => order2 }) }), insert }));
  return { sb: { from } as unknown as SupabaseClient, insert };
}

describe("Court tests", () => {
  it("counts a test with the big counter and saves it as the baseline", async () => {
    const { sb, insert } = fakeSb();
    const onSaved = vi.fn();
    render(<CourtTests sb={sb} onSaved={onSaved} />);
    const save = await screen.findByRole("button", { name: "Save baseline · 0 of 5 tests" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    const more = screen.getByRole("button", { name: "One more: Deep serves" });
    for (let i = 0; i < 3; i++) fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "One less: Deep serves" }));
    expect((screen.getByLabelText("Deep serves: deep serves out of 20") as HTMLInputElement).value).toBe("2");
    fireEvent.change(screen.getByLabelText("Deep serves: deep serves out of 20"), { target: { value: "25" } });
    expect((screen.getByLabelText("Deep serves: deep serves out of 20") as HTMLInputElement).value).toBe("20"); // never above the tries
    fireEvent.change(screen.getByLabelText("Deep serves: deep serves out of 20"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Done · next test" }));
    // The next test opens; a zero result still counts once marked done.
    expect(screen.getByLabelText("Dinks in a row: dinks in your best run")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done · next test" }));
    fireEvent.click(screen.getByRole("button", { name: "Save baseline · 2 of 5 tests" }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ test_key: "deep_serves", value: 13, out_of: 20 }),
      expect.objectContaining({ test_key: "dinks_in_a_row", value: 0, out_of: null }),
    ]));
    expect(onSaved).toHaveBeenCalledWith(2);
    expect(await screen.findByText(/Saved 2 tests/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save results · 0 of 5 tests" })).toBeTruthy(); // the next save is a re-test
  });

  it("shows the last result of each test and lets a test be left out", async () => {
    const { sb } = fakeSb([{ id: "a", test_key: "deep_returns", value: 4, out_of: 10, tested_on: "2026-10-03", created_at: "2026-10-03T10:00:00Z" }]);
    render(<CourtTests sb={sb} />);
    expect(await screen.findByText(/Last 4\/10 · /)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "One more: Deep serves" }));
    expect(screen.getByRole("button", { name: "Save results · 1 of 5 tests" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Leave out" }));
    expect(screen.getByRole("button", { name: "Save results · 0 of 5 tests" })).toBeTruthy();
  });

  it("offers Skip for now in onboarding and names the database update when the table is missing", async () => {
    const from = vi.fn(() => ({ select: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: null,
      error: { message: "relation \"public.baseline_tests\" does not exist" } }) }) }) }) }));
    const onSkip = vi.fn();
    render(<CourtTests sb={{ from } as unknown as SupabaseClient} onSkip={onSkip} />);
    expect(await screen.findByText(/pickleproapp_upgrade_8\.sql/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onSkip).toHaveBeenCalled();
  });
});

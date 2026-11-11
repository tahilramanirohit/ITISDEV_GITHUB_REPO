import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecoveryCard } from "./RecoveryCard";

afterEach(cleanup);

const injury = { id: "i1", body_area: "knee" as const, note: null, started_on: "2026-11-01", ended_on: null };

describe("RecoveryCard", () => {
  it("shows the recovery plan and what is paused, and turning the switch off ends it", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const changed = vi.fn();
    render(<RecoveryCard sb={{ rpc } as unknown as SupabaseClient} injury={injury} onChanged={changed} />);
    const toggle = screen.getByRole("switch", { name: "Recovery mode" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Since Nov 1 · Knee/)).toBeTruthy();
    expect(screen.getByText("Goals paused")).toBeTruthy();
    expect(screen.getByText("Hidden from Buddy")).toBeTruthy();
    expect(screen.queryByText(/injur/i)).toBeNull();
    expect(screen.getByRole("list", { name: "Recovery plan" })).toBeTruthy();
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Recovery mode" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("end_injury");
  });

  it("explains a missing database update instead of failing silently", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "Could not find the function public.end_injury without parameters in the schema cache" } });
    render(<RecoveryCard sb={{ rpc } as unknown as SupabaseClient} injury={injury} onChanged={vi.fn()} showPlan={false} />);
    expect(screen.queryByRole("list", { name: "Recovery plan" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Recovery mode" }));
    expect(await screen.findByText(/pickleproapp_upgrade_11\.sql/)).toBeTruthy();
  });
});

describe("RecoveryEntry", () => {
  it("turns recovery mode on straight from the switch", async () => {
    const { RecoveryEntry } = await import("./RecoverySwitch");
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const changed = vi.fn();
    render(<RecoveryEntry sb={{ rpc } as unknown as SupabaseClient} onChanged={changed} />);
    const toggle = screen.getByRole("switch", { name: "Recovery mode" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("start_injury", { p_body_area: null, p_note: null });
  });
});

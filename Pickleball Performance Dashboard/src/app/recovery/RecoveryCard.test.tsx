import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecoveryCard } from "./RecoveryCard";

afterEach(cleanup);

const injury = { id: "i1", body_area: "knee" as const, note: null, started_on: "2026-11-01", ended_on: null };

describe("RecoveryCard", () => {
  it("shows the rest plan and what is paused, and \"I'm back\" ends the injury", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const changed = vi.fn();
    render(<RecoveryCard sb={{ rpc } as unknown as SupabaseClient} injury={injury} onChanged={changed} />);
    expect(screen.getByRole("heading", { name: "Recovery mode" })).toBeTruthy();
    expect(screen.getByText(/Knee/)).toBeTruthy();
    expect(screen.getByText(/goal deadlines are paused/i)).toBeTruthy();
    expect(screen.getByText(/hidden from the Buddy list/i)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Rest plan" })).toBeTruthy();
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /i'm back to playing/i }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("end_injury");
  });

  it("explains a missing database update instead of failing silently", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "Could not find the function public.end_injury without parameters in the schema cache" } });
    render(<RecoveryCard sb={{ rpc } as unknown as SupabaseClient} injury={injury} onChanged={vi.fn()} showPlan={false} />);
    expect(screen.queryByRole("list", { name: "Rest plan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /i'm back to playing/i }));
    expect(await screen.findByText(/pickleproapp_upgrade_11\.sql/)).toBeTruthy();
  });
});

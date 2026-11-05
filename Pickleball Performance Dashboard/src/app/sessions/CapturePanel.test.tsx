import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "../../lib/api/types";
import { loadCapture, saveCheckin, saveRecovery, saveReflection } from "../../lib/api/capture";
import { endInjury, startInjury } from "../../lib/api/injury";
import { CapturePanel } from "./CapturePanel";

vi.mock("../../lib/api/capture", () => ({
  loadCapture: vi.fn(), saveCheckin: vi.fn(), saveRecovery: vi.fn(), saveReflection: vi.fn(),
}));
vi.mock("../../lib/api/injury", () => ({ startInjury: vi.fn(), endInjury: vi.fn(), injuryErrorText: (e: Error) => e.message }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("CapturePanel", () => {
  it("guides players through three saved steps and keeps Back available", async () => {
    vi.mocked(loadCapture).mockResolvedValue({ participantId: "participant-1", checkin: null, recovery: null, reflection: null });
    vi.mocked(saveCheckin).mockResolvedValue();
    vi.mocked(saveRecovery).mockResolvedValue();
    vi.mocked(saveReflection).mockResolvedValue();
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const sb = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const session = { id: "session-1", actual_start_at: null } as SessionRow;

    render(<CapturePanel sb={sb} session={session} onSessionUpdated={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: /pre-game/i })).toBeTruthy();
    expect(screen.queryByLabelText("Exertion (1–10)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Session focus"), { target: { value: "Serve placement" } });
    fireEvent.click(screen.getByRole("button", { name: /save.*continue/i }));

    expect(await screen.findByRole("heading", { name: /post-game/i })).toBeTruthy();
    expect(saveCheckin).toHaveBeenCalledWith(sb, "participant-1", {
      warmup_done: null, sleep_hours: null, readiness: null, focus: "Serve placement",
    });
    expect(screen.queryByLabelText("Session focus")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByLabelText("Session focus")).toHaveProperty("value", "Serve placement");
    fireEvent.click(screen.getByRole("button", { name: /save.*continue/i }));
    await screen.findByRole("heading", { name: /post-game/i });
    fireEvent.click(screen.getByRole("button", { name: /save.*continue/i }));
    expect(await screen.findByRole("heading", { name: /reflection/i })).toBeTruthy();
    expect(saveRecovery).toHaveBeenCalledWith(sb, "participant-1", {
      exertion: null, soreness: null, cooldown_done: null,
    });
    fireEvent.change(screen.getByLabelText("What went well?"), { target: { value: "Better serves" } });
    fireEvent.click(screen.getByRole("button", { name: /save reflection/i }));
    await waitFor(() => expect(saveReflection).toHaveBeenCalledWith(sb, "participant-1", {
      went_well: "Better serves", change_next: null,
    }));
    expect(await screen.findByText(/reflection saved/i)).toBeTruthy();
  });

  it("starts at the first step when the player opens another session", async () => {
    vi.mocked(loadCapture).mockResolvedValue({ participantId: "participant-1", checkin: null, recovery: null, reflection: null });
    vi.mocked(saveCheckin).mockResolvedValue();
    const sb = { from: vi.fn() } as unknown as SupabaseClient;
    const first = { id: "session-1", actual_start_at: null } as SessionRow;
    const second = { id: "session-2", actual_start_at: null } as SessionRow;
    const view = render(<CapturePanel sb={sb} session={first} onSessionUpdated={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /save.*continue/i }));
    expect(await screen.findByRole("heading", { name: /post-game/i })).toBeTruthy();
    view.rerender(<CapturePanel sb={sb} session={second} onSessionUpdated={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: /pre-game/i })).toBeTruthy();
  });

  it("marks an injury in the post-game step, and unticking it ends recovery mode", async () => {
    vi.mocked(loadCapture).mockResolvedValue({ participantId: "participant-1", checkin: null, recovery: null, reflection: null });
    vi.mocked(saveRecovery).mockResolvedValue();
    vi.mocked(startInjury).mockResolvedValue();
    vi.mocked(endInjury).mockResolvedValue();
    const sb = { from: vi.fn() } as unknown as SupabaseClient;
    const session = { id: "session-1", actual_start_at: null } as SessionRow;
    const changed = vi.fn();
    const view = render(<CapturePanel sb={sb} session={session} onSessionUpdated={vi.fn()} step={1} injury={null} onInjuryChanged={changed} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /i'm injured right now/i }));
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Where (optional)"), { target: { value: "knee" } });
    fireEvent.change(screen.getByLabelText("Private note (optional)"), { target: { value: " Twisted it " } });
    fireEvent.click(screen.getByRole("button", { name: /save.*continue/i }));
    await waitFor(() => expect(startInjury).toHaveBeenCalledWith(sb, "knee", "Twisted it"));
    expect(changed).toHaveBeenCalledTimes(1);

    const open = { id: "i1", body_area: "knee" as const, note: "Twisted it", started_on: "2026-11-01", ended_on: null };
    // Saving moved on to the reflection step; open the post-game step again, now injured.
    view.unmount();
    render(<CapturePanel sb={sb} session={session} onSessionUpdated={vi.fn()} step={1} injury={open} onInjuryChanged={changed} />);
    const box = await screen.findByRole("checkbox", { name: /i'm injured right now/i });
    await waitFor(() => expect(box).toHaveProperty("checked", true));
    fireEvent.click(box);
    expect(screen.getByText(/ends recovery mode/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save.*continue/i }));
    await waitFor(() => expect(endInjury).toHaveBeenCalledWith(sb));
    expect(startInjury).toHaveBeenCalledTimes(1);
  });

  it("does not offer the injury option while the injury status is unknown", async () => {
    vi.mocked(loadCapture).mockResolvedValue({ participantId: "participant-1", checkin: null, recovery: null, reflection: null });
    render(<CapturePanel sb={{ from: vi.fn() } as unknown as SupabaseClient} session={{ id: "s", actual_start_at: null } as SessionRow}
      onSessionUpdated={vi.fn()} step={1} />);
    await screen.findByRole("heading", { name: /post-game/i });
    expect(screen.queryByRole("checkbox", { name: /injured/i })).toBeNull();
  });
});

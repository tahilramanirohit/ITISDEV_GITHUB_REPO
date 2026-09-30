import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "../../lib/api/types";
import { loadCapture, saveCheckin, saveRecovery, saveReflection } from "../../lib/api/capture";
import { CapturePanel } from "./CapturePanel";

vi.mock("../../lib/api/capture", () => ({
  loadCapture: vi.fn(), saveCheckin: vi.fn(), saveRecovery: vi.fn(), saveReflection: vi.fn(),
}));

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
    expect(await screen.findByRole("heading", { name: /before play/i })).toBeTruthy();
    expect(screen.queryByLabelText("Exertion (1–10)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Session focus"), { target: { value: "Serve placement" } });
    fireEvent.click(screen.getByRole("button", { name: /save.*continue/i }));

    expect(await screen.findByRole("heading", { name: /after play/i })).toBeTruthy();
    expect(saveCheckin).toHaveBeenCalledWith(sb, "participant-1", {
      warmup_done: null, sleep_hours: null, readiness: null, focus: "Serve placement",
    });
    expect(screen.queryByLabelText("Session focus")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByLabelText("Session focus")).toHaveProperty("value", "Serve placement");
    fireEvent.click(screen.getByRole("button", { name: /save.*continue/i }));
    await screen.findByRole("heading", { name: /after play/i });
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
    expect(await screen.findByRole("heading", { name: /after play/i })).toBeTruthy();
    view.rerender(<CapturePanel sb={sb} session={second} onSessionUpdated={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: /before play/i })).toBeTruthy();
  });
});

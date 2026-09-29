import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoOverlayPlayer } from "./VideoOverlayPlayer";

function fakeContext() {
  return {
    clearRect: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 35 })), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), ellipse: vi.fn(),
    font: "", strokeStyle: "", fillStyle: "", lineWidth: 0, globalAlpha: 1,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("VideoOverlayPlayer", () => {
  it("draws a saved detection at the matching playback timestamp", () => {
    let drawFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      drawFrame = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const strokeRect = vi.fn();
    const ctx = {
      clearRect: vi.fn(), strokeRect, fillRect: vi.fn(), fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 35 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

    const { container } = render(
      <VideoOverlayPlayer src="/demo.mp4" selectedTrackId={7}
        positions={[{ time_seconds: 6, players: [{ track_id: 7, bbox: [100, 80, 200, 300], confidence: null }] }]} />,
    );
    const video = container.querySelector("video")!;
    Object.defineProperties(video, {
      clientWidth: { value: 480 }, clientHeight: { value: 270 },
      videoWidth: { value: 960 }, videoHeight: { value: 540 },
      currentTime: { value: 6 },
    });

    act(() => drawFrame?.(0));
    expect(strokeRect).toHaveBeenCalledWith(50, 40, 50, 110);
  });

  it("draws the observed ball even when no player was detected", () => {
    let drawFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      drawFrame = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const { container } = render(<VideoOverlayPlayer src="/demo.mp4" positions={[]}
      ballPositions={[{ time_seconds: 2, bbox: [100, 80, 110, 90], confidence: 0.8 }]} />);
    const video = container.querySelector("video")!;
    Object.defineProperties(video, {
      clientWidth: { value: 480 }, clientHeight: { value: 270 },
      videoWidth: { value: 960 }, videoHeight: { value: 540 },
      currentTime: { value: 2 },
    });
    act(() => drawFrame?.(0));
    // Ball centre (105, 85) at half scale.
    expect(ctx.arc).toHaveBeenCalledWith(52.5, 42.5, expect.any(Number), 0, Math.PI * 2);
  });

  it("labels the selected player as You, draws court lines, and names the shot", () => {
    let drawFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      drawFrame = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const { container, getByText } = render(<VideoOverlayPlayer src="/demo.mp4"
      positions={[{ time_seconds: 6, players: [
        { track_id: 7, bbox: [100, 80, 200, 300], confidence: 0.9, selected: true },
        { track_id: 8, bbox: [400, 20, 440, 100], confidence: 0.9 },
      ] }]}
      courtLines={[{ time_seconds: 0, lines: [[130, 500, 830, 500]] }]}
      shots={[{
        time_seconds: 5.8, rally_index: 0, shot_number: 3, hitter_track_id: 7, hitter_side: "near", by_selected_player: true,
        hitter_court_m: [3, 1], shot_type: "drop", contact: "after_bounce", ground_speed_mps: 4, landing_court_m: null,
        landed_in: null, evidence: "soft shot",
      }]} />);
    const video = container.querySelector("video")!;
    Object.defineProperties(video, {
      clientWidth: { value: 480 }, clientHeight: { value: 270 },
      videoWidth: { value: 960 }, videoHeight: { value: 540 }, currentTime: { value: 6 },
    });
    act(() => drawFrame?.(0));
    const texts = ctx.fillText.mock.calls.map((call) => call[0]);
    expect(texts).toContain("You");
    expect(texts).toContain("Player");
    expect(texts).toContain("You: Drop?");
    expect(ctx.moveTo).toHaveBeenCalledWith(65, 250);
    expect(getByText("Court lines found")).toBeTruthy();
  });

  it("selects one observed player at the paused video time", () => {
    let drawFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      drawFrame = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 35 })),
    } as unknown as CanvasRenderingContext2D);
    const onSelectTrack = vi.fn();
    const { container } = render(<VideoOverlayPlayer src="/demo.mp4" onSelectTrack={onSelectTrack}
      positions={[{ time_seconds: 6, players: [{ track_id: 7, bbox: [100, 80, 200, 300], confidence: null }] }]} />);
    const video = container.querySelector("video")!;
    const canvas = container.querySelector("canvas")!;
    Object.defineProperties(video, {
      clientWidth: { value: 480 }, clientHeight: { value: 270 },
      videoWidth: { value: 960 }, videoHeight: { value: 540 }, currentTime: { value: 6 },
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 480, height: 270 } as DOMRect);
    act(() => drawFrame?.(0));
    fireEvent.click(canvas, { clientX: 75, clientY: 70 });
    expect(onSelectTrack).toHaveBeenCalledWith(7, 6);
  });
});

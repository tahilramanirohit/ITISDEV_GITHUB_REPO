import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LabelPage from "./LabelPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it("preserves saved coarse labels while recording hashing is pending", async () => {
  let finish!: (value: ArrayBuffer) => void;
  const digest = new Promise<ArrayBuffer>((resolve) => { finish = resolve; });
  vi.stubGlobal("crypto", { subtle: { digest: vi.fn(() => digest) } });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const file = new File(["test"], "recording.mp4", { type: "video/mp4" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
  const key = `picklepro:labels:${file.name}:${file.size}`;
  const saved = { labels: [{ id: "old", t: 18, player: 2, type: "drop", resolution_s: 1 }],
    meta: { video: file.name, labelled_by: "Human", original_fps: 29.93, notes: "", identity_scheme: "human" } };
  localStorage.setItem(key, JSON.stringify(saved));
  const { container } = render(<LabelPage />);
  fireEvent.change(container.querySelector('input[accept="video/*"]')!, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/Computing recording identity/)).toBeTruthy());
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(saved);
  finish(new Uint8Array(32).buffer);
  await waitFor(() => expect(screen.getByText(/Restored 1 labels/)).toBeTruthy());
  expect(JSON.parse(localStorage.getItem(key)!).labels[0].resolution_s).toBe(1);
  expect(JSON.parse(localStorage.getItem(key)!).meta.recording_sha256).toBe("0".repeat(64));
});

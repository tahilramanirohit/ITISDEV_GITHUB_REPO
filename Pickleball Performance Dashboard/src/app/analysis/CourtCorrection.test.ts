import { describe, expect, it } from "vitest";
import { previewServiceReachable } from "./CourtCorrection";

describe("court preview service", () => {
  it("is not used from an https page when it lives on localhost (phones, deployed site)", () => {
    expect(previewServiceReachable("https:", "http://localhost:8000")).toBe(false);
    expect(previewServiceReachable("https:", "http://127.0.0.1:8000")).toBe(false);
  });
  it("is used during local development", () => {
    expect(previewServiceReachable("http:", "http://localhost:8000")).toBe(true);
    expect(previewServiceReachable("https:", "https://court.example.org")).toBe(true);
  });
});

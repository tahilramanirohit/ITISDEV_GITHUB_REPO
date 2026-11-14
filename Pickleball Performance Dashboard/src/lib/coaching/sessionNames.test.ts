import { describe, expect, it } from "vitest";
import { autoSessionTitle, localDate, startTimeLabel } from "./sessionNames";

describe("automatic session names", () => {
  const sat = (h: number) => new Date(2026, 10, 14, h, 30);

  it("names a session from the day, time of day and kind", () => {
    expect(autoSessionTitle(sat(18), "match")).toBe("Saturday evening game");
    expect(autoSessionTitle(sat(9), "solo")).toBe("Saturday morning practice");
    expect(autoSessionTitle(sat(14), "tournament")).toBe("Saturday afternoon tournament");
  });

  it("uses the tournament's name when there is one", () => {
    expect(autoSessionTitle(sat(14), "tournament", " Manila Open ")).toBe("Manila Open");
  });

  it("uses the local date and shows the start time", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(startTimeLabel(new Date(2026, 10, 15, 18, 30).toISOString())).toBe("6:30 PM");
    expect(startTimeLabel(null)).toBeNull();
  });
});

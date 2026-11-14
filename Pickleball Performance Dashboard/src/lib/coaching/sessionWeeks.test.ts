import { describe, expect, it } from "vitest";
import { groupByWeek, weekLabel, weekRecord, weekStart } from "./sessionWeeks";

describe("sessions by week", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
  });

  it("names this week, last week, then date ranges", () => {
    expect(weekLabel("2026-11-09", "2026-11-12")).toBe("This week");
    expect(weekLabel("2026-11-02", "2026-11-12")).toBe("Last week");
    expect(weekLabel("2026-10-19", "2026-11-12")).toBe("Oct 19 – 25");
    expect(weekLabel("2026-10-26", "2026-11-12")).toBe("Oct 26 – Nov 1");
  });

  it("groups newest week first and counts each week's record", () => {
    const rows = [
      { date: "2026-11-12", practice: false, won: true },
      { date: "2026-11-11", practice: false, won: false },
      { date: "2026-11-10", practice: true, won: null },
      { date: "2026-11-04", practice: false, won: true },
    ];
    const weeks = groupByWeek(rows, (r) => r, "2026-11-12");
    expect(weeks.map((w) => [w.label, w.items.length, weekRecord(w)])).toEqual([
      ["This week", 3, "1–1 · 1 practice"],
      ["Last week", 1, "1–0"],
    ]);
  });
});

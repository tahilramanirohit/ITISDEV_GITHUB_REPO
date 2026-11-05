import { describe, expect, it } from "vitest";
import { INJURY_AREAS, INJURY_AREA_LABELS, daysInjured, openInjury, pausedDays, type InjuryPeriod } from "./injury";

const migrations = import.meta.glob<string>("../../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true });
const sql = Object.entries(migrations).find(([file]) => file.endsWith("_injury.sql"))?.[1] ?? "";

const period = (started_on: string, ended_on: string | null): InjuryPeriod => ({ id: started_on, body_area: null, note: null, started_on, ended_on });

describe("injury periods", () => {
  it("use the same body areas as the database", () => {
    expect(sql).not.toBe("");
    const keys = [...sql.match(/body_area in \(([^)]+)\)/)![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...INJURY_AREAS]);
    expect(Object.keys(INJURY_AREA_LABELS)).toEqual([...INJURY_AREAS]);
  });

  it("find the open injury", () => {
    expect(openInjury([period("2026-10-01", "2026-10-05")])).toBeNull();
    expect(openInjury([period("2026-10-01", "2026-10-05"), period("2026-11-01", null)])?.id).toBe("2026-11-01");
  });

  it("count the days injured since the baseline, once each", () => {
    const periods = [period("2026-09-20", "2026-10-03"), period("2026-10-02", "2026-10-06"), period("2026-11-01", null)];
    // From Oct 1: Oct 1-5 (5 days, the overlap counted once), then Nov 1-4 (still open on Nov 5).
    expect(pausedDays(periods, "2026-10-01T09:00:00Z", "2026-11-05")).toBe(9);
    expect(pausedDays(periods, null, "2026-11-05")).toBe(0);
    expect(pausedDays([period("2026-11-05", null)], "2026-10-01", "2026-11-05")).toBe(0);
    expect(daysInjured(period("2026-11-01", null), "2026-11-05")).toBe(4);
  });
});

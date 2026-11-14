/** Ticked-off practice plan steps, remembered on this device per session. */
export const planTicksKey = (sessionId: string) => `picklepro:plan-done:${sessionId}`;

export function readPlanTicks(sessionId: string): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(planTicksKey(sessionId)) ?? "[]");
    return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writePlanTicks(sessionId: string, ticks: string[]) {
  try { window.localStorage.setItem(planTicksKey(sessionId), JSON.stringify(ticks)); } catch { /* private window: keep for this visit */ }
}

export const EXPERIENCE = [
  { years: 0.1, number: "<3", unit: "months", label: "Less than 3 months", reply: "Got it. You're new, so we'll start with serving and keeping score." },
  { years: 0.4, number: "3–6", unit: "months", label: "3 to 6 months", reply: "Got it. You know the basics; we'll work on keeping the ball in." },
  { years: 0.8, number: "7–12", unit: "months", label: "7 to 12 months", reply: "7 to 12 months, got it. So you can keep the ball going, but still miss a lot. I'll plan for that." },
  { years: 1.5, number: "1–2", unit: "years", label: "1 to 2 years", reply: "Got it. You know the rules; we'll work on making fewer mistakes." },
  { years: 3, number: "2+", unit: "years, a long time", label: "More than 2 years", reply: "Got it. You've played a while; we'll work on winning more points." },
] as const;
export function nearestExperience(years: number | null | undefined) {
  if (years == null) return null;
  return EXPERIENCE.reduce((best, e) => Math.abs(e.years - years) < Math.abs(best.years - years) ? e : best).years;
}

/** The answer's words for display, e.g. "7 to 12 months", instead of the stored number. */
export function experienceLabel(years: number | null | undefined) {
  const nearest = nearestExperience(years);
  return nearest == null ? null : EXPERIENCE.find((e) => e.years === nearest)!.label;
}

import { expect, it } from "vitest";
import { needsConsent, DATA_CONSENT_VERSION, type PlayerProfile } from "./profile";
it("requires current dated consent, including existing profiles", () => {
  expect(needsConsent(null)).toBe(true);
  expect(needsConsent({} as PlayerProfile)).toBe(true);
  expect(needsConsent({ data_consent_version: DATA_CONSENT_VERSION } as PlayerProfile)).toBe(true);
  expect(needsConsent({ data_consent_version: DATA_CONSENT_VERSION, data_consent_at: "2026-11-08T00:00:00Z" } as PlayerProfile)).toBe(false);
});

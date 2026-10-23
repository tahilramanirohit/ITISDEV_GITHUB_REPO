import { UPLOAD_POLICY_VERSION } from "./capture";

// The storage upload policy and consent_records insert policy hardcode the
// consent version. If the app sends a different one, every upload is refused.
const migrations = import.meta.glob<string>("../../../../supabase/migrations/*.sql", {
  query: "?raw", import: "default", eager: true,
});

describe("upload consent version", () => {
  it("matches the version required by the latest migration", () => {
    const versions = Object.keys(migrations).sort().flatMap((file) =>
      [...migrations[file].matchAll(/policy_version = '([^']+)'/g)].map((m) => m[1]));
    expect(versions.length).toBeGreaterThan(0);
    expect(UPLOAD_POLICY_VERSION).toBe(versions[versions.length - 1]);
  });
});

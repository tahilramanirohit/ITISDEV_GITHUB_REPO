// Measured court tests: saved as new rows each time, so the history is kept.
// Private to the player (supabase/migrations/20261105090000_baseline_tests.sql).
import type { SupabaseClient } from "@supabase/supabase-js";
import { COURT_TEST_BY_KEY, type CourtTestKey, type CourtTestRow } from "../coaching/baselineTests";

export async function listCourtTests(sb: SupabaseClient): Promise<CourtTestRow[]> {
  const { data, error } = await sb.from("baseline_tests").select("id, test_key, value, out_of, tested_on, created_at")
    .order("tested_on").order("created_at").limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtTestRow[];
}

export async function saveCourtTests(sb: SupabaseClient, results: { key: CourtTestKey; value: number }[], testedOn: string): Promise<void> {
  if (!results.length) return;
  const { error } = await sb.from("baseline_tests").insert(results.map(({ key, value }) => ({
    test_key: key, value, out_of: COURT_TEST_BY_KEY[key].outOf, tested_on: testedOn,
  })));
  if (error) throw new Error(error.message);
}

/** Turns database errors into the messages shown on screen. */
export function courtTestErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/baseline_tests/.test(message) && /does not exist|schema cache|PGRST20[02]|42P01/i.test(message)) {
    return "Court tests need a database update. Run supabase/scripts/pickleproapp_upgrade_8.sql in the Supabase SQL Editor, then reload.";
  }
  if (/baseline_tests_date/.test(message)) return "That date is in the future. Check your device's date and try again.";
  if (/check constraint/.test(message)) return "One of the numbers is outside what that test allows. Check it and try again.";
  return message;
}

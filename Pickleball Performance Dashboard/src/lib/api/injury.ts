// "I'm injured": private injury periods (supabase/migrations/20261105120000_injury.sql).
// Starting and ending go through database functions, so the Buddy listing changes with them.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InjuryArea, InjuryPeriod } from "../coaching/injury";

export async function listInjuries(sb: SupabaseClient): Promise<InjuryPeriod[]> {
  const { data, error } = await sb.from("injury_periods").select("id, body_area, note, started_on, ended_on")
    .order("started_on").order("created_at").limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as InjuryPeriod[];
}

/** Marks the player injured (or updates the open injury) and hides them from Buddy. */
export async function startInjury(sb: SupabaseClient, area: InjuryArea | null, note: string | null): Promise<void> {
  const { error } = await sb.rpc("start_injury", { p_body_area: area, p_note: note?.trim() || null });
  if (error) throw new Error(error.message);
}

/** "I'm back": closes the open injury and lists the player on Buddy again if they were listed. */
export async function endInjury(sb: SupabaseClient): Promise<void> {
  const { error } = await sb.rpc("end_injury");
  if (error) throw new Error(error.message);
}

/** Turns database errors into the messages shown on screen. */
export function injuryErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/injury_periods|start_injury|end_injury/.test(message) && /does not exist|schema cache|could not find|PGRST20[02]|42P01|42883/i.test(message)) {
    return "The injury option needs a database update. Run supabase/scripts/pickleproapp_upgrade_11.sql in the Supabase SQL Editor, then reload.";
  }
  return message;
}

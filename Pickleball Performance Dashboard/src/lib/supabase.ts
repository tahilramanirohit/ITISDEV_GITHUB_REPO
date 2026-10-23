import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

// The browser only ever gets the public anon key; row-level security enforces
// per-user access. The service-role key lives in the worker's environment only.
export const supabase: SupabaseClient | null = config.supabase
  ? createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  return supabase;
}

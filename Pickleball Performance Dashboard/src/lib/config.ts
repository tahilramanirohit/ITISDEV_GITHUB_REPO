// Runtime configuration derived from Vite env vars. Pure so it can be tested
// with any env object.

export type AppConfig = {
  supabase: { url: string; anonKey: string } | null;
  /** Why `supabase` is null, in plain words; empty when it is configured. */
  supabaseProblems: string[];
  maxUploadBytes: number;
  cvBackendUrl: string;
  /** Sample-data dashboard. Never on in a production build unless explicitly enabled. */
  designPreviewEnabled: boolean;
  /** Synchronous FastAPI upload prototype (no accounts, no persistence). */
  localPrototypeEnabled: boolean;
  /**
   * "Dev mode" button on the sign-in screen: enter as a Supabase anonymous user
   * with generated mock sessions. Enabled in local development or explicitly
   * for a dedicated testing deployment.
   */
  devModeEnabled: boolean;
  /** Private, persistent-in-this-browser guest sessions with real uploads. */
  guestModeEnabled: boolean;
  /** Public sample site without an always-on analysis worker. */
  trialNoWorker: boolean;
  /** Where players ask about their data or deletion; shown on the privacy page when set. */
  contactEmail: string | null;
};

type EnvLike = Record<string, string | boolean | undefined>;

// This deployment stays on Supabase Free. Its global file limit is 50 decimal
// MB, so never accept 50 MiB (52,428,800 bytes) in the browser.
export const DEFAULT_MAX_UPLOAD_MB = 50;
export const FREE_MAX_UPLOAD_MB = 50;

/** The `role` inside a Supabase JWT key, if the key is one. */
function jwtRole(key: string): string | null {
  const part = key.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

/** Plain-language reasons the Supabase settings cannot be used. */
export function supabaseProblems(url: string, anonKey: string): string[] {
  const problems: string[] = [];
  if (!url) {
    problems.push("VITE_SUPABASE_URL is missing or empty.");
  } else if (!/^https?:\/\/[^\s<>]+$/.test(url) || url.includes("your-project")) {
    problems.push(`VITE_SUPABASE_URL is not a web address (it should look like https://abcdefghijkl.supabase.co).`);
  }
  if (!anonKey) {
    problems.push("VITE_SUPABASE_ANON_KEY is missing or empty.");
  } else if (anonKey.startsWith("sb_secret_") || jwtRole(anonKey) === "service_role") {
    // Anything in a VITE_ variable is sent to every visitor's browser.
    problems.push("VITE_SUPABASE_ANON_KEY holds the secret service-role key. Use the public anon key; the service-role key belongs only in server/.env.");
  }
  return problems;
}

export function getConfig(env: EnvLike): AppConfig {
  const url = String(env.VITE_SUPABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  const problems = supabaseProblems(url, anonKey);
  const dev = env.DEV === true || env.DEV === "true";
  const mb = Number(env.VITE_MAX_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB);
  const safeMb = Number.isFinite(mb) && mb > 0 ? Math.min(mb, FREE_MAX_UPLOAD_MB) : DEFAULT_MAX_UPLOAD_MB;
  return {
    supabase: problems.length === 0 ? { url: url.replace(/\/+$/, ""), anonKey } : null,
    supabaseProblems: problems,
    maxUploadBytes: Math.round(safeMb * 1_000_000),
    cvBackendUrl: String(env.VITE_CV_BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, ""),
    designPreviewEnabled: dev || env.VITE_ENABLE_DESIGN_PREVIEW === "true",
    localPrototypeEnabled: dev || env.VITE_ENABLE_LOCAL_PROTOTYPE === "true",
    devModeEnabled: dev || env.VITE_ENABLE_DEV_MODE === "true",
    guestModeEnabled: env.VITE_ENABLE_GUEST_MODE === "true",
    trialNoWorker: env.VITE_TRIAL_NO_WORKER === "true",
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.VITE_CONTACT_EMAIL ?? "").trim()) ? String(env.VITE_CONTACT_EMAIL).trim() : null,
  };
}

export const config: AppConfig = getConfig(import.meta.env as unknown as EnvLike);

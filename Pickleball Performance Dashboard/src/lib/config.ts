// Runtime configuration derived from Vite env vars. Pure so it can be tested
// with any env object.

export type AppConfig = {
  supabase: { url: string; anonKey: string } | null;
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
  /** Public sample site without an always-on analysis worker. */
  trialNoWorker: boolean;
};

type EnvLike = Record<string, string | boolean | undefined>;

// This deployment stays on Supabase Free. Its global file limit is 50 decimal
// MB, so never accept 50 MiB (52,428,800 bytes) in the browser.
export const DEFAULT_MAX_UPLOAD_MB = 50;
export const FREE_MAX_UPLOAD_MB = 50;

export function getConfig(env: EnvLike): AppConfig {
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const dev = env.DEV === true || env.DEV === "true";
  const mb = Number(env.VITE_MAX_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB);
  const safeMb = Number.isFinite(mb) && mb > 0 ? Math.min(mb, FREE_MAX_UPLOAD_MB) : DEFAULT_MAX_UPLOAD_MB;
  return {
    supabase: url && anonKey ? { url: url.replace(/\/+$/, ""), anonKey } : null,
    maxUploadBytes: Math.round(safeMb * 1_000_000),
    cvBackendUrl: String(env.VITE_CV_BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, ""),
    designPreviewEnabled: dev || env.VITE_ENABLE_DESIGN_PREVIEW === "true",
    localPrototypeEnabled: dev || env.VITE_ENABLE_LOCAL_PROTOTYPE === "true",
    devModeEnabled: dev || env.VITE_ENABLE_DEV_MODE === "true",
    trialNoWorker: env.VITE_TRIAL_NO_WORKER === "true",
  };
}

export const config: AppConfig = getConfig(import.meta.env as unknown as EnvLike);

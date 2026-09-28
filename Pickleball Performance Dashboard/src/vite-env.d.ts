/// <reference types="vite/client" />

// Only public values belong here: everything prefixed VITE_ is embedded in the
// browser bundle. Service-role keys and LLM API keys must never be VITE_ vars.
declare interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MAX_UPLOAD_MB?: string;
  readonly VITE_CV_BACKEND_URL?: string;
  readonly VITE_ENABLE_DESIGN_PREVIEW?: string;
  readonly VITE_ENABLE_LOCAL_PROTOTYPE?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_CV_BACKEND_URL?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

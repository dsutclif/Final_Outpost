/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_URL?: string;
  /** Level supply endpoint (default /api/progress on the same host; "off" disables reporting). */
  readonly VITE_PROGRESS_URL?: string;
}

/** Build id stamped by vite.config.ts (commit on Vercel, "local-<time>" elsewhere); undefined in tests. */
declare const __BUILD__: string;

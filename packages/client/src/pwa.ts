// Service worker registration with a deferred update. Workbox (generateSW, registerType
// "prompt") builds sw.js; a new worker installs in the background and waits. The app shows
// its release notes and activates it when the player taps Update (only on menus, never
// mid-level) by posting SKIP_WAITING, then reloads.
// Hand-rolled instead of virtual:pwa-register to avoid the workbox-window dependency.

/** dist/release.json, written by the build (vite.config.ts): what the waiting build brings. */
export interface ReleaseInfo {
  /** The new build's PROGRESS_EPOCH; a different one means the levels changed. */
  epoch: number;
  notes: string[];
}

/** The waiting build's release.json (never precached, so this is the new one), or null offline. */
async function fetchRelease(base: string): Promise<ReleaseInfo | null> {
  try {
    const r = await fetch(`${base}release.json`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<ReleaseInfo>;
    return typeof j.epoch === "number" ? { epoch: j.epoch, notes: Array.isArray(j.notes) ? j.notes.map(String) : [] } : null;
  } catch { return null; }
}

export interface UpdateHandle {
  /** True once a new version is installed and waiting. */
  readonly ready: boolean;
  /** Activate the waiting worker and reload. Returns false when nothing is waiting. */
  apply(): boolean;
}

export function setupPwa(onReady: (info: ReleaseInfo | null) => void): UpdateHandle {
  let waiting: ServiceWorker | null = null;
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (sw && import.meta.env.PROD) {
    const base = import.meta.env.BASE_URL;
    const mark = (w: ServiceWorker | null): void => {
      if (w && sw.controller && w !== waiting) { waiting = w; void fetchRelease(base).then(onReady); }
    };
    void sw.register(`${base}sw.js`, { scope: base }).then((reg) => {
      mark(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed") mark(w); });
      });
      // look for a new build when the app comes back to the foreground, and hourly
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update().catch(() => undefined); });
      setInterval(() => void reg.update().catch(() => undefined), 3_600_000);
    }).catch(() => undefined);
  }
  return {
    get ready() { return waiting !== null; },
    apply() {
      if (!waiting || !sw) return false;
      sw.addEventListener("controllerchange", () => location.reload(), { once: true });
      waiting.postMessage({ type: "SKIP_WAITING" });
      waiting = null;
      return true;
    },
  };
}

// Service worker registration with a deferred update. Workbox (generateSW, registerType
// "prompt") builds sw.js; a new worker installs in the background and waits. The app
// activates it only between levels (never mid-level) by posting SKIP_WAITING, then reloads.
// Hand-rolled instead of virtual:pwa-register to avoid the workbox-window dependency.

export interface UpdateHandle {
  /** True once a new version is installed and waiting. */
  readonly ready: boolean;
  /** Activate the waiting worker and reload. Returns false when nothing is waiting. */
  apply(): boolean;
}

export function setupPwa(onReady: () => void): UpdateHandle {
  let waiting: ServiceWorker | null = null;
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (sw && import.meta.env.PROD) {
    const base = import.meta.env.BASE_URL;
    const mark = (w: ServiceWorker | null): void => {
      if (w && sw.controller) { waiting = w; onReady(); }
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

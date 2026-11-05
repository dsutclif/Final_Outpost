/**
 * Download every rigged character GLB while the player is on the title or level select, so a
 * level opened later finds them in loadMeshy's cache and never shows the old code-built figures.
 * Runs once per app open, after first paint, at idle priority, and not at all when offline.
 * Dynamic import keeps three.js out of the first-load bundle.
 */
let started = false;

export function preloadCharacters(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const run = (): void => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    void import("@fo/render-3d/meshy")
      .then((m) => m.loadMeshy(undefined, new Set(m.meshyCharacters().map((e) => e.id))))
      .catch(() => undefined);
  };
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric.call(window, run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-700.css";
import "./style.css";
import { App } from "./app.js";
import { allLevels } from "./levels.js";
import { MirroredStore, createPlatform } from "./platform.js";
import { setupPwa, type ReleaseInfo } from "./pwa.js";
import { openSaves } from "./save.js";
import { TelemetryQueue } from "./telemetry.js";

/** Written just before a service-worker update reloads the page; read once on the next boot. */
const UPDATED_FLAG = "fo-updated";

function takeFlag(): boolean {
  try {
    const v = localStorage.getItem(UPDATED_FLAG);
    if (v) localStorage.removeItem(UPDATED_FLAG);
    return !!v;
  } catch { return false; }
}

/** Set when a launch-time update reload starts: a second one within this window is skipped so a failed swap cannot loop. */
const LAUNCH_APPLY_KEY = "fo-launch-apply";

async function boot(): Promise<void> {
  // N16: a new build that downloaded in the background is applied before anything paints, so the
  // returning player never sees the old title first. Only here at launch (no level can be running);
  // mid-level the Update now / Later prompt still rules.
  let app: App | null = null;
  let release: ReleaseInfo | null = null;
  const pwa = setupPwa((info) => { release = info; app?.offerUpdate(info); });
  await pwa.settled;
  if (pwa.ready) {
    let recent = false;
    try { recent = Date.now() - Number(sessionStorage.getItem(LAUNCH_APPLY_KEY) ?? 0) < 20_000; } catch { /* storage blocked */ }
    if (!recent) {
      try { sessionStorage.setItem(LAUNCH_APPLY_KEY, String(Date.now())); localStorage.setItem(UPDATED_FLAG, "1"); } catch { /* the toast is a nicety */ }
      if (pwa.apply()) { await new Promise((r) => setTimeout(r, 4000)); } // the page reloads on controllerchange; if it never does, boot on
    }
  }
  // world labels are drawn to canvas once, so the display face must be ready before the first level
  try { await document.fonts?.load('800 16px "Barlow Condensed"'); } catch { /* falls back to the system face */ }
  const root = document.getElementById("root");
  if (!root) throw new Error("no #root");
  const platform = await createPlatform();
  let store = await openSaves();
  if (platform.storage) {
    const mirrored = new MirroredStore(store, platform.storage);
    await mirrored.restore();
    store = mirrored;
  }
  const telemetry = new TelemetryQueue(store, import.meta.env.VITE_TELEMETRY_URL || undefined);
  // the waiting worker can be found before the app exists; the check after start() covers that
  // every pack under levels/packs that matches this engine/content version
  const packsBase = `${import.meta.env.BASE_URL}levels/packs`.replace(/\/{2,}/g, "/");
  const source = await allLevels(packsBase);
  app = new App(root, {
    source, store, telemetry, platform, justUpdated: takeFlag(),
    findLevels: () => allLevels(packsBase),
    applyUpdate: () => {
      if (!pwa.ready) return false;
      try { localStorage.setItem(UPDATED_FLAG, "1"); } catch { /* the toast is a nicety */ }
      return pwa.apply();
    },
  });
  await app.start();
  if (pwa.ready) app.offerUpdate(release);
  if (import.meta.env.DEV) {
    (window as unknown as { __fo: App }).__fo = app;
    void import("./dev/playtest.js").then((m) => m.installPlaytest(app!));
  }
}

void boot();

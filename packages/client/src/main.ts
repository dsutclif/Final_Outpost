import "./style.css";
import { App } from "./app.js";
import { allLevels } from "./levels.js";
import { MirroredStore, createPlatform } from "./platform.js";
import { setupPwa } from "./pwa.js";
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

async function boot(): Promise<void> {
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
  let app: App | null = null;
  const pwa = setupPwa(() => { if (app) app.updateReady = true; });
  // golden levels first, then every pack under levels/packs that matches this engine/content version
  const source = await allLevels(`${import.meta.env.BASE_URL}levels/packs`.replace(/\/{2,}/g, "/"));
  app = new App(root, {
    source, store, telemetry, platform, justUpdated: takeFlag(),
    applyUpdate: () => {
      if (!pwa.ready) return false;
      try { localStorage.setItem(UPDATED_FLAG, "1"); } catch { /* the toast is a nicety */ }
      return pwa.apply();
    },
  });
  await app.start();
  if (import.meta.env.DEV) {
    (window as unknown as { __fo: App }).__fo = app;
    void import("./dev/playtest.js").then((m) => m.installPlaytest(app!));
  }
}

void boot();

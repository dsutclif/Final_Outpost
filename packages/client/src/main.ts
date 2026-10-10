import "./style.css";
import { App } from "./app.js";
import { goldenLevelSource } from "./levels.js";
import { setupPwa } from "./pwa.js";
import { openSaves } from "./save.js";
import { TelemetryQueue } from "./telemetry.js";

async function boot(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) throw new Error("no #root");
  // dev-only asset lab; the branch is compiled out of production builds
  if (import.meta.env.DEV && location.hash.startsWith("#lab")) {
    window.addEventListener("hashchange", () => location.reload());
    const { mountLab } = await import("./dev/lab.js");
    await mountLab(root, goldenLevelSource());
    return;
  }
  const store = await openSaves();
  const telemetry = new TelemetryQueue(store, import.meta.env.VITE_TELEMETRY_URL || undefined);
  let app: App | null = null;
  const pwa = setupPwa(() => { if (app) app.updateReady = true; });
  app = new App(root, { source: goldenLevelSource(), store, telemetry, applyUpdate: () => pwa.apply() });
  await app.start();
  if (import.meta.env.DEV) {
    window.addEventListener("hashchange", () => { if (location.hash.startsWith("#lab")) location.reload(); });
    (window as unknown as { __fo: App }).__fo = app;
    void import("./dev/playtest.js").then((m) => m.installPlaytest(app!));
  }
}

void boot();

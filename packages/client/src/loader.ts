// First-launch "Preparing the outpost" screen: downloads everything for offline play (the service
// worker's precache, then the level data) with a real progress bar. Shown once per install; every
// later launch skips it (the worker is already in control). Plain DOM, no game state.
import type { UpdateHandle } from "./pwa.js";

/** Set once the install finished (or a worker was already in control); the screen never shows again. */
export const READY_KEY = "fo-offline-ready";

/** What the build says the install downloads (dist/precache.json, vite.config.ts). */
export interface PrecacheInfo { count: number; bytes: number; files: Record<string, number> }

/** A bar that has not moved for this long shows the stall message with Retry. */
export const STALL_MS = 15_000;
const POLL_MS = 400;
const LINE_MS = 4_500;

/** One line at a time under the bar: how the game works, plus a note from the commander. */
export const LINES: readonly string[] = [
  "Everything is saved on this device, so the outpost runs with no signal.",
  "Tap anything on the map to see its name and what it does.",
  "Keep the pads fed: a pad that runs dry stops the whole line.",
  "Commander's log: the ground here is dead, but the machines still answer.",
  "Heat builds fast. Watch the rail along the top edge.",
  "Commander's log: build slow, build sure. The dust gives no second chances.",
];

export function isFirstRun(): boolean {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !navigator.serviceWorker) return false;
  try {
    if (navigator.serviceWorker.controller) { localStorage.setItem(READY_KEY, "1"); return false; }
    return !localStorage.getItem(READY_KEY);
  } catch { return false; }
}

export async function fetchPrecacheInfo(base: string): Promise<PrecacheInfo | null> {
  try {
    const r = await fetch(`${base}precache.json`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<PrecacheInfo>;
    return typeof j.count === "number" && typeof j.bytes === "number" && j.files ? (j as PrecacheInfo) : null;
  } catch { return null; }
}

/** Path of a precache key relative to the app base, without the revision query. */
export function keyPath(url: string, base: string): string {
  let p = url;
  try { p = new URL(url).pathname; } catch { /* already a path */ }
  p = p.split("?")[0]!;
  return p.startsWith(base) ? p.slice(base.length) : p.replace(/^\//, "");
}

/** How much of the precache list is cached so far, by bytes (the bar) and files. */
export function progressOf(cachedKeys: readonly string[], info: PrecacheInfo, base: string): { files: number; bytes: number; frac: number } {
  const seen = new Set<string>();
  let bytes = 0;
  for (const k of cachedKeys) {
    const p = keyPath(k, base);
    if (seen.has(p) || !(p in info.files)) continue;
    seen.add(p);
    bytes += info.files[p]!;
  }
  return { files: seen.size, bytes, frac: info.bytes > 0 ? Math.min(1, bytes / info.bytes) : 0 };
}

/** True when the browser says the connection is a mobile network (Chrome on Android); unknown reads as not mobile. */
export function onMobileData(): boolean {
  const c = (navigator as unknown as { connection?: { type?: string } }).connection;
  return c?.type === "cellular";
}

/** Whole megabytes, rounded for display ("about 67 MB"). */
export const megabytes = (bytes: number): number => Math.max(1, Math.round(bytes / 1_000_000));

async function cachedKeys(): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  const out: string[] = [];
  for (const name of await caches.keys()) {
    if (!/precache/.test(name)) continue;
    const c = await caches.open(name);
    for (const r of await c.keys()) out.push(r.url);
  }
  return out;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Screen {
  set(frac: number, status: string): void;
  prompt(mb: number): Promise<"now" | "wifi">;
  problem(message: string): Promise<void>;
  clearProblem(): void;
  close(): void;
}

function openScreen(): Screen {
  const el = document.createElement("div");
  el.className = "firstrun";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Preparing the outpost");
  el.innerHTML = `<div class="fr-card">
    <h1>Preparing the outpost</h1>
    <div class="fr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
    <p class="fr-status" aria-live="polite">Starting…</p>
    <p class="fr-line"></p>
    <div class="fr-ask" hidden></div>
    <div class="fr-problem" hidden></div>
  </div>`;
  document.body.appendChild(el);
  const bar = el.querySelector<HTMLElement>(".fr-bar")!;
  const fill = bar.querySelector<HTMLElement>("i")!;
  const status = el.querySelector<HTMLElement>(".fr-status")!;
  const line = el.querySelector<HTMLElement>(".fr-line")!;
  const ask = el.querySelector<HTMLElement>(".fr-ask")!;
  const problem = el.querySelector<HTMLElement>(".fr-problem")!;
  let n = 0;
  const showLine = (): void => { line.textContent = LINES[n++ % LINES.length]!; };
  showLine();
  const timer = setInterval(showLine, LINE_MS);
  return {
    set(frac, text) {
      const pct = Math.round(frac * 100);
      fill.style.width = `${pct}%`;
      bar.setAttribute("aria-valuenow", String(pct));
      status.textContent = text;
    },
    prompt(mb) {
      return new Promise((done) => {
        ask.hidden = false;
        status.textContent = "You are on mobile data.";
        ask.innerHTML = `<button type="button" data-a="now">Download now</button><button type="button" data-a="wifi" class="alt">Wait for Wi-Fi (about ${mb} MB)</button>`;
        ask.addEventListener("click", (e) => {
          const a = (e.target as HTMLElement).closest("button")?.dataset.a;
          if (a === "now" || a === "wifi") { ask.hidden = true; done(a); }
        });
      });
    },
    problem(message) {
      return new Promise((done) => {
        problem.hidden = false;
        problem.innerHTML = `<p>${esc(message)}</p><button type="button" data-a="retry">Retry</button>`;
        problem.querySelector("button")!.addEventListener("click", () => { problem.hidden = true; done(); }, { once: true });
      });
    },
    clearProblem() { problem.hidden = true; },
    close() { clearInterval(timer); el.remove(); },
  };
}

export interface FirstRunDeps {
  pwa: UpdateHandle;
  base: string;
  /** Cache the level data once the worker is in (levels.ts prefetchLevels over the pack list). */
  levels: () => Promise<void>;
}

/**
 * Run the first-launch screen to the end, or hand off to the game. Resolves when the screen is gone:
 * downloaded, or the player chose to wait for Wi-Fi (the download then starts by itself on Wi-Fi).
 */
export async function runFirstRun({ pwa, base, levels }: FirstRunDeps): Promise<void> {
  const info = await fetchPrecacheInfo(base);
  if (!info) { void pwa.download(); return; } // nothing to measure (offline or no list): install quietly as before
  const mb = megabytes(info.bytes);
  const ui = openScreen();
  try {
    if (onMobileData()) {
      ui.set(0, "You are on mobile data.");
      if ((await ui.prompt(mb)) === "wifi") {
        ui.close();
        const c = (navigator as unknown as { connection?: EventTarget & { type?: string } }).connection;
        const start = (): void => { void pwa.download().then((ok) => { if (ok) { try { localStorage.setItem(READY_KEY, "1"); } catch { /* retried next launch */ } } }); };
        if (c) c.addEventListener("change", () => { if (!onMobileData()) start(); }, { once: false });
        return;
      }
    }
    let lastFrac = -1;
    let lastMove = Date.now();
    for (;;) {
      ui.clearProblem();
      let result: boolean | null = null;
      const attempt = pwa.download().then((ok) => { result = ok; });
      let stalled = false;
      while (result === null) {
        await Promise.race([attempt, new Promise((r) => setTimeout(r, POLL_MS))]);
        const p = progressOf(await cachedKeys(), info, base);
        if (p.frac > lastFrac) { lastFrac = p.frac; lastMove = Date.now(); }
        ui.set(p.frac, `${megabytes(p.bytes)} of ${mb} MB`);
        if (result === null && Date.now() - lastMove > STALL_MS) { stalled = true; break; }
      }
      if (result === true) break;
      const msg = stalled ? "The download has stalled. Check your connection, then retry." : "The download was interrupted. Your progress is kept; retry when you are back online.";
      await ui.problem(msg);
      lastMove = Date.now();
    }
    ui.set(1, "Saving the levels…");
    try { await levels(); } catch { /* the app tries the levels again on its own */ }
    try { localStorage.setItem(READY_KEY, "1"); } catch { /* the worker being in control marks it next launch */ }
    ui.set(1, "Ready");
  } finally {
    ui.close();
  }
}

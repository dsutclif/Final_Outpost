// Prints gzipped sizes of the build and fails it if the app shell exceeds the 300 kB budget.
// The shell is what the first load needs: index.html, the CSS, the manifest and every script
// index.html loads or modulepreloads. Lazy chunks (the three.js 3D renderer, native-only
// Capacitor plugins, dev tools) are listed apart; they load on demand.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const BUDGET = 300 * 1024;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const html = readFileSync(join(dist, "index.html"), "utf8");
// Strip the deploy base (BASE_PATH, e.g. /Final_Outpost/) so paths resolve inside dist.
const base = (process.env.BASE_PATH ?? "/").replace(/^\/|\/$/g, "");
const unbase = (p) => (base && p.startsWith(base + "/") ? p.slice(base.length + 1) : p);
const eager = new Set([...html.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((m) => unbase(m[1])));
let shell = 0, lazy = 0, sw = 0;
const rows = [];
for (const f of walk(dist)) {
  const rel = relative(dist, f).replace(/\\/g, "/");
  if (!/\.(js|css|html|webmanifest)$/.test(rel)) continue;
  const gz = gzipSync(readFileSync(f)).length;
  const kind = /^(sw|workbox-|registerSW)/.test(rel) ? "service worker" : rel === "privacy.html" ? "page" : /\.(html|webmanifest|css)$/.test(rel) || eager.has(rel) ? "shell" : "lazy";
  if (kind === "shell") shell += gz; else if (kind === "lazy") lazy += gz; else if (kind === "service worker") sw += gz;
  rows.push([rel, gz, kind]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [rel, gz, kind] of rows) console.log(`  ${(gz / 1024).toFixed(1).padStart(7)} kB gz  ${rel}  (${kind})`);
console.log(`app shell: ${(shell / 1024).toFixed(1)} kB gzipped (budget ${BUDGET / 1024} kB); lazy chunks: ${(lazy / 1024).toFixed(1)} kB; service worker: ${(sw / 1024).toFixed(1)} kB`);
if (shell > BUDGET) { console.error("app shell over budget"); process.exit(1); }

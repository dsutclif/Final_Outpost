// Prints the gzipped size of the app shell in dist (JS, CSS, HTML, manifest) and fails the
// build if it exceeds the 300 kB budget. Service-worker files and icons are listed apart.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const BUDGET = 300 * 1024;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let shell = 0, sw = 0;
const rows = [];
for (const f of walk(dist)) {
  const rel = relative(dist, f).replace(/\\/g, "/");
  const gz = gzipSync(readFileSync(f)).length;
  const isSw = /^(sw|workbox-|registerSW)/.test(rel);
  if (/\.(js|css|html|webmanifest)$/.test(rel)) { if (isSw) sw += gz; else shell += gz; rows.push([rel, gz, isSw]); }
}
rows.sort((a, b) => b[1] - a[1]);
for (const [rel, gz, isSw] of rows) console.log(`  ${(gz / 1024).toFixed(1).padStart(7)} kB gz  ${rel}${isSw ? "  (service worker)" : ""}`);
console.log(`app shell: ${(shell / 1024).toFixed(1)} kB gzipped (budget ${BUDGET / 1024} kB); service worker: ${(sw / 1024).toFixed(1)} kB`);
if (shell > BUDGET) { console.error("app shell over budget"); process.exit(1); }

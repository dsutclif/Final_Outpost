import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Manifest } from "../packages/content/src/index.js";
import { applyNightCadence } from "../packages/generator/src/index.js";

// Stamp generator.json nightEvery onto an already built pack (level number from the id, s1-L008 -> 8).
// Lighting is renderer only, so ratings and replays are unaffected.
// pnpm exec vite-node tools/night-pack.ts -- [levels/packs/s1]

const dir = resolve(process.argv.slice(2).filter((a) => a !== "--")[0] ?? "levels/packs/s1");
const pack = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8")) as { levels: { id: string; file: string }[] };
const night: string[] = [];
for (const e of pack.levels) {
  const n = Number(/-L(\d+)$/.exec(e.id)?.[1]);
  if (!Number.isFinite(n)) throw new Error(`no level number in ${e.id}`);
  const p = join(dir, e.file);
  const m = JSON.parse(readFileSync(p, "utf8")) as Manifest;
  applyNightCadence(m, n);
  writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  if (m.lighting === "night") night.push(e.id);
}
console.log(`night: ${night.join(" ")}`);

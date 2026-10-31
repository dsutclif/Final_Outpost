// pnpm levels:repin: after an engine or content version bump, pin the hand-made levels (levels/golden,
// levels/story) and the shipped pack (levels/packs/s1: pack.json and s1-L*) to the running versions.
// Only the two version strings change; each file keeps its format. For rule changes that leave generated
// levels' results alone: `pnpm levels:check` must stay clean afterwards.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const pinned: [string, (f: string) => boolean][] = [
  ["levels/golden", () => true],
  ["levels/story", () => true],
  ["levels/packs/s1", (f) => f === "pack.json" || f.startsWith("s1-L")],
];
for (const [dir, wanted] of pinned) {
  const d = join(root, dir);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json") && wanted(x))) {
    const p = join(d, f), text = readFileSync(p, "utf8");
    const out = text
      .replace(/("engineVersion"\s*:\s*)"[^"]*"/, `$1"${ENGINE_VERSION}"`)
      .replace(/("contentVersion"\s*:\s*)"[^"]*"/, `$1"${CONTENT_VERSION}"`);
    if (out !== text) { writeFileSync(p, out); n++; }
  }
}
console.log(`pinned ${n} level files to engine ${ENGINE_VERSION}, content ${CONTENT_VERSION}`);

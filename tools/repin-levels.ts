// pnpm levels:repin: after an engine or content version bump, pin the hand-made levels (levels/golden,
// levels/story) to the running versions. Only the two version strings change; each file keeps its format.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
for (const dir of ["levels/golden", "levels/story"]) {
  const d = join(root, dir);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json"))) {
    const p = join(d, f), text = readFileSync(p, "utf8");
    const out = text
      .replace(/("engineVersion"\s*:\s*)"[^"]*"/, `$1"${ENGINE_VERSION}"`)
      .replace(/("contentVersion"\s*:\s*)"[^"]*"/, `$1"${CONTENT_VERSION}"`);
    if (out !== text) { writeFileSync(p, out); n++; }
  }
}
console.log(`pinned ${n} hand-made levels to engine ${ENGINE_VERSION}, content ${CONTENT_VERSION}`);

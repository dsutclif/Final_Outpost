import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// pnpm levels:reset --yes
//
// Start the level supply over: deletes every generated pack (levels/packs/*), the failed-slot log
// (levels/dropped.json), and writes an empty levels/packs/index.json. The five
// story levels (levels/story) are untouched. The next progress report (or `pnpm levels:next --cleared 0`)
// rebuilds from level 6 with ids that match the in-game numbers. Commit the result to ship it.
// Saved progress is keyed by level id, so clear the game's save too if reused ids must not show as cleared.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packs = join(root, "levels", "packs");

if (!process.argv.includes("--yes")) {
  console.log("This deletes every generated level pack (levels/packs/*) and levels/dropped.json. Re-run with --yes.");
  process.exit(1);
}
for (const e of existsSync(packs) ? readdirSync(packs, { withFileTypes: true }) : []) {
  if (e.isDirectory()) rmSync(join(packs, e.name), { recursive: true, force: true });
}
writeFileSync(join(packs, "index.json"), JSON.stringify({ packs: [] }, null, 2) + "\n");
rmSync(join(root, "levels", "dropped.json"), { force: true });
console.log("levels reset: no packs; the next batch builds from level 6");

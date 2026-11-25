import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { traceStory, traceText } from "../packages/client/src/story/trace.js";

// pnpm story:trace <levelId> [--seed n]: play a story level headless through the real StoryDirector and sim
// (packages/client/src/story/trace.ts) and write the sequence timeline to docs/story-trace/<levelId>.txt.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--seed");
const si = args.indexOf("--seed");
if (!ids.length) { console.error("usage: pnpm story:trace <levelId...> [--seed n]"); process.exit(2); }
for (const id of ids) {
  const manifest = JSON.parse(readFileSync(join(root, "levels", "story", `${id}.json`), "utf8"));
  const t = await traceStory(id, manifest, { seed: si >= 0 ? Number(args[si + 1]) : 1 });
  const out = join(root, "docs", "story-trace", `${id}.txt`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, traceText(t));
  console.log(`${id}: ${t.won === null ? "did not end" : t.won ? "won" : "lost"}, ${t.rows.length} rows, ${t.failures.length} failures -> ${out}`);
  for (const f of t.failures) console.log(`  (${f.check}) t ${f.t.toFixed(1)} cue ${f.cue}: ${f.message}`);
}

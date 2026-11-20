import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { measure, score } from "../packages/rater/src/index.js";
import { GENERATOR_REFERENCE, GEN } from "../packages/generator/src/index.js";
import { levelsDirOf, loadPool, savePool } from "./level-pool.js";

// Re-rate every pool entry's saved level with the current reference (stuck-fixes): the entry's D is replaced, the old one goes to the TSV.
//   vite-node tools/rerate-pool.ts -- <pool.json> <out.tsv> [--write]
const [poolPath, tsv] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const write = process.argv.includes("--write");
const pool = loadPool(poolPath!);
const lines = ["id\tgoal\tfamily\told\tnew"];
let n = 0;
for (const e of pool.entries) {
  const m = JSON.parse(readFileSync(join(levelsDirOf(poolPath!), e.file), "utf8"));
  const ms = measure(m, { refSeeds: GEN.search.quickSeeds.ref, otherSeeds: GEN.search.quickSeeds.other });
  const r = score(ms, { reference: GENERATOR_REFERENCE });
  lines.push(`${e.id}\t${e.goalId}\t${e.family}\t${e.D}\t${r.D.toFixed(4)}`);
  e.D = Math.round(r.D * 1e4) / 1e4;
  if (++n % 25 === 0) console.log(`${n}/${pool.entries.length}`);
}
writeFileSync(tsv!, lines.join("\n") + "\n");
if (write) savePool(poolPath!, pool);

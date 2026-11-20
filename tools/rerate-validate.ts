import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { measure, score } from "../packages/rater/src/index.js";
import { GENERATOR_REFERENCE, GEN } from "../packages/generator/src/index.js";
import { runRows } from "../packages/generator/src/record.js";
import { DEFAULT_WEIGHTS, METRIC_NAMES } from "../packages/rater/src/index.js";
import { content } from "../packages/content/src/index.js";
import { rerate, z } from "./rerate-log.js";

// Exact re-rate of level files (bot replay with the build's full seeds) next to the log-based approximation.
//   vite-node tools/rerate-validate.ts -- <oldref.json> <levels dir> [from-to]
const [oldRefPath, dir] = process.argv.slice(2).filter((a) => a !== "--");
const oldRef = JSON.parse(readFileSync(oldRefPath!, "utf8"));
for (const f of readdirSync(dir!).filter((n) => /^s1-L\d+\.json$/.test(n)).sort()) {
  const m = JSON.parse(readFileSync(join(dir!, f), "utf8"));
  const t0 = Date.now();
  const ms = measure(m, { content, refSeeds: GEN.search.fullSeeds.ref, otherSeeds: GEN.search.fullSeeds.other });
  const newR = score(ms, { reference: GENERATOR_REFERENCE });
  const oldSum = METRIC_NAMES.reduce((a, k) => a + (DEFAULT_WEIGHTS.difficulty.w[k] ?? 0) * z(k, ms.metrics[k], m.goal.type, m.family, oldRef, "old"), DEFAULT_WEIGHTS.difficulty.bias);
  const oldR = { D: 1 / (1 + Math.exp(-oldSum)) };
  const approx = rerate({ runs: runRows(ms.runs), rating: { D: oldR.D } }, oldRef, GENERATOR_REFERENCE, m);
  console.log(`${f.slice(3, 7)} ${m.goal.type.padEnd(22)} oldD ${oldR.D.toFixed(3)} newD ${newR.D.toFixed(3)} approxNew ${approx?.Dnew.toFixed(3)} err ${(approx ? approx.Dnew - newR.D : NaN).toFixed(3)}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

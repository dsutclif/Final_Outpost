// outpost-ops#202: replay the wavefront placement trace of a level over many seeds and check the agreed rules.
//   npx vite-node tools/wavefront-trace-review.ts -- --level s1-L020 --seeds 20
import { reviewSeed } from "../packages/generator/src/wavefrontReview.js";
import { argOf, levelNumber, loadLevel } from "./wavefront-load.js";

const argv = process.argv.slice(2), level = argOf(argv, "--level", "s1-L020"), n = Number(argOf(argv, "--seeds", "20"));
const { input } = loadLevel(level);
let clean = 0, ruleBad = 0, padBad = 0;
for (let seed = 1; seed <= n; seed++) {
  const r = reviewSeed(input, seed);
  const ok = !r.rules.length && !r.pads.length;
  if (ok) clean++;
  ruleBad += r.rules.length; padBad += r.pads.length;
  const st = r.result.stats;
  console.log(`seed ${seed}: ${ok ? "ok" : "FAIL"} (${r.steps} steps, ${st.pushes} pushes, ${st.repairs} repairs)${r.rules.length || r.pads.length ? "" : ""}`);
  for (const v of r.rules) console.log(`  rule: ${v}`);
  for (const v of r.pads) console.log(`  pad: ${v}`);
}
const L = `Level ${levelNumber(level)}`;
console.log(ruleBad || padBad ? `${L}: ${clean}/${n} seeds clean; pad visibility problems: ${padBad}; rule violations: ${ruleBad}` : `${L}: ${n}/${n} seeds, every pad visible in its active window; rule violations: 0`);
process.exit(ruleBad || padBad ? 1 : 0);

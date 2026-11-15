// Generator layout rate over the first 60 sequenced requests: how many lay out on the first draw, how many within
// GEN.search.layoutTries draws, and how many finished layouts still hide a pad during its window (walls not counted).
//   pnpm vite-node tools/pad-gen-rate.ts -- [--n 60] [--p 0.3]
import { sequenceRange, closure } from "../packages/sequencer/src/index.js";
import { GEN, buildLevel, knobsFor, templateById } from "../packages/generator/src/index.js";
import { lifetimeVisibility, staticWindows, type Manifest } from "../packages/generator/src/padRepair.js";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const N = Number(arg("--n", "60")), p = Number(arg("--p", "0.3"));
const reqs = sequenceRange(1, N);
let first = 0, within = 0, hiddenLeft = 0;
const why: Record<string, number> = {};
const t0 = Date.now();
reqs.forEach((r, i) => {
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    let b: ReturnType<typeof buildLevel>;
    try {
      b = buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p) }, salt);
      if (salt === 0) first++;
      within++;
      const m = b.manifest as unknown as Manifest;
      if (lifetimeVisibility(m, staticWindows(m)).some((v) => v.hidden > 0 && !/^tower/.test(v.id))) hiddenLeft++;
      return;
    } catch (e) {
      const k = String((e as Error).message).replace(/[\d.,]+/g, "#").slice(0, 60);
      why[k] = (why[k] ?? 0) + 1;
    }
  }
  void i;
});
console.log(JSON.stringify({ n: N, firstTry: first, within: within, tries: GEN.search.layoutTries, layoutsWithAPadHiddenInItsWindow: hiddenLeft, s: Math.round((Date.now() - t0) / 1000) }));
console.log(JSON.stringify(Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 8)));

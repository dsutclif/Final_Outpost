import { writeFileSync } from "node:fs";
import { sequenceRange } from "../packages/sequencer/src/index.js";
import { buildLevel, generateDetailed, knobsFor, templateById, GEN } from "../packages/generator/src/index.js";
import { closure } from "../packages/sequencer/src/index.js";
import { PROFILES, playBot } from "../packages/bots/src/index.js";

// Dev helper: pnpm vite-node tools/try-level.ts -- --index 7 [--build-only] [--p 0.3] [--out file.json]
// Generates (or only builds and plays) one level of the sequence with verbose logs.

const argv = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const index = Number(arg("--index", "1"));
const reqs = sequenceRange(1, index);
const req = reqs[index - 1]!;
console.log(JSON.stringify({ index, family: req.family, goal: req.goalId, features: req.features, phase: req.phase, target: req.target }));
const t0 = Date.now();
if (argv.includes("--build-only")) {
  const p = Number(arg("--p", "0.3"));
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      const b = buildLevel({ id: req.id, seed: req.seed, family: req.family, secondary: req.secondary, features: req.features, goalType: req.goalType, modules: closure(req.modules), template: templateById(req.template), knobs: knobsFor(p) }, salt);
      if (arg("--out")) writeFileSync(arg("--out")!, JSON.stringify(b.manifest, null, 1));
      const profs = argv.includes("--ladder") ? ["good", "average", "weak", "novice", "floor"] : ["good"];
      for (const pn of profs) for (const s of [1, 2, 3]) {
        const r = playBot(b.manifest, PROFILES[pn]!, s, { timeBudgetSeconds: 900 });
        process.stdout.write(pn + " ");
        console.log(`seed ${s}: won=${r.won} ${r.reason} t=${Math.round(r.ticks / 30)}s stalls=${r.stalls} stars=${r.stars} used=${JSON.stringify(r.used)} ${r.stallStates.map((x) => JSON.stringify(x)).join(" ")}`);
      }
      break;
    } catch (e) { console.log(`salt ${salt}: ${(e as Error).message}`); }
  }
} else {
  const d = generateDetailed({ ...req }, { log: (s) => console.log(s), maxIterations: Number(arg("--it", "10")) });
  console.log(JSON.stringify({ ok: d.manifest !== null, stats: d.stats, stars: d.best?.stars, byRung: d.best?.starsByRung, objectives: d.best?.manifest.objectives, D: d.best?.rating.D }));
  if (arg("--out") && d.best) writeFileSync(arg("--out")!, JSON.stringify(d.best.manifest, null, 1));
}
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);

// outpost-ops#202: time ONE call of the generator's full per-level pipeline (generateDetailed, as tools/build-levels.ts calls it with retries 0,
// nothing written to levels/) split into stages: layout (buildLevel, thrown salts included), bot playtests / simulation (measure, playHuman,
// verifyStars), rater / filters (score, settleObjectives, idleElements, spareCut, overLoopCap) and other (the rest).
// It reads timers a TEMPORARY local hook in packages/generator/src/index.ts fills (globalThis.__tm); the hook is never committed.
//   pnpm vite-node tools/gen-timing.ts -- --levels 6,15,20,60,120 --json out.json
import { writeFileSync } from "node:fs";
import { sequenceRange } from "../packages/sequencer/src/index.js";
import { generateDetailed, newSearchMemory, templateById, type CandidateRecord } from "../packages/generator/src/index.js";
import { hashStr, mix } from "../packages/generator/src/rand.js";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const LEVELS = arg("--levels", "6,15,20,60,120").split(",").map(Number), OUT = arg("--json", "");
interface Tm { acc: Record<string, number>; cnt: Record<string, number>; thrown: number }
const tm = (globalThis as unknown as { __tm?: Tm }).__tm;
if (!tm) throw new Error("timing hook missing in index.ts");
void hashStr; void mix;
const out: Record<string, unknown>[] = [];
for (const index of LEVELS) {
  const reqs = sequenceRange(1, index, [], { targetOffset: 0 });
  const req = reqs[index - 1]!;
  const history = reqs.slice(0, index - 1).map((r) => ({ id: r.id, modules: r.modules, goal: r.goalType, template: templateById(r.template).zones.join("|") }));
  tm.acc = {}; tm.cnt = {}; tm.thrown = 0;
  const cands: CandidateRecord[] = [];
  const t0 = performance.now();
  const d = generateDetailed({ ...req, seed: req.seed }, { history, memory: newSearchMemory(), finish: true, onCandidate: (c) => cands.push(c) });
  const total = performance.now() - t0;
  const layout = tm.acc["layout"] ?? 0, bots = tm.acc["bots"] ?? 0, rater = tm.acc["rater"] ?? 0, other = total - layout - bots - rater;
  const row = {
    level: index, id: req.id, family: req.family, secondary: req.secondary ?? null, features: req.features, template: req.template,
    defend: req.family === "defend" || req.secondary === "defend",
    totalMs: Math.round(total), layoutMs: Math.round(layout), botsMs: Math.round(bots), raterMs: Math.round(rater), otherMs: Math.round(other),
    layoutCalls: tm.cnt["layout"] ?? 0, layoutThrown: tm.thrown, measureCalls: tm.cnt["measure"] ?? 0, iterations: d.stats.iterations, ratings: d.stats.ratings,
    shipped: !!d.manifest, candidates: cands.length, rejects: d.stats.rejects,
  };
  out.push(row);
  console.log(JSON.stringify(row));
}
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 1));

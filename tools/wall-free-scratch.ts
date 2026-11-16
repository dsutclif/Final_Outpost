import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sequenceRange } from "../packages/sequencer/src/index.js";
import { generateDetailed } from "../packages/generator/src/index.js";
import { PROFILES, playBot } from "../packages/bots/src/index.js";

// Scratch build of wall-free defend levels (outpost-ops#208): pnpm vite-node tools/wall-free-scratch.ts -- --slots 21,33,45 --out <dir> [--seeds 3]
// Runs the generator's search with walls off for those sequence slots, writes the manifests to --out (never levels/packs; no docs touched)
// and replays each with the good bot, printing the result and its per-run defend record.

const argv = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const slots = (arg("--slots", "") ?? "").split(",").filter(Boolean).map(Number);
const out = resolve(arg("--out", "scratch-wall-free")!);
const seeds = Number(arg("--seeds", "3"));
mkdirSync(out, { recursive: true });
const reqs = sequenceRange(1, Math.max(...slots));
for (const i of slots) {
  const req = reqs[i - 1]!;
  const t0 = Date.now();
  const d = generateDetailed({ ...req, walls: arg("--walls") === "on" }, { maxIterations: 10, ...(argv.includes("--log") ? { log: (s: string) => console.log(s) } : {}) });
  const m = d.best?.manifest ?? d.manifest;
  console.log(`slot ${i} ${req.id} family=${req.family} features=${req.features.join("+")} built=${m !== null} rejects=${JSON.stringify(d.stats.rejects)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!m) continue;
  writeFileSync(join(out, `${req.id}.json`), JSON.stringify(m, null, 2) + "\n");
  for (let s = 1; s <= seeds; s++) {
    const r = playBot(m, PROFILES["good"]!, s, { timeBudgetSeconds: 900 });
    console.log(`  good seed ${s}: won=${r.won} ${r.reason} t=${Math.round(r.ticks / 30)}s stalls=${r.stalls} stars=${r.stars} defend=${JSON.stringify(r.defend)}`);
  }
}

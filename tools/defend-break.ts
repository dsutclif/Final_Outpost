import { readFileSync, writeFileSync } from "node:fs";
import { content } from "../packages/content/src/index.js";
import { strategyGap, repin } from "../packages/rater/src/index.js";
import { STRATEGIES } from "../packages/bots/src/index.js";
import { DEFEND_FIT, defendInput, fitEta, modelBreak } from "../packages/generator/src/defendModel.js";

// Defend redesign S0 (outpost-ops#264): the breaking wave-volume multiplier of each fixed strategy on one manifest, played
// by the sim (bisect, geometric), then the defend model's eta_s and h refitted to those multipliers. Report only.
// pnpm exec vite-node tools/defend-break.ts -- manifest.json [--seed 1] [--iterations 6] [--lo 0.25] [--hi 60] [--json out.json]
// Plays 2 + iterations runs per strategy (about 30 bot runs, ~1 s each); no level build. A logged candidate pinned to an older
// engine is replayed on the current one (repin), so its numbers are the current rules' on that manifest.
const args = process.argv.slice(2).filter((a) => a !== "--");
const flag = (n: string, d: number): number => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const file = args.find((a, i) => a.endsWith(".json") && args[i - 1] !== "--json");
if (!file) { console.error("usage: defend-break.ts manifest.json [--seed N] [--iterations N] [--lo X] [--hi X] [--json out.json]"); process.exit(1); }
const m = repin(JSON.parse(readFileSync(file, "utf8")));
const opts = { seed: flag("seed", 1), iterations: flag("iterations", 6), lo: flag("lo", 0.25), hi: flag("hi", 60) };
const t0 = Date.now();
const g = strategyGap(m, opts);
console.log(`${m.id}  sim breaking multiplier: ${STRATEGIES.map((s) => `${s} ${g.multipliers[s]!.toFixed(3)}`).join("  ")}`);
console.log(`strategyGap ${g.gap.toFixed(3)}  best ${g.best}  worst ${g.worst}  runs ${g.runs}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const inp = defendInput(m, content);
const fits: Record<string, { eta: number; h: number; modelAtDefaultEta: number; fitMultiplier: number }> = {};
for (const s of STRATEGIES) {
  const sim = g.multipliers[s]!;
  const def = modelBreak(inp, DEFEND_FIT, s, DEFEND_FIT.eta);
  const f = sim > 0 && sim < opts.hi ? fitEta(inp, DEFEND_FIT, s, sim) : { eta: NaN, h: NaN, multiplier: NaN };
  fits[s] = { eta: f.eta, h: f.h, modelAtDefaultEta: def.multiplier, fitMultiplier: f.multiplier };
  console.log(`  ${s.padEnd(14)} model at eta ${DEFEND_FIT.eta}: ${def.multiplier.toFixed(3)} (h ${def.h.toFixed(2)})   fitted eta_s ${f.eta.toFixed(3)} -> ${f.multiplier.toFixed(3)}  h ${f.h.toFixed(2)}`);
}
const j = args.indexOf("--json");
if (j >= 0) writeFileSync(args[j + 1]!, JSON.stringify({ id: m.id, ...g, fits }, null, 1) + "\n");

import { sequenceRange, closure } from "../packages/sequencer/src/index.js";
import { buildLevel, knobsFor, templateById, GEN } from "../packages/generator/src/index.js";

// Dev helper: pnpm vite-node tools/layout-spread.ts -- [--from 1] [--to 60] [--p 0.5]
// Builds each level's layout (no bot runs) and reports how far its stations sit from the core and
// how far each hire / level / upgrade pad sits from what it serves, so layout changes can be compared.

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const from = Number(arg("--from", "1")), to = Number(arg("--to", "60")), p = Number(arg("--p", "0.5"));
const reqs = sequenceRange(1, to);
const d = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
let sumFar = 0, sumP90 = 0, n = 0, sumPad = 0, nPad = 0;
for (let i = from; i <= to; i++) {
  const req = reqs[i - 1]!;
  let line = `L${String(i).padStart(2, "0")} ${req.family.padEnd(13)} `;
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      const b = buildLevel({ id: req.id, seed: req.seed, family: req.family, secondary: req.secondary, features: req.features, goalType: req.goalType, modules: closure(req.modules), template: templateById(req.template), knobs: knobsFor(p) }, salt);
      const ents = b.manifest.entities as unknown as { type: string; id?: string; at?: [number, number]; role?: { from?: string; node?: string }; target?: string }[];
      const core = ents.find((e) => e.type === "sink.core")!.at!;
      const keyEnts = ents.filter((e) => e.at && (e.type.startsWith("pad.") || e.type.startsWith("sink.")));
      const ds = keyEnts.map((e) => ({ id: e.id ?? e.type, r: d(e.at!, core) })).sort((a, b) => a.r - b.r);
      const far = ds[ds.length - 1]!, p90 = ds[Math.floor(ds.length * 0.9)]!;
      // a pad's distance to what it serves: the node it gathers from, the thing it upgrades
      const byId = new Map(ents.filter((e) => e.id).map((e) => [e.id!, e]));
      const padGaps: string[] = [];
      for (const e of ents) {
        let to: [number, number] | undefined;
        if (e.type === "pad.hire" && e.role?.node) to = byId.get(e.role.node)?.at;
        else if (e.type === "pad.hire" && e.role?.from?.startsWith("node.")) {
          const ns = ents.filter((x) => x.type === e.role!.from && x.at);
          to = ns.sort((a, b) => d(a.at!, e.at!) - d(b.at!, e.at!))[0]?.at;
        } else if (e.type === "pad.build" && e.target) to = byId.get(e.target)?.at;
        else if (e.type === "pad.build" && e.id?.startsWith("core_level")) to = core;
        if (!to || !e.at) continue;
        const g = d(e.at, to);
        sumPad += g; nPad++;
        if (g > 95) padGaps.push(`${e.id}:${Math.round(g)}`);
      }
      line += `far ${far.id}:${Math.round(far.r)} p90 ${Math.round(p90.r)}  ${padGaps.join(" ")}`;
      sumFar += far.r; sumP90 += p90.r; n++;
      break;
    } catch (e) { if (salt === GEN.search.layoutTries - 1) line += `FAILED ${(e as Error).message}`; }
  }
  console.log(line);
}
console.log(`mean far ${Math.round(sumFar / n)}  mean p90 ${Math.round(sumP90 / n)}  mean pad gap ${Math.round(sumPad / nPad)} (${n} levels)`);

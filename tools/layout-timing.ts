// outpost-ops#202: time the CURRENT generator's layout step (buildLevel, layout salts 0..layoutTries-1 as index.ts loops them) over
// the shipped levels' requests, and count the salts thrown away per level. No bots, no pack build.
//   pnpm vite-node tools/layout-timing.ts -- [--p 0.5] [--l20 40] [--json out.json]
import { writeFileSync } from "node:fs";
import { closure, sequenceRange } from "../packages/sequencer/src/index.js";
import { GEN, buildLevel, knobsFor, templateById } from "../packages/generator/src/index.js";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const P = Number(arg("--p", "0.5")), L20 = Number(arg("--l20", "40")), OUT = arg("--json", "");
const reqs = sequenceRange(1, 183);
const tries = GEN.search.layoutTries;
interface Row { level: string; seedOff: number; calls: number; thrown: number; layoutRejects: number; flowRejects: number; ok: boolean; msCalls: number; msOk: number; msFail: number; reasons: string[] }
const rows: Row[] = [];
const one = (i: number, off: number): Row => {
  const req = reqs[i]!;
  const r: Row = { level: req.id, seedOff: off, calls: 0, thrown: 0, layoutRejects: 0, flowRejects: 0, ok: false, msCalls: 0, msOk: 0, msFail: 0, reasons: [] };
  for (let salt = 0; salt < tries && !r.ok; salt++) {
    const t = performance.now(); r.calls++;
    try {
      buildLevel({ id: req.id, seed: req.seed + off, family: req.family, secondary: req.secondary ?? null, features: req.features, goalType: req.goalType, modules: closure(req.modules), template: templateById(req.template), knobs: knobsFor(P) }, salt);
      r.ok = true; r.msOk = performance.now() - t;
    } catch (e) {
      const why = (e as Error).message; r.msFail += performance.now() - t; r.thrown++;
      if (why.startsWith("flow")) r.flowRejects++; else r.layoutRejects++;
      if (r.reasons.length < 3) r.reasons.push(why.slice(0, 60));
    }
  }
  r.msCalls = r.msOk + r.msFail;
  return r;
};
rows.push(one(0, 0)); rows.pop(); // warm-up
for (let i = 0; i < reqs.length; i++) rows.push(one(i, 0));
const i20 = reqs.findIndex((q) => q.id === "s1-L020");
for (let k = 1; k <= L20; k++) rows.push(one(i20, k));
// keep only the shipped levels' ids (the packs hold 160 of the 183)
import { readdirSync } from "node:fs";
const shipped = new Set<string>();
const root = new URL("../levels/packs/", import.meta.url);
for (const d of readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) for (const f of readdirSync(new URL(`${d.name}/`, root))) { const m = /^(s1-L\d+)\.json$/.exec(f); if (m) shipped.add(m[1]!); }
const rs = rows.filter((r) => shipped.has(r.level));
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / (x.length || 1);
const calls = rs.reduce((a, r) => a + r.calls, 0);
console.log(`runs ${rs.length} (shipped levels ${rs.filter((r) => r.seedOff === 0).length} + L20 extra ${rs.filter((r) => r.seedOff > 0).length}); p=${P}; layoutTries ${tries}`);
console.log(`ms per buildLevel call: mean ${(rs.reduce((a, r) => a + r.msCalls, 0) / calls).toFixed(2)} (successful ${mean(rs.filter((r) => r.ok).map((r) => r.msOk)).toFixed(2)}, failed ${(rs.reduce((a, r) => a + r.msFail, 0) / rs.reduce((a, r) => a + r.thrown, 0)).toFixed(2)}); max single run total ${Math.max(...rs.map((r) => r.msCalls)).toFixed(0)}`);
console.log(`salts thrown away per run: mean ${mean(rs.map((r) => r.thrown)).toFixed(2)}, max ${Math.max(...rs.map((r) => r.thrown))}; layout-type ${mean(rs.map((r) => r.layoutRejects)).toFixed(2)}, flow-type ${mean(rs.map((r) => r.flowRejects)).toFixed(2)}`);
console.log(`ms per successful layout incl. thrown salts: mean ${mean(rs.filter((r) => r.ok).map((r) => r.msCalls)).toFixed(2)}, max ${Math.max(...rs.filter((r) => r.ok).map((r) => r.msCalls)).toFixed(0)}; runs that never succeeded: ${rs.filter((r) => !r.ok).length}; runs with 0 thrown: ${rs.filter((r) => r.thrown === 0).length}`);
const l20 = rs.filter((r) => r.level === "s1-L020");
console.log(`Level 20 only (${l20.length}): thrown mean ${mean(l20.map((r) => r.thrown)).toFixed(2)}, ms per successful layout ${mean(l20.map((r) => r.msCalls)).toFixed(2)}`);
if (OUT) writeFileSync(OUT, JSON.stringify(rs));

// Which pads are hidden in their window on the first 60 generated layouts (first layout that builds), and by what.
//   pnpm vite-node tools/pad-hidden-list.ts -- [--n 60] [--p 0.3] [--json out.json]
import { writeFileSync } from "node:fs";
import { sequenceRange, closure } from "../packages/sequencer/src/index.js";
import { GEN, buildLevel, knobsFor, templateById } from "../packages/generator/src/index.js";
import { lifetimeVisibility, staticWindows, type Manifest } from "../packages/generator/src/padRepair.js";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const N = Number(arg("--n", "60")), p = Number(arg("--p", "0.3")), out = arg("--json", "");
const reqs = sequenceRange(1, N);
const byHider: Record<string, number> = {}, byPad: Record<string, number> = {};
const rows: unknown[] = [];
reqs.forEach((r, i) => {
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      const b = buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(p) }, salt);
      const m = b.manifest as unknown as Manifest;
      const hid = lifetimeVisibility(m, staticWindows(m)).filter((v) => v.hidden > 0 && !/^tower/.test(v.id));
      for (const v of hid) { const h = String(v.by).replace(/[#\d]+$/, ""); byHider[h] = (byHider[h] ?? 0) + 1; byPad[v.id.replace(/\d+$/, "")] = (byPad[v.id.replace(/\d+$/, "")] ?? 0) + 1; }
      rows.push({ level: i + 1, salt, manifest: out ? m : undefined, hidden: hid.map((v) => `${v.id}:${v.hidden.toFixed(2)}:${v.by}`) });
      return;
    } catch { /* next salt */ }
  }
  rows.push({ level: i + 1, failed: true });
});
console.log(JSON.stringify({ byHider, byPad }));
for (const r of rows as { level: number; hidden?: string[] }[]) if (r.hidden?.length) console.log(r.level, r.hidden.join(" "));
if (out) writeFileSync(out, JSON.stringify(rows));

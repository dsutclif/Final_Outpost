import { sequenceRange, closure } from "../packages/sequencer/src/index.js";
import { buildLevel, knobsFor, templateById, GEN } from "../packages/generator/src/index.js";

// Dev helper: pnpm vite-node tools/layout-map.ts -- --index 50 [--p 0.5]
// Prints one level's layout as a coarse character map (20 world units per cell) with a legend.

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const index = Number(arg("--index", "50")), p = Number(arg("--p", "0.5"));
const req = sequenceRange(1, index)[index - 1]!;
for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
  try {
    const b = buildLevel({ id: req.id, seed: req.seed, family: req.family, secondary: req.secondary, features: req.features, goalType: req.goalType, modules: closure(req.modules), template: templateById(req.template), knobs: knobsFor(p) }, salt);
    const C = 20, W = 24, H = 45, grid = Array.from({ length: H }, () => Array<string>(W).fill("."));
    const legend: string[] = [];
    let k = 0;
    const sym = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (const e of b.manifest.entities as unknown as { type: string; id?: string; at?: [number, number] }[]) {
      if (!e.at) continue;
      const ch = e.type === "node.fuel_scrap" ? "*" : e.type === "node.material_source" ? "o" : sym[k++]!;
      grid[Math.min(H - 1, Math.floor(e.at[1] / C))]![Math.min(W - 1, Math.floor(e.at[0] / C))] = ch;
      if (ch !== "*" && ch !== "o") legend.push(`${ch}=${e.id ?? e.type}(${e.at.join(",")})`);
    }
    console.log(grid.map((r, i) => `${String(i * C).padStart(3)} ${r.join("")}`).join("\n"));
    console.log(legend.join("  "));
    break;
  } catch (e) { void e; }
}

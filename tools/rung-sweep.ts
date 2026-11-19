// Scratch measurement (fix-4-rungs, 2026-11-19): industrialize candidates for one recipe cell (goal x features x machines x target),
// pool off, composer off (features are given), seeds re-rolled until the time cap. Rows go to a candidate-log-shaped .jsonl so
// tools/goal-ranges.ts reads them. Not part of the build.
//   vite-node tools/rung-sweep.ts -- --out dir --minutes 12 --jobs 10 [--only cellName]
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { sequenceRange } from "../packages/sequencer/src/index.js";
import { generateDetailed, newSearchMemory } from "../packages/generator/src/index.js";
import { hashStr, mix } from "../packages/generator/src/rand.js";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const arg = (n: string, d = "") => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const MODS = ["build_pads", "carry", "converters", "core", "gather", "sales", "supply_routing", "workers", "conveyors"];
const CELLS: Record<string, { goal: string; features: string[]; machines: number }> = {
  A1: { goal: "automate", features: [], machines: 1 },
  A2: { goal: "automate", features: ["material_processor"], machines: 2 },
  A3m2: { goal: "automate", features: ["material_processor", "tier2"], machines: 2 },
  A3m3: { goal: "automate", features: ["material_processor", "tier2"], machines: 3 },
  C3: { goal: "chain", features: ["material_processor", "tier2"], machines: 3 },
  C3x: { goal: "chain", features: ["conveyors", "depot", "material_processor", "tier2"], machines: 3 },
};
const TARGETS = [0.2, 0.4, 0.6, 0.8];

if (arg("--cell")) {
  const name = arg("--cell"), t = Number(arg("--target")), c = CELLS[name]!, out = arg("--out"), deadline = Date.now() + Number(arg("--minutes", "12")) * 60000;
  const id = `rung-${name}-${t}`;
  const knobFile = join(out, `knobs-${id}.json`);
  writeFileSync(knobFile, JSON.stringify({ [id]: c.goal === "automate" && c.features.length > 0 ? { machines: c.machines } : {} }));
  process.env["FO_KNOB_OVERRIDES"] = knobFile;
  const base = sequenceRange(1, 25, [], { targetOffset: 0 })[24]!;
  const modules = c.features.includes("conveyors") ? MODS : MODS.filter((m) => m !== "conveyors");
  const recipeId = `industrialize|g:${c.goal}|f:${c.features.join(",")}`;
  const file = join(out, `${id}.jsonl`);
  let n = 0;
  for (let k = 0; Date.now() < deadline; k++) {
    const seed = mix(base.seed, hashStr(`rung${k}`)) & 0x7fffffff;
    const req = { ...base, id, target: t, goalType: c.goal, goalId: c.goal, features: c.features, modules, introduced: [], seed, funThreshold: 0.2, phase: "mix" };
    const rows: Record<string, unknown>[] = [];
    generateDetailed(req as never, { history: [], memory: newSearchMemory(), finish: true,
      onCandidate: (cand) => { const { manifest: _m, ...rest } = cand as never as Record<string, unknown>; rows.push(rest); } });
    for (const r of rows) appendFileSync(file, JSON.stringify({ run: "rung", engine: ENGINE_VERSION, content: CONTENT_VERSION, n: ++n, cell: name, target: t, family: "industrialize", features: c.features, goalType: c.goal, recipeId, attempt: k, seed, ...r }) + "\n");
  }
} else {
  const out = resolve(arg("--out", "rung-out")), jobs = Number(arg("--jobs", "10")), minutes = arg("--minutes", "12"), only = arg("--only");
  mkdirSync(out, { recursive: true });
  const todo = Object.keys(CELLS).filter((n) => !only || only.split(",").includes(n)).flatMap((n) => TARGETS.map((t) => [n, t] as const));
  const viteNode = resolve("node_modules", "vite-node", "vite-node.mjs");
  let running = 0, i = 0;
  const next = () => {
    while (running < jobs && i < todo.length) {
      const [n, t] = todo[i++]!; running++;
      const ch = spawn(process.execPath, [viteNode, fileURLToPath(import.meta.url), "--", "--cell", n, "--target", String(t), "--out", out, "--minutes", minutes], { stdio: "inherit" });
      ch.on("close", () => { running--; console.log(`cell ${n} ${t} done (${i}/${todo.length} started)`); next(); });
    }
  };
  next();
}

// Scratch measurement (gap-fill, 2026-11-19): candidates for goals that have no samples yet (goal x target), one level request
// per seed, pool off, composer off (the goal's own needs are the features), seeds re-rolled until the time cap. Rows go to a
// candidate-log-shaped .jsonl so tools/goal-ranges.ts reads them. Not part of the build.
//   vite-node tools/goal-sweep.ts -- --goals heat_hold,fuel_full --targets 0.2,0.45,0.7 --out dir --minutes 6 --jobs 8
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { DEFAULT_CONFIG as cfg, featureClosure, modulesFor, sequenceRange } from "../packages/sequencer/src/index.js";
import { generateDetailed, newSearchMemory } from "../packages/generator/src/index.js";
import { hashStr, mix } from "../packages/generator/src/rand.js";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const arg = (n: string, d = "") => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1]! : d; };
const TARGETS = arg("--targets", "0.2,0.45,0.7").split(",").map(Number);

if (arg("--goal")) {
  const goal = arg("--goal"), t = Number(arg("--target")), out = arg("--out"), deadline = Date.now() + Number(arg("--minutes", "6")) * 60000;
  const g = cfg.goals[goal]!;
  // a mix level of the goal's family is the base request (template, slot shape); everything else is overridden
  const base = sequenceRange(1, 60).find((r) => r.index > 15 && r.family === g.family && r.phase === "mix")!;
  // @two_goods goals (sell_each) exist only on a finale whose second family supplies the second good: pair with rescue's hunting
  const two = g.needs.includes("@two_goods");
  const features = featureClosure([...g.needs.filter((f) => cfg.features[f] !== undefined), ...(two ? ["hunting"] : [])], cfg);
  const modules = modulesFor(two ? [g.family, "rescue"] : [g.family], features);
  const id = `gs-${goal}-${t}`;
  const recipeId = `${g.family}|g:${goal}|f:${features.join(",")}`;
  const file = join(out, `${id}.jsonl`);
  let n = 0;
  for (let k = 0; Date.now() < deadline; k++) {
    const seed = mix(base.seed, hashStr(`gs${goal}${k}`)) & 0x7fffffff;
    const req = { ...base, id, target: t, goalType: g.kind ?? goal, goalId: goal, features, modules, introduced: [], ...(two ? { secondary: "rescue" } : {}), seed, funThreshold: 0.2, phase: "mix" };
    const rows: Record<string, unknown>[] = [];
    try {
      generateDetailed(req as never, { history: [], memory: newSearchMemory(), finish: true,
        onCandidate: (cand) => { const { manifest: _m, ...rest } = cand as never as Record<string, unknown>; rows.push(rest); } });
    } catch { /* a layout the builder cannot place: next seed */ }
    for (const r of rows) appendFileSync(file, JSON.stringify({ run: "gs", engine: ENGINE_VERSION, content: CONTENT_VERSION, n: ++n, goal, target: t, family: g.family, features, goalType: goal, recipeId, attempt: k, seed, ...r }) + "\n");
  }
} else {
  const out = resolve(arg("--out", "goal-sweep-out")), jobs = Number(arg("--jobs", "8")), minutes = arg("--minutes", "6");
  mkdirSync(out, { recursive: true });
  const todo = arg("--goals").split(",").flatMap((n) => TARGETS.map((t) => [n, t] as const));
  const viteNode = resolve("node_modules", "vite-node", "vite-node.mjs");
  let running = 0, i = 0;
  const next = () => {
    while (running < jobs && i < todo.length) {
      const [n, t] = todo[i++]!; running++;
      const ch = spawn(process.execPath, [viteNode, fileURLToPath(import.meta.url), "--", "--goal", n, "--target", String(t), "--out", out, "--minutes", minutes], { stdio: "inherit" });
      ch.on("close", () => { running--; console.log(`goal ${n} ${t} done (${i}/${todo.length} started)`); next(); });
    }
  };
  next();
}

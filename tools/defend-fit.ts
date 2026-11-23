import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { content, CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { DEFEND_FIT_FILE, defendInput, predictRho, type DefendFit, type DefendInput, type FitFile } from "../packages/bots/src/index.js";
import { DATA_DIR, LEVELS, RUNS_FILE, SIM_STRATEGIES, loadLevel, modelStrategy, type CellLine, type SimStrategy, type Variant } from "./defend-lib.js";

// Defend model fit (outpost-ops#273). Reads the cell lines of tools/defend-collect.ts, fits the behaviour constants of packages/bots/data/defendFit.json
// (eta/overkill, presence, pickupDelay, walkShare, pileUse, feedWeight, reach) and the small residual correction (sim = exp(b) * model^a), then checks
// held-out levels: the breaking size within 25% on >= 80% of waves, and the same best plan on >= 80%. Writes the report; the fit file is replaced
// only when the held-out check passes (else defendFit.candidate.json and a FAILED report).
//   pnpm exec vite-node tools/defend-fit.ts -- [--force] [--evals 3]
const args = process.argv.slice(2).filter((a) => a !== "--");
const force = args.includes("--force");
const SWEEPS = args.includes("--evals") ? Number(args[args.indexOf("--evals") + 1]) : 2;
const CEIL = 60, FLOORM = 0.05, TOL = 0.25, GATE = 0.8;

interface Cell { level: string; variant: Variant; strategy: SimStrategy; wave: number; sim: number; censored: boolean; n: number }
const key = (level: string, v: Variant) => `${level}|${v}`;

function loadCells(): Cell[] {
  if (!existsSync(RUNS_FILE)) throw new Error(`no data at ${RUNS_FILE}`);
  const by = new Map<string, { c: CellLine[] }>();
  for (const l of readFileSync(RUNS_FILE, "utf8").split("\n")) {
    if (!l.trim()) continue;
    let j: CellLine;
    try { j = JSON.parse(l) as CellLine; } catch { continue; }
    if (j.kind !== "cell" || j.engine !== ENGINE_VERSION) continue;
    const k = `${j.level}|${j.variant}|${j.strategy}|${j.wave}`;
    (by.get(k) ?? by.set(k, { c: [] }).get(k)!).c.push(j);
  }
  const out: Cell[] = [];
  for (const [k, { c }] of by) {
    const [level, variant, strategy, wave] = k.split("|");
    const ests = c.map((x) => (x.hi ? (x.lo > 0 ? Math.sqrt(x.lo * x.hi) : x.hi / 1.5) : Math.min(CEIL, x.lo))).sort((a, b) => a - b);
    const sim = ests[Math.floor(ests.length / 2)]!;
    out.push({ level: level!, variant: variant as Variant, strategy: strategy as SimStrategy, wave: Number(wave), sim: Math.max(FLOORM, Math.min(CEIL, sim)), censored: c.every((x) => !x.hi && x.lo >= CEIL * 0.99), n: c.length });
  }
  return out;
}

const inputs = new Map<string, DefendInput>();
function inputFor(level: string, v: Variant): DefendInput {
  const k = key(level, v);
  if (!inputs.has(k)) inputs.set(k, defendInput(loadLevel(level, v) as never, content, 0));
  return inputs.get(k)!;
}

/** Largest multiplier of wave `k` alone the model still holds (geometric bisection). */
function modelWave(inp: DefendInput, fit: DefendFit, s: SimStrategy, k: number): number {
  const n = inp.waves.length;
  const lost = (m: number) => predictRho(inp, fit, 1, { dt: 0.5, strategy: modelStrategy(s), volumes: Array.from({ length: n }, (_, i) => (i === k ? m : 1)) }).lost;
  let lo = FLOORM, hi = CEIL;
  if (lost(lo)) return FLOORM;
  if (!lost(hi)) return CEIL;
  for (let i = 0; i < 9; i++) { const mid = Math.sqrt(lo * hi); if (lost(mid)) hi = mid; else lo = mid; }
  return lo;
}
const predict = (cells: Cell[], fit: DefendFit): number[] => cells.map((c) => modelWave(inputFor(c.level, c.variant), fit, c.strategy, c.wave));
const sqErr = (cells: Cell[], preds: number[]): number => cells.reduce((a, c, i) => a + Math.log(preds[i]! / c.sim) ** 2, 0) / Math.max(1, cells.length);

const GRID: { k: "eta" | "presence" | "pickupDelay" | "walkShare" | "pileUse" | "feedWeight" | "reach"; lo: number; hi: number }[] = [
  { k: "eta", lo: 0.15, hi: 1.5 }, { k: "presence", lo: 0.2, hi: 1 }, { k: "pickupDelay", lo: 0, hi: 12 },
  { k: "walkShare", lo: 0, hi: 2 }, { k: "pileUse", lo: 0, hi: 1 }, { k: "feedWeight", lo: 0, hi: 2 }, { k: "reach", lo: 50, hi: 160 },
];

/** Coordinate descent over the behaviour constants on a fixed sample of the training cells. */
function fitConstants(train: Cell[], start: DefendFit): { fit: DefendFit; err: number } {
  let rnd = 12345;
  const sample = [...train].sort((a, b) => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff), (rnd % 1000) - 500)).slice(0, 110);
  let fit = { ...start, residual: { a: 1, b: 0 } };
  let best = sqErr(sample, predict(sample, fit));
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (const g of GRID) {
      const cur = fit[g.k] as number;
      const cands = [g.lo, (g.lo + cur) / 2, cur, (cur + g.hi) / 2, g.hi].map((v) => Math.max(g.lo, Math.min(g.hi, v)));
      for (const v of cands) {
        if (v === cur) continue;
        const f2 = { ...fit, [g.k]: v } as DefendFit;
        const e = sqErr(sample, predict(sample, f2));
        if (e < best - 1e-6) { best = e; fit = f2; }
      }
    }
    console.log(`  sweep ${sweep + 1}: err ${best.toFixed(4)}  ${GRID.map((g) => `${g.k} ${(fit[g.k] as number).toFixed(2)}`).join(" ")}`);
  }
  return { fit, err: best };
}

/** ln sim = b + a ln model over the training cells that neither side clips. */
function fitResidual(train: Cell[], fit: DefendFit): { a: number; b: number } {
  const preds = predict(train, fit);
  const pts = train.map((c, i) => ({ x: Math.log(preds[i]!), y: Math.log(c.sim), ok: !c.censored && preds[i]! < CEIL && preds[i]! > FLOORM && c.sim > FLOORM })).filter((p) => p.ok);
  if (pts.length < 8) return { a: 1, b: 0 };
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const a = sxx > 1e-9 ? Math.max(0.5, Math.min(1.5, sxy / sxx)) : 1;
  return { a, b: my - a * mx };
}

interface Score { within: number; planAgree: number; n: number; plans: number }
function score(cells: Cell[], fit: DefendFit): Score {
  const raw = predict(cells, fit);
  const corr = raw.map((m) => Math.min(CEIL, Math.exp(fit.residual.b) * Math.pow(m, fit.residual.a)));
  let within = 0;
  cells.forEach((c, i) => { const r = corr[i]! / c.sim; if (r >= 1 / (1 + TOL) && r <= 1 + TOL) within++; else if (c.censored && corr[i]! >= CEIL * 0.8) within++; });
  const groups = new Map<string, { c: Cell; m: number }[]>();
  cells.forEach((c, i) => { const g = `${c.level}|${c.variant}|${c.wave}`; (groups.get(g) ?? groups.set(g, []).get(g)!).push({ c, m: corr[i]! }); });
  let plans = 0, agree = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    plans++;
    const simBest = Math.max(...g.map((x) => x.c.sim));
    const pick = g.reduce((a, b) => (b.m > a.m ? b : a));
    if (pick.c.sim >= 0.9 * simBest) agree++;
  }
  return { within: within / Math.max(1, cells.length), planAgree: plans ? agree / plans : 0, n: cells.length, plans };
}

function main(): void {
  const cells = loadCells();
  if (cells.length < 40) { console.error(`only ${cells.length} cells; collect more first`); process.exit(2); }
  const tags = [...new Set(cells.map((c) => c.level))].sort();
  const held = new Set(tags.filter((_, i) => i % 3 === 2));
  const train = cells.filter((c) => !held.has(c.level)), test = cells.filter((c) => held.has(c.level));
  console.log(`cells ${cells.length} (train ${train.length} on ${tags.length - held.size} levels, held-out ${test.length} on ${[...held].join(",")})`);
  const start = DEFEND_FIT_FILE;
  const before = score(test, start);
  console.log(`held-out with the current fit file: within 25% ${(before.within * 100).toFixed(0)}%, same best plan ${(before.planAgree * 100).toFixed(0)}% (${before.plans} plans)`);
  console.log("fit on training levels");
  const f1 = fitConstants(train, start);
  f1.fit.residual = fitResidual(train, f1.fit);
  const inS = score(train, f1.fit), outS = score(test, f1.fit);
  const pass = outS.within >= GATE && outS.planAgree >= GATE;
  console.log(`train: within ${(inS.within * 100).toFixed(0)}%  plan ${(inS.planAgree * 100).toFixed(0)}%   held-out: within ${(outS.within * 100).toFixed(0)}%  plan ${(outS.planAgree * 100).toFixed(0)}%  -> ${pass ? "PASS" : "FAILED"}`);
  console.log("refit on all levels");
  const f2 = fitConstants(cells, f1.fit);
  f2.fit.residual = fitResidual(cells, f2.fit);
  const all = score(cells, f2.fit);
  const perLevel = tags.map((t) => { const s = score(cells.filter((c) => c.level === t), f2.fit); return `${t}${held.has(t) ? "*" : ""}: ${(s.within * 100).toFixed(0)}% / ${(s.planAgree * 100).toFixed(0)}%`; });
  const file: FitFile = { ...f2.fit, engine: ENGINE_VERSION, content: CONTENT_VERSION, fittedOn: new Date().toISOString().slice(0, 10), note: `fitted on ${cells.length} sim break searches, ${tags.length} levels; held-out ${[...held].join(",")} within ${(outS.within * 100).toFixed(0)}% plan ${(outS.planAgree * 100).toFixed(0)}% ${pass ? "PASS" : "FAILED"}` };
  const target = new URL("../packages/bots/data/defendFit.json", import.meta.url);
  const wrote = pass || force;
  writeFileSync(wrote ? target : new URL("../packages/bots/data/defendFit.candidate.json", import.meta.url), JSON.stringify(file, null, 2) + "\n");
  const rep = [
    `# Defend model fit ${new Date().toISOString()}`, `engine ${ENGINE_VERSION}, content ${CONTENT_VERSION}, ${cells.length} cells (${LEVELS.length} levels configured)`,
    `Held-out levels (*): ${[...held].join(", ")}`,
    `Gate: breaking size within 25% on >= 80% of waves AND same best plan on >= 80% (held-out): **${pass ? "PASS" : "FAILED"}**`,
    `| set | within 25% | same best plan |`, `|---|---|---|`,
    `| current file, held-out | ${(before.within * 100).toFixed(0)}% | ${(before.planAgree * 100).toFixed(0)}% |`,
    `| refit, train | ${(inS.within * 100).toFixed(0)}% | ${(inS.planAgree * 100).toFixed(0)}% |`, `| refit, held-out | ${(outS.within * 100).toFixed(0)}% | ${(outS.planAgree * 100).toFixed(0)}% |`,
    `| final refit, all | ${(all.within * 100).toFixed(0)}% | ${(all.planAgree * 100).toFixed(0)}% |`,
    `Per level (within / plan): ${perLevel.join("; ")}`, `Constants: ${JSON.stringify({ ...f2.fit, skill: undefined })}`,
    wrote ? `Wrote packages/bots/data/defendFit.json` : `NOT promoted: wrote packages/bots/data/defendFit.candidate.json (rerun with --force to promote)`,
  ].join("\n");
  writeFileSync(`${DATA_DIR}/defend-fit-report.md`, rep + "\n");
  console.log(rep);
  process.exit(pass ? 0 : 3);
}
main();

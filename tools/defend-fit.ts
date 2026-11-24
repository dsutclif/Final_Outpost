import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { content, CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { DEFEND_FIT_FILE, defendInput, predictRho, type DefendFit, type DefendInput, type FitFile } from "../packages/bots/src/index.js";
import { DATA_DIR, LEVELS, RUNS_FILE, loadLevel, modelStrategy, type CellLine, type RunLine, type SimStrategy, type Variant } from "./defend-lib.js";

// Defend model fit (outpost-ops#273, #350). Reads the run lines of tools/defend-collect.ts, fits the behaviour constants of packages/bots/data/defendFit.json
// (eta/overkill, presence, pickupDelay, walkShare, pileUse, feedWeight, reach, exposure, fightPickup, reviveDelay) and the small residual correction
// (sim = exp(b) * model^a), then checks held-out levels: the breaking size within 25% on >= 80% of waves, and the same best plan on >= 80%. Writes the
// report; the fit file is replaced only when the held-out check passes (else defendFit.candidate.json and a FAILED report).
//   pnpm exec vite-node tools/defend-fit.ts -- [--force] [--evals 3] [--score] [--old-cells]
// #350 F3: cells are rebuilt from the run lines. A run the level's clock ended (reason "budget") is neither a hold nor a loss and is dropped (the
// collector counted it as held, so most cells were "censored at 60x" by the clock, not by the defence). A cell with a held and a lost run is
// two-sided (sim = geometric middle of the bracket); one with holds only is one-sided (sim >= lo). Constants and residual are fitted under ONE
// objective (log error on two-sided cells, shortfall below lo on one-sided ones, the residual applied to every cell); the gate is scored on
// two-sided cells only, one-sided agreement is reported apart. --score: score the current fit file, no refit. --old-cells: the collector's own
// cell lines (the before numbers).
const args = process.argv.slice(2).filter((a) => a !== "--");
const force = args.includes("--force"), scoreOnly = args.includes("--score"), oldCells = args.includes("--old-cells");
const SWEEPS = args.includes("--evals") ? Number(args[args.indexOf("--evals") + 1]) : 2;
const CEIL = 60, FLOORM = 0.05, TOL = 0.25, GATE = 0.8;

interface Cell { level: string; variant: Variant; strategy: SimStrategy; wave: number; seed: number; prior: number[]; sim: number; censored: boolean; lo: number; hi: number | null }
const key = (level: string, v: Variant) => `${level}|${v}`;

/** The collector's own cell lines (budget-ended runs counted as held). */
function loadCells(): Cell[] {
  if (!existsSync(RUNS_FILE)) throw new Error(`no data at ${RUNS_FILE}`);
  const out: Cell[] = [];
  for (const l of readFileSync(RUNS_FILE, "utf8").split(/\r?\n/)) {
    if (!l.trim()) continue;
    let j: CellLine;
    try { j = JSON.parse(l) as CellLine; } catch { continue; }
    if (j.kind !== "cell" || j.engine !== ENGINE_VERSION || !j.prior) continue;
    out.push({ level: j.level, variant: j.variant, strategy: j.strategy, wave: j.wave, seed: j.seed, prior: j.prior, sim: Math.max(FLOORM, Math.min(CEIL, j.est)), censored: !j.hi && j.lo >= CEIL * 0.99, lo: j.lo, hi: j.hi });
  }
  return out;
}

/** Cells from the run lines (#350 F3): clock-ended runs dropped; held = won, lost = the base fell. */
function cellsFromRuns(): Cell[] {
  if (!existsSync(RUNS_FILE)) throw new Error(`no data at ${RUNS_FILE}`);
  const groups = new Map<string, { r: RunLine; m: number }[]>();
  for (const l of readFileSync(RUNS_FILE, "utf8").split(/\r?\n/)) {
    if (!l.trim()) continue;
    let j: RunLine;
    try { j = JSON.parse(l) as RunLine; } catch { continue; }
    if (j.kind !== "run" || j.engine !== ENGINE_VERSION || j.reason === "budget") continue;
    const prior = j.mult.slice(0, j.wave);
    const k = `${j.level}|${j.variant}|${j.strategy}|${j.wave}|${j.seed}|${prior.map((x) => x.toFixed(4)).join(",")}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push({ r: j, m: j.mult[j.wave]! });
  }
  const out: Cell[] = [];
  for (const g of groups.values()) {
    const held = g.filter((x) => x.r.won).map((x) => x.m);
    if (!held.length) continue; // lost at every size tried: no bracket
    const lo = Math.max(...held), above = g.filter((x) => !x.r.won && x.m > lo).map((x) => x.m);
    const hi = above.length ? Math.min(...above) : null, r = g[0]!.r;
    out.push({ level: r.level, variant: r.variant, strategy: r.strategy, wave: r.wave, seed: r.seed, prior: r.mult.slice(0, r.wave), lo, hi,
      sim: Math.max(FLOORM, Math.min(CEIL, hi ? Math.sqrt(lo * hi) : lo)), censored: hi === null });
  }
  return out;
}

const inputs = new Map<string, DefendInput>();
function inputFor(level: string, v: Variant): DefendInput {
  const k = key(level, v);
  if (!inputs.has(k)) inputs.set(k, defendInput(loadLevel(level, v) as never, content, 0));
  return inputs.get(k)!;
}

const cut = (full: DefendInput, n: number): DefendInput => ({ ...full, waves: full.waves.slice(0, n) });
const lostAt = (c: Cell, fit: DefendFit, m: number): boolean =>
  predictRho(cut(inputFor(c.level, c.variant), c.prior.length + 1), fit, 1, { dt: 0.5, strategy: modelStrategy(c.strategy), volumes: [...c.prior, m] }).lost;
/** Largest multiplier of wave `k` alone the model still holds (geometric bisection). */
function modelWave(c: Cell, fit: DefendFit): number {
  const lost = (m: number) => lostAt(c, fit, m);
  let lo = FLOORM, hi = CEIL;
  if (lost(lo)) return FLOORM;
  if (!lost(hi)) return CEIL;
  for (let i = 0; i < 9; i++) { const mid = Math.sqrt(lo * hi); if (lost(mid)) hi = mid; else lo = mid; }
  return lo;
}
const predict = (cells: Cell[], fit: DefendFit): number[] => cells.map((c) => modelWave(c, fit));
const corrected = (raw: number[], r: { a: number; b: number }): number[] => raw.map((m) => Math.max(FLOORM, Math.min(CEIL, Math.exp(r.b) * Math.pow(m, r.a))));
/** One cell's error: log miss on a two-sided cell; on a one-sided cell only a model below the held size counts. */
const cellErr = (c: Cell, m: number): number => (c.censored ? Math.min(0, Math.log(m / c.lo)) ** 2 : Math.log(m / c.sim) ** 2);

/** ln sim = b + a ln model over the two-sided cells the model does not clip. */
function fitResidualOn(cells: Cell[], raw: number[]): { a: number; b: number } {
  const pts = cells.map((c, i) => ({ x: Math.log(raw[i]!), y: Math.log(c.sim), ok: !c.censored && raw[i]! < CEIL && raw[i]! > FLOORM })).filter((p) => p.ok);
  if (pts.length < 8) return { a: 1, b: 0 };
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const a = sxx > 1e-9 ? Math.max(0.5, Math.min(1.5, sxy / sxx)) : 1;
  return { a, b: my - a * mx };
}
/** The fit's objective (#350 F3): the residual is fitted on the same raw predictions and applied to every cell, one-sided ones too. */
function objective(cells: Cell[], fit: DefendFit): { err: number; residual: { a: number; b: number } } {
  const raw = predict(cells, fit), residual = fitResidualOn(cells, raw), corr = corrected(raw, residual);
  return { err: cells.reduce((a, c, i) => a + cellErr(c, corr[i]!), 0) / Math.max(1, cells.length), residual };
}

const GRID: { k: "eta" | "presence" | "pickupDelay" | "walkShare" | "pileUse" | "feedWeight" | "reach" | "exposure" | "fightPickup" | "reviveDelay"; lo: number; hi: number }[] = [
  { k: "eta", lo: 0.15, hi: 1.5 }, { k: "presence", lo: 0.2, hi: 1 }, { k: "exposure", lo: 0.1, hi: 1.5 }, { k: "fightPickup", lo: 0, hi: 1 },
  { k: "reviveDelay", lo: 2, hi: 20 }, { k: "pickupDelay", lo: 0, hi: 12 }, { k: "walkShare", lo: 0, hi: 2 }, { k: "pileUse", lo: 0, hi: 1 },
  { k: "feedWeight", lo: 0, hi: 2 }, { k: "reach", lo: 50, hi: 160 },
];

/** Coordinate descent over the behaviour constants on a fixed sample of the training cells (two-sided cells first). */
function fitConstants(train: Cell[], start: DefendFit): { fit: DefendFit; err: number } {
  let rnd = 12345;
  const shuffled = [...train].sort((a, b) => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff), (rnd % 1000) - 500));
  const sample = [...shuffled.filter((c) => !c.censored), ...shuffled.filter((c) => c.censored)].slice(0, 110);
  let fit: DefendFit = { exposure: 0.5, fightPickup: 0, reviveDelay: 6, ...start };
  const o0 = objective(sample, fit);
  let best = o0.err;
  fit = { ...fit, residual: o0.residual };
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (const g of GRID) {
      const cur = fit[g.k] as number;
      const cands = [g.lo, (g.lo + cur) / 2, cur, (cur + g.hi) / 2, g.hi].map((v) => Math.max(g.lo, Math.min(g.hi, v)));
      for (const v of cands) {
        if (v === cur) continue;
        const f2 = { ...fit, [g.k]: v } as DefendFit;
        const ob = objective(sample, f2);
        if (ob.err < best - 1e-6) { best = ob.err; fit = { ...f2, residual: ob.residual }; }
      }
    }
    console.log(`  sweep ${sweep + 1}: err ${best.toFixed(4)}  ${GRID.map((g) => `${g.k} ${(fit[g.k] as number).toFixed(2)}`).join(" ")} res a ${fit.residual.a.toFixed(2)} b ${fit.residual.b.toFixed(2)}`);
  }
  return { fit, err: best };
}

interface Score { within: number; n: number; planAgree: number; plans: number; oneSided: number; nOne: number; corr: number[] }
/** The gate (#350 F3): within 25% on two-sided cells only; one-sided cells reported apart (model >= held size / 1.25). */
function score(cells: Cell[], fit: DefendFit): Score {
  const corr = corrected(predict(cells, fit), fit.residual);
  let within = 0, n = 0, one = 0, nOne = 0;
  cells.forEach((c, i) => {
    if (c.censored) { nOne++; if (corr[i]! * (1 + TOL) >= c.lo) one++; return; }
    n++;
    const r = corr[i]! / c.sim;
    if (r >= 1 / (1 + TOL) && r <= 1 + TOL) within++;
  });
  const groups = new Map<string, { c: Cell; m: number }[]>();
  cells.forEach((c, i) => { if (c.censored) return; const g = `${c.level}|${c.variant}|${c.wave}|${c.seed}`; (groups.get(g) ?? groups.set(g, []).get(g)!).push({ c, m: corr[i]! }); });
  let plans = 0, agree = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    plans++;
    const simBest = Math.max(...g.map((x) => x.c.sim));
    const pick = g.reduce((a, b) => (b.m > a.m ? b : a));
    if (pick.c.sim >= 0.9 * simBest) agree++;
  }
  return { within: n ? within / n : 0, n, planAgree: plans ? agree / plans : 1, plans, oneSided: nOne ? one / nOne : 1, nOne, corr };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
/** Level 21 per wave: sim bracket vs the model, and whether the model loses at the size the sim lost at. */
function l21Table(cells: Cell[], fit: DefendFit): string[] {
  const rows = [`| level | variant | wave | plan | sim held / lost at | model break | model loses at sim's lost size |`, `|---|---|---|---|---|---|---|`];
  let lossCells = 0, lossAgree = 0;
  for (const c of cells.filter((x) => x.level.includes("L021")).sort((a, b) => (a.level + a.variant).localeCompare(b.level + b.variant) || a.wave - b.wave || a.strategy.localeCompare(b.strategy))) {
    const m = corrected([modelWave(c, fit)], fit.residual)[0]!;
    let loses = "-";
    if (c.hi !== null) { lossCells++; const l = lostAt(c, fit, c.hi); if (l) lossAgree++; loses = l ? "yes" : "NO"; }
    rows.push(`| ${c.level} | ${c.variant} | ${c.wave + 1} | ${c.strategy} | ${c.lo.toFixed(2)} / ${c.hi === null ? "none" : c.hi.toFixed(2)} | ${m.toFixed(2)} | ${loses} |`);
  }
  rows.push(``, `Model loses at the sim's losing size on ${lossAgree} of ${lossCells} Level 21 cells with a sim loss.`);
  return rows;
}

function main(): void {
  const cells = oldCells ? loadCells() : cellsFromRuns();
  if (cells.length < 40) { console.error(`only ${cells.length} cells; collect more first`); process.exit(2); }
  const tags = [...new Set(cells.map((c) => c.level))].sort();
  const held = new Set(tags.filter((_, i) => i % 3 === 2));
  const train = cells.filter((c) => !held.has(c.level)), test = cells.filter((c) => held.has(c.level));
  const two = (cs: Cell[]) => cs.filter((c) => !c.censored).length;
  console.log(`cells ${cells.length} (${two(cells)} two-sided; train ${train.length} on ${tags.length - held.size} levels, held-out ${test.length} (${two(test)} two-sided) on ${[...held].join(",")})${oldCells ? " [collector cell lines]" : ""}`);
  const start = DEFEND_FIT_FILE;
  const before = score(test, start);
  const line = (s: Score) => `within 25% ${pct(s.within)} of ${s.n} two-sided, same best plan ${pct(s.planAgree)} (${s.plans} plans), one-sided ok ${pct(s.oneSided)} of ${s.nOne}`;
  console.log(`held-out with the current fit file: ${line(before)}`);
  if (scoreOnly) {
    const all = score(cells, start);
    console.log(`all cells with the current fit file: ${line(all)}`);
    for (const t of tags) { const s = score(cells.filter((c) => c.level === t), start); console.log(`  ${t}${held.has(t) ? "*" : ""}: ${line(s)}`); }
    console.log(l21Table(cells, start).join("\n"));
    return;
  }
  console.log("fit on training levels");
  const f1 = fitConstants(train, start);
  const inS = score(train, f1.fit), outS = score(test, f1.fit);
  const pass = outS.within >= GATE && outS.planAgree >= GATE && outS.n >= 8;
  console.log(`train: ${line(inS)}\nheld-out: ${line(outS)} -> ${pass ? "PASS" : "FAILED"}`);
  console.log("refit on all levels");
  const f2 = fitConstants(cells, f1.fit);
  const all = score(cells, f2.fit);
  const perLevel = tags.map((t) => { const s = score(cells.filter((c) => c.level === t), f2.fit); return `${t}${held.has(t) ? "*" : ""}: ${pct(s.within)} of ${s.n} / ${pct(s.planAgree)}`; });
  const file: FitFile = { ...f2.fit, engine: ENGINE_VERSION, content: CONTENT_VERSION, fittedOn: new Date().toISOString().slice(0, 10), note: `fitted on ${cells.length} sim break searches (${two(cells)} two-sided), ${tags.length} levels; held-out ${[...held].join(",")} within ${pct(outS.within)} plan ${pct(outS.planAgree)} ${pass ? "PASS" : "FAILED"}` };
  const target = new URL("../packages/bots/data/defendFit.json", import.meta.url);
  const wrote = pass || force;
  writeFileSync(wrote ? target : new URL("../packages/bots/data/defendFit.candidate.json", import.meta.url), JSON.stringify(file, null, 2) + "\n");
  const rep = [
    `# Defend model fit ${new Date().toISOString()}`, `engine ${ENGINE_VERSION}, content ${CONTENT_VERSION}, ${cells.length} cells, ${two(cells)} two-sided (${LEVELS.length} levels configured)`,
    `Held-out levels (*): ${[...held].join(", ")}`,
    `Gate: breaking size within 25% on >= 80% of two-sided waves AND same best plan on >= 80% (held-out): **${pass ? "PASS" : "FAILED"}**`,
    `| set | within 25% (two-sided) | same best plan | one-sided ok |`, `|---|---|---|---|`,
    `| current file, held-out | ${pct(before.within)} of ${before.n} | ${pct(before.planAgree)} | ${pct(before.oneSided)} of ${before.nOne} |`,
    `| refit, train | ${pct(inS.within)} of ${inS.n} | ${pct(inS.planAgree)} | ${pct(inS.oneSided)} of ${inS.nOne} |`, `| refit, held-out | ${pct(outS.within)} of ${outS.n} | ${pct(outS.planAgree)} | ${pct(outS.oneSided)} of ${outS.nOne} |`,
    `| final refit, all | ${pct(all.within)} of ${all.n} | ${pct(all.planAgree)} | ${pct(all.oneSided)} of ${all.nOne} |`,
    `Per level (within / plan): ${perLevel.join("; ")}`, `Constants: ${JSON.stringify({ ...f2.fit, skill: undefined })}`,
    wrote ? `Wrote packages/bots/data/defendFit.json` : `NOT promoted: wrote packages/bots/data/defendFit.candidate.json (rerun with --force to promote)`,
    ``, ...l21Table(cells, f2.fit),
  ].join("\n");
  writeFileSync(`${DATA_DIR}/defend-fit-report.md`, rep + "\n");
  console.log(rep);
  process.exit(pass ? 0 : 3);
}
main();

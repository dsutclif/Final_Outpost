import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { compactRow, keepRawLog } from "./candidate-log.js";
import { cpus } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { computeReference, measure, score, type HistoryEntry, type Measurement, type Metrics } from "../packages/rater/src/index.js";
import { content as defaultContent } from "../packages/content/src/index.js";
import { findFit, whyNotFit, type PoolEntry } from "../packages/sequencer/src/pool.js";
import { historyOf, recipeKey, recipeOf, sequenceRange, type LevelRequest, type RecipeRegister } from "../packages/sequencer/src/index.js";
import { loadPool, readPoolLevel, removeEntry, savePassing } from "./level-pool.js";
import { buildWithRerolls, describeRecipe, stopMessage, type SlotOutcome } from "./recipe-reroll.js";
import { GEN, GENERATOR_REFERENCE, applyNightCadence, attachRating, calibrationSample, composeStart, composerSwap, dedupeTitles, generateDetailed, newSearchMemory, templateById, withWaveFallback, type Candidate, type CandidateRecord, type ComposerLog, type Composition } from "../packages/generator/src/index.js";
import { hashStr, mix } from "../packages/generator/src/rand.js";
import { digestLog } from "./candidate-digest.js";
import { VARIETY } from "../packages/rater/src/variety.js";
import { varietyPass, type Signed } from "./variety-pass.js";

// pnpm levels:build --from 6 --to 60 --out levels/packs/s1 [--jobs N] [--retries N] [--calibrate] [--verbose]
//   [--target-offset X] [--no-doc] [--register path] [--pool path] [--no-pool]
//
// Sequencer -> generator -> rater for each index. Requests come from the sequencer with the earlier
// requests as history, so every level can be generated independently: the CLI runs one child
// process per level, `--jobs` at a time (default: cores - 2). A level whose search fails retries with
// new seeds; after the last retry the closest feasible, filter-clean candidate ships (reported as off
// target) if it is within the register's failGap of its target. Otherwise the recipe failed: it goes
// into the recipe register (packages/sequencer/data/recipe-register.json, or --register) and the slot
// re-rolls with a new recipe, rebuilding every later slot whose request changed; after maxRerolls the
// build stops and names the level and its recipes (tools/recipe-reroll.ts, outpost-ops#198). `--calibrate` first measures one unsearched sample per level and rewrites the
// generator's reference stats (packages/generator/data/reference.json). `--target-offset` shifts every
// level's target difficulty (batch tuning, tools/levels-next.ts); `--no-doc` leaves docs/LEVELS.md alone.
// Every search iteration, rejected or not, is appended to levels/candidates/<pack>.jsonl (outside
// levels/packs, which the client serves; gitignored) and folded into a small daily digest for working
// out up-front generation rules (tools/candidate-digest.ts).
// Pool and place (outpost-ops#254): a candidate that passes every check except its slot's D target is saved
// in the level pool (packages/sequencer/data/level-pool.json, or --pool) instead of being thrown away. Before a
// slot is generated, the parent looks for a pool level that fits it (D within failGap, family, goal, features,
// no duplicate in the window); a placed level is re-rated before it is written and leaves the pool. `--no-pool`
// builds from scratch: nothing is placed and nothing is saved.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const argv = process.argv.slice(2);
const arg = (name: string, def?: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name: string): boolean => argv.includes(name);
const base = process.env["INIT_CWD"] ?? process.cwd();
const abs = (p: string) => (isAbsolute(p) ? p : resolve(base, p));

export interface LevelResult {
  index: number;
  id: string;
  file: string;
  title: string;
  phase: string;
  family: string;
  secondary: string | null;
  features: string[];
  objectives: { id: string; kind: string; params: Record<string, number | string> }[];
  /** Mean stars of the good and median bots, share of good seeds with three stars, and per rung. */
  stars: { good: number; median: number; goodAll: number };
  starsByRung: Record<string, number>;
  introduced: string[];
  modules: string[];
  goal: string;
  template: string;
  target: number;
  D: number;
  F: number;
  onTarget: boolean;
  margin: Record<string, number>;
  winRate: Record<string, number>;
  botsPassed: string[];
  /** Beat sheet from the rater's median bot run (outpost-ops#149): ordered first occurrences with ticks. */
  beats: { beat: string; tick: number }[];
  /** Variety signature (outpost-ops#150): no two non-exempt levels of a pack share one. */
  signature?: string;
  seconds: number;
  seed: number;
  attempts: number;
  rejects: Record<string, number>;
  ratings: number;
  /** Defend levels: false where the denser waves failed and the level was built with today's wave sizing (outpost-ops#93). */
  denseWaves?: boolean;
}

const historyFor = (reqs: readonly LevelRequest[], index: number): HistoryEntry[] =>
  reqs.slice(0, index - 1).map((r) => ({ id: r.id, modules: r.modules, goal: r.goalType, template: templateById(r.template).zones.join("|") }));

// ---------- worker: one level ----------

const DEFAULT_REGISTER_PATH = join(root, "packages", "sequencer", "data", "recipe-register.json");
const DEFAULT_POOL_PATH = join(root, "packages", "sequencer", "data", "level-pool.json");
const loadRegister = (path: string): RecipeRegister => JSON.parse(readFileSync(path, "utf8")) as RecipeRegister;

/** Requests of `indices` given the register (entries from an older engine are ignored). */
const requestsFor = (indices: number[], targetOffset: number) => (register: RecipeRegister): Map<number, LevelRequest> => {
  const all = sequenceRange(1, Math.max(...indices), [], { targetOffset, register, engine: ENGINE_VERSION });
  return new Map(indices.map((i) => [i, all[i - 1]!] as const));
};

function workLevel(index: number, outDir: string, retries: number, verbose: boolean, targetOffset: number, retryBase = 0, registerPath = DEFAULT_REGISTER_PATH, avoidPath?: string, placeId?: string, poolPath = DEFAULT_POOL_PATH): void {
  const register = loadRegister(registerPath);
  const reqs = sequenceRange(1, index, [], { targetOffset, register, engine: ENGINE_VERSION });
  const req = reqs[index - 1]!;
  // --avoid: signatures of the levels built before this one, from the parent's variety pass (outpost-ops#150)
  const avoid = avoidPath ? (JSON.parse(readFileSync(avoidPath, "utf8")) as { id: string; signature: string }[]) : [];
  // merged into the planned entries by id, so novelty (the last five entries) still reads the plan
  const sig = new Map(avoid.map((a) => [a.id, a.signature] as const));
  const planned = historyFor(reqs, index);
  const history: HistoryEntry[] = [
    ...avoid.filter((a) => !planned.some((h) => h.id === a.id)).map((a) => ({ ...a, modules: [], goal: "" })),
    ...planned.map((h) => (h.id !== undefined && sig.has(h.id) ? { ...h, signature: sig.get(h.id)! } : h)),
  ];
  const t0 = Date.now();
  const rejects: Record<string, number> = {};
  let ratings = 0, attempts = 0;
  // Pool placement (outpost-ops#254): the parent picked a pool level for this slot. It is re-rated here with the
  // full ladder against the slot's target and fun bar before anything is written; a level that fails goes back to the normal search.
  if (placeId) {
    const e = loadPool(poolPath).entries.find((x) => x.id === placeId);
    const m = e ? readPoolLevel(poolPath, e) as ReturnType<typeof JSON.parse> : null;
    if (e && m) {
      m.id = req.id;
      applyNightCadence(m, index);
      const ms = measure(m, { content: defaultContent, refSeeds: GEN.search.fullSeeds.ref, otherSeeds: GEN.search.fullSeeds.other, history });
      const r = score(ms, { content: defaultContent, reference: GENERATOR_REFERENCE });
      const gap = Math.abs(r.D - req.target);
      const why = !r.ok ? `rating filters failed (${Object.entries(r.filters).filter(([, v]) => v).map(([k]) => k).join(", ")})` : r.F < req.funThreshold ? `fun ${r.F.toFixed(3)} below ${req.funThreshold}` : gap > register.settings.failGap ? `D ${r.D.toFixed(3)} is ${gap.toFixed(3)} from target ${req.target}` : null;
      if (why) process.stdout.write(`POOL recheck-failed ${JSON.stringify({ entry: e.id, why })}\n`);
      else {
        const stars = (m.rating?.stars ?? { good: 0, median: 0, goodAll: 0 }) as { good: number; median: number; goodAll: number };
        attachRating(m, r, req.introduced, m.rating?.stars, m.rating?.loopMax);
        const file = `${m.id}.json`;
        writeFileSync(join(outDir, file), JSON.stringify(m, null, 2) + "\n");
        const res: LevelResult = {
          index, id: m.id, file, title: m.text["mars_greenhouse"]?.title ?? m.id, phase: req.phase, introduced: req.introduced,
          family: req.family, secondary: req.secondary, features: req.features, objectives: (m.objectives ?? []) as LevelResult["objectives"],
          stars, starsByRung: e.starsByRung, modules: m.modules, goal: m.goal.type, template: req.template, target: req.target, D: r.D, F: r.F,
          onTarget: gap <= GEN.search.tolerance, margin: r.margin, winRate: r.winRate, botsPassed: r.botsPassed, beats: r.beats, signature: r.signature,
          seconds: (Date.now() - t0) / 1000, seed: m.seed, attempts: 0, rejects: {}, ratings: 1,
        };
        process.stdout.write(`POOL placed ${JSON.stringify({ entry: e.id, D: r.D, from: e.slotId })}\n`);
        process.stdout.write(`CANDIDATES []\n`);
        process.stdout.write(`RESULT ${JSON.stringify({ ...res, req })}\n`);
        return;
      }
    } else process.stdout.write(`POOL recheck-failed ${JSON.stringify({ entry: placeId, why: "entry or its level file is missing" })}\n`);
  }
  const candidates: (CandidateRecord & { attempt: number; seed: number })[] = [];
  // Add-on composer (packages/generator/src/composer.ts): the starting set from the add-ons' difficulty steps, the knob
  // search on it, then at most composer.maxSwaps single add/remove swaps when every measured D misses the target one way.
  let composed: Composition | null = null;
  const say = (s: string) => process.stderr.write(`[${req.id}] ${s}\n`);
  const search = () => {
    let best: Candidate | null = null, shipped: Candidate | null = null;
    let comp = composeStart(req, GEN.conveyorGoals);
    let decision: ComposerLog["decision"] = { action: "start", why: `estimate ${comp.estimate.lo}-${comp.estimate.hi} (mid ${comp.estimate.mid}) for target ${req.target}` };
    for (let round = 0; ; round++) {
      const clog: ComposerLog = { round, features: comp.features, estimate: comp.estimate, cap: comp.cap, optionalModules: comp.optionalModules, decision,
        ...(comp.dropped.length > 0 ? { dropped: comp.dropped } : {}), ...(comp.notes.length > 0 ? { notes: comp.notes } : {}) };
      say(`composer round ${round}: ${decision.action}${decision.feature ? ` ${decision.feature}` : ""} (${decision.why}) -> [${comp.features.join(", ")}] est ${comp.estimate.mid}, optional modules ${comp.optionalModules}/${comp.cap}`
        + (comp.dropped.length > 0 ? `, left out ${comp.dropped.map((d) => `${d.feature}: ${d.why}`).join("; ")}` : "") + (comp.notes.length > 0 ? `, ${comp.notes.join("; ")}` : ""));
      const creq = { ...req, features: comp.features, modules: comp.modules };
      const measured: number[] = [];
      const memory = newSearchMemory();
      for (let k = retryBase; k <= retryBase + retries && !shipped && !memory.settled; k++) {
        attempts++;
        const seed = k === 0 ? req.seed : mix(req.seed, hashStr(`retry${k}`)) & 0x7fffffff;
        const d = generateDetailed({ ...creq, seed }, { history, memory, finish: k === retryBase + retries,
          onCandidate: (c) => { candidates.push({ ...c, attempt: k, seed, composer: clog }); if (c.rating?.feasible) measured.push(c.rating.D); }, ...(verbose ? { log: say } : {}) });
        for (const [r, n] of Object.entries(d.stats.rejects)) rejects[r] = (rejects[r] ?? 0) + n;
        ratings += d.stats.ratings;
        if (d.manifest && d.best) shipped = d.best;
        if (d.best && (!best || d.best.err < best.err)) { best = d.best; composed = comp; }
      }
      if (shipped) { composed = comp; break; }
      const sw = composerSwap(req, comp, measured, GEN.search.tolerance, round);
      say(`composer round ${round} measured D ${measured.length > 0 ? `${Math.min(...measured).toFixed(3)}-${Math.max(...measured).toFixed(3)} (n ${measured.length})` : "none"}: ${sw.action}${sw.feature ? ` ${sw.feature}` : ""} (${sw.why})`);
      if (sw.action === "none" || !sw.next) break;
      decision = { action: sw.action, ...(sw.feature ? { feature: sw.feature } : {}), why: sw.why,
        measured: { n: measured.length, min: measured.length > 0 ? Math.min(...measured) : 0, max: measured.length > 0 ? Math.max(...measured) : 0 } };
      comp = sw.next;
    }
    return { shipped, pick: shipped ?? best };
  };
  // Denser defend waves (outpost-ops#93): a recipe they fail is searched again with today's wave sizing (Doug, 2026-11-17).
  const failGap = register.settings.failGap;
  const { result: { shipped, pick }, dense } = withWaveFallback(req.family === "defend" || req.secondary === "defend", search,
    (s) => !s.pick || Math.abs(s.pick.rating.D - req.target) > failGap);
  if (verbose && !dense && (req.family === "defend" || req.secondary === "defend")) process.stderr.write(`[${req.id}] built with today's wave sizing\n`);
  const level = { index, id: req.id, family: req.family, secondary: req.secondary, features: (composed as Composition | null)?.features ?? req.features, goalType: req.goalType, template: req.template, target: req.target };
  process.stdout.write(`CANDIDATES ${JSON.stringify(candidates.map((c) => ({ ...level, ...c })))}\n`);
  // The recipe failed (outpost-ops#198): nothing ships, or the closest level is further than the
  // register's failGap from its target. Nothing is written; the parent registers it and re-rolls.
  if (!pick || Math.abs(pick.rating.D - req.target) > register.settings.failGap) {
    process.stdout.write(`RESULT ${JSON.stringify({ index, id: req.id, family: req.family, secondary: req.secondary, failed: true, req, closestD: pick ? pick.rating.D : null, attempts, rejects, seconds: (Date.now() - t0) / 1000 })}\n`);
    return;
  }
  const m = pick.manifest;
  applyNightCadence(m, index);
  const file = `${m.id}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(m, null, 2) + "\n");
  const r = pick.rating;
  const res: LevelResult = {
    index, id: m.id, file, title: m.text["mars_greenhouse"]?.title ?? m.id, phase: req.phase, introduced: req.introduced,
    family: req.family, secondary: req.secondary, features: (composed as Composition | null)?.features ?? req.features, objectives: (m.objectives ?? []) as LevelResult["objectives"],
    stars: pick.stars, starsByRung: pick.starsByRung,
    modules: m.modules, goal: m.goal.type, template: req.template, target: req.target, D: r.D, F: r.F, onTarget: shipped !== null,
    margin: r.margin, winRate: r.winRate, botsPassed: r.botsPassed, beats: r.beats, signature: r.signature, seconds: (Date.now() - t0) / 1000, seed: m.seed,
    attempts, rejects, ratings, ...(req.family === "defend" || req.secondary === "defend" ? { denseWaves: dense } : {}),
  };
  process.stdout.write(`RESULT ${JSON.stringify({ ...res, req })}\n`);
}

function workCalib(index: number): void {
  const reqs = sequenceRange(1, index);
  const s = calibrationSample(reqs[index - 1]!);
  process.stdout.write(`RESULT ${JSON.stringify({ index, sample: s })}\n`);
}

// ---------- main ----------

function runChild(args: string[]): Promise<string> {
  const viteNode = join(root, "node_modules", "vite-node", "vite-node.mjs");
  return new Promise((ok) => {
    const ch = spawn(process.execPath, [viteNode, fileURLToPath(import.meta.url), "--", ...args], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    ch.stdout.on("data", (b: Buffer) => { out += b.toString(); });
    ch.on("close", () => ok(out));
  });
}

async function pool<T>(items: number[], jobs: number, fn: (i: number) => Promise<T>, onDone: (i: number, r: T) => void): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (queue.length > 0) {
      const i = queue.shift()!;
      onDone(i, await fn(i));
    }
  }));
}

const parseResult = (out: string): Record<string, unknown> | null => {
  const line = out.split(/\r?\n/).find((l) => l.startsWith("RESULT "));
  return line ? JSON.parse(line.slice(7)) as Record<string, unknown> : null;
};

async function main(): Promise<void> {
  const from = Number(arg("--from", "6")), to = Number(arg("--to", "60"));
  const outDir = abs(arg("--out", "levels/packs/s1")!);
  const jobs = Number(arg("--jobs", String(Math.max(1, cpus().length - 2))));
  const retries = Number(arg("--retries", "3"));
  const verbose = flag("--verbose");
  const packId = outDir.split(/[\\/]/).pop()!;
  mkdirSync(outDir, { recursive: true });
  // --only 12,15 rebuilds just those numbers (the supply refilling slots whose seeds all failed);
  // --retry-base N starts their retry seeds at N so a refill tries seeds the first pass never did.
  const only = arg("--only");
  const indices = only ? only.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0) : Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const retryBase = arg("--retry-base", "0")!;
  const t0 = Date.now();

  if (flag("--calibrate")) {
    console.log(`calibrating: one unsearched sample per level, ${jobs} jobs`);
    const samples: { goal: string; metrics: Metrics }[] = [];
    await pool(indices, jobs, (i) => runChild(["--calib", "--index", String(i)]), (i, out) => {
      const r = parseResult(out) as { sample: { goal: string; metrics: Metrics } | null } | null;
      if (r?.sample) samples.push(r.sample); else console.log(`  L${i}: no calibration sample`);
    });
    const ref = computeReference(samples.map((s) => ({ metrics: s.metrics, manifest: { goal: { type: s.goal } } }) as unknown as Measurement),
      `generated calibration batch: ${samples.length} unsearched samples of levels ${from}-${to} (refSeeds 10, others 3)`);
    const refPath = join(root, "packages", "generator", "data", "reference.json");
    writeFileSync(refPath, JSON.stringify(ref, null, 2) + "\n");
    console.log(`wrote ${relative(root, refPath)} from ${samples.length} samples in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  console.log(`building ${packId} levels ${only ? indices.join(",") : `${from}-${to}`} with ${jobs} jobs`);
  const results: LevelResult[] = [];
  const failed: { index: number; rejects: unknown }[] = [];
  // Levels whose every seed failed. A crashed worker is not one: it says nothing about the level.
  const dropped: { index: number; id: unknown; family: unknown; secondary: unknown; rejects: unknown }[] = [];
  const offset = arg("--target-offset", "0")!;
  const candPath = join(root, "levels", "candidates", `${packId}.jsonl`);
  mkdirSync(dirname(candPath), { recursive: true });
  const run = new Date(t0).toISOString();
  // A failed recipe is registered and the slot re-rolled (tools/recipe-reroll.ts, outpost-ops#198).
  const registerPath = abs(arg("--register", DEFAULT_REGISTER_PATH)!);
  const register = loadRegister(registerPath);
  // #251: every row of this build is also kept in memory, so the raw log can be archived whole (levels/candidates/archive, and the ops backup) at the end.
  const buildId = run.replace(/[:.]/g, "-");
  const rowsOfBuild: string[] = [];
  const log = (rec: object) => { const line = JSON.stringify({ run, engine: ENGINE_VERSION, content: CONTENT_VERSION, ...rec }); rowsOfBuild.push(line); appendFileSync(candPath, line + "\n"); };
  log({ kind: "build", buildId, pack: packId, start: run, jobs, retries, only: only ?? null, from, to, targetOffset: Number(arg("--target-offset", "0")), indices });
  const rerolls = new Map<number, number>();
  let candN = 0;
  // Pool and place (#254). Entries a running slot has claimed are not offered to another slot.
  const poolOn = !flag("--no-pool");
  const poolPath = abs(arg("--pool", DEFAULT_POOL_PATH)!);
  const claimed = new Set<string>();
  const poolLog = (rec: Record<string, unknown>, text: string) => { log({ kind: "pool", ...rec }); console.log(`  pool: ${text}`); };
  const poolEntry = (e: PoolEntry) => `${e.id} (D ${e.D}, ${e.family}, goal ${e.goalId}, from ${e.slotId})`;
  const build = async (i: number, sent: LevelRequest, extra: string[] = []): Promise<SlotOutcome<LevelResult>> => {
    let fit: PoolEntry | null = null;
    if (poolOn && extra.length === 0) {
      const reqs = sequenceRange(1, i, [], { targetOffset: Number(offset), register, engine: ENGINE_VERSION });
      const hist = reqs.slice(0, i - 1).map(historyOf);
      const opts = { failGap: register.settings.failGap, engine: ENGINE_VERSION, claimed };
      const pool = loadPool(poolPath);
      fit = findFit(pool, sent, hist, opts);
      if (fit) { claimed.add(fit.id); poolLog({ event: "hit", index: i, id: sent.id, target: sent.target, entry: fit.id, D: fit.D, family: fit.family, goalId: fit.goalId, from: fit.slotId }, `HIT L${i} (target ${sent.target}) takes ${poolEntry(fit)}`); }
      else {
        const near = pool.entries.filter((e) => e.family === sent.family && e.secondary === sent.secondary).map((e) => ({ e, why: whyNotFit(e, sent, hist, opts) })).filter((x) => x.why !== null).sort((a, b) => Math.abs(a.e.D - sent.target) - Math.abs(b.e.D - sent.target))[0];
        poolLog({ event: "miss", index: i, id: sent.id, target: sent.target, pooled: pool.entries.length, nearest: near ? { entry: near.e.id, D: near.e.D, why: near.why } : null }, `miss L${i} (target ${sent.target}), ${pool.entries.length} pooled${near ? `; nearest same-family ${near.e.id} D ${near.e.D}: ${near.why}` : ""}`);
      }
    }
    const out = await runChild(["--worker", "--index", String(i), "--out", outDir, "--retries", String(retries), "--retry-base", retryBase, "--target-offset", offset, "--register", registerPath, "--pool", poolPath, ...(fit ? ["--place", fit.id] : []), ...(verbose ? ["--verbose"] : []), ...extra]);
    if (fit) {
      const line = out.split("\n").map((l) => l.trim()).find((l) => l.startsWith("POOL "));
      claimed.delete(fit.id);
      if (line?.startsWith("POOL placed")) { removeEntry(poolPath, fit.id); poolLog({ event: "placed", index: i, id: sent.id, entry: fit.id }, `placed ${fit.id} in L${i}, removed from the pool`); }
      else { removeEntry(poolPath, fit.id); poolLog({ event: "recheck-failed", index: i, id: sent.id, entry: fit.id, detail: line ? JSON.parse(line.slice(line.indexOf("{"))) : null }, `${fit.id} failed its re-check for L${i} (${line ?? "no report"}); dropped, slot searched normally`); }
    }
    const r = parseResult(out);
    const cands = out.split("\n").find((l) => l.startsWith("CANDIDATES "));
    if (cands) {
      const rows = JSON.parse(cands.slice(11)) as (CandidateRecord & { index: number })[];
      const recipeId = recipeKey(recipeOf(sent)), reroll = rerolls.get(i) ?? 0;
      for (const c of rows) log({ n: ++candN, recipeId, reroll, ...compactRow(c) });
      if (poolOn) {
        // every candidate that passed all checks but the slot's D target is kept (the level that shipped is not)
        const shippedD = r && !r["failed"] ? (r["D"] as number) : null;
        const saved = savePassing(poolPath, sent, recipeId, rows as never, { engine: ENGINE_VERSION, date: run.slice(0, 10), skipD: shippedD });
        for (const e of saved) poolLog({ event: "save", index: i, id: sent.id, entry: e.id, D: e.D, F: e.F, target: sent.target, family: e.family, goalId: e.goalId, recipeId }, `saved ${poolEntry(e)} (slot target ${sent.target})`);
      }
      // per recipe: the lowest and highest D any candidate reached (a target outside it is out of reach for this recipe)
      const Ds = rows.map((c) => c.rating?.D).filter((d): d is number => typeof d === "number");
      log({ kind: "recipe", index: i, id: sent.id, recipeId, reroll, target: sent.target, candidates: rows.length, rated: Ds.length, Dmin: Ds.length ? Math.min(...Ds) : null, Dmax: Ds.length ? Math.max(...Ds) : null, shipped: rows.some((c) => c.shipped) });
    }
    if (!r) { console.log(`  L${i}: worker crashed`); return { req: sent, ok: false, crashed: true, closestD: null, seeds: 0, rejects: {} }; }
    const req = r["req"] as LevelRequest;
    if (r["failed"]) {
      const d = r["closestD"] as number | null;
      console.log(`  L${i}: recipe failed (${d === null ? "nothing shipped" : `closest D=${d.toFixed(3)}, target ${req.target}`}) ${JSON.stringify(r["rejects"] ?? {})}`);
      return { req, ok: false, closestD: d, seeds: r["attempts"] as number, rejects: r["rejects"] as Record<string, number> };
    }
    const { req: _req, ...lr } = r as unknown as LevelResult & { req: LevelRequest };
    console.log(`  L${i} ${lr.onTarget ? "ok " : "off"} D=${lr.D.toFixed(3)} (target ${lr.target}) F=${lr.F.toFixed(3)} ${lr.seconds.toFixed(0)}s`);
    return { req, ok: true, result: lr, closestD: lr.D, seeds: lr.attempts, rejects: lr.rejects };
  };
  const rep = await buildWithRerolls({
    indices, register, engine: ENGINE_VERSION, jobs, date: new Date(t0).toISOString().slice(0, 10),
    requests: requestsFor(indices, Number(offset)), build,
    // written whole then renamed, so a worker starting meanwhile never reads half a file
    onRegister: (_e, reg) => { writeFileSync(`${registerPath}.tmp`, JSON.stringify(reg, null, 2) + "\n"); renameSync(`${registerPath}.tmp`, registerPath); },
    onEvent: (ev) => {
      rerolls.set(ev.index, (rerolls.get(ev.index) ?? 0) + 1);
      log({ kind: "reroll", index: ev.index, id: ev.id, from: ev.from, to: ev.to, reason: ev.reason });
      console.log(`  L${ev.index}: re-roll -> ${ev.to ? describeRecipe(ev.to) : "none"}`);
    },
  });
  // Variety pass (outpost-ops#150): no level of the pack the same as an earlier one. Earlier levels outside this
  // build come from the pack's build log; levels from before the rule carry no signature and match nothing.
  const logPath = join(outDir, "build-log.json");
  const prevLog: LevelResult[] = existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) as LevelResult[] : [];
  const before: Signed[] = prevLog.filter((r) => !rep.results.has(r.index)).map((r) => ({ index: r.index, id: r.id, signature: r.signature }));
  const avoidDir = join(root, "levels", "candidates", "avoid");
  mkdirSync(avoidDir, { recursive: true });
  const variety = await varietyPass({
    before, results: rep.results, maxPasses: VARIETY.maxPasses, log: (s) => console.log(s),
    rebuild: async (i, avoid) => {
      const file = join(avoidDir, `${packId}-L${i}.json`);
      writeFileSync(file, JSON.stringify(avoid));
      const out = await build(i, requestsFor([i], Number(offset))(loadRegister(registerPath)).get(i)!, ["--avoid", file]);
      log({ kind: "variety", index: i, ok: out.ok, avoided: avoid.length });
      return out.ok ? out.result! : null;
    },
  });
  for (const u of variety.unresolved) failed.push({ index: u.index, rejects: { duplicateOf: u.sameAs } });
  results.push(...variety.results.values());
  for (const i of rep.crashed) failed.push({ index: i, rejects: {} });
  if (rep.stopped) {
    const s = rep.stopped;
    log({ kind: "reroll", index: s.index, stopped: s.reason, tried: s.tried });
    failed.push({ index: s.index, rejects: {} });
    const req = requestsFor([s.index], Number(offset))({ ...register, entries: [] }).get(s.index)!;
    dropped.push({ index: s.index, id: req.id, family: req.family, secondary: req.secondary, rejects: { recipes: s.tried.length } });
  }
  log({ kind: "buildEnd", buildId, end: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), candidates: candN });
  keepRawLog(rowsOfBuild, join(dirname(candPath), "archive"), `${packId}-${buildId}.jsonl.gz`, flag("--no-backup") ? null : join(root, "..", "outpost-ops", "data", "bot-runs", "candidates"));
  digestLog(candPath, join(dirname(candPath), "digest"));
  results.sort((a, b) => a.index - b.index);

  // pack.json: merge with any levels already in the pack outside this range.
  const packPath = join(outDir, "pack.json");
  type Entry = { id: string; file: string; title: string; family: string; secondary?: string; modules: string[]; goal: string; rating: number; fun: number; target: number; beats?: { beat: string; tick: number }[]; signature?: string };
  const old: Entry[] = existsSync(packPath) ? (JSON.parse(readFileSync(packPath, "utf8")) as { levels: Entry[]; engineVersion: string }).levels : [];
  const byId = new Map<string, Entry>();
  for (const e of old) byId.set(e.id, e);
  for (const r of results) byId.set(r.id, { id: r.id, file: r.file, title: r.title, family: r.family, ...(r.secondary ? { secondary: r.secondary } : {}), modules: r.modules, goal: r.goal, rating: round3(r.D), fun: round3(r.F), target: r.target, beats: r.beats, ...(r.signature ? { signature: r.signature } : {}) });
  // Titles are unique across the pack: a level keeps the title players know unless its goal changed;
  // new or re-goaled levels are deduped against the kept ones.
  const keep: Record<string, string> = {};
  for (const e of old) {
    const r = results.find((x) => x.id === e.id);
    if (e.title && e.title !== e.id && (!r || r.goal === e.goal)) keep[e.id] = e.title;
  }
  const titles = dedupeTitles([...byId.values()].map((e) => ({ id: e.id, goal: e.goal, modules: e.modules })), keep);
  for (const r of results) {
    const mf = JSON.parse(readFileSync(join(outDir, r.file), "utf8")) as { text: Record<string, { title: string }> };
    mf.text["mars_greenhouse"]!.title = titles[r.id]!;
    writeFileSync(join(outDir, r.file), JSON.stringify(mf, null, 2) + String.fromCharCode(10));
    r.title = titles[r.id]!;
  }
  for (const e of byId.values()) e.title = titles[e.id]!;
  const levels = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  writeFileSync(packPath, JSON.stringify({ id: packId, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION, levels, ...(dropped.length > 0 ? { dropped: dropped.sort((a, b) => a.index - b.index) } : {}) }, null, 2) + "\n");

  // levels/packs/index.json lists the pack ids the client offers.
  const indexPath = join(dirname(outDir), "index.json");
  const idx = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as { packs: string[] }) : { packs: [] };
  if (!idx.packs.includes(packId)) idx.packs.push(packId);
  writeFileSync(indexPath, JSON.stringify(idx, null, 2) + "\n");

  // Run log next to the pack (summary data for docs/LEVELS.md and the report).
  const logMap = new Map(prevLog.map((r) => [r.index, r] as const));
  for (const r of results) logMap.set(r.index, r);
  const all = [...logMap.values()].sort((a, b) => a.index - b.index);
  writeFileSync(logPath, JSON.stringify(all, null, 1) + "\n");
  if (!flag("--no-doc")) writeFileSync(join(root, "docs", "LEVELS.md"), levelsDoc(packId, all));

  printSummary(results, failed.length, (Date.now() - t0) / 1000);
  // Re-roll summary: slot, recipes tried, the one that built.
  if (rep.failedRecipes.size > 0) {
    console.log(`\nre-rolls (register ${relative(root, registerPath)}, ${register.entries.length} entries):`);
    for (const [i, tried] of [...rep.failedRecipes.entries()].sort((a, b) => a[0] - b[0])) {
      const built = rep.builtWith.get(i);
      console.log(`  Level ${i}: ${tried.length} recipe(s) failed; ${built ? `built with ${describeRecipe(built)}` : "not built"}`);
      for (const r of tried) console.log(`    x ${describeRecipe(r)}`);
    }
  }
  // Retries per level for the variety rule: duplicate candidates the search rejected, and rebuilds by the pass.
  console.log(`\nvariety (signature v1, whole pack${VARIETY.exempt.length ? `, exempt ${VARIETY.exempt.join(",")}` : ""}):`);
  for (const r of results) console.log(`  Level ${r.index}: ${r.rejects["duplicate"] ?? 0} duplicate candidate(s) rejected, ${variety.reruns.get(r.index) ?? 0} rebuild(s), signature ${r.signature ?? "-"}`);
  for (const u of variety.unresolved) console.log(`  Level ${u.index}: STILL THE SAME AS ${u.sameAs} after ${VARIETY.maxPasses} passes`);
  if (rep.stopped) console.log(`\nBUILD STOPPED. ${stopMessage(rep.stopped)}`);
  if (failed.length > 0) process.exitCode = 1;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;
const RUNGS = ["good", "average", "weak", "novice", "floor"];

function printSummary(rs: LevelResult[], failed: number, secs: number): void {
  console.log("\n" + ["idx", "modules", "goal", "target", "D", "F", ...RUNGS.map((r) => r.slice(0, 4)), "time"].join("\t"));
  for (const r of rs) {
    const mods = r.modules.filter((m) => !["carry", "gather", "core", "sales"].includes(m)).join(",");
    console.log([r.index, mods || "-", r.goal, r.target.toFixed(2), r.D.toFixed(3) + (r.onTarget ? "" : "*"), r.F.toFixed(3),
      ...RUNGS.map((p) => `${(r.winRate[p] ?? 0) === 1 ? "W" : (r.winRate[p] ?? 0) > 0 ? "w" : "L"}${pct(r.margin[p])}`), `${r.seconds.toFixed(0)}s`].join("\t"));
  }
  const rej: Record<string, number> = {};
  for (const r of rs) for (const [k, n] of Object.entries(r.rejects)) rej[k] = (rej[k] ?? 0) + n;
  const off = rs.filter((r) => !r.onTarget).length;
  console.log(`\n${rs.length} levels, ${off} off target (*), ${failed} failed, ${secs.toFixed(0)} s wall; rejected candidates: ${JSON.stringify(rej)}`);
  console.log(familySummary(rs).join("\n"));
}

const objText = (o: LevelResult["objectives"][number]): string => {
  const ps = Object.entries(o.params).map(([k, v]) => `${k}=${String(v).replace(/^(res|role|struct)\./, "")}`).join(" ");
  return ps ? `${o.kind} (${ps})` : o.kind;
};

/** Per-family counts, goals and star objectives used, and mean stars per rung. */
function familySummary(rs: LevelResult[]): string[] {
  const out: string[] = [];
  const fams = [...new Set(rs.map((r) => r.family))];
  for (const f of fams) {
    const xs = rs.filter((r) => r.family === f);
    const goals = [...new Set(xs.map((r) => r.goal))].join(", ");
    const stars = [...new Set(xs.flatMap((r) => r.objectives.slice(1).map((o) => o.kind)))].join(", ");
    const rung = RUNGS.map((p) => `${p} ${(xs.reduce((a, r) => a + (r.starsByRung?.[p] ?? 0), 0) / Math.max(1, xs.length)).toFixed(2)}`).join(" / ");
    out.push(`${f}: ${xs.length} levels; goals: ${goals}; star objectives: ${stars}; mean stars: ${rung}`);
  }
  return out;
}

function levelsDoc(packId: string, rs: LevelResult[]): string {
  const lines = [
    `# Level pack ${packId}`,
    "",
    `Generated by \`pnpm levels:build\` (engine ${ENGINE_VERSION}, content ${CONTENT_VERSION}). Regenerated on every build; do not edit by hand.`,
    "",
    "D and F are the rater's difficulty and fun indexes against the generator's reference stats",
    "(`packages/generator/data/reference.json`). `*` marks a level shipped off target: the closest",
    "feasible, filter-clean candidate after every retry. Margins are the good and median (weak) bots'",
    "mean margins; Passed lists the rungs that win at least half their runs.",
    "",
    "Every level has a family and three star objectives: the main goal, then a time target (or, for goals that end",
    "on the clock, a second family challenge), then the family challenge. Stars are the good and median (weak) bots'",
    "mean stars on the final objectives (10 and 3 seeds).",
    "",
    "| # | Id | Family | Phase | Introduces | Features | Goal | Star 2 | Star 3 | Target | D | F | Good | Weak | Stars good/median |",
    "|---|----|--------|-------|------------|----------|------|--------|--------|--------|---|---|------|------|-------------------|",
  ];
  for (const r of rs) {
    const fam = r.secondary ? `${r.family} + ${r.secondary}` : r.family;
    const [g, s2, s3] = r.objectives ?? [];
    lines.push(`| ${r.index} | ${r.id} | ${fam} | ${r.phase} | ${r.introduced.join(" + ") || ""} | ${r.features.join(", ") || "-"} | ${g ? objText(g) : r.goal} | ${s2 ? objText(s2) : ""} | ${s3 ? objText(s3) : ""} | ${r.target.toFixed(2)} | ${r.D.toFixed(3)}${r.onTarget ? "" : "*"} | ${r.F.toFixed(3)} | ${pct(r.margin["good"])} | ${pct(r.margin["weak"])} | ${r.stars?.good ?? 0}/${r.stars?.median ?? 0} |`);
  }
  lines.push("", "## Families", "", ...familySummary(rs).map((l) => `- ${l}`));
  lines.push("", "## Curve", "", "```");
  for (const r of rs) {
    const bar = (x: number) => Math.round(x * 50);
    const row = Array.from({ length: 51 }, (_, k) => (k === bar(r.D) ? "#" : k === bar(r.target) ? "|" : k % 10 === 0 ? "." : " ")).join("");
    lines.push(`${String(r.index).padStart(2)} ${row} ${r.D.toFixed(2)}`);
  }
  lines.push("```", "", "`#` is D, `|` the sequencer's target, dots mark 0.2 steps.", "");
  return lines.join("\n");
}

if (flag("--worker")) workLevel(Number(arg("--index")), arg("--out")!, Number(arg("--retries", "3")), flag("--verbose"), Number(arg("--target-offset", "0")), Number(arg("--retry-base", "0")), arg("--register", DEFAULT_REGISTER_PATH)!, arg("--avoid"), arg("--place"), arg("--pool", DEFAULT_POOL_PATH));
else if (flag("--calib")) workCalib(Number(arg("--index")));
else void main();

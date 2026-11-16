import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { closure, sequenceRange, type LevelRequest } from "../packages/sequencer/src/index.js";
import { GEN, buildLevel, knobsFor, templateById, type Built, type Knobs } from "../packages/generator/src/index.js";
import { Rand } from "../packages/generator/src/rand.js";
import { PROFILES, playBot } from "../packages/bots/src/index.js";
import { assess, modelInput, DEFAULT_SLACK, type ModelInput } from "./defend-model.js";

// pnpm exec vite-node tools/walls-sweep.ts -- [--points 120] [--seeds 3] [--levels 10,21,26,32,43,54,60,98]
//   [--walls off|on|both] [--seed 1] [--jobs N] [--out levels/sweeps/walls-sweep.jsonl] [--audit] [--fixture file.json]
//   [--slack 0.3] [--range name=lo:hi ...]
//
// No-wall balance slice 4 (outpost-ops #210): a Latin-hypercube bot sweep over the defend knobs. Each point is a
// set of knob values; each (point, level) is one single-level scratch build (buildLevel straight from the
// sequencer's request, in memory: nothing under levels/packs, no docs), screened by the no-sim filter
// (tools/defend-model.ts), then played by the good bot on --seeds in-level seeds. Workers are child processes
// (CPU count - 1 by default), fed one (point, level) at a time. Output: JSONL (levels/sweeps/, gitignored) with a
// meta line, one line per bot run (knobs, what they turned into, the filter's verdict and the bot's per-run defend
// record), one line per filtered-out candidate, and a summary. Seeded: the same flags give the same file.
// --audit plays the filtered-out candidates too, to count false rejects (a rejected candidate the bot wins).
// --fixture writes the filter's input and the outcome per (point, level): calibration data for defend-model.test.ts.
//
// Knobs (scales are on the level's own generator value at its pressure, so one range fits the whole sequence):
//   baseHealth   x meters.baseHealth (knob baseHealth)       waveGap     x the waveGap knob
//   swarm        x every built wave's attackers (bosses kept)
//   earlyGrowth  x per wave on the early waves (before defendWaves.lateFrom): wave k x earlyGrowth^k
//   (both act on the built waves, because the generator re-sizes its waves to pay for the purchase list)
//   firstWave    the first wave's start, s (later waves keep their spacing; a survive goal keeps its tail)
//   towerCost    x the salvage price of every tower pad (sockets and levels)
//   ringSockets, ringRadius   tower ring around the heat circle: recorded and passed through only, until the
//                ring layout (no-wall balance slice 3) gives the generator something to apply them to.

export interface KnobSpec { lo: number; hi: number; int?: boolean }
export const KNOBS: Record<string, KnobSpec> = {
  baseHealth: { lo: 1, hi: 4 },
  swarm: { lo: 0.25, hi: 2 },
  earlyGrowth: { lo: 0.5, hi: 2.5 },
  waveGap: { lo: 0.75, hi: 1.75 },
  firstWave: { lo: 15, hi: 60 },
  towerCost: { lo: 0.4, hi: 1.5 },
  ringSockets: { lo: 4, hi: 12, int: true },
  ringRadius: { lo: 0.6, hi: 0.95 },
};
export const DEFAULT_LEVELS = [10, 21, 26, 32, 43, 54, 60, 98];

type KnobValues = Record<string, number>;

/** Latin hypercube: n points, each dimension cut into n strata used once each, a seeded point in each stratum. */
export function latinHypercube(n: number, dims: number, seed: number): number[][] {
  const r = new Rand(seed);
  const cols = Array.from({ length: dims }, () => {
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = r.int(0, i); [perm[i], perm[j]] = [perm[j]!, perm[i]!]; }
    return perm.map((s) => (s + r.float()) / n);
  });
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]!));
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const pressureOf = (req: LevelRequest) => Math.min(1, Math.max(0, (req.target - 0.08) / 0.8));

export interface Job { job: number; sweepSeed: number; point: number; level: number; walls: boolean; knobs: KnobValues; seeds: number; audit: boolean; slack: number }

/** Build one single-level scratch candidate with the knobs applied (in memory). */
export function buildCandidate(req: LevelRequest, walls: boolean, kv: KnobValues): { built: Built; applied: Record<string, number> } {
  const K: Knobs = knobsFor(pressureOf(req));
  K.baseHealth *= kv["baseHealth"] ?? 1;
  K.waveGap *= kv["waveGap"] ?? 1;
  const DW = GEN.defendWaves;
  let built: Built | null = null, why = "";
  for (let salt = 0; salt < GEN.search.layoutTries && !built; salt++) {
    try {
      built = buildLevel({ id: req.id, seed: req.seed, family: req.family, secondary: req.secondary ?? null, features: req.features, goalType: req.goalType, modules: closure(req.modules), template: templateById(req.template), knobs: K, walls }, salt);
    } catch (e) { why = (e as Error).message; }
  }
  if (!built) throw new Error(`build failed: ${why}`);
  const m = built.manifest;
  // wave size and early growth act on the built waves: the generator re-sizes its waves to pay for the purchase
  // list (defendWaves dropsPerNeed and the growth loops), which would undo a scaled swarm knob. Bosses stay as built.
  // The generator's spawn rule still holds: no wave spawns for longer than spawnMax s (its gap tightens, down to
  // minGap), and a wave never spawns slower than its built gap (or lateGap, where spawnMax had tightened it).
  const sw = kv["swarm"] ?? 1, eg = kv["earlyGrowth"] ?? 1;
  const size = (w: { counts: Record<string, number> }) => Object.values(w.counts).reduce((a, n) => a + n, 0);
  m.waves.forEach((w, k) => {
    const f = sw * (k < DW.lateFrom ? eg ** k : 1);
    const gap0 = w.gap ?? DW.gap, design = gap0 < DW.lateGap ? DW.lateGap : gap0;
    for (const h of Object.keys(w.counts)) if (h !== "hostile.boss") w.counts[h] = Math.max(1, Math.round(w.counts[h]! * f));
    w.gap = round3(Math.max(DW.minGap, Math.min(design, DW.spawnMax / size(w))));
  });
  // first wave time: every wave moves with the first; a survive goal keeps its length past the wave before the last
  if (kv["firstWave"] !== undefined && m.waves.length > 0) {
    const shift = Math.round(kv["firstWave"]) - m.waves[0]!.t;
    m.waves = m.waves.map((w) => ({ ...w, t: Math.max(1, w.t + shift) }));
    if (m.goal.type === "survive" && m.waves.length >= 2) {
      const seconds = Math.round(Math.max(K.length, m.waves[m.waves.length - 2]!.t + DW.surviveTail) / 10) * 10;
      (m.goal as { seconds: number }).seconds = seconds;
      if (m.objectives?.[0]) m.objectives[0] = { ...m.objectives[0], params: { ...m.objectives[0].params, seconds } };
    }
  }
  // tower price: every socket and level
  const tc = kv["towerCost"] ?? 1;
  for (const e of m.entities) if (e.type === "pad.build" && e.build.startsWith("struct.ranged_defense") && e.cost["res.salvage"]) e.cost["res.salvage"] = Math.max(1, Math.round(e.cost["res.salvage"] * tc));
  // ringSockets / ringRadius: no ring layout yet (slice 3), so nothing to apply
  const hostiles = m.waves.reduce((a, w) => a + Object.values(w.counts).reduce((b, n) => b + n, 0), 0);
  return { built, applied: { baseHealth: Number(m.params["meters.baseHealth"]), swarm: sw, earlyGrowth: eg, waveGap: round3(K.waveGap), firstWave: m.waves[0]?.t ?? -1, towerCostScale: tc, hostiles } };
}

/** One (point, level): build, filter, play. Returns the JSONL records and the fixture row. */
export function runJob(j: Job, req: LevelRequest): { records: object[]; fixture: object | null } {
  const head = { point: j.point, level: j.level, id: req.id, goal: req.goalType, walls: j.walls, knobs: j.knobs };
  let b: ReturnType<typeof buildCandidate>;
  try { b = buildCandidate(req, j.walls, j.knobs); }
  catch (e) { return { records: [{ kind: "build_failed", ...head, why: (e as Error).message }], fixture: null }; }
  const m = b.built.manifest;
  const inp: ModelInput = modelInput(m);
  const a = assess(inp, { slack: j.slack });
  const model = { ratio: round3(a.ratio), reject: a.reject, end: Math.round(a.end), leaks: a.perWave.map((w) => w.leaks), towers: a.perWave.map((w) => w.towers), guards: a.perWave.map((w) => w.guards) };
  const waves = m.waves.map((w) => ({ t: w.t, n: Object.values(w.counts).reduce((x, y) => x + y, 0), boss: (w.counts["hostile.boss"] ?? 0) > 0 }));
  if (a.reject && !j.audit) return { records: [{ kind: "filtered", ...head, applied: b.applied, waves, model }], fixture: null };
  const records: object[] = [];
  let wins = 0;
  for (let s = 1; s <= j.seeds; s++) {
    const r = playBot(m, PROFILES["good"]!, s, { timeBudgetSeconds: 900 });
    if (r.won) wins++;
    records.push({ kind: "run", ...head, seed: s, applied: b.applied, waves, model,
      bot: { won: r.won, reason: r.reason, seconds: Math.round(r.ticks / 30), goalSeconds: Math.round(r.goalTicks / 30), stars: r.stars, margin: round3(r.margin), defend: r.defend ?? null } });
  }
  return { records, fixture: { sweepSeed: j.sweepSeed, point: j.point, level: j.level, walls: j.walls, knobs: j.knobs, seeds: j.seeds, wins, ratio: round3(a.ratio), input: inp } };
}

// ---------- worker: one job per stdin line, one result per stdout line ----------
const MARK = "@@walls-sweep ";
async function worker(): Promise<void> {
  const reqs = new Map<number, LevelRequest>();
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const j = JSON.parse(line) as Job;
    if (!reqs.has(j.level)) { const all = sequenceRange(1, j.level); reqs.set(j.level, all[j.level - 1]!); }
    const out = runJob(j, reqs.get(j.level)!);
    process.stdout.write(MARK + JSON.stringify({ job: j.job, ...out }) + "\n");
  }
}

// ---------- parent ----------
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const argv = process.argv.slice(2);
const arg = (name: string, def?: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const base = process.env["INIT_CWD"] ?? process.cwd();
const abs = (p: string) => (isAbsolute(p) ? p : resolve(base, p));

function startWorker(): { send: (j: Job) => Promise<{ job: number; records: object[]; fixture: object | null }>; stop: () => void } {
  const viteNode = join(root, "node_modules", "vite-node", "vite-node.mjs");
  const ch = spawn(process.execPath, [viteNode, fileURLToPath(import.meta.url), "--", "--worker"], { cwd: root, stdio: ["pipe", "pipe", "inherit"] });
  let waiting: ((r: { job: number; records: object[]; fixture: object | null }) => void) | null = null;
  createInterface({ input: ch.stdout }).on("line", (l) => { if (l.startsWith(MARK) && waiting) { const w = waiting; waiting = null; w(JSON.parse(l.slice(MARK.length))); } });
  return {
    send: (j) => new Promise((ok) => { waiting = ok; ch.stdin.write(JSON.stringify(j) + "\n"); }),
    stop: () => ch.stdin.end(),
  };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const points = Number(arg("--points", "120")), seeds = Number(arg("--seeds", "3")), seed = Number(arg("--seed", "1"));
  const levels = (arg("--levels") ?? DEFAULT_LEVELS.join(",")).split(",").map(Number);
  const wallsMode = arg("--walls", "off")!;
  if (!["off", "on", "both"].includes(wallsMode)) throw new Error("--walls off|on|both");
  const slack = Number(arg("--slack", String(DEFAULT_SLACK)));
  const audit = argv.includes("--audit");
  const jobsN = Number(arg("--jobs", String(Math.max(1, cpus().length - 1))));
  const out = abs(arg("--out", `levels/sweeps/walls-sweep-s${seed}.jsonl`)!);
  const specs: Record<string, KnobSpec> = structuredClone(KNOBS);
  argv.forEach((a, i) => {
    if (argv[i - 1] !== "--range") return;
    const [name, lo, hi] = a.split(/[=:]/);
    if (!specs[name!]) throw new Error(`unknown knob ${name}`);
    specs[name!] = { ...specs[name!]!, lo: Number(lo), hi: Number(hi) };
  });
  const names = Object.keys(specs);
  const lhs = latinHypercube(points, names.length + (wallsMode === "both" ? 1 : 0), seed);
  const pts = lhs.map((u) => {
    const kv: KnobValues = {};
    names.forEach((n, d) => { const s = specs[n]!; const v = s.lo + (s.hi - s.lo) * u[d]!; kv[n] = s.int ? Math.round(v) : round3(v); });
    return { kv, walls: wallsMode === "both" ? u[names.length]! < 0.5 : wallsMode === "on" };
  });
  const all = sequenceRange(1, Math.max(...levels));
  for (const l of levels) if (all[l - 1]?.family !== "defend") throw new Error(`level ${l} is not a defend request`);
  const jobs: Job[] = [];
  pts.forEach((p, i) => levels.forEach((l) => jobs.push({ job: jobs.length, sweepSeed: seed, point: i, level: l, walls: p.walls, knobs: p.kv, seeds, audit, slack })));
  const meta = { kind: "meta", engine: ENGINE_VERSION, content: CONTENT_VERSION, seed, points, seeds, walls: wallsMode, audit, slack, knobs: specs,
    levels: levels.map((l) => { const r = all[l - 1]!; return { level: l, id: r.id, goal: r.goalType, target: r.target, p: round3(pressureOf(r)), features: r.features }; }) };
  process.stderr.write(`walls-sweep: ${points} points x ${levels.length} levels (${jobs.length} builds) x ${seeds} seeds, ${jobsN} workers, walls ${wallsMode}${audit ? ", audit" : ""}\n`);
  const results: { job: number; records: object[]; fixture: object | null }[] = new Array(jobs.length);
  const queue = [...jobs];
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(jobsN, jobs.length) }, async () => {
    const w = startWorker();
    while (queue.length > 0) {
      const j = queue.shift()!;
      results[j.job] = await w.send(j);
      if (++done % 20 === 0 || done === jobs.length) process.stderr.write(`  ${done}/${jobs.length} builds, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
    }
    w.stop();
  }));
  const records = results.flatMap((r) => r.records) as Record<string, any>[];
  const runs = records.filter((r) => r["kind"] === "run");
  const summary = {
    kind: "summary", seconds: Math.round((Date.now() - t0) / 1000), builds: jobs.length,
    buildFailed: records.filter((r) => r["kind"] === "build_failed").length,
    filtered: records.filter((r) => r["kind"] === "filtered").length + (audit ? new Set(runs.filter((r) => r["model"].reject).map((r) => r["point"] + ":" + r["level"])).size : 0),
    botRuns: runs.length, wins: runs.filter((r) => r["bot"].won).length,
    ...(audit ? { falseRejects: runs.filter((r) => r["model"].reject && r["bot"].won).length, rejectedLosses: runs.filter((r) => r["model"].reject && !r["bot"].won).length, losses: runs.filter((r) => !r["bot"].won).length } : {}),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, [meta, ...records, summary].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const fx = arg("--fixture");
  if (fx) writeFileSync(abs(fx), JSON.stringify(results.map((r) => r.fixture).filter((x) => x !== null)) + "\n");
  process.stderr.write(`${JSON.stringify(summary)}\nwrote ${out}\n`);
}

if (argv.includes("--worker")) void worker();
else if (!process.env["VITEST"]) void main();

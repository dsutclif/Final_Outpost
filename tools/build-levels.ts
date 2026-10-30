import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { computeReference, type HistoryEntry, type Measurement, type Metrics } from "../packages/rater/src/index.js";
import { sequenceRange, type LevelRequest } from "../packages/sequencer/src/index.js";
import { calibrationSample, dedupeTitles, generateDetailed, templateById, type Candidate, type CandidateRecord } from "../packages/generator/src/index.js";
import { hashStr, mix } from "../packages/generator/src/rand.js";
import { digestLog } from "./candidate-digest.js";

// pnpm levels:build --from 1 --to 60 --out levels/packs/s1 [--jobs N] [--retries N] [--calibrate] [--verbose]
//   [--target-offset X] [--no-doc]
//
// Sequencer -> generator -> rater for each index. Requests come from the sequencer with the earlier
// requests as history, so every level can be generated independently: the CLI runs one child
// process per level, `--jobs` at a time (default: cores - 2). A level whose search fails retries with
// new seeds; after the last retry the closest feasible, filter-clean candidate ships and is reported
// as off target. `--calibrate` first measures one unsearched sample per level and rewrites the
// generator's reference stats (packages/generator/data/reference.json). `--target-offset` shifts every
// level's target difficulty (batch tuning, tools/levels-next.ts); `--no-doc` leaves docs/LEVELS.md alone.
// Every search iteration, rejected or not, is appended to levels/candidates/<pack>.jsonl (outside
// levels/packs, which the client serves; gitignored) and folded into a small daily digest for working
// out up-front generation rules (tools/candidate-digest.ts).

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
  seconds: number;
  seed: number;
  attempts: number;
  rejects: Record<string, number>;
  ratings: number;
}

const historyFor = (reqs: readonly LevelRequest[], index: number): HistoryEntry[] =>
  reqs.slice(0, index - 1).map((r) => ({ id: r.id, modules: r.modules, goal: r.goalType, template: templateById(r.template).zones.join("|") }));

// ---------- worker: one level ----------

function workLevel(index: number, outDir: string, retries: number, verbose: boolean, targetOffset: number): void {
  const reqs = sequenceRange(1, index, [], { targetOffset });
  const req = reqs[index - 1]!;
  const history = historyFor(reqs, index);
  const t0 = Date.now();
  let best: Candidate | null = null;
  let shipped: Candidate | null = null;
  const rejects: Record<string, number> = {};
  let ratings = 0, attempts = 0;
  const candidates: (CandidateRecord & { attempt: number; seed: number })[] = [];
  for (let k = 0; k <= retries && !shipped; k++) {
    attempts++;
    const seed = k === 0 ? req.seed : mix(req.seed, hashStr(`retry${k}`)) & 0x7fffffff;
    const d = generateDetailed({ ...req, seed }, { history, onCandidate: (c) => candidates.push({ ...c, attempt: k, seed }), ...(verbose ? { log: (s: string) => process.stderr.write(`[${req.id}] ${s}\n`) } : {}) });
    for (const [r, n] of Object.entries(d.stats.rejects)) rejects[r] = (rejects[r] ?? 0) + n;
    ratings += d.stats.ratings;
    if (d.manifest && d.best) shipped = d.best;
    if (d.best && (!best || d.best.err < best.err)) best = d.best;
  }
  const pick = shipped ?? best;
  const level = { index, id: req.id, family: req.family, secondary: req.secondary, features: req.features, goalType: req.goalType, template: req.template, target: req.target };
  process.stdout.write(`CANDIDATES ${JSON.stringify(candidates.map((c) => ({ ...level, ...c })))}\n`);
  if (!pick) {
    process.stdout.write(`RESULT ${JSON.stringify({ index, id: req.id, family: req.family, secondary: req.secondary, failed: true, rejects, seconds: (Date.now() - t0) / 1000 })}\n`);
    return;
  }
  const m = pick.manifest;
  const file = `${m.id}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(m, null, 2) + "\n");
  const r = pick.rating;
  const res: LevelResult = {
    index, id: m.id, file, title: m.text["mars_greenhouse"]?.title ?? m.id, phase: req.phase, introduced: req.introduced,
    family: req.family, secondary: req.secondary, features: req.features, objectives: (m.objectives ?? []) as LevelResult["objectives"],
    stars: pick.stars, starsByRung: pick.starsByRung,
    modules: m.modules, goal: m.goal.type, template: req.template, target: req.target, D: r.D, F: r.F, onTarget: shipped !== null,
    margin: r.margin, winRate: r.winRate, botsPassed: r.botsPassed, seconds: (Date.now() - t0) / 1000, seed: m.seed,
    attempts, rejects, ratings,
  };
  process.stdout.write(`RESULT ${JSON.stringify(res)}\n`);
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
  const from = Number(arg("--from", "1")), to = Number(arg("--to", "60"));
  const outDir = abs(arg("--out", "levels/packs/s1")!);
  const jobs = Number(arg("--jobs", String(Math.max(1, cpus().length - 2))));
  const retries = Number(arg("--retries", "3"));
  const verbose = flag("--verbose");
  const packId = outDir.split(/[\\/]/).pop()!;
  mkdirSync(outDir, { recursive: true });
  const indices = Array.from({ length: to - from + 1 }, (_, k) => from + k);
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

  console.log(`building ${packId} levels ${from}-${to} with ${jobs} jobs`);
  const results: LevelResult[] = [];
  const failed: { index: number; rejects: unknown }[] = [];
  // Levels whose every seed failed. A crashed worker is not one: it says nothing about the level.
  const dropped: { index: number; id: unknown; family: unknown; secondary: unknown; rejects: unknown }[] = [];
  const offset = arg("--target-offset", "0")!;
  const candPath = join(root, "levels", "candidates", `${packId}.jsonl`);
  mkdirSync(dirname(candPath), { recursive: true });
  const run = new Date(t0).toISOString();
  await pool(indices, jobs, (i) => runChild(["--worker", "--index", String(i), "--out", outDir, "--retries", String(retries), "--target-offset", offset, ...(verbose ? ["--verbose"] : [])]), (i, out) => {
    const r = parseResult(out);
    const cands = out.split("\n").find((l) => l.startsWith("CANDIDATES "));
    if (cands) appendFileSync(candPath, (JSON.parse(cands.slice(11)) as object[]).map((c) => JSON.stringify({ run, engine: ENGINE_VERSION, content: CONTENT_VERSION, ...c })).join("\n") + "\n");
    if (!r || r["failed"]) { failed.push({ index: i, rejects: r?.["rejects"] }); if (r) dropped.push({ index: i, id: r["id"], family: r["family"], secondary: r["secondary"] ?? null, rejects: r["rejects"] }); console.log(`  L${i}: FAILED ${JSON.stringify(r?.["rejects"] ?? {})}`); return; }
    const lr = r as unknown as LevelResult;
    results.push(lr);
    console.log(`  L${i} ${lr.onTarget ? "ok " : "off"} D=${lr.D.toFixed(3)} (target ${lr.target}) F=${lr.F.toFixed(3)} ${lr.seconds.toFixed(0)}s`);
  });
  digestLog(candPath, join(dirname(candPath), "digest"));
  results.sort((a, b) => a.index - b.index);

  // pack.json: merge with any levels already in the pack outside this range.
  const packPath = join(outDir, "pack.json");
  type Entry = { id: string; file: string; title: string; family: string; secondary?: string; modules: string[]; goal: string; rating: number; fun: number; target: number };
  const old: Entry[] = existsSync(packPath) ? (JSON.parse(readFileSync(packPath, "utf8")) as { levels: Entry[]; engineVersion: string }).levels : [];
  const byId = new Map<string, Entry>();
  for (const e of old) byId.set(e.id, e);
  for (const r of results) byId.set(r.id, { id: r.id, file: r.file, title: r.title, family: r.family, ...(r.secondary ? { secondary: r.secondary } : {}), modules: r.modules, goal: r.goal, rating: round3(r.D), fun: round3(r.F), target: r.target });
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
  const logPath = join(outDir, "build-log.json");
  const prevLog: LevelResult[] = existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) as LevelResult[] : [];
  const logMap = new Map(prevLog.map((r) => [r.index, r] as const));
  for (const r of results) logMap.set(r.index, r);
  const all = [...logMap.values()].sort((a, b) => a.index - b.index);
  writeFileSync(logPath, JSON.stringify(all, null, 1) + "\n");
  if (!flag("--no-doc")) writeFileSync(join(root, "docs", "LEVELS.md"), levelsDoc(packId, all));

  printSummary(results, failed.length, (Date.now() - t0) / 1000);
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

if (flag("--worker")) workLevel(Number(arg("--index")), arg("--out")!, Number(arg("--retries", "3")), flag("--verbose"), Number(arg("--target-offset", "0")));
else if (flag("--calib")) workCalib(Number(arg("--index")));
else void main();

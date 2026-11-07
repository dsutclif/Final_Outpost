import { spawn, execFileSync } from "node:child_process";
import { cpus } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_VERSION } from "../../packages/content/src/index.js";
import { ENGINE_VERSION } from "../../packages/sim/src/index.js";
import { Args, appendJsonl, loadLimits, readJsonl, repoRoot, resolveIn, round, writeJson } from "./lib.js";
import { assemble, historyBefore, listLevels, pulseLevel, readManifest, splitByEngine, type HistoryRow, type LevelPulse, type PulseMeta } from "./pulse-core.js";

// pnpm review:pulse -- --out <dir> [--packs levels/golden,levels/packs/s1,levels/story] [--seeds 3] [--history <file.jsonl>]
//                      [--jobs N] [--only id,id] [--limits file]
//
// The nightly bot sweep (docs/review/CONTRACT.md §3). Writes pulse.json (per level: stars per profile,
// rater metrics and fun proxies, the human bot's PlayShape, oneTaskS) and candidates-pulse.json; appends
// one row per level to --history and lists in pulse.json what moved past tolerance since the previous
// row for that level. Levels are played by worker processes (--jobs, default cores - 2) like
// tools/regress-levels.ts. Levels pinned to another engine are skipped and listed in meta.skipped. Exits 1 when
// any other level could not be played; the files are still written.

const here = fileURLToPath(import.meta.url);
export const DEFAULT_PACKS = ["levels/golden", "levels/packs/s1", "levels/story"];

function playLevels(tokens: readonly string[], packDirs: readonly string[], seeds: number, limitsFile: string | undefined): { rows: LevelPulse[]; errors: PulseMeta["errors"] } {
  const L = loadLimits(limitsFile);
  const all = packDirs.flatMap((p) => listLevels(p));
  const rows: LevelPulse[] = [];
  const errors: PulseMeta["errors"] = [];
  for (const tok of tokens) {
    const ref = all.find((r) => `${r.packDir}::${r.id}` === tok);
    if (!ref) { errors.push({ levelId: tok, message: "level not found" }); continue; }
    try {
      rows.push(pulseLevel(readManifest(ref), { seeds, history: historyBefore(ref, all), sampling: L.sampling, pack: ref.pack, index: ref.index }));
    } catch (e) {
      errors.push({ levelId: ref.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { rows, errors };
}

function workerMain(args: Args): void {
  const packDirs = args.list("--packs");
  const { rows, errors } = playLevels(args.list("--levels"), packDirs, args.num("--seeds", 3), args.get("--limits"));
  for (const r of rows) process.stdout.write(`ROW ${JSON.stringify(r)}\n`);
  for (const e of errors) process.stdout.write(`ERR ${JSON.stringify(e)}\n`);
}

function runChild(extra: string[]): Promise<string> {
  const viteNode = join(repoRoot, "node_modules", "vite-node", "vite-node.mjs");
  return new Promise((ok) => {
    const ch = spawn(process.execPath, [viteNode, here, "--", "--worker", ...extra], { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    ch.stdout.on("data", (b: Buffer) => { out += b.toString(); });
    ch.on("close", () => ok(out));
  });
}

function gitSha(): string | null {
  const env = process.env["GITHUB_SHA"];
  if (env) return env.slice(0, 12);
  try { return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; }
}

async function main(args: Args): Promise<void> {
  const usage = "pnpm review:pulse -- --out <dir> [--packs a,b] [--seeds 3] [--history file.jsonl] [--jobs N] [--only id,id]";
  const out = resolveIn(args.need("--out", usage));
  const packDirs = args.list("--packs", DEFAULT_PACKS).map(resolveIn);
  const seeds = args.num("--seeds", 3);
  const limitsArg = args.get("--limits") ? resolveIn(args.get("--limits")!) : undefined;
  const L = loadLimits(limitsArg);
  const historyFile = args.get("--history") ? resolveIn(args.get("--history")!) : null;
  const only = args.list("--only");
  const t0 = Date.now();

  const all = packDirs.flatMap((p) => listLevels(p));
  const { play: todo, skipped } = splitByEngine(only.length > 0 ? all.filter((r) => only.includes(r.id)) : all);
  const jobs = Math.max(1, Math.min(Math.max(1, todo.length), args.num("--jobs", Math.max(1, cpus().length - 2))));
  const rows: LevelPulse[] = [];
  const errors: PulseMeta["errors"] = [];

  if (jobs <= 1) {
    const r = playLevels(todo.map((x) => `${x.packDir}::${x.id}`), packDirs, seeds, limitsArg);
    rows.push(...r.rows);
    errors.push(...r.errors);
  } else {
    const chunks: string[][] = Array.from({ length: jobs }, () => []);
    todo.forEach((r, i) => chunks[i % jobs]!.push(`${r.packDir}::${r.id}`));
    const common = ["--packs", packDirs.join(","), "--seeds", String(seeds), ...(limitsArg ? ["--limits", limitsArg] : [])];
    await Promise.all(chunks.filter((c) => c.length > 0).map(async (c) => {
      const text = await runChild([...common, "--levels", c.join(",")]);
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("ROW ")) rows.push(JSON.parse(line.slice(4)) as LevelPulse);
        else if (line.startsWith("ERR ")) errors.push(JSON.parse(line.slice(4)) as { levelId: string; message: string });
      }
    }));
  }

  // pack order, not the order the workers finished in
  const order = new Map(all.map((r, i) => [r.id, i]));
  rows.sort((a, b) => (order.get(a.levelId) ?? 0) - (order.get(b.levelId) ?? 0));
  for (const r of todo) if (!rows.some((x) => x.levelId === r.id) && !errors.some((e) => e.levelId === r.id)) errors.push({ levelId: r.id, message: "no result (worker stopped)" });

  // the previous rows are read before this run's are appended
  const previous = historyFile ? readJsonl<HistoryRow>(historyFile) : [];
  const meta = { generated: new Date().toISOString(), engine: ENGINE_VERSION, content: CONTENT_VERSION, seeds, packs: packDirs.map((p) => basename(p)), runtimeS: round((Date.now() - t0) / 1000, 1), errors, skipped };
  const run = assemble(rows, previous, L, meta, gitSha());
  writeJson(out, "pulse.json", run.file);
  writeJson(out, "candidates-pulse.json", run.candidates);
  if (historyFile) appendJsonl(historyFile, run.rows);

  console.log(`pulse: ${rows.length} levels in ${meta.runtimeS} s (${jobs} job${jobs === 1 ? "" : "s"}), ${run.file.moved.length} moved past tolerance, ${run.candidates.length} candidates, ${errors.length} errors, ${skipped.length} skipped (pinned to another engine)`);
  for (const e of errors) console.error(`  ${e.levelId}: ${e.message}`);
  if (errors.length > 0) process.exitCode = 1;
}

if (process.argv.includes("--worker")) workerMain(new Args(process.argv.slice(2)));
else void main(new Args(process.argv.slice(2)));

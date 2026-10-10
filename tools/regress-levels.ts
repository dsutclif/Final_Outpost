import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LADDER, playBot } from "../packages/bots/src/index.js";

// pnpm levels:check [--pack levels/packs/s1] [--jobs N] [--seeds 10] [--others 3]
//
// Bot regression over a shipped pack: every level replayed by the whole ladder (10 seeds for the
// reference bot, 3 for each other rung). Fails when any run stalls or the reference bot does not win
// every seed with at least 20% margin.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const argv = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const base = process.env["INIT_CWD"] ?? process.cwd();
const packDir = ((p: string) => (isAbsolute(p) ? p : resolve(base, p)))(arg("--pack", "levels/packs/s1")!);

interface Row { id: string; feasible: boolean; refMinMargin: number; stalls: string[]; wins: Record<string, number>; seconds: number }

function checkLevel(file: string, refSeeds: number, otherSeeds: number): Row {
  const t0 = Date.now();
  const m = JSON.parse(readFileSync(join(packDir, file), "utf8")) as { id: string };
  const stalls: string[] = [];
  const wins: Record<string, number> = {};
  let feasible = true, refMin = Infinity;
  for (const p of LADDER) {
    const n = p.name === "good" ? refSeeds : otherSeeds;
    let w = 0;
    for (let s = 1; s <= n; s++) {
      const r = playBot(m, p, s);
      if (r.won) w++;
      if (r.stalls > 0) stalls.push(`${p.name}#${s}@${r.stallStates[0]?.tick ?? 0}`);
      if (p.name === "good") { refMin = Math.min(refMin, r.won ? r.margin : -1); if (!r.won || r.margin < 0.2) feasible = false; }
    }
    wins[p.name] = w / n;
  }
  return { id: m.id, feasible, refMinMargin: refMin, stalls, wins, seconds: (Date.now() - t0) / 1000 };
}

function runChild(args: string[]): Promise<string> {
  const viteNode = join(root, "node_modules", "vite-node", "vite-node.mjs");
  return new Promise((ok) => {
    const ch = spawn(process.execPath, [viteNode, fileURLToPath(import.meta.url), "--", ...args], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    ch.stdout.on("data", (b: Buffer) => { out += b.toString(); });
    ch.on("close", () => ok(out));
  });
}

async function main(): Promise<void> {
  const pack = JSON.parse(readFileSync(join(packDir, "pack.json"), "utf8")) as { id: string; levels: { id: string; file: string }[] };
  const jobs = Number(arg("--jobs", String(Math.max(1, cpus().length - 2))));
  const seeds = arg("--seeds", "10")!, others = arg("--others", "3")!;
  const t0 = Date.now();
  const files = pack.levels.map((l) => l.file);
  const chunks: string[][] = Array.from({ length: jobs }, () => []);
  files.forEach((f, i) => chunks[i % jobs]!.push(f));
  const rows: Row[] = [];
  await Promise.all(chunks.filter((c) => c.length > 0).map(async (c) => {
    const out = await runChild(["--worker", "--pack", packDir, "--files", c.join(","), "--seeds", seeds, "--others", others]);
    for (const line of out.split(/\r?\n/)) if (line.startsWith("ROW ")) rows.push(JSON.parse(line.slice(4)) as Row);
  }));
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  let bad = 0;
  for (const r of rows) {
    const ok = r.feasible && r.stalls.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${r.id} refMin=${r.refMinMargin.toFixed(2)} wins=${LADDER.map((p) => (r.wins[p.name] ?? 0).toFixed(2)).join("/")}${r.stalls.length ? " stalls=" + r.stalls.join(",") : ""} ${r.seconds.toFixed(0)}s`);
  }
  const missing = files.length - rows.length;
  console.log(`\n${pack.id}: ${rows.length} levels replayed, ${bad} failing, ${missing} missing, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (bad > 0 || missing > 0) process.exitCode = 1;
}

if (argv.includes("--worker")) {
  for (const f of arg("--files")!.split(",")) process.stdout.write(`ROW ${JSON.stringify(checkLevel(f, Number(arg("--seeds")), Number(arg("--others"))))}\n`);
} else void main();

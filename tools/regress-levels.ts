import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HUMAN, LADDER, playBot } from "../packages/bots/src/index.js";

// pnpm levels:check [--pack levels/packs/s1] [--jobs N] [--seeds 10] [--others 3] [--strict-stars]
//
// Bot regression over a shipped pack: every level replayed by the whole ladder (10 seeds for the
// reference bot, 3 for each other rung). Fails when any run stalls or the reference bot does not win
// every seed with at least 20% margin. Also reports levels per family and the star distribution
// (REDESIGN-R2 �6): mean stars per rung per family, and the good bot's share of three-star runs.
//
// Human-view rung (BACKLOG-R4 Batch 2): the human-view bot replays the generator's star seeds
// (generator.json humanStars). A level fails when its human mean stars fall more than regressTolerance
// below the mean recorded at generation (rating.stars.human), or when a star objective is earned on
// fewer than minEarned seeds. Levels generated before that rule carry no record: they are reported
// and only fail with --strict-stars.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const argv = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const base = process.env["INIT_CWD"] ?? process.cwd();
const HS = (JSON.parse(readFileSync(join(root, "packages/generator/data/generator.json"), "utf8")) as { humanStars: { seeds: number; minEarned: number; regressTolerance: number } }).humanStars;
const strictStars = argv.includes("--strict-stars");
const packDir = ((p: string) => (isAbsolute(p) ? p : resolve(base, p)))(arg("--pack", "levels/packs/s1")!);

interface HumanRow {
  /** Mean stars over HS.seeds, and the mean recorded at generation (null before the human-view rule). */
  mean: number;
  recorded: number | null;
  /** Seeds that earned each star objective, in manifest order after the goal. */
  earned: { kind: string; n: number }[];
  three: number;
  /** Why the level misses the human bar ("" when it meets it). */
  miss: string;
}
interface Row { id: string; family: string; feasible: boolean; refMinMargin: number; stalls: string[]; wins: Record<string, number>; stars: Record<string, number>; goodThree: number; human: HumanRow; seconds: number }

function humanRung(m: unknown): HumanRow {
  const rs = Array.from({ length: HS.seeds }, (_, i) => playBot(m, HUMAN, i + 1));
  const objs = (m as { objectives?: { kind: string }[] }).objectives ?? [];
  const earned = objs.slice(1).map((o, i) => ({ kind: o.kind, n: rs.filter((r) => r.objectives[i + 1]?.done).length }));
  const mean = rs.reduce((a, r) => a + r.stars, 0) / rs.length;
  const rec = (m as { rating?: { stars?: { human?: number } } }).rating?.stars?.human;
  const recorded = typeof rec === "number" ? rec : null;
  const three = rs.filter((r) => r.stars === 3).length;
  const miss = [
    ...(recorded !== null && mean < recorded - HS.regressTolerance ? [`human stars ${mean.toFixed(2)} < recorded ${recorded.toFixed(2)}`] : []),
    ...earned.filter((e) => e.n < HS.minEarned).map((e) => `${e.kind} ${e.n}/${HS.seeds}`),
    ...(three === 0 ? ["no three-star seed"] : []),
  ].join(", ");
  return { mean, recorded, earned, three, miss };
}

function checkLevel(file: string, refSeeds: number, otherSeeds: number): Row {
  const t0 = Date.now();
  const m = JSON.parse(readFileSync(join(packDir, file), "utf8")) as { id: string; family?: string };
  const stalls: string[] = [];
  const wins: Record<string, number> = {};
  const stars: Record<string, number> = {};
  let goodThree = 0;
  let feasible = true, refMin = Infinity;
  for (const p of LADDER) {
    const n = p.name === "good" ? refSeeds : otherSeeds;
    let w = 0, st = 0;
    for (let s = 1; s <= n; s++) {
      const r = playBot(m, p, s);
      if (r.won) w++;
      st += r.stars;
      if (p.name === "good" && r.stars === 3) goodThree++;
      if (r.stalls > 0) stalls.push(`${p.name}#${s}@${r.stallStates[0]?.tick ?? 0}`);
      if (p.name === "good") { refMin = Math.min(refMin, r.won ? r.margin : -1); if (!r.won || r.margin < 0.2) feasible = false; }
    }
    wins[p.name] = w / n;
    stars[p.name] = st / n;
  }
  const human = humanRung(m);
  return { id: m.id, family: m.family ?? "-", feasible, refMinMargin: refMin, stalls, wins, stars, goodThree: goodThree / refSeeds, human, seconds: (Date.now() - t0) / 1000 };
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
  let bad = 0, starBad = 0;
  for (const r of rows) {
    const h = r.human;
    const starFail = h.miss !== "" && (h.recorded !== null || strictStars);
    const ok = r.feasible && r.stalls.length === 0 && !starFail;
    if (!ok) bad++;
    if (h.miss !== "") starBad++;
    const hs = ` human=${h.mean.toFixed(1)}${h.recorded !== null ? `(rec ${h.recorded.toFixed(1)})` : ""} [${h.earned.map((e) => `${e.kind} ${e.n}/${HS.seeds}`).join(", ")}]${h.miss ? ` MISS ${h.miss}` : ""}`;
    console.log(`${ok ? "ok  " : "FAIL"} ${r.id} ${r.family} refMin=${r.refMinMargin.toFixed(2)} wins=${LADDER.map((p) => (r.wins[p.name] ?? 0).toFixed(2)).join("/")} stars=${LADDER.map((p) => (r.stars[p.name] ?? 0).toFixed(1)).join("/")}${hs}${r.stalls.length ? " stalls=" + r.stalls.join(",") : ""} ${r.seconds.toFixed(0)}s`);
  }
  console.log("\nper family (levels; mean stars good/average/weak/novice/floor; good 3-star share; good win share):");
  for (const f of [...new Set(rows.map((r) => r.family))]) {
    const xs = rows.filter((r) => r.family === f);
    const mean = (k: string) => (xs.reduce((a, r) => a + (r.stars[k] ?? 0), 0) / xs.length).toFixed(2);
    const three = (xs.reduce((a, r) => a + r.goodThree, 0) / xs.length).toFixed(2);
    const win = (xs.reduce((a, r) => a + (r.wins["good"] ?? 0), 0) / xs.length).toFixed(2);
    console.log(`  ${f}: ${xs.length}; ${LADDER.map((p) => mean(p.name)).join("/")}; ${three}; ${win}`);
  }
  const dist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const r of rows) dist[Math.round(r.stars["weak"] ?? 0)]!++;
  const unrec = rows.filter((r) => r.human.recorded === null).length;
  console.log(`human-view rung: ${rows.length - starBad}/${rows.length} levels meet the star bar (each star on ${HS.minEarned}/${HS.seeds} seeds, one three-star seed); ${unrec} levels predate the rule${strictStars ? "" : " (reported, not failed; --strict-stars fails them)"}; mean human stars ${(rows.reduce((a, r) => a + r.human.mean, 0) / Math.max(1, rows.length)).toFixed(2)}`);
  console.log(`median-bot (weak) mean stars per level, rounded: ${JSON.stringify(dist)}; levels where the good bot averages >= 2.5 stars: ${rows.filter((r) => (r.stars["good"] ?? 0) >= 2.5).length}/${rows.length}`);
  const missing = files.length - rows.length;
  console.log(`\n${pack.id}: ${rows.length} levels replayed, ${bad} failing, ${missing} missing, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (bad > 0 || missing > 0) process.exitCode = 1;
}

if (argv.includes("--worker")) {
  for (const f of arg("--files")!.split(",")) process.stdout.write(`ROW ${JSON.stringify(checkLevel(f, Number(arg("--seeds")), Number(arg("--others"))))}\n`);
} else void main();

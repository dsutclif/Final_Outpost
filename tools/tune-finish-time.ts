// Finish-time tuning for one untimed economy level, end to end with no judgement calls (outpost-ops
// docs/handoffs/difficulty-tune-plan.md, "per-goal-type finish-time targets", Doug 2026-11-27).
//   target seconds = baseline for the level's goal family (tools/finish-time-baselines.json) x the sequencer's
//   difficulty target for the slot. Then: measure the goal-size dial grid, pick the dial whose median finish time is
//   nearest the target (refining once between the two bracketing dials), confirm on fresh seeds, and write a verdict:
//     on-target       dial found, confirm median within the tolerance
//     needs-more-map  every goal size that fits the map finishes too fast (the goal would stall before the target)
//     too-long        even the smallest goal size finishes too slowly
//     no-step         the goal has no size between two that straddle the target (coarse amounts)
//     win-rate        timed goal (own deadline) or waves: tuned on win rate, not finish time
//     no-amount       the goal has no amount to dial (house all, rescue all)
//   pnpm exec vite-node tools/tune-finish-time.ts -- --level s1-L013 [--bot average] [--out <dir>] [--tolerance 0.15]
// Runs tools/tune-level.ts as a child process (resume-safe, idle priority). Appends one line per level to
// <out>/../results.jsonl so a batch over many levels leaves one ledger.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { slotFor, targetFor } from "../packages/sequencer/src/index";

const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (n: string, d: string): string => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1]! : d; };
const level = opt("level", "s1-L013");
const bot = opt("bot", "average");
const outRoot = opt("out", `tune-data/finish-time/${level}`);
const tol = Number(opt("tolerance", "0.15"));
const GRID = [0.5, 0.63, 0.79, 1, 1.26, 1.59, 2];
const TIMED = new Set(["rescue_before_freeze", "earn_within"]);

const pack = level.split("-")[0]!;
const m = JSON.parse(readFileSync(`levels/packs/${pack}/${level}.json`, "utf8")) as Record<string, any>;
const index = Number(/L(\d+)$/.exec(level)?.[1]);
const baselines = JSON.parse(readFileSync("tools/finish-time-baselines.json", "utf8")).baselines as Record<string, number>;
const family = String(m["family"]);
const target = (baselines[family] ?? NaN) * targetFor(index, slotFor(index).phase).target;
mkdirSync(outRoot, { recursive: true });

type Run = { dial: number; seed: number; outcome: string; goalSec: number | null };
function tune(dials: number[], seeds: number, seedStart: number, dir: string): Run[] {
  const r = spawnSync("pnpm", ["exec", "vite-node", "tools/tune-level.ts", "--", "--level", level, "--knob", "goal", "--bot", bot,
    "--dials", dials.join(","), "--seeds", String(seeds), "--seed-start", String(seedStart), "--out", dir], { encoding: "utf8", shell: true });
  if (r.status !== 0) throw new Error(`tune-level failed for ${level}: ${r.stderr.slice(-800)}`);
  return readFileSync(`${dir}/runs.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Run);
}
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]!; };
/** Per dial: median finish of wins, or null when any run stalled (the goal no longer fits the map). */
function perDial(runs: Run[]): Map<number, number | null> {
  const out = new Map<number, number | null>();
  for (const d of [...new Set(runs.map((r) => r.dial))].sort((a, b) => a - b)) {
    const rs = runs.filter((r) => r.dial === d);
    out.set(d, rs.some((r) => r.outcome !== "win" || r.goalSec == null) ? null : median(rs.map((r) => r.goalSec!)));
  }
  return out;
}
const miss = (sec: number): number => Math.abs(Math.log(sec / target));

function result(verdict: string, extra: Record<string, unknown> = {}): void {
  const rec = { ts: new Date().toISOString(), level, family, goal: m["goal"]?.type, bot, target: Math.round(target), verdict, ...extra };
  writeFileSync(`${outRoot}/result.json`, JSON.stringify(rec, null, 1));
  appendFileSync(`${dirname(outRoot)}/results.jsonl`, JSON.stringify(rec) + "\n");
  console.log(JSON.stringify(rec));
}

function main(): void {
  const goalType = String(m["goal"]?.type);
  if (TIMED.has(goalType) || (m["waves"] as unknown[] | undefined)?.length) return result("win-rate");
  if (typeof m["goal"]?.n !== "number" && typeof m["goal"]?.seconds !== "number") return result("no-amount");
  if (!Number.isFinite(target)) throw new Error(`no finish-time baseline for family ${family} in tools/finish-time-baselines.json`);

  // 1. measure the grid (5 seeds), refine once between the dials that straddle the target
  let runs = tune(GRID, 5, 1, `${outRoot}/measure`);
  let med = perDial(runs);
  const fits = [...med].filter(([, s]) => s != null) as [number, number][];
  if (!fits.length) return result("needs-more-map", { note: "every goal size stalls" });
  if (fits.every(([, s]) => s < target)) return result("needs-more-map", { fastestFit: fits.at(-1), stallsAbove: fits.at(-1)![0] });
  if (fits.every(([, s]) => s > target)) return result("too-long", { smallest: fits[0] });
  const lo = fits.filter(([, s]) => s <= target).at(-1), hi = fits.find(([, s]) => s >= target);
  if (lo && hi && lo[0] !== hi[0] && lo[1] !== hi[1]) {
    // log-linear interpolation between the bracketing dials; the goal amount rounds, so this may land on either step
    const f = Math.log(target / lo[1]) / Math.log(hi[1] / lo[1]);
    const d = Math.round(Math.exp(Math.log(lo[0]) + f * Math.log(hi[0] / lo[0])) * 100) / 100;
    if (!GRID.includes(d)) { runs = tune([...GRID, d], 5, 1, `${outRoot}/measure`); med = perDial(runs); }
  }
  const best = ([...med].filter(([, s]) => s != null) as [number, number][]).sort((a, b) => miss(a[1]) - miss(b[1]))[0]!;

  // 2. confirm on fresh seeds
  const conf = tune([best[0]], 10, 101, `${outRoot}/confirm`).filter((r) => r.dial === best[0]);
  const unknown = conf.filter((r) => r.outcome !== "win").length;
  const cm = median(conf.filter((r) => r.outcome === "win" && r.goalSec != null).map((r) => r.goalSec!));
  const off = cm / target - 1;
  if (Math.abs(off) <= tol) return result("on-target", { dial: best[0], confirmMedian: cm, off: +off.toFixed(3), unknown });
  return result("no-step", { nearestDial: best[0], confirmMedian: cm, off: +off.toFixed(3), unknown,
    steps: [...med].map(([d, s]) => [d, s]) });
}
if (!existsSync(`levels/packs/${pack}/${level}.json`)) throw new Error(`no level ${level}`);
main();

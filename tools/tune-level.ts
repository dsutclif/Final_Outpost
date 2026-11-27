import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setPriority } from "node:os";
import { content, CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { playBot, PROFILES } from "../packages/bots/src/index.js";

// Whole-level difficulty tuning (outpost-ops docs/handoffs/difficulty-tune-plan.md, step 0 trust check).
// Plays ONE level whole, as built (real goal, economy, every wave), with one dial that scales every wave's attacker counts.
// Runs dial values x shared seeds with one bot, records each run as a JSON line, then fits a logistic win-rate curve
// against log(dial) and reports the dial at 50%, the 20-80% band and the undecided count.
//   pnpm exec vite-node tools/tune-level.ts -- --level s1-L010 [--dials 0.5,0.63,0.79,1,1.26,1.59,2] [--seeds 5]
//     [--bot average] [--out <dir>] [--fit-only] [--seed-start 1]
// Resume-safe: (dial, seed) pairs already in the runs file for this engine are skipped. Runs at idle priority, one process.
// No run counts as a loss unless the base fell or the level's own fail fired. A run the clock ends is replayed with a 3x
// clock; still open after that it is "unknown" and left out of the fit (never counted as a loss).
const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (n: string, d: string): string => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1]! : d; };
const level = opt("level", "s1-L010");
const pack = level.split("-")[0]!;
const dials = opt("dials", "0.5,0.63,0.79,1,1.26,1.59,2").split(",").map(Number);
const seeds = Number(opt("seeds", "5"));
const seedStart = Number(opt("seed-start", "1")); // fresh seeds for confirm runs (tune plan step 4)
const botName = opt("bot", "average");
const outDir = opt("out", `tune-data/${level}`);
const runsFile = `${outDir}/runs.jsonl`;
const knob = opt("knob", "waves");
const bot = PROFILES[botName];
if (!bot) throw new Error(`unknown bot ${botName}`);

/** Every wave's attacker counts x dial (at least 1 of each kind present), spawn gap / dial so each wave keeps its built length
 *  and gets denser (a fixed gap only makes a bigger wave longer, not harder: 32x attackers at the built gap never touched
 *  Level 10's base). The gap floors at one tick (1/30 s); past that a wave grows longer. Wave start times stay as built.
 *  --keep-gap restores the old count-only dial. */
export function dialWaves(manifest: Record<string, any>, dial: number, keepGap = false): Record<string, any> {
  const c = JSON.parse(JSON.stringify(manifest)) as Record<string, any>;
  for (const w of c["waves"] as any[]) {
    for (const k of Object.keys(w.counts)) if (w.counts[k] > 0) w.counts[k] = Math.max(1, Math.round(w.counts[k] * dial));
    if (!keepGap && w.gap !== undefined) w.gap = Math.max(1 / 30, Number(w.gap) / dial);
  }
  return c;
}

/** Fine economy dial for small-count goals (Doug 2026-11-27): the goal count stays, the cost of reaching it moves.
 *  core_level / build_count: price (every res.* cost) of the build pads the goal counts x dial, rounded, at least 1.
 *  crates: each supply crate's offset from the core x dial (farther or nearer along the same line), clamped inside the
 *  map. Measurement only: at the rebuild the generator places crates at the solved distance on valid ground. */
export function dialCost(manifest: Record<string, any>, dial: number): Record<string, any> {
  const c = JSON.parse(JSON.stringify(manifest)) as Record<string, any>;
  const g = c["goal"] ?? {}, ents = c["entities"] as any[];
  if (g.type === "crates") {
    const core = ents.find((e) => e.type === "sink.core")?.at as [number, number];
    const { w, h } = c["map"] as { w: number; h: number }, pad = 40; // the outer strip is not walkable: 12 px stalled the bot
    for (const e of ents) if (e.type === "capture.supply_crate") {
      e.at = [Math.min(w - pad, Math.max(pad, Math.round(core[0] + (e.at[0] - core[0]) * dial))),
        Math.min(h - pad, Math.max(pad, Math.round(core[1] + (e.at[1] - core[1]) * dial)))];
    }
  } else {
    const build = g.type === "core_level" ? "sink.core.level" : g.type === "build_count" ? g.build : null;
    const pads = ents.filter((e) => e.type === "pad.build" && build && e.build === build);
    if (!pads.length) throw new Error(`goal ${g.type} has no pads to price`);
    for (const p of pads) for (const k of Object.keys(p.cost ?? {})) p.cost[k] = Math.max(1, Math.round(p.cost[k] * dial));
  }
  if (c["params"]?.["level.budgetSeconds"]) c["params"]["level.budgetSeconds"] = Math.round(c["params"]["level.budgetSeconds"] * Math.max(1, dial));
  return c;
}

/** Economy goal-size dial: the main goal's amount (n) x dial, rounded, at least 1; for goals counted in seconds
 *  (automate) the seconds x dial; earn_within keeps its window and scales the amount. Applied to the goal and the main
 *  objective (the sim reads the objective, the bot planner the goal). Goals with no amount (house_all, rescue_all) can't be dialled. */
export function dialGoal(manifest: Record<string, any>, dial: number): Record<string, any> {
  const c = JSON.parse(JSON.stringify(manifest)) as Record<string, any>;
  const scale = (o: Record<string, any> | undefined) => {
    if (!o) return false;
    const key = typeof o["n"] === "number" ? "n" : typeof o["seconds"] === "number" ? "seconds" : null;
    if (!key) return false;
    o[key] = Math.max(1, Math.round(o[key] * dial));
    return true;
  };
  const ok = scale(c["goal"]);
  const main = (c["objectives"] as any[] | undefined)?.find((o) => o.id === "main") ?? (c["objectives"] as any[] | undefined)?.[0];
  if (main) scale(main.params);
  if (!ok) throw new Error(`goal ${c["goal"]?.type} has no amount to dial`);
  // the bot's time budget grows with the goal so a bigger goal is not cut off by a budget sized for the built one
  if (c["params"]?.["level.budgetSeconds"]) c["params"]["level.budgetSeconds"] = Math.round(c["params"]["level.budgetSeconds"] * Math.max(1, dial));
  return c;
}

export type Outcome ="win" | "loss" | "unknown";
export interface TuneRun {
  ts: string; engine: string; content: string; level: string; bot: string; knob?: string; dial: number; seed: number;
  outcome: Outcome; reason: string; extended: boolean; goalDone: boolean; endSec: number;
  /** Seconds to the main goal (the run can go on past it for star objectives); null when the goal was never done. */
  goalSec?: number | null;
  baseMin: number; baseMinByWave: number[]; wavesStarted: number; nWaves: number;
  /** Losses: the wave the base fell in (1-based) and the attacker HP still on the field / all attacker HP spawned so far. */
  lossWave: number | null; hpLeft: number | null; hpLeftShare: number | null; attackersLeft: number;
}

function playOnce(m: Record<string, any>, seed: number, clock: number): Omit<TuneRun, "ts" | "engine" | "content" | "level" | "bot" | "dial" | "seed" | "outcome" | "extended"> & { won: boolean; over: boolean } {
  const nWaves = (m["waves"] as unknown[]).length;
  const byWave = Array<number>(nWaves).fill(-1);
  let baseMin = 1, idx = 0, hpLeft = 0, hpSpawned = 0, left = 0, goalDone = false;
  const seen = new Set<number>();
  const r = playBot(m, bot!, seed, {
    content, timeBudgetSeconds: clock,
    onTick: (st) => {
      const s = st as any;
      const b = st.meters.baseHealth / Math.max(1, st.meters.baseHealthMax);
      baseMin = Math.min(baseMin, b);
      idx = Math.min(nWaves, s.waves.idx);
      if (idx > 0) byWave[idx - 1] = byWave[idx - 1]! < 0 ? b : Math.min(byWave[idx - 1]!, b);
      hpLeft = 0; left = 0;
      for (const h of s.hostiles as any[]) { hpLeft += Math.max(0, h.hp); left++; if (!seen.has(h.id)) { seen.add(h.id); hpSpawned += h.hpMax ?? h.hp; } }
      if (st.objectives[0]?.done) goalDone = true;
    },
  });
  return {
    won: r.won, over: r.reason !== "budget", reason: r.reason, goalDone, endSec: Math.round(r.ticks / 30), goalSec: goalDone ? Math.round(r.goalTicks / 30) : null,
    baseMin: +baseMin.toFixed(3), baseMinByWave: byWave.map((x) => +x.toFixed(3)), wavesStarted: idx, nWaves,
    lossWave: r.won ? null : idx, hpLeft: r.won ? null : Math.round(hpLeft), hpLeftShare: r.won ? null : +(hpLeft / Math.max(1, hpSpawned)).toFixed(3), attackersLeft: left,
  };
}

function runOne(base: Record<string, any>, dial: number, seed: number): TuneRun {
  const m = knob === "goal" ? dialGoal(base, dial) : knob === "cost" ? dialCost(base, dial) : dialWaves(base, dial, args.includes("--keep-gap"));
  const ws = m["waves"] as any[];
  const lastSpawn = Math.max(0, ...ws.map((w) => Number(w.t) + Object.values(w.counts as Record<string, number>).reduce((a, b) => a + b, 0) * Number(w.gap ?? 0.5)));
  const clock = Math.max(Number(m["params"]?.["level.budgetSeconds"] ?? 0), lastSpawn + 300);
  let p = playOnce(m, seed, clock), extended = false;
  if (!p.over) { p = playOnce(m, seed, clock * 3); extended = true; }
  const outcome: Outcome = p.won ? "win" : p.over ? "loss" : "unknown";
  const { won: _w, over: _o, ...rest } = p;
  return { ts: new Date().toISOString(), engine: ENGINE_VERSION, content: CONTENT_VERSION, level, bot: botName, knob, dial, seed, outcome, extended, ...rest };
}

/** Logistic fit P(win) = 1 / (1 + exp(k (x - x50))), x = ln(dial); Newton steps with a light ridge so separable data stays finite. */
export function fitLogistic(pts: { dial: number; win: boolean }[]): { x50: number; k: number; dial50: number; band: [number, number]; bandRatio: number } | null {
  if (pts.length < 4 || pts.every((p) => p.win) || pts.every((p) => !p.win)) return null;
  // parametrise as logit = a + b x (b < 0 when harder dials lose)
  let a = 0, b = -1;
  const lam = 0.01;
  for (let it = 0; it < 100; it++) {
    let ga = 0, gb = -lam * b, haa = 0, hab = 0, hbb = lam;
    for (const p of pts) {
      const x = Math.log(p.dial), q = 1 / (1 + Math.exp(-(a + b * x))), y = p.win ? 1 : 0, w = q * (1 - q);
      ga += y - q; gb += (y - q) * x; haa += w; hab += w * x; hbb += w * x * x;
    }
    haa += 1e-9;
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  const k = -b, x50 = a / k;
  const L4 = Math.log(4);
  const band: [number, number] = [Math.exp(x50 - L4 / k), Math.exp(x50 + L4 / k)]; // dial at 80% win, dial at 20% win
  return { x50, k, dial50: Math.exp(x50), band, bandRatio: band[1] / band[0] };
}

function report(runs: TuneRun[]): string {
  const lines: string[] = [];
  const un = runs.filter((r) => r.outcome === "unknown").length, ext = runs.filter((r) => r.extended).length;
  lines.push(`# Tune ${level} · knob ${knob} · bot ${botName} · engine ${ENGINE_VERSION} · ${runs.length} runs`, "");
  lines.push(`Undecided (unknown) runs: ${un} of ${runs.length} (${ext} needed the 3x clock).`, "");
  lines.push("| dial | runs | wins | losses | unknown | win rate | mean lowest base | losses: mean wave reached | losses: mean attacker HP left |", "|---|---|---|---|---|---|---|---|---|");
  for (const d of [...new Set(runs.map((r) => r.dial))].sort((x, y) => x - y)) {
    const rs = runs.filter((r) => r.dial === d), w = rs.filter((r) => r.outcome === "win").length, l = rs.filter((r) => r.outcome === "loss");
    const dec = w + l.length;
    const mean = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2) : "-");
    lines.push(`| ${d} | ${rs.length} | ${w} | ${l.length} | ${rs.length - dec} | ${dec ? ((100 * w) / dec).toFixed(0) + "%" : "-"} | ${mean(rs.map((r) => r.baseMin))} | ${mean(l.map((r) => r.lossWave ?? 0))} of ${rs[0]?.nWaves} | ${mean(l.map((r) => r.hpLeftShare ?? 0))} |`);
  }
  const f = fitLogistic(runs.filter((r) => r.outcome !== "unknown").map((r) => ({ dial: r.dial, win: r.outcome === "win" })));
  lines.push("");
  if (!f) lines.push("Fit: not possible (all wins or all losses, or too few runs).");
  else {
    lines.push(`Fit: 50% win at dial ${f.dial50.toFixed(2)}; 80% win at ${f.band[0].toFixed(2)}, 20% win at ${f.band[1].toFixed(2)}; 20-80% band = x${f.bandRatio.toFixed(2)} in dial (slope k ${f.k.toFixed(2)}).`);
    lines.push("", "| dial | fitted win rate |", "|---|---|");
    for (const d of dials) lines.push(`| ${d} | ${(100 / (1 + Math.exp(f.k * (Math.log(d) - f.x50)))).toFixed(0)}% |`);
  }
  const t = fitTime(runs);
  const ds = [...new Set(runs.map((r) => r.dial))].sort((x, y) => x - y);
  lines.push("", "Finish time (wins only, seconds to the main goal):", "", "| dial | wins | median s | min s | max s |", "|---|---|---|---|---|");
  for (const d of ds) {
    const ts = runs.filter((r) => r.dial === d && r.outcome === "win" && r.goalSec != null).map((r) => r.goalSec!).sort((a, b) => a - b);
    lines.push(`| ${d} | ${ts.length} | ${ts.length ? ts[ts.length >> 1] : "-"} | ${ts[0] ?? "-"} | ${ts.at(-1) ?? "-"} |`);
  }
  if (t) lines.push("", `Time fit: seconds = ${t.s1.toFixed(0)} x dial^${t.b.toFixed(2)} (log-log least squares over ${t.n} wins, residual sd ${t.sd.toFixed(2)} in log). Built-size finish ${t.s1.toFixed(0)} s.`);
  // largest dial at and below which no run stalled (the goal still fits the map)
  let feasibleMaxDial = 0;
  for (const d of ds) { if (runs.some((r) => r.dial === d && r.outcome === "unknown")) break; feasibleMaxDial = d; }
  writeFileSync(`${outDir}/summary.json`, JSON.stringify({ level, bot: botName, knob, engine: ENGINE_VERSION, runs: runs.length, unknown: runs.filter((r) => r.outcome === "unknown").length, winFit: f, timeFit: t, feasibleMaxDial }, null, 1));
  return lines.join("\n") + "\n";
}

/** log(goalSec) = log(s1) + b log(dial) over wins: the finish-time curve; the dial for a target T seconds is (T / s1)^(1/b). */
export function fitTime(runs: TuneRun[]): { s1: number; b: number; sd: number; n: number } | null {
  const pts = runs.filter((r) => r.outcome === "win" && r.goalSec != null && r.goalSec > 0).map((r) => [Math.log(r.dial), Math.log(r.goalSec!)] as const);
  if (pts.length < 4 || new Set(pts.map((p) => p[0])).size < 2) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const sd = Math.sqrt(pts.reduce((acc, [x, y]) => acc + (y - a - b * x) ** 2, 0) / Math.max(1, n - 2));
  return { s1: Math.exp(a), b, sd, n };
}

function readRuns(): TuneRun[] {
  if (!existsSync(runsFile)) return [];
  const out: TuneRun[] = [];
  for (const l of readFileSync(runsFile, "utf8").split("\n")) { if (!l.trim()) continue; try { const j = JSON.parse(l) as TuneRun; if (j.engine === ENGINE_VERSION && j.level === level && j.bot === botName && (j.knob ?? "waves") === knob) out.push(j); } catch { /* torn last line */ } }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  try { setPriority(19); } catch { /* not allowed: carry on */ }
  if (!args.includes("--fit-only")) {
    const base = JSON.parse(readFileSync(`levels/packs/${pack}/${level}.json`, "utf8")) as Record<string, any>;
    const done = new Set(readRuns().map((r) => `${r.dial}|${r.seed}`));
    console.log(`tune ${level} bot ${botName} engine ${ENGINE_VERSION}: ${dials.length} dials x ${seeds} seeds, ${done.size} already done -> ${runsFile}`);
    // seed-major so a stop part-way still covers every dial
    for (let seed = seedStart; seed < seedStart + seeds; seed++) for (const dial of dials) {
      if (done.has(`${dial}|${seed}`)) continue;
      const t0 = Date.now();
      const r = runOne(base, dial, seed);
      appendFileSync(runsFile, JSON.stringify(r) + "\n");
      console.log(`${r.ts} dial ${dial} seed ${seed}: ${r.outcome} (${r.reason}${r.extended ? ", 3x clock" : ""}) lowest base ${r.baseMin} waves ${r.wavesStarted}/${r.nWaves} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  const rep = report(readRuns());
  writeFileSync(`${outDir}/report.md`, rep);
  console.log(rep);
  writeFileSync(`${outDir}/DONE`, new Date().toISOString());
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

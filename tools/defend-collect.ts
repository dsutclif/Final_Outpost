import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { setPriority } from "node:os";
import { content, CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { playBot, strategyProfile, LADDER, type Strategy } from "../packages/bots/src/index.js";
import { DATA_DIR, LEVELS, RUNS_FILE, SIM_STRATEGIES, STATE_FILE, VARIANTS, loadLevel, shapeWaves, type CellLine, type RunLine, type SimStrategy, type Variant } from "./defend-lib.js";

// Defend model data run (outpost-ops#273). Per (level, variant, strategy, wave, seed) it searches the largest multiplier of that one wave the
// strategy bot still holds, aiming each next volume from the last run's margin (not halving), and appends every run as a JSON line.
// Resume-safe: a finished search writes a "cell" line and a restart skips it. One worker, low priority, pauses while story lanes build.
//   pnpm exec vite-node tools/defend-collect.ts -- [--seeds 6] [--hours 72] [--trial 600] [--sleep 400] [--only scratch-L021]
// --trial S: stop after S seconds (the short trial); the same data file is kept. Start time and stop target live in state.json.
const args = process.argv.slice(2).filter((a) => a !== "--");
const val = (n: string, d: number): number => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const onlyVariant = args.includes("--variant") ? args[args.indexOf("--variant") + 1] : undefined;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const BUILD_DIR = process.env["DEFEND_PAUSE_DIR"] ?? "C:/Users/dougl/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_094a00b3-ee04-4f42-af3f-2f1df0034834";
const MAX_RUNS_PER_CELL = 10, TOL = 1.15, CEIL = 60, FLOOR = 0.05;

mkdirSync(DATA_DIR, { recursive: true });
try { setPriority(19); } catch { /* not allowed: carry on */ }
const state: Record<string, any> = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : { startedAt: Date.now() };
if (state["engine"] !== ENGINE_VERSION) { state["engine"] = ENGINE_VERSION; state["content"] = CONTENT_VERSION; state["startedAt"] = Date.now(); }
state["seeds"] = val("seeds", state["seeds"] ?? 6); state["hours"] = val("hours", state["hours"] ?? 72);
writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
const deadline = args.includes("--trial") ? Date.now() + val("trial", 600) * 1000 : state["startedAt"] + state["hours"] * 3600e3;
const sleepMs = val("sleep", 400);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True while another session's note in the pause folder ends in BUILDING (the story lanes come first). */
function buildingElsewhere(): boolean {
  try {
    for (const f of readdirSync(BUILD_DIR)) {
      if (!f.endsWith(".md")) continue;
      const last = readFileSync(`${BUILD_DIR}/${f}`, "utf8").trimEnd().split(/\r?\n/).filter((l) => l.trim()).at(-1) ?? "";
      if (/BUILDING[\s*_`.]*$/i.test(last.trim())) return true;
    }
  } catch { /* folder missing: nothing is building */ }
  return false;
}

const done = new Set<string>();
const lastMult = new Map<string, number>();
const estOf = new Map<string, number>();
if (existsSync(RUNS_FILE)) for (const l of readFileSync(RUNS_FILE, "utf8").split("\n")) {
  if (!l.trim()) continue;
  try {
    const j = JSON.parse(l) as CellLine | RunLine;
    if (j.engine !== ENGINE_VERSION || j.kind !== "cell") continue;
    done.add(`${j.level}|${j.variant}|${j.strategy}|${j.wave}|${j.seed}`);
    lastMult.set(`${j.level}|${j.variant}|${j.strategy}|${j.wave}`, j.est);
    estOf.set(`${j.level}|${j.variant}|${j.strategy}|${j.wave}|${j.seed}`, j.est);
  } catch { /* torn last line from a hard stop */ }
}

const profileFor = (s: SimStrategy) => { if (s !== "fastest") return strategyProfile(s as Strategy); const { judgment: _j, ...rest } = LADDER[0]!; return { ...rest, name: "good:fastest" }; };

type Played = Pick<RunLine, "won" | "reason" | "held" | "margin" | "baseLeft" | "leaks" | "baseHp" | "purchases" | "salvageEarned" | "salvageSpent" | "fuelFed" | "ticks" | "combat">;
function play(manifest: Record<string, any>, s: SimStrategy, seed: number): Played {
  const purchases: { tick: number; what: string }[] = [];
  let fuelFed = 0, baseEnd = 1;
  // #350 F2 terms: kills by source, attacker hits by target, downs, gate crowding, attackers left at the end
  const cb: NonNullable<RunLine["combat"]> = { kills: {}, hits: {}, guardDowns: 0, cmdDowns: 0, gateQueueMax: 0, gateQueueSec: 0, leftAlive: 0, endSec: 0 };
  // #350 F1: the clock is pushed past the level budget so a fight can finish (300 s after the last spawn); a run still ended by the clock is unresolved, not held
  const ws = (manifest["waves"] ?? []) as any[];
  const lastSpawn = Math.max(0, ...ws.map((w) => Number(w.t) + Object.values(w.counts as Record<string, number>).reduce((a, b) => a + b, 0) * Number(w.gap ?? 0.5)));
  const budget = Number(manifest["params"]?.["level.budgetSeconds"] ?? 0);
  const r = playBot(manifest, profileFor(s), seed, {
    content, timeBudgetSeconds: Math.max(budget, lastSpawn + 300),
    onTick: (st, _b, ev) => {
      let q = 0;
      for (const h of (st as any).hostiles as any[]) if (h.target === "barrier") q++;
      cb.gateQueueMax = Math.max(cb.gateQueueMax, q); if (q > 2) cb.gateQueueSec += 1 / 30;
      cb.leftAlive = ((st as any).hostiles as any[]).length; cb.endSec = st.tick / 30;
      for (const e of ev as any[]) {
        if (e.t === "died" && String(e.kind).startsWith("hostile")) cb.kills[e.by ?? "?"] = (cb.kills[e.by ?? "?"] ?? 0) + 1;
        else if (e.t === "hit" && e.by === "hostile") cb.hits[e.target] = (cb.hits[e.target] ?? 0) + 1;
        else if (e.t === "guard_down") cb.guardDowns++;
        else if (e.t === "downed") cb.cmdDowns++;
        if (e.t === "built") purchases.push({ tick: st.tick, what: String(e.build) });
        else if (e.t === "hired") purchases.push({ tick: st.tick, what: "guard" });
        else if (e.t === "deposited" && e.to === "sink.core" && e.by === undefined) fuelFed++;
      }
      baseEnd = st.meters.baseHealth / Math.max(1, st.meters.baseHealthMax);
    },
  });
  const d = r.defend;
  return {
    won: r.won, reason: r.reason, held: r.won, margin: r.margin, baseLeft: baseEnd,
    combat: cb, leaks: d?.leaks ?? [], baseHp: d?.baseHp ?? [], purchases, salvageEarned: d?.salvageEarned ?? 0, salvageSpent: d?.salvageSpent ?? 0, fuelFed, ticks: r.ticks,
  };
}

interface Pt { m: number; mg: number }
/** Next volume from the last run: a step sized by its margin, or the log-interpolated margin-zero point inside a bracket. */
function aim(m: number, held: boolean, margin: number, lo: Pt | null, hi: Pt | null): number {
  if (lo && hi) {
    const t = lo.mg / (lo.mg - hi.mg || 1); // margin falls from lo.mg (held, > 0) to hi.mg (lost, < 0)
    return Math.exp(Math.log(lo.m) + Math.min(0.85, Math.max(0.15, t)) * (Math.log(hi.m) - Math.log(lo.m)));
  }
  const g = 1 + 4 * Math.max(Math.abs(margin), 0.25);
  return held ? m * g : m / g;
}

async function cell(level: string, variant: Variant, strategy: SimStrategy, wave: number, seed: number, base: Record<string, any>): Promise<boolean> {
  const ck = `${level}|${variant}|${strategy}|${wave}`;
  // earlier waves at 0.9 x this strategy's own limit found for this seed (at most 1), so a wave is probed on a base that still stands
  const prior = Array.from({ length: wave }, (_, i) => Math.min(1, 0.9 * (estOf.get(`${level}|${variant}|${strategy}|${i}|${seed}`) ?? 1)));
  let m = lastMult.get(ck) ?? 1;
  let lo: Pt | null = null, hi: Pt | null = null, runs = 0;
  while (runs < MAX_RUNS_PER_CELL) {
    while (buildingElsewhere()) { if (Date.now() > deadline) return false; await sleep(60_000); }
    if (Date.now() > deadline) return false;
    const mult = [...prior, m];
    const r = play(shapeWaves(base, mult), strategy, seed);
    runs++;
    const line: RunLine = { kind: "run", ts: new Date().toISOString(), engine: ENGINE_VERSION, content: CONTENT_VERSION, level, variant, strategy, seed, wave, mult, ...r };
    appendFileSync(RUNS_FILE, JSON.stringify(line) + "\n");
    // a held run's margin is clamped positive and a lost one's negative, so the bracket interpolation is well-defined
    const pm = r.held && r.margin <= 0 ? 0.8 * r.baseLeft : r.margin; // the clock ran out with the base standing: margin 0, so use what is left of the base
    const mg = r.held ? Math.max(pm, 0.01) : Math.min(pm, -0.01);
    if (r.held) { if (!lo || m > lo.m) lo = { m, mg }; } else if (!hi || m < hi.m) hi = { m, mg };
    if (lo && hi && hi.m < lo.m) hi = null; // non-monotone sim: keep the held point and search upward from it
    if (lo && hi && hi.m / lo.m < TOL) break;
    if (!hi && lo && lo.m >= CEIL) break;
    if (!lo && hi && hi.m <= FLOOR) break;
    m = Math.min(CEIL, Math.max(FLOOR, aim(m, r.held, pm, lo, hi)));
    await sleep(sleepMs);
  }
  const est = lo && hi ? Math.sqrt(lo.m * hi.m) : lo ? lo.m : hi ? hi.m / 1.5 : 1;
  const cl: CellLine = { kind: "cell", ts: new Date().toISOString(), engine: ENGINE_VERSION, content: CONTENT_VERSION, level, variant, strategy, seed, wave, lo: lo?.m ?? 0, hi: hi?.m ?? null, runs, prior, est };
  appendFileSync(RUNS_FILE, JSON.stringify(cl) + "\n");
  console.log(`${cl.ts} cell ${level} ${variant} ${strategy} wave ${wave} seed ${seed}: lo ${cl.lo.toFixed(2)} hi ${cl.hi?.toFixed(2) ?? "none"} (${runs} runs)`);
  done.add(`${level}|${variant}|${strategy}|${wave}|${seed}`);
  lastMult.set(ck, est);
  estOf.set(`${ck}|${seed}`, est);
  return true;
}

async function main(): Promise<void> {
  console.log(`defend-collect engine ${ENGINE_VERSION} content ${CONTENT_VERSION}  seeds ${state["seeds"]}  until ${new Date(deadline).toISOString()}  data ${RUNS_FILE}`);
  const levels = LEVELS.filter((l) => !only || l.tag === only);
  // seed-major: every cell gets seed 1 before any gets seed 2, so a stop at any time leaves even coverage
  for (let seed = 1; seed <= state["seeds"]; seed++) {
    for (const lv of levels) for (const variant of VARIANTS.filter((v) => !onlyVariant || v === onlyVariant)) {
      const base = loadLevel(lv.tag, variant);
      const nW = (base["waves"] as unknown[]).length;
      for (const strategy of SIM_STRATEGIES) for (let wave = 0; wave < nW; wave++) {
        if (done.has(`${lv.tag}|${variant}|${strategy}|${wave}|${seed}`)) continue;
        if (Date.now() > deadline) { console.log("stop target reached; run again to resume"); return; }
        if (!(await cell(lv.tag, variant, strategy, wave, seed, base))) { console.log("stop target reached; run again to resume"); return; }
      }
    }
    console.log(`seed ${seed} complete: ${done.size} searches`);
  }
  console.log("sample target reached");
  writeFileSync(`${DATA_DIR}/COMPLETE`, new Date().toISOString());
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

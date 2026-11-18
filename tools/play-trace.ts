import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILES, playBot } from "../packages/bots/src/index.js";
import { ACTION_EVENTS, ENGINE_VERSION, TPS, type SimEvent } from "../packages/sim/src/index.js";

// Play trace: a compact, deterministic event timeline for ONE bot run of ONE level.
//
//   pnpm trace --level <file | id> --seed <n> [--bot good] [--out file.json] [--idle 10]
//   pnpm trace --candidate levels/candidates/<pack>.jsonl --line <n> --seed <n>   (record must carry `manifest`)
//
// As a function (the build pipeline's way):  traceRun(manifest, { seed, bot, idleSeconds })  -> Trace
//                                            traceText(trace)                                 -> the exact file text
//
// Reuses playBot's `onTick` hook: no sim or bot change, no new events. Nothing time- or machine-dependent goes
// into the output, so the same level + seed + bot gives byte-identical text (the header carries the run hash too).
//
// Format: one JSON document, header fields first, then `events` with ONE ROW PER LINE (cheap to read and to diff).
// All times are sim ticks (TPS per second, header.tps); all numbers are the sim's raw integers, nothing rounded.
// State tuple `s` = header.cols = [currency, scrapCarried, scrapPicked, fuel, baseHp, earned]:
//   currency      st.currency; scrapCarried  res.salvage units in the player's stack right now;
//   scrapPicked   salvage picked up so far (stats.salvage); fuel  core fuel (raw); baseHp  base health (raw);
//   earned        sum of `pay` over sold events so far.
// Rows (row[0] = kind, row[1] = tick):
//   built   [pad, build, paid, s]   hired [pad, role, paid, s]   unlock [pad, target, paid, s]   paid = {res: n} spent on that pad since its last row
//   coreup  [level, s]   zone [zone, s]   barrier+ / barrier- [line, section, s]   obj [id, kind, done, failed, s]
//   wave+   [idx, s]   wave- [idx, kills{kind:n} since the wave started, s]
//   bad     [what, detail, s]   what = downed | guard_down | guard_died | pod_lost | fuel_out | fuel_back | core_lit | injured
//   idle    [endTick, s]   the player did nothing for >= header.idleTicks ticks: starts at row[1], s taken at the start
//   end     [won, reason, s]
// A "player action" for idle is any ACTION_EVENTS event with no worker (`by`) behind it. Kills are counted per wave
// (not one row each) and the rest of the run's kills sit in header-level `killsAfterLastWave`.

export const TRACE_FORMAT = 1;
/** Default idle threshold: 10 s with no player action is long enough to be a real gap, short enough to catch every walk-around. */
export const DEFAULT_IDLE_SECONDS = 10;
const COLS = ["currency", "scrapCarried", "scrapPicked", "fuel", "baseHp", "earned"] as const;

type Row = (string | number | boolean | null | object)[];
type Tuple = [number, number, number, number, number, number];

export interface TraceOptions {
  seed: number;
  /** Profile name from PROFILES (good, average, weak, novice, floor, human). Default "good". */
  bot?: string;
  /** No player action for this many seconds is an idle stretch. Default DEFAULT_IDLE_SECONDS. */
  idleSeconds?: number;
  /** Optional cap passed on to playBot (seconds); leave out to use the level's own budget. */
  timeBudgetSeconds?: number;
}

export interface Trace {
  trace: number;
  level: string;
  seed: number;
  bot: string;
  engine: string;
  tps: number;
  idleTicks: number;
  cols: readonly string[];
  result: { won: boolean; reason: string; ticks: number; goalTicks: number; stars: number; margin: number; stalls: number; hash: string };
  start: Tuple;
  /** Per scheduled wave (-1: never started): base health fraction at wave end, towers at wave start, leaks (playBot's defend record). */
  defend: { baseHp: number[]; towers: number[]; leaks: number[]; salvageEarned: number; salvageSpent: number; firstCoreContactS: number } | null;
  stallsAt: { tick: number; task: string; planStep: string | null; currency: number; fuel: number }[];
  killsAfterLastWave: Record<string, number>;
  events: Row[];
}

const sortedObj = (o: Record<string, number>): Record<string, number> => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]!]));

export function traceRun(manifest: unknown, opts: TraceOptions): Trace {
  const botName = opts.bot ?? "good";
  const profile = PROFILES[botName];
  if (!profile) throw new Error(`unknown bot "${botName}" (have: ${Object.keys(PROFILES).join(", ")})`);
  const idleTicks = Math.round((opts.idleSeconds ?? DEFAULT_IDLE_SECONDS) * TPS);
  const rows: Row[] = [];
  let earned = 0;
  let lastAction = 0, idleState: Tuple | null = null;
  let kills: Record<string, number> = {};
  const paid = new Map<string, Record<string, number>>();
  let startTuple: Tuple | null = null;

  const snap = (st: { currency: number; core: { fuel: number }; meters: { baseHealth: number }; stats: { salvage: number }; player: { stack: string[] } }): Tuple =>
    [st.currency, st.player.stack.filter((x) => x === "res.salvage").length, st.stats.salvage, st.core.fuel, st.meters.baseHealth, earned];
  const takePaid = (pad: string): Record<string, number> => { const p = paid.get(pad) ?? {}; paid.delete(pad); return sortedObj(p); };

  const result = playBot(manifest, profile, opts.seed, {
    ...(opts.timeBudgetSeconds !== undefined ? { timeBudgetSeconds: opts.timeBudgetSeconds } : {}),
    onTick: (st, _brain, ev: SimEvent[]) => {
      const t = st.tick;
      if (startTuple === null) startTuple = snap(st);
      let acted = false;
      for (const e of ev) {
        if (e.t === "sold") earned += e.pay;
        if (ACTION_EVENTS.has(e.t) && !("by" in e && e.by !== undefined)) acted = true;
      }
      // Idle: remember the state when the threshold is crossed; close the stretch at the next action.
      if (acted) {
        if (idleState !== null) { rows.push(["idle", lastAction, t, idleState]); idleState = null; }
        lastAction = t;
      } else if (idleState === null && t - lastAction >= idleTicks) idleState = snap(st);
      if (ev.length === 0) return;
      const s = (): Tuple => snap(st);
      for (const e of ev) {
        switch (e.t) {
          case "pad_paid": { const p = paid.get(e.pad) ?? {}; p[e.res] = (p[e.res] ?? 0) + e.n; paid.set(e.pad, p); break; }
          case "built": rows.push(["built", t, e.pad, e.build, takePaid(e.pad), s()]); break;
          case "hired": rows.push(["hired", t, e.pad, e.role, takePaid(e.pad), s()]); break;
          case "unlocked": rows.push(["unlock", t, e.pad, e.target, takePaid(e.pad), s()]); break;
          case "core_upgraded": rows.push(["coreup", t, e.level, s()]); break;
          case "zone_cleared": rows.push(["zone", t, e.zone, s()]); break;
          case "barrier_built": rows.push(["barrier+", t, e.line, e.section, s()]); break;
          case "barrier_broken": rows.push(["barrier-", t, e.line, e.section, s()]); break;
          case "objective": if (e.done || e.failed) rows.push(["obj", t, e.id, e.kind, e.done, e.failed, s()]); break;
          case "wave_started": kills = {}; rows.push(["wave+", t, e.idx, s()]); break;
          case "wave_cleared": rows.push(["wave-", t, e.idx, sortedObj(kills), s()]); kills = {}; break;
          case "died": kills[e.kind] = (kills[e.kind] ?? 0) + 1; break;
          case "downed": rows.push(["bad", t, "downed", "", s()]); break;
          case "guard_down": rows.push(["bad", t, "guard_down", e.resident, s()]); break;
          case "guard_died": rows.push(["bad", t, "guard_died", e.resident, s()]); break;
          case "pod_lost": rows.push(["bad", t, "pod_lost", e.capture, s()]); break;
          case "injured": rows.push(["bad", t, "injured", e.resident, s()]); break;
          case "core_fuel_out": rows.push(["bad", t, "fuel_out", "", s()]); break;
          case "core_fuel_restored": rows.push(["bad", t, "fuel_back", "", s()]); break;
          case "core_lit": rows.push(["bad", t, "core_lit", "", s()]); break;
          case "level_end": rows.push(["end", t, e.won, e.reason, s()]); break;
          default: break;
        }
      }
    },
  });
  // An idle stretch still open at the end of the run closes at the final tick.
  if (idleState !== null) rows.push(["idle", lastAction, result.ticks, idleState]);
  // Rows were collected out of order only by idle (closed late); a stable sort by tick restores the timeline.
  const events = rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r[1] as number) - (b.r[1] as number) || a.i - b.i).map((x) => x.r);
  const m = manifest as { id?: string };
  const d = result.defend;
  return {
    trace: TRACE_FORMAT,
    level: String(m.id ?? ""),
    seed: opts.seed,
    bot: botName,
    engine: ENGINE_VERSION,
    tps: TPS,
    idleTicks,
    cols: COLS,
    result: { won: result.won, reason: result.reason, ticks: result.ticks, goalTicks: result.goalTicks, stars: result.stars, margin: result.margin, stalls: result.stalls, hash: result.hash },
    start: startTuple ?? [0, 0, 0, 0, 0, 0],
    defend: d ? { baseHp: d.baseHp, towers: d.towers, leaks: d.leaks, salvageEarned: d.salvageEarned, salvageSpent: d.salvageSpent, firstCoreContactS: d.firstCoreContactS } : null,
    stallsAt: result.stallStates.slice(0, 5).map((x) => ({ tick: x.tick, task: x.task, planStep: x.planStep, currency: x.currency, fuel: x.fuel })),
    killsAfterLastWave: sortedObj(kills),
    events,
  };
}

/** The exact bytes written: header fields on their own lines, `events` one row per line. */
export function traceText(tr: Trace): string {
  const { events, ...head } = tr;
  const lines = Object.entries(head).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  return `{\n${lines.join(",\n")},\n"events":[\n${events.map((r) => JSON.stringify(r)).join(",\n")}\n]\n}\n`;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** Manifest from a file path, or from a level id found under levels/packs/*, levels/story and levels/golden. */
export function loadManifest(levelArg: string, cwd: string = process.cwd()): unknown {
  const asPath = isAbsolute(levelArg) ? levelArg : resolve(cwd, levelArg);
  if (existsSync(asPath) && !asPath.endsWith("/") && /\.json$/i.test(asPath)) return JSON.parse(readFileSync(asPath, "utf8"));
  const dirs = [join(root, "levels", "story"), join(root, "levels", "golden"), ...readdirSync(join(root, "levels", "packs"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(root, "levels", "packs", e.name))];
  for (const d of dirs) { const f = join(d, `${levelArg}.json`); if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")); }
  throw new Error(`level "${levelArg}" is neither a file nor an id under levels/{packs/*,story,golden}`);
}

/**
 * A candidate record from levels/candidates/<pack>.jsonl. Those records hold the knobs and settings but, today, not the
 * built manifest, and a rebuild would need the layout salt, hire ease and dropped features the search used. So a record is
 * traceable only when it carries `manifest` (the object) or `manifestPath` (a file); otherwise this throws, naming the gap.
 */
export function manifestOfCandidate(rec: Record<string, unknown>): unknown {
  if (rec["manifest"] && typeof rec["manifest"] === "object") return rec["manifest"];
  if (typeof rec["manifestPath"] === "string") return JSON.parse(readFileSync(rec["manifestPath"], "utf8"));
  throw new Error("candidate record has no `manifest`/`manifestPath`: the generator must log the built manifest (or a path) per candidate before it can be traced");
}

export function readCandidate(file: string, line: number): Record<string, unknown> {
  const ls = readFileSync(file, "utf8").split("\n").filter((l) => l.trim() !== "");
  const l = ls[line - 1];
  if (l === undefined) throw new Error(`${file} has ${ls.length} records; no line ${line}`);
  return JSON.parse(l) as Record<string, unknown>;
}

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (n: string, d?: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const base = process.env["INIT_CWD"] ?? process.cwd();
  const seed = Number(arg("--seed", "1"));
  let manifest: unknown;
  if (arg("--candidate")) manifest = manifestOfCandidate(readCandidate(resolve(base, arg("--candidate")!), Number(arg("--line", "1"))));
  else if (arg("--level")) manifest = loadManifest(arg("--level")!, base);
  else { console.error("usage: pnpm trace --level <file|id> --seed <n> [--bot good] [--idle 10] [--out file.json]\n       pnpm trace --candidate <file.jsonl> --line <n> --seed <n>"); process.exit(2); }
  const idle = arg("--idle");
  const tr = traceRun(manifest, { seed, bot: arg("--bot", "good")!, ...(idle !== undefined ? { idleSeconds: Number(idle) } : {}) });
  const text = traceText(tr);
  const out = arg("--out");
  if (out) { writeFileSync(resolve(base, out), text); console.error(`${basename(out)}: ${tr.events.length} events, ${text.length} bytes, ${tr.result.won ? "won" : "lost"} (${tr.result.reason})`); }
  else process.stdout.write(text);
}

// Runs only as `pnpm trace` (npm_lifecycle_event), never when a test or the build pipeline (also vite-node) imports this file.
if (process.env["npm_lifecycle_event"] === "trace") main();

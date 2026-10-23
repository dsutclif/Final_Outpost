import type { Compiled, CompiledObjective } from "../compile.js";
import type { SimEvent } from "../events.js";
import { TPS } from "../fixed.js";
import type { ObjectiveState, State } from "../state.js";
import { inBase, population } from "./common.js";
import { converterRunnable, operated } from "./converters.js";
import { coreFuelCap } from "./core.js";
import { wavesDone } from "./defense.js";

// Objectives are a registry like the old goal predicates: each kind turns state and stats into
// progress / target, and says when it is done or can no longer be done. Kinds and their params
// are listed in content/data/objectives.json; checkManifest validates them, so params here are
// trusted. "Guard" kinds (never X) only fail during play; they count as done when the level ends.

type P = Record<string, number | string>;
interface Ctx { st: State; cp: Compiled; p: P; o: ObjectiveState; main: ObjectiveState }
/** Sets o.progress / o.target and returns true when the objective is achieved; may set o.failed. */
type Kind = (c: Ctx) => boolean;

const num = (p: P, k: string, dflt = 0): number => (typeof p[k] === "number" ? p[k] as number : dflt);
const str = (p: P, k: string): string | undefined => (typeof p[k] === "string" ? p[k] as string : undefined);
const secs = (p: P): number => Math.round(num(p, "seconds") * TPS);

/** progress vs target, done at target. */
const count = (o: ObjectiveState, progress: number, target: number): boolean => {
  o.progress = progress;
  o.target = target;
  return progress >= target;
};
/** Never-breached guard: progress 1 of 1 while intact, 0 once breached. */
const guard = (o: ObjectiveState, breached: boolean): boolean => {
  if (breached) o.failed = true;
  o.progress = o.failed ? 0 : 1;
  o.target = 1;
  return false;
};
/** A run of consecutive ticks while `holds`, done at `target` ticks. Progress is the memory. */
const hold = (o: ObjectiveState, holds: boolean, target: number): boolean => {
  o.progress = holds ? o.progress + 1 : 0;
  o.target = target;
  return o.progress >= target;
};
/** Reached by the deadline, failed after it. */
const byDeadline = (c: Ctx, progress: number, target: number, deadline: number): boolean => {
  const ok = count(c.o, progress, target);
  if (ok && c.st.tick <= deadline) return true;
  if (c.st.tick > deadline) c.o.failed = true;
  return false;
};

const heatAtLeast = (st: State, cp: Compiled, pct: number): boolean => st.core.fuel * 100 >= pct * coreFuelCap(st, cp);
const recruitPods = (st: State, cp: Compiled): number =>
  st.captures.filter((c) => cp.lassoables[c.type]?.result === "recruit").length;
const turretLevel = (st: State, cp: Compiled): number =>
  st.structures.reduce((m, s) => (cp.structures[s.type]?.tiers ? Math.max(m, s.level) : m), 0);
const sections = (st: State): { total: number; built: number } => {
  let total = 0, built = 0;
  for (const l of st.barriers) for (const s of l.sections) { total++; if (s.built) built++; }
  return { total, built };
};

export const OBJECTIVE_KINDS: Record<string, Kind> = {
  // shelter
  population: ({ st, p, o }) => count(o, population(st), num(p, "n")),
  core_level: ({ st, p, o }) => count(o, st.core.level, num(p, "n")),
  build_count: ({ st, p, o }) => count(o, st.structures.filter((s) => s.type === str(p, "build")).length, num(p, "n")),
  hazard_survive: ({ st, cp, p, o }) => count(o, st.stats.hazardsSurvived, num(p, "n", cp.events.length)),
  heat_hold: ({ st, cp, p, o }) => hold(o, heatAtLeast(st, cp, num(p, "pct")), secs(p)),
  fuel_full: (c) => byDeadline(c, c.st.core.fuel, coreFuelCap(c.st, c.cp), secs(c.p)),
  admit: ({ st, p, o }) => count(o, st.stats.admitted, num(p, "n")),
  clear_zones: ({ st, p, o }) => count(o, st.stats.zonesCleared, num(p, "n")),
  house_all: ({ st, cp, o }) => {
    const housed = st.residents.filter((r) => r.origin !== "start" && inBase(r)).length;
    const pending = st.residents.filter((r) => r.status === "waiting" || r.status === "arriving").length
      + st.timers.gateLeft + recruitPods(st, cp);
    count(o, housed, housed + pending);
    return pending === 0 && housed > 0;
  },
  survive: ({ st, p, o }) => count(o, Math.min(st.tick, secs(p)), secs(p)),
  // rescue
  rescue: ({ st, p, o }) => count(o, st.stats.rescued, num(p, "n")),
  rescue_all: ({ st, cp, o }) => {
    if (st.stats.podsLost > 0) o.failed = true;
    const left = recruitPods(st, cp);
    count(o, st.stats.rescued, st.stats.rescued + left);
    return left === 0 && st.stats.rescued > 0;
  },
  tow_trip: ({ st, p, o }) => count(o, st.stats.tripBest, num(p, "n")),
  rescue_before_freeze: ({ st, cp, p, o }) => {
    const n = num(p, "n");
    if (st.stats.rescued + recruitPods(st, cp) < n) o.failed = true;
    return count(o, st.stats.rescued, n);
  },
  hunt: ({ st, p, o }) => count(o, st.stats.preyKilled, num(p, "n")),
  protein: ({ st, p, o }) => count(o, st.stats.protein, num(p, "n")),
  rescue_housed: ({ st, p, o }) => count(o, st.residents.filter((r) => r.origin === "rescue" && inBase(r)).length, num(p, "n")),
  tow_full_trip: ({ st, cp, p, o }) => count(o, st.stats.tripBestClean, num(p, "n", cp.lasso.maxTowed)),
  crates: ({ st, p, o }) => count(o, st.stats.crates, num(p, "n")),
  // harvest
  currency: ({ st, p, o }) => count(o, st.currency, num(p, "n")),
  sell: ({ st, p, o }) => count(o, st.stats.soldUnits[str(p, "res") ?? ""] ?? 0, num(p, "n")),
  earn: ({ st, p, o }) => count(o, st.stats.earned, num(p, "n")),
  serve_premium: ({ st, p, o }) => count(o, st.sales?.premiumServed ?? 0, num(p, "n")),
  unlock: ({ st, p, o }) => count(o, st.stats.unlocked, num(p, "n")),
  shelves_full: ({ st, cp, o }) => {
    const s = st.sales;
    if (!s) return count(o, 0, 1);
    return count(o, s.sells.filter((r) => (s.shelf[r] ?? 0) >= cp.sales.shelfCap).length, s.sells.length);
  },
  streak: ({ st, p, o }) => count(o, st.stats.streakMax, num(p, "n")),
  sell_each: ({ st, p, o }) => count(o, Object.values(st.stats.soldUnits).filter((v) => v >= num(p, "n")).length, num(p, "k")),
  hire: ({ st, p, o }) => {
    const role = str(p, "role");
    return count(o, role === undefined ? st.stats.hired : st.stats.hiredBy[role] ?? 0, num(p, "n"));
  },
  earn_within: (c) => byDeadline(c, c.st.stats.earned, num(c.p, "n"), secs(c.p)),
  bulk_order: ({ st, p, o }) => count(o, st.stats.bulkServed, num(p, "n", 1)),
  // industrialize
  produce: ({ st, p, o }) => {
    const res = str(p, "res");
    return count(o, res === undefined ? st.stats.converted : st.stats.convertedBy[res] ?? 0, num(p, "n"));
  },
  converters_running: ({ st, cp, p, o }) =>
    hold(o, st.converters.filter((cv) => converterRunnable(cp, cv) && operated(st, cp, cv)).length >= num(p, "k"), secs(p)),
  haul: ({ st, p, o }) => count(o, st.stats.hauled, num(p, "n")),
  chain: ({ st, p, o }) => count(o, st.stats.tier2Made, num(p, "n", 1)),
  automate: ({ st, p, o }) => count(o, st.stats.salesSinceDeposit > 0 ? Math.min(st.tick - st.stats.lastPlayerDeposit, secs(p)) : 0, secs(p)),
  stockpile: ({ st, p, o }) => count(o, st.depot?.stock[str(p, "res") ?? ""] ?? 0, num(p, "n")),
  build: ({ st, p, o }) => count(o, st.built.includes(str(p, "target") ?? "") ? 1 : 0, 1),
  converter_level: ({ st, p, o }) => count(o, st.converters.reduce((m, cv) => Math.max(m, cv.level), 0), num(p, "n")),
  // defend
  waves: ({ st, cp, o }) => {
    count(o, st.stats.wavesCleared, cp.waves.length);
    return wavesDone(st, cp);
  },
  waves_survived: ({ st, p, o }) => count(o, st.stats.wavesCleared, num(p, "n")),
  kills: ({ st, p, o }) => count(o, st.stats.kills, num(p, "n")),
  boss: ({ st, p, o }) => count(o, st.stats.bossKills, num(p, "n", 1)),
  turret_level: ({ st, cp, p, o }) => count(o, turretLevel(st, cp), num(p, "n")),
  salvage: ({ st, p, o }) => count(o, st.stats.salvage, num(p, "n")),
  perimeter_before_wave1: ({ st, o }) => {
    const { total, built } = sections(st);
    const ok = count(o, built, total) && total > 0;
    if (ok && st.waves.idx === 0) return true;
    if (st.waves.idx > 0) o.failed = true;
    return false;
  },
  // challenges
  time_target: ({ st, p, o, main }) => {
    const T = secs(p);
    o.progress = Math.min(st.tick, T);
    o.target = T;
    if (main.done && st.tick <= T) return true;
    if (st.tick > T) o.failed = true;
    return false;
  },
  settlement_never_freezes: ({ st, o }) => guard(o, st.stats.fuelOuts > 0),
  no_colonist_freezes: ({ st, o }) => guard(o, st.stats.froze > 0),
  heat_floor: ({ st, cp, p, o }) => guard(o, !heatAtLeast(st, cp, num(p, "pct"))),
  no_angry_customers: ({ st, o }) => guard(o, st.stats.customersAngry > 0),
  no_injuries: ({ st, o }) => guard(o, st.stats.injured > 0),
  hp_floor: ({ st, p, o }) => guard(o, st.meters.baseHealth * 100 < num(p, "pct") * st.meters.baseHealthMax),
  // only gates can break (Batch 3)
  gate_held: ({ st, o }) => guard(o, st.stats.barriersLost > 0),
  no_stockpile_overload: ({ st, cp, o }) => guard(o,
    // Converter outputs only: a full kiosk shelf is the healthy state, and the warehouse has no cap.
    st.converters.some((cv) => cv.out >= cp.converters[cv.type]!.outCap)),
};

export function initObjectives(cp: Compiled): ObjectiveState[] {
  return cp.objectives.map((o) => ({ id: o.id, kind: o.kind, progress: 0, target: 0, done: false, failed: false, doneTick: -1 }));
}

function evaluate(st: State, cp: Compiled, def: CompiledObjective, o: ObjectiveState, main: ObjectiveState, out: SimEvent[]): void {
  const kind = OBJECTIVE_KINDS[def.kind];
  if (!kind || o.done || o.failed) {
    // Latched: keep guards' progress honest, nothing else moves.
    return;
  }
  const done = kind({ st, cp, p: def.params, o, main });
  if (done && !o.failed) { o.done = true; o.doneTick = st.tick; }
  if (o.done || o.failed) out.push({ t: "objective", id: o.id, kind: o.kind, done: o.done, failed: o.failed });
}

/** Evaluate every objective from this tick's state and stats; the main goal (index 0) first. */
export function stepObjectives(st: State, cp: Compiled, out: SimEvent[]): void {
  const main = st.objectives[0]!;
  st.objectives.forEach((o, i) => evaluate(st, cp, cp.objectives[i]!, o, main, out));
}

/** At level end every objective settles: unbreached guards are done, anything else not done has failed. */
export function settleObjectives(st: State, cp: Compiled, out: SimEvent[]): void {
  st.objectives.forEach((o, i) => {
    if (o.done || o.failed) return;
    const guardKind = cp.content.objectives[cp.objectives[i]!.kind]?.guard ?? false;
    if (guardKind) o.done = true;
    else o.failed = true;
    out.push({ t: "objective", id: o.id, kind: o.kind, done: o.done, failed: o.failed });
  });
}

/** Settled for ending the level: done, failed, or a guard (which settles as done). */
export const objectiveSettled = (cp: Compiled, o: ObjectiveState, i: number): boolean =>
  o.done || o.failed || (cp.content.objectives[cp.objectives[i]!.kind]?.guard ?? false);

/** Stars earned: objectives done (meaningful once the level is over). */
export const starsOf = (st: State): number => st.objectives.filter((o) => o.done).length;

import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, METER_MAX, mulDiv } from "../fixed.js";
import type { ResidentState, State } from "../state.js";
import { inBase } from "./common.js";

/** Frost per mille at which a resident freezes to death. */
export const FROST_MAX = 1000;

/**
 * Reactor-out countdown (REDESIGN-R2 §3). While the core has fuel the lifeline recovers and frost
 * thaws. When it runs dry a countdown starts from the current lifeline (a full lifeline gives the
 * whole `core.grace`); the lifeline is ticksLeft / ticksTotal, so it reaches zero exactly when the
 * countdown ends. Residents in the base freeze one at a time: the coldest one (farthest from the core
 * among equals) is the victim. When a victim is picked its loss is scheduled (`lossAt`, a ticksLeft
 * value) an equal share of the remaining countdown per living resident ahead, and its frost is paced
 * to reach FROST_MAX exactly then, so the losses spread evenly and the last one falls as the
 * countdown ends. The
 * others' frost rises at `freeze.othersRate` of the victim's rate, capped at `freeze.othersCap`.
 */
export function stepFreeze(st: State, cp: Compiled, out: SimEvent[]): void {
  const F = st.freeze, c = st.core;
  if (c.fuel > 0) {
    F.active = false;
    F.lossAt = -1;
    c.lifeline = Math.min(METER_MAX, c.lifeline + cp.core.recoverPerTick);
    F.ticksLeft = mulDiv(c.lifeline, F.ticksTotal, METER_MAX);
    for (const r of st.residents) if (r.frost > 0 && r.status !== "dead") r.frost = Math.max(0, r.frost - cp.freeze.decayPerTick);
  } else {
    if (!F.active) {
      F.active = true;
      F.ticksLeft = mulDiv(c.lifeline, F.ticksTotal, METER_MAX);
    }
    F.ticksLeft = Math.max(0, F.ticksLeft - 1);
    c.lifeline = mulDiv(F.ticksLeft, METER_MAX, F.ticksTotal);
    chill(st, cp, out);
  }
  st.meters.lifeline = c.lifeline;
}

function chill(st: State, cp: Compiled, out: SimEvent[]): void {
  const alive = st.residents.filter(inBase);
  if (alive.length === 0) return;
  // The coldest resident; among equals, the one farthest from the core.
  const far = (r: ResidentState): number => {
    const dx = r.pos.x - st.core.pos.x, dy = r.pos.y - st.core.pos.y;
    return dx * dx + dy * dy;
  };
  let victim: ResidentState = alive[0]!;
  for (const r of alive) if (r.frost > victim.frost || (r.frost === victim.frost && far(r) > far(victim))) victim = r;
  // Each loss is scheduled when its victim is picked: an equal share of the countdown per living resident.
  const F = st.freeze;
  if (F.lossAt < 0) F.lossAt = Math.floor((F.ticksLeft * (alive.length - 1)) / alive.length);
  const left = F.ticksLeft - F.lossAt;
  const need = FROST_MAX - victim.frost;
  // Floor pacing over the ticks left (this one included) lands exactly on lossAt, never before it.
  const rate = left <= 0 ? need : Math.floor(need / (left + 1));
  const others = Math.min(cp.freeze.othersCap, FROST_MAX - 1);
  const otherRate = mulDiv(rate, cp.freeze.othersRate, FP);
  for (const r of alive) {
    if (r === victim) continue;
    if (r.frost < others) r.frost = Math.min(others, r.frost + otherRate);
  }
  victim.frost = Math.min(FROST_MAX, victim.frost + rate);
  if (victim.frost < FROST_MAX) return;
  F.lossAt = -1;
  victim.status = "dead";
  victim.carry = null;
  victim.n = 0;
  victim.mode = "gather";
  victim.target = null;
  out.push({ t: "froze", resident: victim.id, at: { ...victim.pos } });
}

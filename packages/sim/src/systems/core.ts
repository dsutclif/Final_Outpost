import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, mulDiv } from "../fixed.js";
import type { State } from "../state.js";

export function coreFuelCap(st: State, cp: Compiled): number {
  const lv = cp.core.levels[Math.min(st.core.level, cp.core.levels.length) - 1]!;
  return lv.fuelCap;
}

export const hazardActive = (st: State): boolean => st.hazard.phase === "active";

/** Radius inside which the lifeline protects residents. Shrinks when the core is out of fuel and during a hazard. */
export function safeRadius(st: State, cp: Compiled): number {
  const lv = cp.core.levels[Math.min(st.core.level, cp.core.levels.length) - 1]!;
  let r = lv.safeRadius;
  if (hazardActive(st)) r = mulDiv(r, cp.hazard.radiusScale, FP);
  if (st.core.fuel <= 0) r = mulDiv(r, cp.core.noFuelScale, FP);
  return r;
}

/** Burn fuel on a fixed interval (faster under a hazard). The lifeline and frost follow in freeze.ts. */
export function stepCore(st: State, cp: Compiled, out: SimEvent[]): void {
  const c = st.core;
  if (c.dormant) return; // a dark core burns nothing until its first fuel lights it
  // The accumulator counts FP per tick, so a hazard can scale the burn by a ratio exactly.
  c.burnAcc += hazardActive(st) ? cp.hazard.burnMul : FP;
  const threshold = cp.core.burnTicks * FP;
  while (c.burnAcc >= threshold) {
    c.burnAcc -= threshold;
    if (c.fuel > 0) {
      c.fuel--;
      if (c.fuel === 0) out.push({ t: "core_fuel_out" });
    }
  }
}

/** Add fuel for one item of res. Returns false if the core is full or does not accept it. */
export function feedCoreWith(st: State, cp: Compiled, res: string, out: SimEvent[], by?: number): boolean {
  const value = cp.core.accepts[res];
  if (value === undefined) return false;
  const cap = coreFuelCap(st, cp);
  const c = st.core;
  if (c.fuel >= cap) return false;
  const before = c.fuel;
  c.fuel = Math.min(cap, c.fuel + value);
  if (c.dormant) {
    delete c.dormant;
    out.push({ t: "core_lit", at: { ...c.pos } });
  } else if (before === 0 && c.fuel > 0) out.push({ t: "core_fuel_restored" });
  const ev: SimEvent = { t: "deposited", res, to: "sink.core", at: { ...c.pos } };
  if (by !== undefined) ev.by = by;
  out.push(ev);
  return true;
}

import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, METER_MAX, mulDiv } from "../fixed.js";
import type { State } from "../state.js";

export function coreFuelCap(st: State, cp: Compiled): number {
  const lv = cp.core.levels[Math.min(st.core.level, cp.core.levels.length) - 1]!;
  return lv.fuelCap;
}

/** Radius inside which the lifeline protects residents. Shrinks when the core is out of fuel. */
export function safeRadius(st: State, cp: Compiled): number {
  const lv = cp.core.levels[Math.min(st.core.level, cp.core.levels.length) - 1]!;
  let r = lv.safeRadius;
  if (st.core.fuel <= 0) r = mulDiv(r, cp.core.noFuelScale, FP);
  // hazard events scale it again once that module exists
  return r;
}

/** Burn fuel on a fixed interval; the lifeline recovers while fuel lasts and drains to failure without it. */
export function stepCore(st: State, cp: Compiled, out: SimEvent[]): void {
  const c = st.core;
  c.burnAcc++;
  while (c.burnAcc >= cp.core.burnTicks) {
    c.burnAcc -= cp.core.burnTicks;
    if (c.fuel > 0) {
      c.fuel--;
      if (c.fuel === 0) out.push({ t: "core_fuel_out" });
    }
  }
  if (c.fuel > 0) c.lifeline = Math.min(METER_MAX, c.lifeline + cp.core.recoverPerTick);
  else c.lifeline = Math.max(0, c.lifeline - cp.core.drainPerTick);
}

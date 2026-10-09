import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import type { State } from "../state.js";
import { endLevel, population } from "./common.js";
import { wavesDone } from "./defense.js";

export { population };

/** Goal types are a registry: each is a predicate over state. */
const GOALS: Record<string, (st: State, cp: Compiled) => boolean> = {
  build: (st, cp) => cp.manifest.goal.type === "build" && st.built.includes(cp.manifest.goal.target),
  population: (st, cp) => cp.manifest.goal.type === "population" && population(st) >= cp.manifest.goal.n,
  currency: (st, cp) => cp.manifest.goal.type === "currency" && st.currency >= cp.manifest.goal.n,
  waves: (st, cp) => cp.manifest.goal.type === "waves" && wavesDone(st, cp),
  serve_premium: (st, cp) => cp.manifest.goal.type === "serve_premium" && (st.sales?.premiumServed ?? 0) >= cp.manifest.goal.n,
};

/** Fail conditions are meters that can reach zero, plus the optional timer. */
const FAILS: Record<string, (st: State, cp: Compiled) => boolean> = {
  "meter.lifeline": (st) => st.core.lifeline <= 0,
  "meter.base_health": (st) => st.meters.baseHealth <= 0,
};

export function checkEnd(st: State, cp: Compiled, out: SimEvent[]): void {
  for (const f of cp.manifest.fail) {
    if (FAILS[f]?.(st, cp)) { endLevel(st, out, false, f); return; }
  }
  if (cp.timerTicks > 0 && st.tick >= cp.timerTicks) { endLevel(st, out, false, "timer"); return; }
  if (GOALS[cp.manifest.goal.type]?.(st, cp)) endLevel(st, out, true, "goal");
}

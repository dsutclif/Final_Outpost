import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import type { State } from "../state.js";
import { endLevel, population } from "./common.js";
import { collapsedConverter } from "./stock.js";
import { settleObjectives } from "./objectives.js";

export { population };

/**
 * Fail conditions are meters that can reach zero, plus the optional timer. The lifeline also fails
 * once the reactor-out freeze has killed someone and nobody alive is left in the base.
 */
const FAILS: Record<string, (st: State, cp: Compiled) => boolean> = {
  "meter.lifeline": (st) => st.core.lifeline <= 0 || (st.stats.froze > 0 && population(st) === 0),
  "meter.base_health": (st) => st.meters.baseHealth <= 0,
};

/** Fails first, then the timer, then the main goal (objective 0, which mirrors the manifest goal). */
export function checkEnd(st: State, cp: Compiled, out: SimEvent[]): void {
  let ended = false;
  for (const f of cp.manifest.fail) {
    if (FAILS[f]?.(st, cp)) { endLevel(st, out, false, f); ended = true; break; }
  }
  const pile = ended ? null : collapsedConverter(st, cp);
  if (pile !== null) { out.push({ t: "pile_collapsed", conv: pile }); endLevel(st, out, false, "pile_collapse"); ended = true; }
  if (!ended && cp.timerTicks > 0 && st.tick >= cp.timerTicks) { endLevel(st, out, false, "timer"); ended = true; }
  if (!ended && st.objectives[0]?.done) { endLevel(st, out, true, "goal"); ended = true; }
  if (ended) settleObjectives(st, cp, out);
}

import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import type { State } from "../state.js";
import { endLevel, population } from "./common.js";
import { collapsedConverter } from "./stock.js";
import { wavesDone } from "./defense.js";
import { objectiveSettled, settleObjectives } from "./objectives.js";

export { population };

/**
 * Fail conditions are meters that can reach zero, plus the optional timer. The lifeline also fails
 * once the reactor-out freeze has killed someone and nobody alive is left in the base.
 */
const FAILS: Record<string, (st: State, cp: Compiled) => boolean> = {
  "meter.lifeline": (st) => st.core.lifeline <= 0 || (st.stats.froze > 0 && population(st) === 0),
  "meter.base_health": (st) => st.meters.baseHealth <= 0,
};

/**
 * The level ends on its slowest goal: once the main goal (objective 0, which mirrors the manifest goal)
 * is done, it ends when every objective is done or can no longer be done, or when the overtime runs
 * out, and never while attack waves are still to come (Batch 3). Fails, a pile collapse and the timer still end it early: a loss before the main goal, a win
 * after it (the open stars are lost).
 */
export function checkEnd(st: State, cp: Compiled, out: SimEvent[]): void {
  const main = st.objectives[0];
  const won = main?.done ?? false;
  let why = cp.manifest.fail.find((f) => FAILS[f]?.(st, cp)) ?? null;
  if (why === null) {
    const pile = collapsedConverter(st, cp);
    if (pile !== null) { out.push({ t: "pile_collapsed", conv: pile }); why = "pile_collapse"; }
  }
  if (why === null && cp.timerTicks > 0 && st.tick >= cp.timerTicks) why = "timer";
  // Batch 3: a level with attack waves runs until the last one is cleared, so the defence is built and held to the end.
  const wavesLeft = cp.waves.length > 0 && !wavesDone(st, cp);
  if (why === null && won && !wavesLeft && (st.tick - main!.doneTick >= cp.overtimeTicks || st.objectives.every((o, i) => objectiveSettled(cp, o, i)))) why = "goal";
  if (why === null) return;
  endLevel(st, out, won, won ? "goal" : why);
  settleObjectives(st, cp, out);
}

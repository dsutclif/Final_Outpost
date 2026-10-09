import type { Compiled } from "../compile.js";
import type { HintKey, SimEvent } from "../events.js";
import type { State } from "../state.js";

/** Hints repeat only after this many ticks, matching the prototype's 1.5 s hint life. */
const HINT_TICKS = 45;

export function hint(st: State, out: SimEvent[], key: HintKey): void {
  const last = st.lastHint;
  if (last && last.key === key && st.tick - last.tick < HINT_TICKS) return;
  st.lastHint = { key, tick: st.tick };
  out.push({ t: "hint", key });
}

export const countOf = (stack: readonly string[], res: string): number => {
  let n = 0;
  for (const s of stack) if (s === res) n++;
  return n;
};

export function canTake(cp: Compiled, stack: readonly string[], res: string): boolean {
  const cap = cp.resources[res]?.cap;
  if (cap === null || cap === undefined) return false;
  return countOf(stack, res) < cap;
}

/** Remove the most recently picked-up item of this type. Returns false if none. */
export function take(stack: string[], res: string): boolean {
  const i = stack.lastIndexOf(res);
  if (i < 0) return false;
  stack.splice(i, 1);
  return true;
}

export function endLevel(st: State, out: SimEvent[], won: boolean, reason: string): void {
  if (st.over) return;
  st.over = true;
  st.won = won;
  st.reason = reason;
  out.push({ t: "level_end", won, reason });
}

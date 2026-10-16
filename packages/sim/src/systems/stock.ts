import type { Compiled } from "../compile.js";
import type { State } from "../state.js";
import { TPS } from "../fixed.js";

/**
 * Overstock collapse (R3 item 9). A capped stock that sits at its cap for `stock.collapseSeconds`
 * topples and fails the level; dropping below the cap resets its clock. Goods are never lost.
 *
 * Only converter outputs count. A full kiosk shelf is the healthy state (traders buy from it, and
 * "fill the shelves" objectives need it), so shelves are not collapsible stocks.
 *
 * `st.collapse` maps a stock key to the ticks it has sat at cap. It is created lazily, so with the
 * rule off (collapseTicks 0) the state, and therefore every hash, is untouched.
 */
export const converterStockKey = (id: string): string => `conv:${id}`;

export function stepStockCollapse(st: State, cp: Compiled): void {
  if (cp.stock.collapseTicks <= 0) return;
  const held = (st.collapse ??= {});
  for (const cv of st.converters) {
    const key = converterStockKey(cv.id);
    if (cv.out >= cp.converters[cv.type]!.outCap) held[key] = (held[key] ?? 0) + 1;
    else delete held[key];
  }
}

/** Id of the converter whose pile has collapsed, or null. */
export function collapsedConverter(st: State, cp: Compiled): string | null {
  if (cp.stock.collapseTicks <= 0 || !st.collapse) return null;
  for (const cv of st.converters) {
    if ((st.collapse[converterStockKey(cv.id)] ?? 0) >= cp.stock.collapseTicks) return cv.id;
  }
  return null;
}

/** Whole seconds left on a stock's countdown, or null when it is not counting down. */
export function collapseSecondsLeft(st: State, cp: Compiled, key: string): number | null {
  const n = st.collapse?.[key];
  if (n === undefined || cp.stock.collapseTicks <= 0) return null;
  return Math.max(0, Math.ceil((cp.stock.collapseTicks - n) / TPS));
}

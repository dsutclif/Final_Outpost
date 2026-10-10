import { content } from "@fo/content";
import { METER_MAX, TPS, type Compiled, type State } from "@fo/sim";
import type { LevelMeta } from "./levels.js";
import type { Progress } from "./save.js";

// Progression rules, pure so they are unit tested: sequential unlocks, where Play continues,
// star ratings from the win margin and chapter grouping for the level grid.

/** The rating time budget in seconds: manifest `level.budgetSeconds`, else the content default, else 300. */
export function budgetSeconds(cp: Compiled): number {
  const p = cp.manifest.params as Record<string, number | undefined>;
  const d = content.defaults as Record<string, number | undefined>;
  return p["level.budgetSeconds"] ?? d["level.budgetSeconds"] ?? 300;
}

/**
 * How comfortably a level was won, 0..1: time left on a timed level (else time left of the
 * rating budget, level.budgetSeconds, for goals that are not a wave schedule), hull left on a
 * defended one; the smallest that applies. Falls back to the lowest lifeline of the attempt.
 */
export function winMargin(st: State, cp: Compiled, lifelineMin: number): number {
  const parts: number[] = [];
  if (cp.timerTicks > 0) parts.push(Math.max(0, cp.timerTicks - st.tick) / cp.timerTicks);
  else if (cp.manifest.goal.type !== "waves") {
    const budget = Math.round(budgetSeconds(cp) * TPS);
    if (budget > 0) parts.push(Math.max(0, budget - st.tick) / budget);
  }
  const bhMax = st.meters.baseHealthMax ?? 0;
  if (bhMax > 0 && cp.manifest.fail.includes("meter.base_health")) parts.push(Math.max(0, st.meters.baseHealth) / bhMax);
  if (!parts.length) parts.push(Math.max(0, Math.min(1, lifelineMin / METER_MAX)));
  return Math.max(0, Math.min(1, Math.min(...parts)));
}

/** Stars for a win: 3 at half the margin left or more, 2 at a quarter, else 1. */
export function starsFor(margin: number): 1 | 2 | 3 {
  return margin >= 0.5 ? 3 : margin >= 0.25 ? 2 : 1;
}

export const starText = (n: number): string => "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));

/** Level 0 is always open; each later level opens when the one before it is cleared. */
export function isUnlocked(levels: readonly LevelMeta[], meta: LevelMeta, p: Progress, debug = false): boolean {
  if (meta.index === 0 || debug) return true;
  const prev = levels[meta.index - 1];
  return !prev || !!p.cleared[prev.id];
}

/** Where Play continues: the saved current level if unlocked and uncleared, else the first uncleared unlocked one. */
export function nextLevel(levels: readonly LevelMeta[], p: Progress): LevelMeta | undefined {
  const cur = levels.find((l) => l.id === p.current && !p.cleared[l.id] && isUnlocked(levels, l, p));
  return cur ?? levels.find((l) => !p.cleared[l.id] && isUnlocked(levels, l, p)) ?? levels[levels.length - 1];
}

/** Levels in chapters of `size` (the grid draws a header before each). */
export function chapters<T extends { index: number }>(levels: readonly T[], size = 10): { n: number; levels: T[] }[] {
  const out: { n: number; levels: T[] }[] = [];
  for (const l of levels) {
    const n = Math.floor(l.index / size) + 1;
    let c = out[out.length - 1];
    if (!c || c.n !== n) { c = { n, levels: [] }; out.push(c); }
    c.levels.push(l);
  }
  return out;
}

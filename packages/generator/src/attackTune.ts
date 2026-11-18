import type { Content, Manifest } from "@fo/content";
import { wavePoints } from "./build.js";

/** generator.json attackTune (outpost-ops#98, 98.1). */
export type AttackTune = { trigger: number; stopWithin: number; maxSteps: number; gain: number; minScale: number; maxScale: number; maxStepRatio: number };

type Wave = Manifest["waves"][number];

/**
 * Per-level defend tuning (Doug, 2026-11-17): the level keeps its layout and every wave's attackers are scaled by
 * f from the built level's counts. Warlords stay (their number follows the target); every other type scales,
 * a type present keeps at least one. No wave goes over maxPoints (rule 7) or, past the dense-wave cap, over
 * max(its own points, cap); a wave still finishes arriving within spawnMax (its gap tightens, down to minGap).
 */
export function scaleAttack(base: readonly Wave[], f: number, c: Content, lim: { maxPoints: number; cap: number; spawnMax: number; minGap: number }): Wave[] {
  return base.map((w) => {
    const own = wavePoints(w.counts, c);
    const ceil = Math.min(lim.maxPoints, lim.cap > 0 ? Math.max(own, lim.cap) : lim.maxPoints);
    const fixed: Record<string, number> = {}, scaled: Record<string, number> = {};
    for (const [h, n] of (Object.entries(w.counts) as [string, number][])) (c.hostiles[h]?.boss ? fixed : scaled)[h] = n;
    const at = (k: number) => ({ ...fixed, ...Object.fromEntries(Object.entries(scaled).map(([h, n]) => [h, Math.max(1, Math.round(n * k))])) });
    const fits = (k: number) => wavePoints(at(k), c) <= Math.max(ceil, own);
    let counts = at(f);
    // a grown wave over its ceiling grows only as far as it fits (a wave already over it stays as built)
    if (f > 1 && !fits(f)) {
      let lo = 1, hi = f;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      counts = at(lo);
    }
    const out: Wave = { ...w, counts };
    const size = Object.values(counts).reduce((a, n) => a + n, 0);
    if (out.gap !== undefined && size * out.gap > lim.spawnMax) out.gap = Math.max(lim.minGap, Math.floor((lim.spawnMax / size) * 100) / 100);
    return out;
  });
}

export type TuneStep = { scale: number; D: number };
export type TuneResult = { scale: number; D: number; steps: TuneStep[]; tuned: boolean };

/**
 * Secant search on the rating for the attack scale that hits the target. `rate(f)` builds and rates the level at
 * scale f (1 = as built, already rated as d0). Nothing happens within `trigger` of the target. At most maxSteps
 * re-ratings; the first step uses `gain` (scale change per unit of rating miss), later ones the secant through
 * the last two points (back to gain when the slope is flat or the wrong way round). Each step changes the scale
 * by at most maxStepRatio either way and stays within [minScale, maxScale]. Returns the closest point seen.
 */
export function tuneScale(target: number, d0: number, rate: (f: number) => number, t: AttackTune): TuneResult {
  const pts: TuneStep[] = [{ scale: 1, D: d0 }];
  let best = pts[0]!;
  if (Math.abs(d0 - target) <= t.trigger) return { ...best, steps: [], tuned: false };
  for (let k = 0; k < t.maxSteps; k++) {
    const cur = pts[pts.length - 1]!, prev = pts.length > 1 ? pts[pts.length - 2]! : null;
    let next = cur.scale * (1 + t.gain * (target - cur.D));
    if (prev && Math.abs(cur.D - prev.D) > 1e-3) {
      const slope = (cur.D - prev.D) / (cur.scale - prev.scale);
      if (slope > 0) next = cur.scale + (target - cur.D) / slope;
    }
    next = Math.min(cur.scale * t.maxStepRatio, Math.max(cur.scale / t.maxStepRatio, next));
    next = Math.min(t.maxScale, Math.max(t.minScale, next));
    next = Math.round(next * 1000) / 1000;
    if (Math.abs(next - cur.scale) < 1e-3) break;
    const p = { scale: next, D: rate(next) };
    pts.push(p);
    if (Math.abs(p.D - target) < Math.abs(best.D - target)) best = p;
    if (Math.abs(p.D - target) <= t.stopWithin) break;
  }
  return { ...best, steps: pts.slice(1), tuned: true };
}

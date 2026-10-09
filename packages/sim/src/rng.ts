// mulberry32: a small seeded generator with 32-bit state, so its state is one
// integer that hashes and serialises cleanly.

export interface Rng {
  state: number;
}

export const seedRng = (seed: number): Rng => ({ state: seed >>> 0 });

/** Next unsigned 32-bit value. */
export function nextU32(r: Rng): number {
  r.state = (r.state + 0x6d2b79f5) >>> 0;
  let t = r.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Integer in [0, n). n must be positive. */
export const below = (r: Rng, n: number): number => nextU32(r) % n;

/** Integer in [lo, hi) . */
export const between = (r: Rng, lo: number, hi: number): number => lo + below(r, hi - lo);

/** True with probability p, where p is a fixed-point ratio out of `scale`. */
export const chance = (r: Rng, p: number, scale: number): boolean => p > 0 && below(r, scale) < p;

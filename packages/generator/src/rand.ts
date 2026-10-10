import { nextU32, seedRng, type Rng } from "@fo/sim";

// Thin helpers over the sim's mulberry32 so every draw in the generator is seeded and replayable.
// Decimals are fine here: the generator writes manifests (decimal by design), not sim state.

export class Rand {
  private readonly r: Rng;
  constructor(seed: number) { this.r = seedRng(seed >>> 0); }
  /** Uniform in [0, 1). */
  float(): number { return nextU32(this.r) / 4294967296; }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.float(); }
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number { return lo + Math.floor(this.float() * (hi - lo + 1)); }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.float() * xs.length)]!; }
  chance(p: number): boolean { return this.float() < p; }
  /** A child stream keyed by a label, so adding draws in one stage never shifts another. */
  fork(label: string): Rand { return new Rand(mix(nextU32(this.r), hashStr(label))); }
}

export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export const mix = (a: number, b: number): number => (Math.imul(a ^ (b + 0x9e3779b9), 0x85ebca6b) ^ (a >>> 13)) >>> 0;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const round1 = (x: number): number => Math.round(x * 10) / 10;
export const round2 = (x: number): number => Math.round(x * 100) / 100;

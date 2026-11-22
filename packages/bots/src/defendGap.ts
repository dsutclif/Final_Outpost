import type { Content, Manifest } from "@fo/content";
import { DEFEND_FIT, defendInput, predictRho, type DefendFit, type DefendInput, type ModelStrategy } from "./defendModel.js";

// Defend S4 (outpost-ops#273, spec section 3): the breaking volume of each fixed strategy, wave by wave. Pure model code (floats are
// fine: generator and rater side, not the sim). Shared by the generator's placement and the rater's gapPosition/crossings.
//
// V_s(k) = largest multiplier of wave k's attackers that strategy s still holds (base standing) when waves 0..k-1 came at the
// volumes the manifest gives them. A strategy that cannot hold an earlier wave is carried on at `feasible` x its own breaking
// volume there (it is "at its limit"), so every strategy gets a value at every wave. Overlapping waves are checked together:
// the model starts waves by defense.maxLive, so wave k shares the defence with a wave still on the field.

export const GAP_STRATEGIES: readonly ModelStrategy[] = ["turrets_first", "guards_first", "drones_first"];
type Json = Record<string, any>;

/** Attacker hit points of a wave's counts. */
export function countsHp(counts: Record<string, number>, c: Content): number {
  let hp = 0;
  for (const [k, n] of Object.entries(counts)) hp += n * Number((c.hostiles[k] as Json | undefined)?.["hp"] ?? 0);
  return hp;
}

/** Largest multiplier of wave `prior.length` the strategy holds, given the multipliers of the waves before it. Geometric bisection. */
export function waveBreakMult(inp: DefendInput, fit: DefendFit, strategy: ModelStrategy, eta: number, prior: readonly number[], lo = 0.05, hi = 60, iterations = 14): number {
  const k = prior.length;
  const cut: DefendInput = { ...inp, waves: inp.waves.slice(0, k + 1) };
  const holds = (m: number): boolean => !predictRho(cut, fit, 1, { strategy, eta, volumes: [...prior, m] }).lost;
  if (!holds(lo)) return 0;
  if (holds(hi)) return hi;
  let a = lo, b = hi;
  for (let i = 0; i < iterations; i++) { const mid = Math.sqrt(a * b); if (holds(mid)) a = mid; else b = mid; }
  return a;
}

export interface GapOptions { fit?: DefendFit; etas?: Partial<Record<ModelStrategy, number>>; coinRate?: number; feasible?: number; strategies?: readonly ModelStrategy[] }
export interface GapWaveProfile {
  k: number; t: number; hp: number;
  /** Breaking volume in attacker hp per strategy. */
  V: Record<string, number>; vLo: number; vHi: number; best: ModelStrategy;
  /** (hp - V_lo) / (V_hi - V_lo): 0 at the worst strategy's limit, 1 at the best's; < 0 or > 1 outside the gap. null when V_hi = V_lo. */
  position: number | null;
  /** (V_hi - V_lo) / V_hi. */
  ratio: number;
}
export interface GapProfile { waves: GapWaveProfile[]; crossings: number; ratioShare: number }

/** Strategy changes of the best strategy between consecutive waves. */
export function crossingCount(best: readonly string[]): number {
  let n = 0;
  for (let i = 1; i < best.length; i++) if (best[i] !== best[i - 1]) n++;
  return n;
}

/** The gap profile of a manifest as it stands (volumes = its own wave counts). */
export function gapProfile(m: Manifest | Json, c: Content, o: GapOptions = {}): GapProfile {
  const fit = o.fit ?? DEFEND_FIT, feasible = o.feasible ?? 0.9, ss = o.strategies ?? GAP_STRATEGIES;
  const inp = defendInput(modelManifest(m), c, o.coinRate ?? 1.5);
  const waves = ((m as Json)["waves"] ?? []) as Json[];
  const caps: Record<string, number[]> = Object.fromEntries(ss.map((s) => [s, [] as number[]]));
  const out: GapWaveProfile[] = [];
  for (let k = 0; k < waves.length; k++) {
    const hp = countsHp(waves[k]!["counts"], c);
    const V: Record<string, number> = {}, mult: Record<string, number> = {};
    for (const s of ss) {
      mult[s] = waveBreakMult(inp, fit, s, o.etas?.[s] ?? fit.eta, caps[s]!);
      V[s] = mult[s]! * hp;
    }
    for (const s of ss) caps[s]!.push(Math.min(1, feasible * mult[s]!));
    out.push(profileOf(k, Number(waves[k]!["t"]), hp, V, ss));
  }
  return { waves: out, ...summary(out) };
}

export function profileOf(k: number, t: number, hp: number, V: Record<string, number>, ss: readonly ModelStrategy[]): GapWaveProfile {
  const vs = ss.map((s) => V[s]!);
  const vLo = Math.min(...vs), vHi = Math.max(...vs);
  const best = ss[vs.indexOf(vHi)]!;
  return { k, t, hp, V, vLo, vHi, best, position: vHi > vLo ? (hp - vLo) / (vHi - vLo) : null, ratio: vHi > 0 ? (vHi - vLo) / vHi : 0 };
}

export function summary(waves: readonly GapWaveProfile[], minRatio = 0.25): { crossings: number; ratioShare: number } {
  return { crossings: crossingCount(waves.map((w) => w.best)), ratioShare: waves.length ? waves.filter((w) => w.ratio >= minRatio).length / waves.length : 0 };
}

/** The model reads one lane per wave: random-side pools (arrays) collapse to their first side. */
export function modelManifest(m: Manifest | Json): Manifest {
  const c = JSON.parse(JSON.stringify(m)) as Json;
  for (const w of (c["waves"] ?? []) as Json[]) if (Array.isArray(w["side"])) w["side"] = w["side"][0];
  return c as Manifest;
}

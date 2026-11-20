import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { playBot, strategyProfile, STRATEGIES, type BotOptions, type BotProfile, type Strategy } from "@fo/bots";

// Defend redesign S0 (outpost-ops#264, spec section 3): how big a wave volume each fixed strategy can still beat.
// The probe scales every wave's attacker counts by a multiplier m and bisects for the largest m the strategy bot wins.
// `strategyGap` = (max - min breaking multiplier) / max over the strategies; report only (it joins no rating).

type Json = Record<string, any>;

/** A logged candidate was pinned to the engine of its build; probes replay it on the engine at hand (rules are the current ones). */
export function repin<T>(manifest: T): T {
  return { ...(manifest as object), engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION } as T;
}

/** The manifest with every wave's attacker counts times `m` (a kind with attackers keeps at least one). Wave times are untouched. */
export function scaleWaves<T>(manifest: T, m: number): T {
  const c = JSON.parse(JSON.stringify(repin(manifest))) as Json;
  for (const w of (c["waves"] ?? []) as Json[]) {
    const counts = w["counts"] as Record<string, number>;
    for (const k of Object.keys(counts)) if (counts[k]! > 0) counts[k] = Math.max(1, Math.round(counts[k]! * m));
  }
  return c as T;
}

export interface BreakOptions extends BotOptions { seed?: number; lo?: number; hi?: number; iterations?: number }
export interface BreakResult { strategy: string; /** Largest multiplier won (0: lost even at `lo`; `hi`: never broke). */ multiplier: number; runs: number; wins: [number, boolean][] }

/** Bisect the breaking multiplier for one profile. Deterministic: same manifest, profile and seed give the same answer. */
export function breakingMultiplier(manifest: unknown, profile: BotProfile, opts: BreakOptions = {}): BreakResult {
  const seed = opts.seed ?? 1, iterations = opts.iterations ?? 6;
  let lo = opts.lo ?? 0.25, hi = opts.hi ?? 6;
  const wins: [number, boolean][] = [];
  const won = (m: number): boolean => {
    const r = playBot(scaleWaves(manifest, m), profile, seed, opts);
    // held = the base stood: won, or the clock ran out first (a strategy that buys no goal tower is slow, not broken)
    const held = r.won || r.reason === "budget";
    wins.push([m, held]);
    return held;
  };
  if (!won(lo)) return { strategy: profile.strategy ?? profile.name, multiplier: 0, runs: wins.length, wins };
  if (won(hi)) return { strategy: profile.strategy ?? profile.name, multiplier: hi, runs: wins.length, wins };
  // geometric bisection: volumes act multiplicatively
  for (let i = 0; i < iterations; i++) {
    const mid = Math.sqrt(lo * hi);
    if (won(mid)) lo = mid; else hi = mid;
  }
  return { strategy: profile.strategy ?? profile.name, multiplier: lo, runs: wins.length, wins };
}

export interface StrategyGap { gap: number; multipliers: Record<string, number>; best: string; worst: string; runs: number }

/** (max - min) / max of the strategies' breaking multipliers. 0 when every strategy breaks at the same volume. */
export function strategyGap(manifest: unknown, opts: BreakOptions = {}, strategies: readonly Strategy[] = STRATEGIES): StrategyGap {
  const rs = strategies.map((s) => breakingMultiplier(manifest, strategyProfile(s), opts));
  const ms = rs.map((r) => r.multiplier), max = Math.max(...ms), min = Math.min(...ms);
  return {
    gap: max > 0 ? (max - min) / max : 0,
    multipliers: Object.fromEntries(rs.map((r) => [r.strategy, r.multiplier])),
    best: rs[ms.indexOf(max)]!.strategy, worst: rs[ms.indexOf(min)]!.strategy, runs: rs.reduce((a, r) => a + r.runs, 0),
  };
}

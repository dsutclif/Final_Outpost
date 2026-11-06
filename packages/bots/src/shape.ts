import { FP, TPS, type SimEvent, type State } from "@fo/sim";

// The shape of one play-through: how much the player stood still, walked, repeated and waited for a
// reward. One definition for real players (client telemetry) and bots (review pulse), so the two can
// be compared and the boredom limits tuned against 👍/👎. Definitions: docs/review/CONTRACT.md §2.

export interface PlayShape {
  durS: number;
  /** Seconds (30-tick windows) in which the player moved less than STILL_UNITS. */
  stillS: number;
  longestStillS: number;
  /** Units walked. */
  distU: number;
  /** Player-caused events by type. */
  acts: Record<string, number>;
  /** Seconds from level start to the first reward (the whole level when none came). */
  firstRewardS: number;
  /** Longest stretch without a reward, level start and level end included. */
  rewardGapMaxS: number;
  /** Longest run of identical player deliveries (same resource, same sink) with no milestone in between. */
  sameRunMax: number;
}

export interface ShapeAcc {
  tick: number;
  last: { x: number; y: number } | null;
  dist: number;
  windowStart: { x: number; y: number } | null;
  windowTicks: number;
  stillS: number;
  stillRun: number;
  longestStill: number;
  acts: Record<string, number>;
  lastReward: number;
  firstReward: number | null;
  rewardGapMax: number;
  runKey: string | null;
  run: number;
  runMax: number;
}

export const STILL_UNITS = 0.25;
const COUNTED = new Set(["gathered", "deposited", "collected", "pad_paid", "built", "captured", "released", "crate_delivered", "picked", "barrier_built", "died"]);
const REWARDS = new Set(["sold", "collected", "built", "unlocked", "core_upgraded", "released", "joined", "crate_delivered", "zone_cleared", "wave_cleared"]);
const MILESTONES = new Set(["built", "unlocked", "released", "joined", "captured", "wave_started", "hazard_start", "zone_cleared", "objective"]);

export function createShape(): ShapeAcc {
  return { tick: 0, last: null, dist: 0, windowStart: null, windowTicks: 0, stillS: 0, stillRun: 0, longestStill: 0, acts: {}, lastReward: 0, firstReward: null, rewardGapMax: 0, runKey: null, run: 0, runMax: 0 };
}

/** Events carry `by` when someone other than the player caused them; a kill names its killer. */
const byPlayer = (e: SimEvent): boolean => (e.t === "died" ? e.by === "player" : !("by" in e) || e.by === undefined);

export function shapeTick(acc: ShapeAcc, state: State, events: readonly SimEvent[]): void {
  acc.tick++;
  const p = state.player.pos;
  if (acc.last) acc.dist += Math.hypot(p.x - acc.last.x, p.y - acc.last.y) / FP;
  acc.last = { x: p.x, y: p.y };
  if (!acc.windowStart) acc.windowStart = { x: p.x, y: p.y };
  if (++acc.windowTicks >= TPS) {
    const moved = Math.hypot(p.x - acc.windowStart.x, p.y - acc.windowStart.y) / FP;
    if (moved < STILL_UNITS) { acc.stillS++; acc.stillRun++; if (acc.stillRun > acc.longestStill) acc.longestStill = acc.stillRun; }
    else acc.stillRun = 0;
    acc.windowStart = { x: p.x, y: p.y };
    acc.windowTicks = 0;
  }
  for (const e of events) {
    const mine = byPlayer(e);
    if (mine && COUNTED.has(e.t)) acc.acts[e.t] = (acc.acts[e.t] ?? 0) + 1;
    if (REWARDS.has(e.t) || (e.t === "objective" && e.done)) {
      acc.rewardGapMax = Math.max(acc.rewardGapMax, acc.tick - acc.lastReward);
      acc.lastReward = acc.tick;
      if (acc.firstReward === null) acc.firstReward = acc.tick;
    }
    if (MILESTONES.has(e.t)) { acc.runKey = null; acc.run = 0; }
    else if (e.t === "deposited" && mine) {
      const key = `${e.res}>${e.to}`;
      acc.run = key === acc.runKey ? acc.run + 1 : 1;
      acc.runKey = key;
      if (acc.run > acc.runMax) acc.runMax = acc.run;
    }
  }
}

const sec = (t: number): number => Math.round((t / TPS) * 10) / 10;

export function shapeResult(acc: ShapeAcc): PlayShape {
  return {
    durS: sec(acc.tick),
    stillS: acc.stillS,
    longestStillS: acc.longestStill,
    distU: Math.round(acc.dist * 10) / 10,
    acts: { ...acc.acts },
    firstRewardS: sec(acc.firstReward ?? acc.tick),
    rewardGapMaxS: sec(Math.max(acc.rewardGapMax, acc.tick - acc.lastReward)),
    sameRunMax: acc.runMax,
  };
}

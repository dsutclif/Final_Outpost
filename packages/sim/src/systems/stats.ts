import type { Compiled } from "../compile.js";
import { ACTION_EVENTS, REWARD_EVENTS, type SimEvent } from "../events.js";
import { FP, METER_MAX, TPS, mulDiv, within } from "../fixed.js";
import type { State } from "../state.js";
import { coreFuelCap } from "./core.js";
import { converterRunnable, operated } from "./converters.js";

/** How many recent reward ticks `stats.rewardTicks` keeps. */
export const REWARD_RING = 64;
/** Upper edges (seconds) of the reward-gap histogram buckets; the last bucket is open-ended. */
export const REWARD_GAP_EDGES: readonly number[] = [1, 2, 4, 8, 15, 30, 60];

/** Cheap counters the rater and bots read; updated from this tick's events and state. */
export function stepStats(st: State, cp: Compiled, out: readonly SimEvent[]): void {
  const s = st.stats;
  let acted = false, reward = false;
  for (const e of out) {
    switch (e.t) {
      case "sold": s.sold++; break;
      case "built": s.built++; break;
      case "released": s.rescued++; break;
      case "injured": s.injured++; break;
      case "barrier_broken": s.barriersLost++; break;
      default: break;
    }
    if (ACTION_EVENTS.has(e.t)) acted = true;
    if (REWARD_EVENTS.has(e.t)) reward = true;
  }
  if (reward) recordReward(st);
  if (!st.player.moving && !acted) s.idleTicks++;
  if (st.core.lifeline < mulDiv(METER_MAX, cp.stats.lifelineLow, FP)) s.lifelineLowTicks++;
  if (demands(st, cp) >= 2) s.concurrentDemandTicks++;
}

/** Bounded reward bookkeeping: a ring of recent ticks plus count, last tick, longest gap and a gap histogram. */
function recordReward(st: State): void {
  const s = st.stats;
  if (s.rewardCount === undefined) {
    s.rewardCount = 0;
    s.rewardLastTick = 0;
    s.rewardGapMax = 0;
    s.rewardGapHist = new Array<number>(REWARD_GAP_EDGES.length + 1).fill(0);
  }
  const gap = st.tick - s.rewardLastTick!;
  s.rewardCount++;
  s.rewardLastTick = st.tick;
  if (gap > s.rewardGapMax!) s.rewardGapMax = gap;
  let b = 0;
  while (b < REWARD_GAP_EDGES.length && gap >= REWARD_GAP_EDGES[b]! * TPS) b++;
  s.rewardGapHist![b]!++;
  s.rewardTicks.push(st.tick);
  if (s.rewardTicks.length > REWARD_RING) s.rewardTicks.shift();
}

/** Stations that need the player right now: a low core, a servable customer at an unstaffed register, an unoperated converter with inputs. */
function demands(st: State, cp: Compiled): number {
  let n = 0;
  if (st.core.fuel * FP < coreFuelCap(st, cp) * cp.stats.coreLowFill) n++;
  const sales = st.sales;
  if (sales) {
    const servable = sales.queue.some((q) => (sales.shelf[q.res] ?? 0) >= q.want);
    const staffed = within(st.player.pos, sales.register, cp.sales.registerRange)
      || st.residents.some((r) => r.status === "ok" && cp.roles[r.role]?.behavior === "stand_at" && r.assign.to === "sink.sales_point" && within(r.pos, sales.register, cp.sales.cashierRange));
    if (servable && !staffed) n++;
  }
  for (const cv of st.converters) if (converterRunnable(cp, cv) && !operated(st, cp, cv)) { n++; break; }
  return n;
}

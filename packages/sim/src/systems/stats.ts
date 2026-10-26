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
      case "sold":
        s.sold++;
        s.earned += e.pay;
        s.soldUnits[e.res] = (s.soldUnits[e.res] ?? 0) + e.n;
        s.streak++;
        if (s.streak > s.streakMax) s.streakMax = s.streak;
        if (e.kind === "unit.customer_bulk") s.bulkServed++;
        // A sale the player rang up at the register is not hands-off.
        if (st.sales && within(st.player.pos, st.sales.register, cp.sales.registerRange)) handWork(st);
        else s.salesSinceDeposit++;
        break;
      case "customer_arrived": s.customersSpawned++; break;
      case "customer_left": if (e.angry) { s.customersAngry++; s.streak = 0; } break;
      case "built": s.built++; break;
      case "released": s.rescued++; break;
      case "injured": s.injured++; break;
      case "hit": if (e.by === "animal") s.animalHits++; break;
      case "barrier_broken": s.barriersLost++; break;
      case "core_fuel_out": s.fuelOuts++; break;
      case "froze": s.froze++; break;
      case "unlocked": s.unlocked++; break;
      case "hired": s.hired++; s.hiredBy[e.role] = (s.hiredBy[e.role] ?? 0) + 1; break;
      case "downed": s.downs++; break;
      case "converted": {
        s.converted++;
        s.convertedBy[e.res] = (s.convertedBy[e.res] ?? 0) + 1;
        const cv = st.converters.find((c) => c.id === e.conv);
        if (cv && cp.converters[cv.type]!.tier >= 2) s.tier2Made++;
        if (cv && within(st.player.pos, cv.operatorPos, cp.convParams.playerOperateRange)) handWork(st);
        break;
      }
      case "deposited": {
        if (e.by === undefined) handWork(st);
        else if (cp.roles[st.residents.find((r) => r.id === e.by)?.role ?? ""]?.behavior === "haul") s.hauled++;
        if (cp.proteinRes.includes(e.res)) s.protein++;
        break;
      }
      case "died":
        if (cp.hostiles[e.kind]) {
          s.kills++;
          if (cp.hostiles[e.kind]!.boss) s.bossKills++;
          if (e.by) { const k = (s.killsBy ??= {}); k[e.by] = (k[e.by] ?? 0) + 1; }
        } else if (cp.animals[e.kind]) s.preyKilled++;
        break;
      case "picked": if (e.res === "res.salvage") s.salvage++; break;
      case "crate_delivered": s.crates++; break;
      case "pod_lost": s.podsLost++; break;
      case "wave_cleared": s.wavesCleared++; break;
      case "recruit_arrived": s.admitted++; break;
      case "zone_cleared": s.zonesCleared++; break;
      case "hazard_end": s.hazardsSurvived++; break;
      case "core_lit": s.litTick = st.tick; break;
      case "joined": s.joined = (s.joined ?? 0) + 1; break;
      case "decoy_opened": s.decoysOpened = (s.decoysOpened ?? 0) + 1; break;
      case "retreated":
        // A boss that breaks off is beaten as far as goals go.
        s.kills++;
        if (cp.hostiles[e.kind]?.boss) s.bossKills++;
        s.retreats = (s.retreats ?? 0) + 1;
        break;
      default: break;
    }
    if (ACTION_EVENTS.has(e.t)) acted = true;
    if (REWARD_EVENTS.has(e.t)) reward = true;
  }
  if (reward) recordReward(st);
  if (!st.player.moving && !acted) s.idleTicks++;
  if (st.core.lifeline < mulDiv(METER_MAX, cp.stats.lifelineLow, FP)) s.lifelineLowTicks++;
  const heat = mulDiv(st.core.fuel, 1000, coreFuelCap(st, cp));
  if (heat < s.heatMin && !st.core.dormant) s.heatMin = heat;
  if (demands(st, cp) >= 2) s.concurrentDemandTicks++;
}

/** The player kept the base running by hand this tick, which restarts the hands-off clock. */
function handWork(st: State): void {
  st.stats.lastPlayerDeposit = st.tick;
  st.stats.salesSinceDeposit = 0;
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
  if (!st.core.dormant && st.core.fuel * FP < coreFuelCap(st, cp) * cp.stats.coreLowFill) n++;
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

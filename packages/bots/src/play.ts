import { content as defaultContent, type Content } from "@fo/content";
import { FP, METER_MAX, REWARD_EVENTS, TPS, createSim, population, seedRng, type Input, type SimEvent, type State, type Vec } from "@fo/sim";
import { Brain } from "./brain.js";
import { planBot, type Plan } from "./plan.js";
import { withLearning, type BotProfile } from "./profiles.js";

/** Time budget for goals without a level timer. Override with opts.timeBudgetSeconds. */
export const DEFAULT_TIME_BUDGET_SECONDS = 300;
/** Extra play time after the last wave before a waves level counts as stuck. */
export const WAVES_TAIL_SECONDS = 120;
/** No progress for this long is a stall (spec: 30 s). */
export const STALL_SECONDS = 30;

export interface BotOptions {
  content?: Content;
  /** Previous attempts at this level; shrinks the profile's noise by its learn term. */
  attempt?: number;
  /** Time budget in seconds for build/population/currency goals without a timer. */
  timeBudgetSeconds?: number;
  /** Hard cap on ticks (defaults from the timer, the budget or the wave schedule). */
  maxTicks?: number;
  /** Keep the input log in the result (for replays). */
  recordInputs?: boolean;
  /** Reuse a plan computed earlier for the same manifest. */
  plan?: Plan;
  /** Debug hook called after every tick. */
  onTick?: (st: State, brain: Brain, events: SimEvent[]) => void;
}

export interface StallState {
  tick: number;
  pos: Vec;
  stack: string[];
  task: string;
  planStep: string | null;
  currency: number;
  fuel: number;
  nearby: string[];
}

export interface BotTrace {
  /** Lowest core fuel as a fraction of capacity. */
  lifelineMin: number;
  /** Ticks with core fuel under 25% of capacity. */
  lifelineLowTicks: number;
  /** Share of ticks with two or more stations needing the player. */
  concurrentDemand: number;
  /** Share of busy ticks spent walking rather than acting. */
  routeShare: number;
  baseHpLost: number;
  barriersBroken: number;
  injuries: number;
  /** Currency cost of the plan's pads and barrier sections. */
  currencyNeeded: number;
  /** Currency paid by customers. */
  currencyEarned: number;
  /** Gaps between recent reward events, seconds (from the stats ring). */
  rewardGaps: number[];
  /** Longest gap between rewards, including the tail to the end, seconds. */
  rewardGapMax: number;
  /** Median reward gap in seconds, from the stats histogram (bucket upper edge). */
  rewardGapMedian: number;
  rewardCount: number;
  /** Ticks the controller had nothing useful to do. */
  deadTicks: number;
  modulesUsed: string[];
  /** Goal progress fraction sampled every second (for late-uncertainty and tension). */
  progress: number[];
  /** Threat signal sampled every second: fuel shortfall, queue pressure, attack load (0..1). */
  threat: number[];
  /** Seconds of warning before the failure condition triggered (loss only; -1 otherwise). */
  warningLead: number;
}

export interface BotResult {
  profile: string;
  seed: number;
  won: boolean;
  reason: string;
  ticks: number;
  margin: number;
  stalls: number;
  stallStates: StallState[];
  trace: BotTrace;
  hash: string;
  inputs?: Input[];
}

const PROGRESS_EVENTS: ReadonlySet<SimEvent["t"]> = new Set<SimEvent["t"]>([
  "pad_paid", "built", "hired", "unlocked", "core_upgraded", "zone_cleared", "captured", "released", "recruit_arrived",
  "moved_in", "barrier_progress", "barrier_built", "wave_cleared", "died",
]);

/** Play a manifest headless with one profile and one in-level seed. Deterministic. */
export function playBot(manifest: unknown, profileIn: BotProfile, seed: number, opts: BotOptions = {}): BotResult {
  const content = opts.content ?? defaultContent;
  const raw = manifest as { params?: Record<string, number> };
  // The budget param is read leniently: manifests cannot carry it (no content default), callers can.
  const budgetS = opts.timeBudgetSeconds ?? raw.params?.["bot.timeBudgetSeconds"] ?? DEFAULT_TIME_BUDGET_SECONDS;
  const cleanParams = { ...(raw.params ?? {}) };
  delete cleanParams["bot.timeBudgetSeconds"];
  const sim = createSim({ ...(manifest as object), params: cleanParams, seed }, { content });
  const cp = sim.compiled, st = sim.state;
  const plan = opts.plan ?? planBot({ ...(manifest as object), params: cleanParams }, content);
  const profile = withLearning(profileIn, opts.attempt ?? 0);
  const rng = seedRng((seed * 2654435761 + hashName(profile.name)) >>> 0);
  const brain = new Brain(cp, plan, profile, rng);

  const goal = cp.manifest.goal;
  const lastWave = cp.waves.length > 0 ? cp.waves[cp.waves.length - 1]!.tick : 0;
  const budgetTicks = cp.timerTicks > 0 ? cp.timerTicks : Math.round(budgetS * TPS);
  const maxTicks = opts.maxTicks ?? (goal.type === "waves" ? lastWave + WAVES_TAIL_SECONDS * TPS : budgetTicks);

  const inputs: Input[] = [];
  const stallStates: StallState[] = [];
  let lastProgress = 0, stalls = 0;
  let fuelMin = 1, fuelLow = 0, moveOnly = 0, acting = 0, dead = 0, earned = 0;
  const used = new Set<string>();
  const progressS: number[] = [], threatS: number[] = [];
  let warnStart = -1;
  let integSum = 0, integN = 0;

  while (!st.over && st.tick < maxTicks) {
    const inp = brain.tick(st);
    if (opts.recordInputs) inputs.push(inp);
    const fuelBefore = st.core.fuel;
    const currencyBefore = st.currency;
    const ev = sim.step(inp);
    let progressed = false, acted = false;
    const needCur = brain.currencyNeedNext(st);
    for (const e of ev) {
      if (PROGRESS_EVENTS.has(e.t)) progressed = true;
      if (REWARD_EVENTS.has(e.t) && e.t !== "sold") progressed = true;
      if (e.t === "sold") {
        earned += e.pay;
        if (currencyReachable(st, needCur, earned, budgetTicks)) progressed = true;
      }
      if (e.t === "collected" && currencyReachable(st, needCur, earned, budgetTicks)) progressed = true;
      if (e.t === "deposited" && e.to === "sink.core" && e.by === undefined && fuelBefore * 2 < coreCap(st, cp)) progressed = true;
      if (e.t === "hired") brain.hiresByPad[e.pad] = (brain.hiresByPad[e.pad] ?? 0) + 1;
      if ((e.t === "gathered" || e.t === "deposited" || e.t === "collected" || e.t === "picked" || e.t === "pad_paid" || e.t === "barrier_progress") && !("by" in e && e.by !== undefined)) acted = true;
      noteModule(used, e, cp.upgrades);
    }
    void currencyBefore;
    opts.onTick?.(st, brain, ev);
    // On a waves goal the schedule itself advances the goal while waves are still to come.
    if (goal.type === "waves" && st.waves.idx < cp.waves.length) progressed = true;
    if (progressed) lastProgress = st.tick;
    else if (st.tick - lastProgress >= STALL_SECONDS * TPS) {
      stalls++;
      stallStates.push(snapshotStall(st, brain));
      lastProgress = st.tick;
    }
    const cap = coreCap(st, cp);
    const f = st.core.fuel / cap;
    if (f < fuelMin) fuelMin = f;
    if (f < 0.25) fuelLow++;
    if (acted) acting++; else if (st.player.moving) moveOnly++;
    if (brain.isIdle) dead++;
    if (st.core.fuel === 0 || st.meters.baseHealth * 3 < st.meters.baseHealthMax) { if (warnStart < 0) warnStart = st.tick; }
    else warnStart = -1;
    if (st.tick % TPS === 0 && st.waves.idx > 0) {
      let have = 0, max = 0;
      for (const l of st.barriers) for (const sec of l.sections) { max += sec.hpMax; if (sec.built) have += sec.hp; }
      if (max > 0) { integSum += have / max; integN++; }
    }
    if (st.tick % TPS === 0) {
      progressS.push(goalProgress(st, cp, plan, brain));
      threatS.push(threatSignal(st, cp));
    }
  }

  const won = st.won === true;
  const reason = st.over ? st.reason ?? "unknown" : "time_budget";
  const ticks = st.tick;
  let margin: number;
  if (goal.type === "waves") {
    const hp = st.meters.baseHealth / Math.max(1, st.meters.baseHealthMax);
    // Barrier integrity averaged over every second since the first wave: quick fights and rebuilds count.
    const integrity = integN > 0 ? integSum / integN : hp;
    margin = won ? (hp + integrity) / 2 : -(1 - goalProgress(st, cp, plan, brain));
  } else {
    margin = won ? (budgetTicks - ticks) / budgetTicks : -(1 - goalProgress(st, cp, plan, brain));
  }

  const s = st.stats;
  const ring = s.rewardTicks;
  const gaps: number[] = [];
  const count = s.rewardCount ?? 0;
  for (let i = 0; i < ring.length; i++) {
    const prev = i === 0 ? (count <= ring.length ? 0 : -1) : ring[i - 1]!;
    if (prev >= 0) gaps.push((ring[i]! - prev) / TPS);
  }
  const tail = ticks - (s.rewardLastTick ?? 0);
  const trace: BotTrace = {
    lifelineMin: fuelMin,
    lifelineLowTicks: fuelLow,
    concurrentDemand: s.concurrentDemandTicks / Math.max(1, ticks),
    routeShare: moveOnly / Math.max(1, moveOnly + acting),
    baseHpLost: st.meters.baseHealthMax - st.meters.baseHealth,
    barriersBroken: s.barriersLost,
    injuries: s.injured,
    currencyNeeded: plan.currencyNeeded,
    currencyEarned: earned,
    rewardGaps: gaps,
    rewardGapMax: Math.max(s.rewardGapMax ?? 0, tail) / TPS,
    rewardGapMedian: histMedian(s.rewardGapHist, count, ticks),
    rewardCount: count,
    deadTicks: dead,
    modulesUsed: cp.manifest.modules.filter((m) => used.has(m)),
    progress: progressS,
    threat: threatS,
    warningLead: !won && warnStart >= 0 ? (ticks - warnStart) / TPS : -1,
  };
  const res: BotResult = {
    profile: profile.name, seed, won, reason, ticks, margin, stalls, stallStates, trace, hash: sim.hash(),
  };
  if (opts.recordInputs) res.inputs = inputs;
  return res;
}

const REWARD_GAP_EDGES = [1, 2, 4, 8, 15, 30, 60];

function histMedian(hist: number[] | undefined, count: number, ticks: number): number {
  if (!hist || count === 0) return ticks / TPS;
  let acc = 0;
  for (let b = 0; b < hist.length; b++) {
    acc += hist[b]!;
    if (acc * 2 >= count) return REWARD_GAP_EDGES[b] ?? 120;
  }
  return 120;
}

function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const coreCap = (st: State, cp: { core: { levels: { fuelCap: number }[] } }): number =>
  cp.core.levels[Math.min(st.core.level, cp.core.levels.length) - 1]!.fuelCap;

/** Sales count as progress only while the next currency need is reachable at the income seen so far. */
function currencyReachable(st: State, need: number, earned: number, budgetTicks: number): boolean {
  if (need <= st.currency) return false;
  const rate = earned / Math.max(TPS * 10, st.tick);
  const left = Math.max(0, budgetTicks - st.tick);
  return need - st.currency <= rate * left * 1.5 + 1;
}

function snapshotStall(st: State, brain: Brain): StallState {
  const p = st.player.pos;
  const R = 120 * FP;
  const near = (q: Vec) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < R * R;
  const nearby: string[] = [];
  for (const pad of st.pads) if (near(pad.pos)) nearby.push(`${pad.id}${pad.done ? ":done" : pad.locked ? ":locked" : pad.visible ? "" : ":hidden"}`);
  for (const n of st.nodes) if (near(n.pos)) nearby.push(`${n.type}${n.id ? "#" + n.id : ""}${n.enabled ? "" : ":disabled"}`);
  for (const c of st.captures) if (near(c.pos)) nearby.push(`${c.type}:${c.state}`);
  for (const h of st.hostiles) if (near(h.pos)) nearby.push(h.type);
  if (st.sales && near(st.sales.pos)) nearby.push("sink.sales_point");
  if (near(st.core.pos)) nearby.push("sink.core");
  const nx = brain.nextStep(st);
  return {
    tick: st.tick, pos: { ...p }, stack: [...st.player.stack], task: brain.current.kind,
    planStep: nx ? nx.step.pad : null, currency: st.currency, fuel: st.core.fuel, nearby,
  };
}

function noteModule(used: Set<string>, e: SimEvent, upgrades: Record<string, unknown>): void {
  switch (e.t) {
    case "gathered": used.add("gather"); used.add("carry"); if (e.by !== undefined) used.add("workers"); break;
    case "deposited": if (e.to === "sink.core") used.add("core"); if (e.by !== undefined) used.add("workers"); break;
    case "sold": used.add("sales"); if (e.premium) used.add("customer_variety"); break;
    case "customer_left": break;
    case "hired": used.add("workers"); used.add("build_pads"); if (e.role === "role.defender") used.add("defenders"); if (e.role === "role.hauler") used.add("supply_routing"); break;
    case "built": used.add("build_pads"); if (upgrades[e.build]) used.add("salvage_upgrades"); if (e.build === "struct.housing") used.add("housing"); if (e.build === "struct.depot") used.add("supply_routing"); if (e.build.startsWith("conv.")) used.add("converters"); break;
    case "unlocked": used.add("source_gating"); break;
    case "core_upgraded": used.add("core_levels"); break;
    case "zone_cleared": used.add("blocked_zones"); break;
    case "released": used.add("lasso"); break;
    case "moved_in": case "recruit_arrived": used.add("housing"); break;
    case "barrier_built": used.add("barrier_lines"); break;
    case "captured": used.add("lasso"); used.add("barrier_lines"); break; // the tow line only engages outside a line
    case "wave_started": case "wave_cleared": used.add("defense"); break;
    case "died": if (e.kind.startsWith("node.")) used.add("hunting"); break;
    case "converted": used.add("converters"); break;
    case "healed": used.add("medical"); break;
    case "hazard_start": used.add("hazard_events"); break;
    case "customer_arrived": if (e.kind !== "unit.customer") used.add("customer_variety"); break;
    default: break;
  }
}

/** Goal progress in [0, 1]. Build goals count paid cost along the goal path. */
export function goalProgress(st: State, cp: ReturnType<typeof createSim>["compiled"], plan: Plan, brain?: Brain): number {
  const g = cp.manifest.goal;
  switch (g.type) {
    case "build": {
      let paid = 0, total = 0;
      for (const s of plan.steps) {
        if (!s.goalPath) continue;
        const pad = st.pads.find((p) => p.id === s.pad);
        for (const [r, n] of Object.entries(s.cost)) { total += n; paid += pad ? (pad.done ? n : Math.min(n, pad.paid[r] ?? 0)) : 0; }
      }
      return st.built.includes(g.target) ? 1 : total > 0 ? Math.min(0.99, paid / total) : 0;
    }
    case "population": return Math.min(1, population(st) / g.n);
    case "currency": return Math.min(1, st.currency / g.n);
    case "serve_premium": return Math.min(1, (st.sales?.premiumServed ?? 0) / g.n);
    case "waves": {
      const n = cp.waves.length;
      if (n === 0) return 1;
      const done = st.waves.idx - (st.waves.active ? 1 : 0);
      return Math.min(1, Math.max(0, done) / n);
    }
  }
  void brain;
  return 0;
}

/** 0..1 threat: the worst of fuel shortfall, queue pressure and attack load. */
function threatSignal(st: State, cp: ReturnType<typeof createSim>["compiled"]): number {
  const cap = coreCap(st, cp);
  const fuel = Math.max(0, 1 - (st.core.fuel / cap) / 0.5);
  const life = 1 - st.core.lifeline / METER_MAX;
  const queue = st.sales ? st.sales.queue.length / Math.max(1, cp.sales.queueMax) * 0.6 : 0;
  const attack = Math.min(1, st.hostiles.length / 6);
  return Math.max(fuel, life, queue, attack);
}

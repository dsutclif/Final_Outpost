import { content as defaultContent, type Content } from "@fo/content";
import { FP, METER_MAX, REWARD_EVENTS, REWARD_GAP_EDGES, TPS, attackedSide, createSim, guardPost, seedRng, starsOf, type Compiled, type Input, type SimEvent, type State, type Vec } from "@fo/sim";
import { Brain } from "./brain.js";
import { TIME_FIXED_GOALS, planBot, type Plan } from "./plan.js";
import { withLearning, type BotProfile } from "./profiles.js";
import { Perception, viewFor } from "./view.js";

/** Content default of `level.budgetSeconds`, kept as a named export for callers. */
export const DEFAULT_TIME_BUDGET_SECONDS: number = defaultContent.defaults["level.budgetSeconds"] ?? 300;
/** Extra play time after the last wave before a waves level counts as stuck. */
export const WAVES_TAIL_SECONDS = 120;
/** No progress for this long is a stall (spec: 30 s). */
export const STALL_SECONDS = 30;

export interface BotOptions {
  content?: Content;
  /** Previous attempts at this level; shrinks the profile's noise by its learn term. */
  attempt?: number;
  /** Overrides the manifest's `level.budgetSeconds` (build/population/currency goals without a timer). */
  timeBudgetSeconds?: number;
  /** Hard cap on ticks (defaults from the timer, the budget or the wave schedule). */
  maxTicks?: number;
  /** Keep the input log in the result (for replays). */
  recordInputs?: boolean;
  /** Reuse a plan computed earlier for the same manifest. */
  plan?: Plan;
  /** From this tick on the player gives no input (stands still): the generator's no-help storm check. */
  idleFrom?: number;
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
  /** Share of hostile kills the player landed (-1: no kills). Batch 3: the player keeps shooting beside the defence. */
  playerKillShare: number;
  /** Salvage price of the turret ladder (towers and their levels) still unbought at the end (-1: no ladder). */
  ladderLeft: number;
  /** Goods the player took back out of the warehouse. */
  depotPicks: number;
  /** Story mechanics: ticks until a dark core was lit (-1: none was dark or it never lit), crew who joined, empty pods opened, bosses that broke off. */
  story: { litTicks: number; joined: number; decoys: number; retreats: number };
  /** Share of guard-seconds under attack spent within reach of a post on the attacked side (-1: never tested). */
  rallyShare: number;
  injuries: number;
  /** Bites taken from dangerous animals. */
  animalHits: number;
  /** Times those bites knocked the player down (whole pack spilled). */
  downs: number;
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
  /** Longest unbroken stretch, in seconds, that any converter output sat at its cap (collapse metric). */
  capHoldMax: number;
  /**
   * Longest run of identical player trips in a row (REDESIGN-R3 item 7). A trip is one get phase
   * (gather / pick up / collect cash) followed by one put phase (deposit, pay a pad, build a barrier);
   * two trips are identical when they carry the same (source type, resource, target) set.
   */
  loopMax: number;
  /** The repeated trip behind `loopMax` ("src>res>target + ...", "" when the player made no trips). */
  loopKey: string;
}

/** Tracks the player's get/put cycles and the longest run of identical ones. */
const LOOP_MERGE_TICKS = 3 * TPS;
class LoopTracker {
  private phase: "get" | "put" = "get";
  private src: Record<string, string> = {};
  private cycle = new Set<string>();
  private lastKey = "";
  private run = 0;
  /** Last source a worker took each resource from, and the trips workers have completed. A trip a
   *  worker already performs is optional for the player, so it is left out of the count: the level
   *  "gave a worker" for that loop. */
  private wSrc = new Map<string, string>();
  private covered = new Set<string>();
  /** Sim tick of the event being fed, the start of the open cycle (-1 when none) and the end of the previous one. */
  now = 0;
  private start = -1;
  private lastEnd = -1e9;
  private endAt = 0;
  max = 0;
  maxKey = "";
  get(res: string, from: string): void {
    if (this.phase === "put") this.close();
    if (this.start < 0) this.start = this.now;
    this.src[res] = from;
  }
  put(res: string, to: string): void {
    this.phase = "put";
    if (this.start < 0) this.start = this.now;
    this.endAt = this.now;
    this.cycle.add(`${this.src[res] ?? "start"}>${res}>${to}`);
  }
  workerGet(who: number, res: string, from: string): void { this.wSrc.set(`${who}|${res}`, from); }
  workerPut(who: number, res: string, to: string): void {
    const from = this.wSrc.get(`${who}|${res}`);
    if (from !== undefined) this.covered.add(`${from}>${res}>${to}`);
  }
  close(): void {
    this.phase = "get";
    const trips = [...this.cycle].filter((t) => !this.covered.has(t));
    const start = this.start;
    this.cycle.clear();
    this.start = -1;
    if (trips.length === 0) return;
    const key = trips.sort().join(" + ");
    // Items handed over back to back with no walking in between are one trip, not a repeat.
    const sameTrip = key === this.lastKey && start - this.lastEnd < LOOP_MERGE_TICKS;
    this.lastEnd = this.endAt;
    if (!sameTrip) this.run = key === this.lastKey ? this.run + 1 : 1;
    this.lastKey = key;
    if (this.run > this.max) { this.max = this.run; this.maxKey = key; }
  }
}

/** Feed one sim event to the loop tracker: only the player's own actions count (workers carry `by`). */
function noteLoop(loops: LoopTracker, e: SimEvent, st: State): void {
  loops.now = st.tick;
  switch (e.t) {
    case "gathered": {
      const from = st.nodes[e.node]?.type ?? "node";
      if (e.by === undefined) loops.get(e.res, from); else loops.workerGet(e.by, e.res, from);
      break;
    }
    case "picked": if (e.by === undefined) loops.get(e.res, "pickup"); else loops.workerGet(e.by, e.res, "pickup"); break;
    case "collected": loops.get(e.res, "cash"); break;
    case "deposited": if (e.by === undefined) loops.put(e.res, e.to); else loops.workerPut(e.by, e.res, e.to); break;
    case "pad_paid": loops.put(e.res, `pad:${e.pad}`); break;
    case "barrier_progress": loops.put("res.barrier", `barrier:${e.line}`); break;
    default: break;
  }
}

/** End-of-run numbers the generator sizes star objectives from (REDESIGN-R2 �6). */
export interface RunStats {
  /** Lowest core fuel, per mille of capacity. */
  heatMin: number;
  /** Lowest base health, percent of max (100 without defense). */
  hpMin: number;
  fuelOuts: number;
  froze: number;
  customersAngry: number;
  injured: number;
  barriersLost: number;
  /** A converter output or a shelf reached its cap at some point. */
  overload: boolean;
  tripBest: number;
  tripBestClean: number;
  podsLost: number;
  /** Recruit pods still on the map at the end. */
  podsLeft: number;
  rescued: number;
  streakMax: number;
  hired: number;
  /** Mean core fuel share over the run (sampled each second). */
  heatMean: number;
  admitted: number;
  kills: number;
  salvage: number;
  /** Highest tier any ranged defense reached (0 without one). */
  turretMax: number;
}

/** What the run used, for the generator's "every element is used" rule. */
export interface ElementUse {
  /** Pads completed (or hired from at least once). */
  pads: string[];
  /** Barrier lines built on or hit, or (closed rings) outside of which a lasso loop closed. */
  lines: string[];
  /** Node types gathered by anyone. */
  nodes: string[];
  /** Converter ids that produced something. */
  converters: string[];
  /** Captures brought home (released or delivered). */
  captures: number;
  preyKilled: number;
  /** Sales made (the sales point was used). */
  sold: number;
  /** Gate arrivals admitted. */
  admitted: number;
  /** Hazard events ridden out. */
  hazards: number;
  /** Units conveyor belts delivered. */
  conveyed: number;
}

export interface BotResult {
  profile: string;
  seed: number;
  won: boolean;
  reason: string;
  ticks: number;
  /** Tick the main goal was done (the run goes on for open star objectives); ticks when it never was. */
  goalTicks: number;
  margin: number;
  stalls: number;
  stallStates: StallState[];
  trace: BotTrace;
  /** Star objectives done at the end (sim `starsOf`), and each objective's outcome in manifest order. */
  stars: number;
  objectives: { kind: string; done: boolean }[];
  runStats: RunStats;
  used: ElementUse;
  hash: string;
  inputs?: Input[];
}

const PROGRESS_EVENTS: ReadonlySet<SimEvent["t"]> = new Set<SimEvent["t"]>([
  "pad_paid", "built", "hired", "unlocked", "core_upgraded", "zone_cleared", "captured", "released", "recruit_arrived",
  "moved_in", "barrier_progress", "barrier_built", "wave_cleared", "died", "crate_delivered",
  "core_lit", "joined", "decoy_opened", "retreated",
]);

const SALES_GOALS: ReadonlySet<string> = new Set(["currency", "sell", "earn", "serve_premium", "streak", "sell_each", "earn_within", "bulk_order", "shelves_full", "automate"]);
const MAKE_GOALS: ReadonlySet<string> = new Set(["produce", "chain", "converters_running", "automate", "converter_level", "haul", "stockpile"]);

/** Play a manifest headless with one profile and one in-level seed. Deterministic. */
/** Salvage price of the unbought turret ladder pads (towers, Lv2, Lv3); -1 when the level has none. */
function ladderLeft(st: State, cp: Compiled): number {
  let any = false, left = 0;
  for (const p of st.pads) {
    const e = cp.entityById[p.id];
    if (!e || e.type !== "pad.build" || !e.build.startsWith("struct.ranged_defense")) continue;
    any = true;
    if (!p.done) left += e.cost["res.salvage"] ?? 0;
  }
  return any ? left : -1;
}

export function playBot(manifest: unknown, profileIn: BotProfile, seed: number, opts: BotOptions = {}): BotResult {
  const content = opts.content ?? defaultContent;
  const sim = createSim({ ...(manifest as object), seed }, { content });
  const cp = sim.compiled, st = sim.state;
  // level.budgetSeconds is a rating input only (DECISIONS 9b); the sim never fails on it.
  const budgetS = opts.timeBudgetSeconds ?? cp.level.budgetSeconds;
  const plan = opts.plan ?? planBot(manifest, content);
  const profile = withLearning(profileIn, opts.attempt ?? 0);
  const rng = seedRng((seed * 2654435761 + hashName(profile.name)) >>> 0);
  const brain = new Brain(cp, plan, profile, rng);
  // The human-view bot decides from what is on screen; the sim and every statistic below read the real state.
  const eyes = profile.view ? new Perception(viewFor(cp.manifest.family)) : null;
  eyes?.overview(st);

  const goal = cp.manifest.goal;
  const lastWave = cp.waves.length > 0 ? cp.waves[cp.waves.length - 1]!.tick : 0;
  const budgetTicks = cp.timerTicks > 0 ? cp.timerTicks : Math.round(budgetS * TPS);
  const timeFixed = TIME_FIXED_GOALS.has(goal.type);
  const lastEvent = cp.manifest.events.reduce((a, e) => Math.max(a, e.end), 0) * TPS;
  const survive = goal.type === "survive" ? Math.round(((goal as { seconds?: number }).seconds ?? 0) * TPS) : 0;
  const fixedEnd = Math.max(lastWave, lastEvent, survive);
  const maxTicks = opts.maxTicks ?? (cp.timerTicks > 0 ? cp.timerTicks : timeFixed ? fixedEnd + WAVES_TAIL_SECONDS * TPS : budgetTicks);

  const inputs: Input[] = [];
  const stallStates: StallState[] = [];
  let lastProgress = 0, stalls = 0, lastCapNeed = Infinity;
  let fuelMin = 1, fuelLow = 0, moveOnly = 0, acting = 0, dead = 0, earned = 0;
  const used = new Set<string>();
  const progressS: number[] = [], threatS: number[] = [];
  let warnStart = -1;
  let integSum = 0, integN = 0;
  let hpMin = 100, overload = false, heatSum = 0, heatN = 0, lastObj = 0;
  let rallyOn = 0, rallyN = 0;
  const capRun: number[] = [];
  let capHoldMax = 0;
  const loops = new LoopTracker();
  const lines = new Set<string>(), nodesUsed = new Set<string>(), convUsed = new Set<string>();
  let capturesHome = 0;
  const builtPads = new Set<string>();

  // Past the main goal the level runs on for open star objectives, for at most the overtime; waves held
  // back until the last one was cleared still get played (up to twice the cap).
  const cap = (): number => (st.objectives[0]?.done ? maxTicks + cp.overtimeTicks : st.waves.idx < cp.waves.length ? 2 * maxTicks : maxTicks);
  while (!st.over && st.tick < cap()) {
    const inp = st.tick >= (opts.idleFrom ?? Infinity) ? { dx: 0, dy: 0 } : brain.tick(eyes ? eyes.see(st) : st);
    if (opts.recordInputs) inputs.push(inp);
    const fuelBefore = st.core.fuel;
    const currencyBefore = st.currency;
    const ev = sim.step(inp);
    let progressed = false, acted = false;
    const needCur = brain.currencyNeedNext(st);
    // Capped goods the plan still needs (refined, salvage): carrying or making more of them is
    // progress even when no pad has been paid yet, so a bot still building up a load is not "stalled".
    // Sampled twice a second, and only on plans that have such costs at all (it is a per-step scan).
    if (brain.usesCapped && st.tick % 15 === 0) {
      const capNeed = Object.values(brain.cappedNeed(st)).reduce((a, b) => a + b, 0);
      if (capNeed < lastCapNeed) progressed = true;
      lastCapNeed = capNeed;
    }
    for (const e of ev) {
      if (e.t === "converted" && MAKE_GOALS.has(goal.type)) progressed = true;
      // Working a machine by hand (manual first) is the player's own action, whatever the goal.
      if (e.t === "converted") {
        const cv = st.converters.find((x) => x.id === e.conv), R = cp.convParams.playerOperateRange;
        if (cv && (st.player.pos.x - cv.operatorPos.x) ** 2 + (st.player.pos.y - cv.operatorPos.y) ** 2 <= R * R) progressed = true;
      }
      if (e.t === "deposited" && e.to === "store.depot") progressed = true;
      if (e.t === "converted" && brain.usesCapped && (brain.cappedNeed(st)[e.res] ?? 0) > 0) progressed = true;
      if (PROGRESS_EVENTS.has(e.t)) progressed = true;
      if (REWARD_EVENTS.has(e.t) && e.t !== "sold") progressed = true;
      if (e.t === "sold") {
        earned += e.pay;
        if (currencyReachable(st, needCur, earned, budgetTicks)) progressed = true;
        // Serving a premium customer is the goal itself on serve_premium levels.
        if (goal.type === "serve_premium" && e.premium) progressed = true;
        // Selling is the goal itself on harvest goals (earn, streaks, bulk orders ...).
        if (SALES_GOALS.has(goal.type)) progressed = true;
      }
      if (e.t === "collected" && currencyReachable(st, needCur, earned, budgetTicks)) progressed = true;
      // Feeding a core below half (or below the heat policy's band) keeps the colony alive: progress.
      if (e.t === "deposited" && e.to === "sink.core" && e.by === undefined && fuelBefore < coreCap(st, cp) * Math.max(0.5, (plan.policies?.heatFloor ?? 0) + 0.2)) progressed = true;
      if (e.t === "hired") brain.hiresByPad[e.pad] = (brain.hiresByPad[e.pad] ?? 0) + 1;
      if (e.t === "gathered") { const n = st.nodes[e.node]; nodesUsed.add(n ? n.type : String(e.node)); }
      if (e.t === "converted") convUsed.add(e.conv);
      if (e.t === "built") builtPads.add(e.pad);
      if (e.t === "barrier_progress" || e.t === "barrier_built") lines.add(e.line);
      if (e.t === "hit" && e.target === "barrier") for (const l of st.barriers) if (l.sections.some((sec) => near2(sec, e.at))) lines.add(l.id);
      if (e.t === "captured") for (const l of st.barriers) if (l.closed) lines.add(l.id);
      if (e.t === "released" || e.t === "crate_delivered") capturesHome++;
      if ((e.t === "gathered" || e.t === "deposited" || e.t === "collected" || e.t === "picked" || e.t === "pad_paid" || e.t === "barrier_progress") && !("by" in e && e.by !== undefined)) acted = true;
      noteLoop(loops, e, st);
      noteModule(used, e, cp.upgrades);
    }
    void currencyBefore;
    opts.onTick?.(st, brain, ev);
    // On a waves goal the schedule itself advances the goal while waves are still to come.
    // While attack waves are still to come, the schedule itself advances any defend level.
    if (cp.waves.length > 0 && st.waves.idx < cp.waves.length) progressed = true;
    if (timeFixed && !st.over) progressed = true;
    // Riding out a storm is the job while it lasts.
    if (st.hazard.phase !== "none") progressed = true;
    const ob = st.objectives[0];
    if (ob && (ob.progress > lastObj || ob.done)) progressed = true;
    if (ob) lastObj = ob.progress;
    const hp = st.meters.baseHealthMax > 0 ? (st.meters.baseHealth * 100) / st.meters.baseHealthMax : 100;
    if (hp < hpMin) hpMin = hp;
    if (!overload) overload = st.converters.some((cv) => cv.out >= cp.converters[cv.type]!.outCap);
    st.converters.forEach((cv, i) => {
      const run = cv.out >= cp.converters[cv.type]!.outCap ? (capRun[i] ?? 0) + 1 : 0;
      capRun[i] = run;
      if (run > capHoldMax) capHoldMax = run;
    });
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
      const side = attackedSide(st);
      if (side) for (const r of st.residents) {
        if (r.status !== "ok" || !cp.roles[r.role]?.rally) continue;
        const q = guardPost(st, cp, r.assign.post ?? 0, side), R = cp.roles[r.role]!.attackRange;
        rallyN++;
        if ((r.pos.x - q.x) ** 2 + (r.pos.y - q.y) ** 2 <= R * R) rallyOn++;
      }
      heatSum += st.core.fuel / cap; heatN++;
      progressS.push(goalProgress(st, cp, plan, brain));
      threatS.push(threatSignal(st, cp));
    }
  }

  loops.close();
  const won = st.won === true;
  const reason = st.over ? st.reason ?? "unknown" : "budget";
  const ticks = st.tick;
  const goalTicks = st.objectives[0]?.done ? st.objectives[0].doneTick : ticks;
  let margin: number;
  if (timeFixed && cp.waves.length > 0) {
    const hp = st.meters.baseHealth / Math.max(1, st.meters.baseHealthMax);
    // Barrier integrity averaged over every second since the first wave: quick fights and rebuilds count.
    const integrity = integN > 0 ? integSum / integN : hp;
    margin = won ? (hp + integrity) / 2 : -(1 - goalProgress(st, cp, plan, brain));
  } else if (timeFixed) {
    // Holding out against the clock (survive, storms): the margin is how warm the colony stayed.
    margin = won ? heatSum / Math.max(1, heatN) : -(1 - goalProgress(st, cp, plan, brain));
  } else {
    margin = won ? (budgetTicks - goalTicks) / budgetTicks : -(1 - goalProgress(st, cp, plan, brain));
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
    playerKillShare: s.kills > 0 ? (s.killsBy?.["player"] ?? 0) / s.kills : -1,
    ladderLeft: ladderLeft(st, cp),
    depotPicks: st.stats.depotPicked ?? 0,
    story: { litTicks: s.litTick ?? -1, joined: s.joined ?? 0, decoys: s.decoysOpened ?? 0, retreats: s.retreats ?? 0 },
    rallyShare: rallyN > 0 ? rallyOn / rallyN : -1,
    injuries: s.injured,
    animalHits: s.animalHits,
    downs: s.downs,
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
    capHoldMax: capHoldMax / TPS,
    loopMax: loops.max,
    loopKey: loops.maxKey,
  };
  const runStats: RunStats = {
    heatMin: s.heatMin, hpMin, fuelOuts: s.fuelOuts, froze: s.froze, customersAngry: s.customersAngry, injured: s.injured,
    barriersLost: s.barriersLost, overload, tripBest: s.tripBest, tripBestClean: s.tripBestClean, podsLost: s.podsLost,
    podsLeft: st.captures.filter((c) => cp.lassoables[c.type]?.result === "recruit").length, rescued: s.rescued,
    streakMax: s.streakMax, hired: s.hired, heatMean: heatSum / Math.max(1, heatN),
    admitted: s.admitted, kills: s.kills, salvage: s.salvage,
    turretMax: st.structures.reduce((a, x) => (cp.structures[x.type]?.tiers ? Math.max(a, x.level) : a), 0),
  };
  const usedEl: ElementUse = {
    pads: st.pads.filter((p) => p.done || builtPads.has(p.id) || (brain.hiresByPad[p.id] ?? 0) > 0).map((p) => p.id),
    lines: [...lines], nodes: [...nodesUsed], converters: [...convUsed], captures: capturesHome, preyKilled: s.preyKilled, sold: s.sold,
    admitted: s.admitted, hazards: s.hazardsSurvived, conveyed: st.stats.conveyed ?? 0,
  };
  const res: BotResult = {
    profile: profile.name, seed, won, reason, ticks, goalTicks, margin, stalls, stallStates, trace,
    stars: st.over ? starsOf(st) : 0, objectives: st.objectives.map((o) => ({ kind: o.kind, done: o.done })),
    runStats, used: usedEl, hash: sim.hash(),
  };
  if (opts.recordInputs) res.inputs = inputs;
  return res;
}

const near2 = (sec: { a: Vec; b: Vec }, p: Vec): boolean => {
  const R = 40 * FP;
  const minx = Math.min(sec.a.x, sec.b.x) - R, maxx = Math.max(sec.a.x, sec.b.x) + R;
  const miny = Math.min(sec.a.y, sec.b.y) - R, maxy = Math.max(sec.a.y, sec.b.y) + R;
  return p.x >= minx && p.x <= maxx && p.y >= miny && p.y <= maxy;
};

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
  // Judged against the whole budget, not what is left of it: a bot still earning toward a price it
  // could have reached must not turn into a "stall" just because the clock is nearly out.
  // A slow player earning toward a reachable price is not stalled: the horizon grows with the run.
  return need - st.currency <= rate * Math.max(budgetTicks, 4 * st.tick) * 1.5 + 1;
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
    case "barrier_built": case "barrier_progress": used.add("barrier_lines"); break;
    case "hit": if (e.target === "barrier") used.add("barrier_lines"); break;
    case "captured": used.add("lasso"); used.add("barrier_lines"); break; // the tow line only engages outside a line
    case "wave_started": case "wave_cleared": used.add("defense"); break;
    case "died": if (e.kind.startsWith("node.")) used.add("hunting"); break;
    case "converted": used.add("converters"); break;
    case "conveyed": used.add("conveyors"); break;
    case "healed": used.add("medical"); break;
    case "hazard_start": used.add("hazard_events"); break;
    case "customer_arrived": if (e.kind !== "unit.customer") used.add("customer_variety"); break;
    default: break;
  }
}

/** Goal progress in [0, 1], from the sim's main objective (objective 0 mirrors the goal). */
export function goalProgress(st: State, cp: ReturnType<typeof createSim>["compiled"], plan: Plan, brain?: Brain): number {
  void brain;
  const o = st.objectives[0];
  if (!o) return 0;
  if (o.done) return 1;
  const g = cp.manifest.goal;
  if (g.type === "build") {
    // Paid cost along the goal path, so a half-paid landmark counts.
    let paid = 0, total = 0;
    for (const s of plan.steps) {
      if (!s.goalPath) continue;
      const pad = st.pads.find((p) => p.id === s.pad);
      for (const [r, n] of Object.entries(s.cost)) { total += n; paid += pad ? (pad.done ? n : Math.min(n, pad.paid[r] ?? 0)) : 0; }
    }
    return total > 0 ? Math.min(0.99, paid / total) : 0;
  }
  return o.target > 0 ? Math.min(0.99, Math.max(0, o.progress / o.target)) : 0;
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

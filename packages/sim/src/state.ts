import type { Vec } from "./fixed.js";
import type { Rng } from "./rng.js";

// All of this is plain data: no classes, no functions, no references between
// objects (indices and ids only), so it can be hashed, cloned and replayed.
// Field names follow Contract 1 in docs/PLAN.md; other packages code against them.

export interface PlayerState {
  pos: Vec;
  face: 1 | -1;
  /** Carried items in pickup order; the top of the stack is the last entry. */
  stack: string[];
  /** Ticks until the next automatic action check. */
  actCd: number;
  /** Ticks until the next auto-attack. */
  atkCd: number;
  /** Ticks until the next barrier build payment. */
  buildCd: number;
  /** Capture ids being towed, in chain order. */
  tow: number[];
  /** True on ticks where the input vector was non-zero. */
  moving: boolean;
  /** Pad the player is standing on (first visible, unfinished pad in range), or null. */
  padId: string | null;
  /** Ticks the player has stood on `padId` without leaving; payment starts at `pads.dwell`. */
  padDwell: number;
  /** Ticks until a hostile in contact can hit the player again. */
  hitCd: number;
}

export interface NodeState {
  id: string | null;
  type: string;
  pos: Vec;
  /** Items left; null for infinite nodes. */
  stock: number | null;
  regrowAcc: number;
  enabled: boolean;
}

export interface CoreState {
  pos: Vec;
  fuel: number;
  level: number;
  /** Burn accumulator in FP per tick, so a hazard can speed the burn by a ratio. */
  burnAcc: number;
  /** meter.lifeline in parts per million of full. */
  lifeline: number;
}

export interface CustomerState {
  /** Unique per level, in arrival order. */
  id: number;
  kind: string;
  res: string;
  want: number;
  patience: number;
  patienceMax: number;
  pos: Vec;
  angry: boolean;
}

export interface SalesState {
  pos: Vec;
  register: Vec;
  pile: Vec;
  /** Currency waiting at the register for the player to collect. */
  pileN: number;
  shelf: Record<string, number>;
  sells: string[];
  queue: CustomerState[];
  leaving: CustomerState[];
  spawnAcc: number;
  premiumServed: number;
  nextCustomerId: number;
  /** Queue slot 0 (beside the stall, on the side facing the map interior); slot k = queueAt + k × queueStep. */
  queueAt: Vec;
  queueStep: Vec;
  /** x of the map edge customers arrive from and leave to (the edge on the stall's side), fixed point. */
  edgeX: number;
}

export type ResidentStatus = "ok" | "injured" | "healing" | "frozen" | "towed" | "releasing" | "waiting" | "arriving" | "dead";

export interface Assignment {
  /** Node type, animal type, converter type or store.depot the worker takes from. */
  from: string | null;
  /** Sink, converter type or store.depot the worker delivers to. */
  to: string | null;
  /** Bound node entity id, when the worker serves one specific node. */
  node: string | null;
  /** Guard post index along the first barrier line. */
  post: number | null;
}

export interface ResidentState {
  id: number;
  pos: Vec;
  /** "idle" or a role id. */
  role: string;
  /** "ok" residents live in the base and count toward population, as do injured and healing ones. */
  status: ResidentStatus;
  carry: string | null;
  n: number;
  mode: "gather" | "deliver";
  /** Entity id (node, converter, structure) the worker is heading for, or null. */
  target: string | null;
  assign: Assignment;
  /** Ticks until the worker's next work action (gather, deliver, attack). */
  acc: number;
  /** Ticks left in a timed status (healing). */
  timer: number;
  /** Slot on the idle ring around the core. */
  slot: number;
  /** Frost while the reactor is out, per mille (0..1000); 1000 means frozen to death. */
  frost: number;
  /** How the resident joined: in the manifest's people, released from a pod, or admitted at the gate. */
  origin: "start" | "rescue" | "gate";
}

export interface PadState {
  id: string;
  type: "pad.hire" | "pad.build";
  pos: Vec;
  done: boolean;
  paid: Record<string, number>;
  /** Hidden while a required pad is undone. */
  visible: boolean;
  /** Visible but unusable: core level too low, or no idle resident for a hire pad. */
  locked: boolean;
}

export interface StructureState {
  id: string;
  type: string;
  pos: Vec;
  level: number;
  hp?: number;
  hpMax?: number;
  /** Ticks until the structure's next action (ranged defense shot). */
  acc: number;
}

export interface BarrierSectionState {
  a: Vec;
  b: Vec;
  built: boolean;
  hp: number;
  hpMax: number;
  gate: boolean;
  /** Resource units paid toward building this section. */
  paid: number;
}

export interface BarrierState {
  id: string;
  a: Vec;
  b: Vec;
  res: string;
  costPerSection: number;
  sections: BarrierSectionState[];
  /** A ring: the last section ends at the first section's start; "outside" is outside the polygon. */
  closed: boolean;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface ZoneState {
  id: string;
  type: "zone.blocked" | "zone.waiting";
  rect: Rect;
  cleared: boolean;
}

export interface PreyZoneState {
  id: string;
  rect: Rect;
  animal: string;
}

export interface CaptureState {
  id: number;
  type: string;
  pos: Vec;
  state: "idle" | "towed" | "releasing";
  timer: number;
  /** Ticks left before it freezes over and is lost (while idle or towed); 0 = no freeze timer. */
  freezeTicks: number;
}

export interface PreyState {
  id: number;
  pos: Vec;
  hp: number;
  alive: boolean;
  /** Ticks until respawn while dead. */
  respawn: number;
  /** Index into state.preyZones. */
  zone: number;
  vel: Vec;
  /** Ticks until the next heading change. */
  turn: number;
}

export interface HostileState {
  id: number;
  type: string;
  pos: Vec;
  hp: number;
  hpMax: number;
  /** Map edge it attacked from. */
  side: "n" | "e" | "s" | "w";
  /** "core" while walking in, "barrier" while hitting a section, "base" while attacking the core. */
  target: "core" | "barrier" | "base";
  acc: number;
}

export interface DropState {
  id: number;
  res: string;
  pos: Vec;
}

export interface ConverterState {
  id: string;
  type: string;
  pos: Vec;
  inQ: string[];
  out: number;
  acc: number;
  operatorPos: Vec;
  pickupPos: Vec;
  /** 1-based; a conv.level pad raises it up to 1 + upgradeRates.length. */
  level: number;
}

export interface DepotState {
  pos: Vec;
  stock: Record<string, number>;
}

export interface MetersState {
  /** Mirrors core.lifeline for readers of the meters block. */
  lifeline: number;
  baseHealth: number;
  baseHealthMax: number;
}

export interface WavesState {
  idx: number;
  pending: { tick: number; type: string; side: "n" | "e" | "s" | "w" }[];
  /** True once a wave has spawned until every hostile is dead. */
  active: boolean;
}

export interface HazardState {
  phase: "none" | "warning" | "active";
  /** Tick at which the current phase ends. */
  until: number;
  /** Index of the next event to warn about. */
  idx: number;
}

export interface LassoState {
  trail: Vec[];
  towing: number[];
  engaged: boolean;
  /** The current tow trip: lassoables delivered into the safe radius and lost (dropped or frozen over). */
  trip: { delivered: number; lost: number };
  /** Ticks the player has stood still while towing outside the safe radius. */
  slack: number;
}

/** Reactor-out countdown. `ticksTotal` is core.grace; the lifeline is ticksLeft / ticksTotal while active. */
export interface FreezeState {
  active: boolean;
  ticksLeft: number;
  ticksTotal: number;
  /** ticksLeft value at which the current victim freezes; -1 while none is scheduled. */
  lossAt: number;
}

/** One star objective, evaluated every tick from state and stats. */
export interface ObjectiveState {
  id: string;
  kind: string;
  progress: number;
  target: number;
  done: boolean;
  /** Can no longer be achieved (a guard was breached or a deadline passed). */
  failed: boolean;
}

export interface TimersState {
  gateAcc: number;
  gateLeft: number;
}

export interface Stats {
  sold: number;
  built: number;
  rescued: number;
  injured: number;
  barriersLost: number;
  lifelineLowTicks: number;
  concurrentDemandTicks: number;
  idleTicks: number;
  /**
   * Ticks on which a reward event (sale, build, unlock, release) fired: a ring of the most
   * recent REWARD_RING entries, so the state stays bounded on long runs. Totals live in the
   * optional fields below, which stats.ts initialises on the first reward.
   */
  rewardTicks: number[];
  /** Total reward events so far. */
  rewardCount?: number;
  /** Tick of the most recent reward event. */
  rewardLastTick?: number;
  /** Longest gap between consecutive reward events, in ticks (the first gap counts from tick 0). */
  rewardGapMax?: number;
  /** Histogram of reward gaps; bucket edges in seconds are REWARD_GAP_EDGES in stats.ts. */
  rewardGapHist?: number[];
  // Objective counters (0.5.0).
  /** Times the core ran out of fuel. */
  fuelOuts: number;
  /** Residents frozen to death. */
  froze: number;
  /** Lowest heat seen (fuel / fuel cap), per mille. */
  heatMin: number;
  customersSpawned: number;
  customersAngry: number;
  /** Credits paid at the register in total. */
  earned: number;
  /** Units sold per good. */
  soldUnits: Record<string, number>;
  /** Customers served since the last angry one, and the best such run. */
  streak: number;
  streakMax: number;
  bulkServed: number;
  unlocked: number;
  hired: number;
  hiredBy: Record<string, number>;
  converted: number;
  convertedBy: Record<string, number>;
  /** Outputs of converters fed by other converters' outputs. */
  tier2Made: number;
  /** Goods delivered by haulers. */
  hauled: number;
  kills: number;
  bossKills: number;
  preyKilled: number;
  /** Hunted food (animal drops) delivered to a sink, converter or depot. */
  protein: number;
  /** Salvage picked up. */
  salvage: number;
  crates: number;
  podsLost: number;
  wavesCleared: number;
  admitted: number;
  zonesCleared: number;
  hazardsSurvived: number;
  /** Most lassoables delivered in one tow trip, and the most in a trip that lost none. */
  tripBest: number;
  tripBestClean: number;
  /** Tick of the last deposit the player made by hand, and sales since then. */
  lastPlayerDeposit: number;
  salesSinceDeposit: number;
}

export interface HintState {
  key: string;
  tick: number;
}

export interface State {
  tick: number;
  rng: Rng;
  currency: number;
  /** Runtime overlay of integer params that upgrades change (barrier.hpMax ...). */
  params: Record<string, number>;
  player: PlayerState;
  core: CoreState;
  nodes: NodeState[];
  sales: SalesState | null;
  residents: ResidentState[];
  nextResidentId: number;
  pads: PadState[];
  /** Ids of pads whose build has completed. */
  built: string[];
  structures: StructureState[];
  barriers: BarrierState[];
  zones: ZoneState[];
  preyZones: PreyZoneState[];
  captures: CaptureState[];
  prey: PreyState[];
  hostiles: HostileState[];
  nextHostileId: number;
  drops: DropState[];
  nextDropId: number;
  converters: ConverterState[];
  depot: DepotState | null;
  meters: MetersState;
  waves: WavesState;
  hazard: HazardState;
  lasso: LassoState;
  /** Resident ids queued at the arrivals gate, front first. */
  gateQueue: number[];
  timers: TimersState;
  freeze: FreezeState;
  objectives: ObjectiveState[];
  stats: Stats;
  lastHint: HintState | null;
  over: boolean;
  won: boolean | null;
  reason: string | null;
}

import {
  content as defaultContent,
  checkManifest,
  goalParams,
  Manifest as ManifestSchema,
  type Content,
  type Effect,
  type Manifest,
} from "@fo/content";
import { FP, METER_MAX, TPS, fp, perTick, ratio, ticks, type Vec } from "./fixed.js";

// Compilation turns the human-unit content (seconds, world units, decimal
// ratios) plus a manifest into integer constants the sim reads every tick.
// Nothing after this step touches a decimal.

export interface CompiledResource {
  cap: number | null;
  price: number;
  category: string;
}

export interface CompiledNodeDef {
  yields: string;
  range: number;
  rateTicks: number;
  workerRateTicks: number | null;
  stock: number | null;
  regrowTicks: number | null;
}

export interface CompiledAnimal {
  hp: number;
  speedMin: number;
  speedMax: number;
  turnMin: number;
  turnMax: number;
  drops: Record<string, number>;
  respawnTicks: number;
  margin: number;
}

export interface CompiledHostile {
  hp: number;
  speed: number;
  drops: Record<string, number>;
  damage: number;
  boss: boolean;
}

export interface CompiledLassoable {
  releaseTicks: number;
  towSpacing: number;
  result: "recruit" | "bundle";
  bundle: Record<string, number>;
  /** 0 = never freezes over. */
  freezeTicks: number;
}

export interface CompiledObjective {
  id: string;
  kind: string;
  params: Record<string, number | string>;
}

/** An effect with its value resolved to an integer (ratios in FP for multiply). */
export interface CompiledEffect {
  op: "set" | "add" | "multiply";
  scope: "params" | "target" | "barriers";
  param: string | null;
  field: "level" | "hp" | "hpMax" | null;
  value: number;
  gate: boolean | null;
}

export interface CompiledStructure {
  hp: number | null;
  tiers: { range: number; rateTicks: number }[] | null;
  damage: number;
  healTicks: number;
  healOffset: Vec;
  range: number;
  effects: CompiledEffect[];
}

export interface CompiledUpgrade {
  target: string | null;
  effects: CompiledEffect[];
}

export interface CompiledConverter {
  inputs: string[];
  output: string;
  rateTicks: number;
  /** Ticks per output at level 1, 2, ...; the max level is the length. */
  rateTicksByLevel: number[];
  /** 1 for raw inputs; 1 + the highest tier among converters making its inputs otherwise. */
  tier: number;
  inCap: number;
  outCap: number;
  role: string;
  range: number;
  operatorOffset: Vec;
  pickupOffset: Vec;
}

export interface CompiledRole {
  behavior: string;
  speed: number;
  carry: number;
  gatherTicks: number;
  deliverTicks: number;
  attackTicks: number;
  attackRange: number;
  damage: number;
}

export interface CompiledCustomerDef {
  patienceTicks: number;
  orderSize: "range" | "max_plus" | "fixed";
  orderExtra: number;
  pay: number;
}

export interface CompiledConsumer {
  /** FP-scaled priority. */
  priority: number;
  /** FP ratio of capacity. */
  targetFill: number;
  critical: number;
}

export interface CompiledSales {
  range: number;
  shelfCap: number;
  depositTicks: number;
  registerOffset: Vec;
  registerRange: number;
  pileOffset: Vec;
  pileRange: number;
  queueOffset: Vec;
  queueStep: Vec;
  queueMax: number;
  /** Spawn interval while the queue is shorter than refillBelow, so the line stays stocked. */
  refillTicks: number;
  refillBelow: number;
  bulkShare: number;
  cashierRange: number;
  /** Ticks the front customer stands at the window before paying; 0 = instant sale. */
  serveTicks: number;
  spawnTicks: number;
  jitterMin: number;
  jitterMax: number;
  initialDelayTicks: number;
  orderMin: number;
  orderMax: number;
  baseWeight: number;
  impatientShare: number;
  premiumShare: number;
  /** Fraction of the remaining distance closed per tick, out of FP. */
  approach: number;
  leaveX: number;
  leaveY: number;
  customers: Record<string, CompiledCustomerDef>;
}

export interface CompiledWave {
  tick: number;
  /** Spawn list in order: hostile type per spawn. */
  types: string[];
  /** Attack sides; spawn k comes from sides[k % length]. */
  sides: ("n" | "e" | "s" | "w")[];
  gapTicks: number;
}

export interface CompiledEvent {
  type: string;
  warnTick: number;
  startTick: number;
  endTick: number;
}

export type ManifestEntity = Manifest["entities"][number];

export interface Compiled {
  manifest: Manifest;
  content: Content;
  /** Manifest entities that carry an id, for pads and targets. */
  entityById: Record<string, ManifestEntity>;
  map: { w: number; h: number };
  modules: Set<string>;
  resources: Record<string, CompiledResource>;
  player: { speed: number; radius: number; actTicks: number; attackTicks: number; attackRange: number; attackDamage: number };
  core: {
    range: number;
    accepts: Record<string, number>;
    depositTicks: number;
    exclusion: number;
    levels: { fuelCap: number; safeRadius: number }[];
    burnTicks: number;
    drainPerTick: number;
    recoverPerTick: number;
    noFuelScale: number;
    upgradeFuelBonus: number;
  };
  nodes: Record<string, CompiledNodeDef>;
  animals: Record<string, CompiledAnimal>;
  hostiles: Record<string, CompiledHostile>;
  lassoables: Record<string, CompiledLassoable>;
  structures: Record<string, CompiledStructure>;
  upgrades: Record<string, CompiledUpgrade>;
  converters: Record<string, CompiledConverter>;
  roles: Record<string, CompiledRole>;
  consumers: Record<string, CompiledConsumer>;
  sales: CompiledSales;
  housing: { base: number; perBuilding: number };
  lasso: { maxTowed: number; speedPenalty: number; pointSpacing: number; trailMax: number; closeDist: number; minLoopPoints: number; slackTicks: number };
  /** Reactor-out countdown and frost (per mille). */
  freeze: { graceTicks: number; decayPerTick: number; othersRate: number; othersCap: number };
  hazard: { burnMul: number; radiusScale: number };
  pads: { range: number; bigRange: number; payItemTicks: number; payCurrencyTicks: number; dwellTicks: number };
  /** Rating-only time budget (never a fail condition; `timer.seconds` is the fail timer). */
  level: { budgetSeconds: number; budgetTicks: number };
  residents: {
    idleSpeed: number; idleRadiusX: number; idleRadiusY: number; waitingSpeed: number; gateSpeed: number; injuredSpeed: number;
    arrive: number; workRange: number; coreDeliverRange: number; seekDropRange: number;
  };
  waiting: Vec;
  gate: { pos: Vec; everyTicks: number; total: number; initialTicks: number; queueMax: number; queueSpacing: number; queueOffsetY: number; admitOffsetY: number; admitRange: number; spawnSpread: number; spawnOffsetY: number } | null;
  zones: { blockMargin: number };
  barrier: { thickness: number; buildRange: number; buildTicks: number; hp: number; gateHp: number; costPerSection: number };
  drops: { pickupRange: number; scatterX: number; scatterY: number };
  convParams: { playerOperateRange: number; operatorRange: number; pickupRange: number; hintRange: number };
  defense: {
    spawnGapTicks: number; spawnY: number; spawnMarginX: number; barrierStop: number; barrierHitTicks: number; barrierDamage: number;
    baseRange: number; baseHitTicks: number; baseDamage: number; steerBand: number; steerRate: number;
    dropRelocateBand: number; dropRelocateOffset: number; postOffset: number; playerHitRange: number; playerHitTicks: number;
  };
  waves: CompiledWave[];
  /** Main goal first; synthesised from `goal` when the manifest lists no objectives. */
  objectives: CompiledObjective[];
  /** Resources animals drop (hunted food, for the protein counter). */
  proteinRes: string[];
  events: CompiledEvent[];
  baseHealth: number;
  conveyor: { speed: number; everyTicks: number; capacity: number; gap: number };
  routing: { hintFill: number };
  stats: { lifelineLow: number; coreLowFill: number };
  timerTicks: number;
}

const vec = ([x, y]: readonly [number, number]): Vec => ({ x: fp(x), y: fp(y) });

export function compile(manifestIn: unknown, c: Content = defaultContent): Compiled {
  const manifest = ManifestSchema.parse(manifestIn);
  checkManifest(manifest, c);
  if (manifest.contentVersion !== c.version) {
    throw new Error(`${manifest.id}: pinned to content ${manifest.contentVersion}, loaded ${c.version}`);
  }
  const param = (key: string): number => {
    const v = manifest.params[key] ?? c.defaults[key];
    if (v === undefined) throw new Error(`${manifest.id}: no value for param ${key}`);
    return v;
  };
  const int = (key: string): number => Math.round(param(key));

  const resources: Record<string, CompiledResource> = {};
  for (const [id, r] of Object.entries(c.resources)) resources[id] = { cap: r.cap, price: r.price, category: r.category };

  const nodes: Record<string, CompiledNodeDef> = {};
  for (const [id, n] of Object.entries(c.nodes)) {
    nodes[id] = {
      yields: n.yields,
      range: fp(n.range),
      rateTicks: ticks(n.rate),
      workerRateTicks: n.workerRate === undefined ? null : ticks(n.workerRate),
      stock: n.stock,
      regrowTicks: n.regrow === null ? null : ticks(n.regrow),
    };
  }
  const animals: Record<string, CompiledAnimal> = {};
  for (const [id, a] of Object.entries(c.animals)) {
    animals[id] = {
      hp: a.hp, speedMin: perTick(a.speedMin), speedMax: perTick(a.speedMax),
      turnMin: ticks(a.turnMin), turnMax: ticks(a.turnMax), drops: { ...a.drops },
      respawnTicks: ticks(a.respawn), margin: fp(a.margin),
    };
  }
  const hostiles: Record<string, CompiledHostile> = {};
  for (const [id, h] of Object.entries(c.hostiles)) hostiles[id] = { hp: h.hp, speed: perTick(h.speed), drops: { ...h.drops }, damage: h.damage, boss: h.boss };
  const lassoables: Record<string, CompiledLassoable> = {};
  for (const [id, l] of Object.entries(c.lassoables)) {
    lassoables[id] = {
      releaseTicks: ticks(l.releaseTime), towSpacing: fp(l.towSpacing), result: l.result, bundle: { ...(l.bundle ?? {}) },
      freezeTicks: l.freezeTime > 0 ? ticks(l.freezeTime) : 0,
    };
  }

  const effect = (e: Effect): CompiledEffect => {
    const raw = typeof e.value === "string" ? param(e.value) : e.value;
    // Multiplies are ratios in FP; sets and adds are plain integers (hp, levels).
    const value = e.op === "multiply" ? ratio(raw) : Math.round(raw);
    return { op: e.op, scope: e.scope, param: e.param ?? null, field: e.field ?? null, value, gate: e.gate ?? null };
  };
  const structures: Record<string, CompiledStructure> = {};
  for (const [id, s] of Object.entries(c.structures)) {
    structures[id] = {
      hp: s.hp ?? null,
      tiers: s.tiers ? s.tiers.map((t) => ({ range: fp(t.range), rateTicks: ticks(t.rate) })) : null,
      damage: s.damage ?? 1,
      healTicks: ticks(s.healTime ?? 0),
      healOffset: s.healOffset ? vec(s.healOffset) : { x: 0, y: 0 },
      range: fp(s.range ?? 0),
      effects: s.effects.map(effect),
    };
  }
  const upgrades: Record<string, CompiledUpgrade> = {};
  for (const [id, u] of Object.entries(c.upgrades)) upgrades[id] = { target: u.target ?? null, effects: u.effects.map(effect) };

  const converters: Record<string, CompiledConverter> = {};
  for (const [id, cv] of Object.entries(c.converters)) {
    converters[id] = {
      inputs: [...cv.inputs], output: cv.output, rateTicks: ticks(cv.rate),
      rateTicksByLevel: [ticks(cv.rate), ...cv.upgradeRates.map(ticks)], tier: 1, inCap: cv.inCap, outCap: cv.outCap,
      role: cv.role, range: fp(cv.range), operatorOffset: vec(cv.operatorOffset), pickupOffset: vec(cv.pickupOffset),
    };
  }
  // Tiers: a converter fed by another converter's output sits one tier above it (content chains are acyclic).
  for (let pass = 0; pass < Object.keys(converters).length; pass++) {
    for (const cv of Object.values(converters)) {
      for (const other of Object.values(converters)) {
        if (other !== cv && cv.inputs.includes(other.output)) cv.tier = Math.max(cv.tier, other.tier + 1);
      }
    }
  }
  const roles: Record<string, CompiledRole> = {};
  for (const [id, r] of Object.entries(c.roles)) {
    roles[id] = {
      behavior: r.behavior, speed: perTick(r.speed), carry: r.carry ?? 1,
      gatherTicks: ticks(r.gatherInterval ?? 0), deliverTicks: ticks(r.deliverInterval ?? 0),
      attackTicks: ticks(r.attackInterval ?? 0), attackRange: fp(r.attackRange ?? 0), damage: r.damage ?? 1,
    };
  }
  const consumers: Record<string, CompiledConsumer> = {};
  for (const [id, k] of Object.entries(c.consumers)) consumers[id] = { priority: ratio(k.priority), targetFill: ratio(k.targetFill), critical: ratio(k.critical) };

  const coreDef = c.sinks["sink.core"];
  if (!coreDef || coreDef.kind !== "core") throw new Error("content has no sink.core");
  const graceTicks = ticks(param("core.grace"));
  const core: Compiled["core"] = {
    range: fp(coreDef.range),
    accepts: { ...coreDef.accepts },
    depositTicks: ticks(coreDef.depositInterval),
    exclusion: fp(coreDef.exclusionRadius),
    levels: coreDef.levels.map((l) => ({ fuelCap: l.fuelCap, safeRadius: fp(l.safeRadius) })),
    burnTicks: ticks(param("core.burn")),
    drainPerTick: Math.max(1, Math.floor(METER_MAX / graceTicks)),
    recoverPerTick: Math.max(1, Math.round((METER_MAX * param("core.lifelineRecover")) / TPS)),
    noFuelScale: ratio(param("core.noFuelRadiusScale")),
    upgradeFuelBonus: coreDef.upgradeFuelBonus,
  };

  const salesDef = c.sinks["sink.sales_point"];
  if (!salesDef || salesDef.kind !== "sales_point") throw new Error("content has no sink.sales_point");
  const customers: Record<string, CompiledCustomerDef> = {};
  for (const [id, cu] of Object.entries(c.customers)) {
    customers[id] = { patienceTicks: ticks(cu.patience), orderSize: cu.orderSize, orderExtra: cu.orderExtra, pay: cu.pay };
  }
  const sales: CompiledSales = {
    range: fp(salesDef.range),
    shelfCap: salesDef.shelfCap,
    depositTicks: ticks(salesDef.depositInterval),
    registerOffset: vec(salesDef.registerOffset),
    registerRange: fp(salesDef.registerRange),
    pileOffset: vec(salesDef.pileOffset),
    pileRange: fp(salesDef.pileRange),
    queueOffset: vec(salesDef.queueOffset),
    queueStep: vec(salesDef.queueStep),
    queueMax: salesDef.queueMax,
    refillTicks: ticks(param("customers.refillSpawn")),
    refillBelow: int("customers.refillBelow"),
    bulkShare: ratio(param("customers.bulkShare")),
    cashierRange: fp(param("sales.cashierRange")),
    serveTicks: param("sales.serveSeconds") > 0 ? ticks(param("sales.serveSeconds")) : 0,
    spawnTicks: ticks(param("customers.spawn")),
    jitterMin: ratio(param("customers.jitterMin")),
    jitterMax: ratio(param("customers.jitterMax")),
    initialDelayTicks: ticks(param("customers.initialDelay")),
    orderMin: int("customers.orderMin"),
    orderMax: int("customers.orderMax"),
    baseWeight: ratio(param("customers.baseWeight")),
    impatientShare: ratio(param("customers.impatientShare")),
    premiumShare: ratio(param("customers.premiumShare")),
    approach: Math.min(FP, Math.round((param("customers.approach") * FP) / TPS)),
    leaveX: perTick(param("customers.leaveSpeedX")),
    leaveY: perTick(param("customers.leaveSpeedY")),
    customers,
  };

  // The hazard event's effects name which core parameters it scales. Only those two are meaningful today.
  let burnMul = FP, radiusScale = FP;
  const hazardDef = c.events["event.hazard"];
  if (hazardDef) {
    for (const e of hazardDef.effects.map(effect)) {
      if (e.op !== "multiply" || e.scope !== "params") throw new Error("event.hazard supports multiply/params effects only");
      if (e.param === "core.burnSpeed") burnMul = e.value;
      else if (e.param === "core.safeRadiusScale") radiusScale = e.value;
      else throw new Error(`event.hazard: unsupported param ${e.param}`);
    }
  }

  const coreEnt = manifest.entities.find((e) => e.type === "sink.core");
  if (!coreEnt || coreEnt.type !== "sink.core") throw new Error("manifest has no core");
  const corePos = vec(coreEnt.at);
  const waitingZone = manifest.entities.find((e) => e.type === "zone.waiting");
  const waiting: Vec = waitingZone && waitingZone.type === "zone.waiting"
    ? { x: fp(waitingZone.rect[0] + waitingZone.rect[2] / 2), y: fp(waitingZone.rect[1] + waitingZone.rect[3] / 2) }
    : { x: corePos.x + fp(param("waiting.offsetX")), y: corePos.y + fp(param("waiting.offsetY")) };

  const gateEnt = manifest.entities.find((e) => e.type === "struct.gate" && "arrivals" in e && e.arrivals);
  const gate: Compiled["gate"] = gateEnt && gateEnt.type === "struct.gate" && gateEnt.arrivals
    ? {
      pos: vec(gateEnt.at), everyTicks: ticks(gateEnt.arrivals.every), total: gateEnt.arrivals.total,
      initialTicks: ticks(param("gate.initialDelay")), queueMax: int("gate.queueMax"), queueSpacing: fp(param("gate.queueSpacing")),
      queueOffsetY: fp(param("gate.queueOffsetY")), admitOffsetY: fp(param("gate.admitOffsetY")), admitRange: fp(param("gate.admitRange")),
      spawnSpread: fp(param("gate.spawnSpread")), spawnOffsetY: fp(param("gate.spawnOffsetY")),
    }
    : null;

  const waves: CompiledWave[] = manifest.waves.map((w) => {
    const types: string[] = [];
    for (const [type, n] of Object.entries(w.counts)) for (let i = 0; i < n; i++) types.push(type);
    const sides: CompiledWave["sides"] = w.side === undefined ? ["n"] : Array.isArray(w.side) ? [...w.side] : [w.side];
    return { tick: ticks(w.t), types, sides, gapTicks: ticks(w.gap ?? param("defense.spawnGap")) };
  });
  const objectives: CompiledObjective[] = manifest.objectives && manifest.objectives.length > 0
    ? manifest.objectives.map((o) => ({ id: o.id, kind: o.kind, params: { ...o.params } }))
    : [{ id: "main", kind: manifest.goal.type, params: goalParams(manifest.goal) }];
  const proteinRes = [...new Set(Object.values(c.animals).flatMap((a) => Object.keys(a.drops)))].sort();
  const events: CompiledEvent[] = manifest.events.map((e) => ({
    type: e.type, warnTick: ticks(e.warnAt), startTick: ticks(e.start), endTick: ticks(e.end),
  }));

  const entityById: Record<string, ManifestEntity> = {};
  for (const e of manifest.entities) if ("id" in e && e.id !== undefined) entityById[e.id] = e;

  const timerSeconds = param("timer.seconds");
  return {
    manifest,
    content: c,
    entityById,
    map: { w: fp(manifest.map.w), h: fp(manifest.map.h) },
    modules: new Set(manifest.modules),
    resources,
    player: {
      speed: perTick(param("player.speed")),
      radius: fp(param("player.radius")),
      actTicks: ticks(param("player.actInterval")),
      attackTicks: ticks(param("player.attackInterval")),
      attackRange: fp(param("player.attackRange")),
      attackDamage: int("player.attackDamage"),
    },
    core,
    nodes,
    animals,
    hostiles,
    lassoables,
    structures,
    upgrades,
    converters,
    roles,
    consumers,
    sales,
    housing: { base: int("housing.base"), perBuilding: int("housing.perBuilding") },
    lasso: {
      maxTowed: int("lasso.maxTowed"), speedPenalty: ratio(param("lasso.speedPenalty")), pointSpacing: fp(param("lasso.pointSpacing")),
      trailMax: int("lasso.trailMax"), closeDist: fp(param("lasso.closeDist")), minLoopPoints: int("lasso.minLoopPoints"),
      slackTicks: param("lasso.slackTime") > 0 ? ticks(param("lasso.slackTime")) : 0,
    },
    freeze: {
      graceTicks,
      decayPerTick: Math.max(1, Math.ceil(1000 / ticks(param("freeze.frostDecay")))),
      othersRate: ratio(param("freeze.othersRate")),
      othersCap: Math.round(param("freeze.othersCap") * 1000),
    },
    hazard: { burnMul, radiusScale },
    pads: {
      range: fp(param("pads.range")), bigRange: fp(param("pads.bigRange")),
      payItemTicks: ticks(param("pads.payItemInterval")), payCurrencyTicks: ticks(param("pads.payCurrencyInterval")),
      // Zero is allowed here (instant payment), unlike ticks(), which never goes below one.
      dwellTicks: Math.max(0, Math.round(param("pads.dwell") * TPS)),
    },
    level: { budgetSeconds: param("level.budgetSeconds"), budgetTicks: Math.max(1, Math.round(param("level.budgetSeconds") * TPS)) },
    residents: {
      idleSpeed: perTick(param("residents.idleSpeed")), idleRadiusX: fp(param("residents.idleRadiusX")), idleRadiusY: fp(param("residents.idleRadiusY")),
      waitingSpeed: perTick(param("residents.waitingSpeed")), gateSpeed: perTick(param("residents.gateSpeed")), injuredSpeed: perTick(param("residents.injuredSpeed")),
      arrive: fp(param("residents.arrive")), workRange: fp(param("residents.workRange")), coreDeliverRange: fp(param("residents.coreDeliverRange")),
      seekDropRange: fp(param("residents.seekDropRange")),
    },
    waiting,
    gate,
    zones: { blockMargin: fp(param("zones.blockMargin")) },
    barrier: {
      thickness: fp(param("barrier.thickness")), buildRange: fp(param("barrier.buildRange")), buildTicks: ticks(param("barrier.buildInterval")),
      hp: c.structures["struct.barrier"]!.hp!, gateHp: c.structures["struct.gate"]!.hp!, costPerSection: int("barrier.costPerSection"),
    },
    drops: { pickupRange: fp(param("drops.pickupRange")), scatterX: fp(param("drops.scatterX")), scatterY: fp(param("drops.scatterY")) },
    convParams: {
      playerOperateRange: fp(param("converters.playerOperateRange")), operatorRange: fp(param("converters.operatorRange")),
      pickupRange: fp(param("converters.pickupRange")), hintRange: fp(param("converters.hintRange")),
    },
    defense: {
      spawnGapTicks: ticks(param("defense.spawnGap")), spawnY: fp(param("defense.spawnY")), spawnMarginX: fp(param("defense.spawnMarginX")),
      barrierStop: fp(param("defense.barrierStop")), barrierHitTicks: ticks(param("defense.barrierHitInterval")), barrierDamage: int("defense.barrierDamage"),
      baseRange: fp(param("defense.baseRange")), baseHitTicks: ticks(param("defense.baseHitInterval")), baseDamage: int("defense.baseDamage"),
      steerBand: fp(param("defense.steerBand")), steerRate: ratio(param("defense.steerRate")),
      dropRelocateBand: fp(param("defense.dropRelocateBand")), dropRelocateOffset: fp(param("defense.dropRelocateOffset")), postOffset: fp(param("defense.postOffset")),
      playerHitRange: fp(param("defense.playerHitRange")), playerHitTicks: ticks(param("defense.playerHitInterval")),
    },
    waves,
    objectives,
    proteinRes,
    events,
    baseHealth: int("meters.baseHealth"),
    conveyor: { speed: perTick(param("conveyor.speed")), everyTicks: ticks(param("conveyor.everySeconds")), capacity: int("conveyor.capacity"), gap: fp(param("conveyor.gap")) },
    routing: { hintFill: ratio(param("routing.hintFill")) },
    stats: { lifelineLow: ratio(param("stats.lifelineLow")), coreLowFill: ratio(param("stats.coreLowFill")) },
    timerTicks: timerSeconds > 0 ? ticks(timerSeconds) : 0,
  };
}

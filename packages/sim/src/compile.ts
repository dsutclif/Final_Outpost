import {
  content as defaultContent,
  checkManifest,
  Manifest as ManifestSchema,
  type Content,
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
  stock: number | null;
  regrowTicks: number | null;
}

export interface CompiledCustomerDef {
  patienceTicks: number;
  orderSize: "range" | "max_plus";
  orderExtra: number;
  pay: number;
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
  queueSpacing: number;
  queueMax: number;
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

export interface Compiled {
  manifest: Manifest;
  content: Content;
  map: { w: number; h: number };
  modules: Set<string>;
  resources: Record<string, CompiledResource>;
  player: { speed: number; radius: number; actTicks: number };
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
  sales: CompiledSales;
  housingBase: number;
  timerTicks: number;
}

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

  const resources: Record<string, CompiledResource> = {};
  for (const [id, r] of Object.entries(c.resources)) resources[id] = { cap: r.cap, price: r.price, category: r.category };

  const nodes: Record<string, CompiledNodeDef> = {};
  for (const [id, n] of Object.entries(c.nodes)) {
    nodes[id] = {
      yields: n.yields,
      range: fp(n.range),
      rateTicks: ticks(n.rate),
      stock: n.stock,
      regrowTicks: n.regrow === null ? null : ticks(n.regrow),
    };
  }

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
  const vec = ([x, y]: readonly [number, number]): Vec => ({ x: fp(x), y: fp(y) });
  const sales: CompiledSales = {
    range: fp(salesDef.range),
    shelfCap: salesDef.shelfCap,
    depositTicks: ticks(salesDef.depositInterval),
    registerOffset: vec(salesDef.registerOffset),
    registerRange: fp(salesDef.registerRange),
    pileOffset: vec(salesDef.pileOffset),
    pileRange: fp(salesDef.pileRange),
    queueOffset: vec(salesDef.queueOffset),
    queueSpacing: fp(salesDef.queueSpacing),
    queueMax: salesDef.queueMax,
    spawnTicks: ticks(param("customers.spawn")),
    jitterMin: ratio(param("customers.jitterMin")),
    jitterMax: ratio(param("customers.jitterMax")),
    initialDelayTicks: ticks(param("customers.initialDelay")),
    orderMin: Math.round(param("customers.orderMin")),
    orderMax: Math.round(param("customers.orderMax")),
    baseWeight: ratio(param("customers.baseWeight")),
    impatientShare: ratio(param("customers.impatientShare")),
    premiumShare: ratio(param("customers.premiumShare")),
    approach: Math.min(FP, Math.round((param("customers.approach") * FP) / TPS)),
    leaveX: perTick(param("customers.leaveSpeedX")),
    leaveY: perTick(param("customers.leaveSpeedY")),
    customers,
  };

  const timerSeconds = param("timer.seconds");
  return {
    manifest,
    content: c,
    map: { w: fp(manifest.map.w), h: fp(manifest.map.h) },
    modules: new Set(manifest.modules),
    resources,
    player: {
      speed: perTick(param("player.speed")),
      radius: fp(param("player.radius")),
      actTicks: ticks(param("player.actInterval")),
    },
    core,
    nodes,
    sales,
    housingBase: Math.round(param("housing.base")),
    timerTicks: timerSeconds > 0 ? ticks(timerSeconds) : 0,
  };
}

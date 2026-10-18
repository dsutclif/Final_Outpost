import { z } from "zod";

// Canonical ids: category.function, never how a thing looks. Skins supply names.
const idOf = (cat: string) => z.string().regex(new RegExp(`^${cat}\\.[a-z0-9_]+(\\.[a-z0-9_]+)*$`));
export const ResId = idOf("res");
// Typed as a template literal so manifest entity unions can still discriminate on `type`.
export type NodeId = `node.${string}`;
export const NodeId = z.custom<NodeId>((v) => typeof v === "string" && /^node\.[a-z0-9_]+$/.test(v), "node id");
export type ConvId = `conv.${string}`;
export const ConvId = z.custom<ConvId>((v) => typeof v === "string" && /^conv\.[a-z0-9_]+$/.test(v), "converter id");
export type StructId = `struct.${string}`;
export const StructId = z.custom<StructId>((v) => typeof v === "string" && /^struct\.[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(v), "struct id");
export type CaptureId = `capture.${string}`;
export const CaptureId = z.custom<CaptureId>((v) => typeof v === "string" && /^capture\.[a-z0-9_]+$/.test(v), "capture id");
// Registry keys stay plain strings, so the record is total rather than Partial.
const NodeKey = idOf("node");
const ConvKey = idOf("conv");
const StructKey = idOf("struct");
const CaptureKey = idOf("capture");
export const SinkId = idOf("sink");
export const RoleId = idOf("role");
export const MeterId = idOf("meter");
export const UnitId = idOf("unit");
export const HostileId = idOf("hostile");
export const EventId = idOf("event");
export const STORE_DEPOT = "store.depot";

const seconds = z.number().nonnegative();
const units = z.number().nonnegative();
const Offset = z.tuple([z.number(), z.number()]);

// ---------- Resources ----------
export const ResourceDef = z.object({
  // Backpack cap per type. null = not carried in the backpack (currency).
  cap: z.number().int().positive().nullable(),
  // Sale price at a sales point. 0 = not sellable.
  price: z.number().int().nonnegative(),
  // Category drives behaviour: customers buy food, the core burns fuel.
  category: z.enum(["material", "fuel", "food", "salvage", "currency"]),
});
export type ResourceDef = z.infer<typeof ResourceDef>;

// ---------- Nodes (gatherable sources) ----------
export const NodeDef = z.object({
  yields: ResId,
  // Player must be within this distance (units) to gather.
  range: units,
  // Seconds per item gathered by the player.
  rate: seconds,
  // Seconds per item gathered by a worker; falls back to the role's gatherInterval.
  workerRate: seconds.optional(),
  // Items held before the node is empty. null = infinite.
  stock: z.number().int().positive().nullable(),
  // Seconds to regrow one item. null = never (only with infinite stock).
  regrow: seconds.nullable(),
});
export type NodeDef = z.infer<typeof NodeDef>;

// ---------- Animals (roaming prey; hunted, not gathered) ----------
export const AnimalDef = z.object({
  hp: z.number().int().positive(),
  speedMin: units,
  speedMax: units,
  // Seconds between random heading changes.
  turnMin: seconds,
  turnMax: seconds,
  drops: z.record(ResId, z.number().int().positive()),
  respawn: seconds,
  // Spawn at least this far inside the roam zone.
  margin: units,
  // Hunters treat this animal as the same quarry as `variantOf` (a dangerous variant of the plain prey).
  variantOf: NodeId.optional(),
  // Dangerous animals: charge anyone (player or hunter) within aggroRange, bite at attackRange every
  // attackInterval. A hit knocks the top item off the player's stack knockDistance away and slows the
  // player to stunSlow (a 0..1 share of speed) for stun seconds and takes damage off player.hp (at 0 the
  // player is knocked down: the pack spills and they lie still for player.downSeconds); a hunter is
  // injured when injuresWorkers.
  aggroRange: units.default(0),
  chargeSpeed: units.default(0),
  attackRange: units.default(0),
  attackInterval: seconds.default(0),
  knockDistance: units.default(0),
  stun: seconds.default(0),
  stunSlow: z.number().min(0).max(1).default(1),
  damage: z.number().int().min(0).default(0),
  injuresWorkers: z.boolean().default(false),
});
export type AnimalDef = z.infer<typeof AnimalDef>;

// ---------- Hostiles ----------
export const HostileDef = z.object({
  hp: z.number().int().positive(),
  speed: units,
  drops: z.record(ResId, z.number().int().positive()),
  // Multiplies defense.baseDamage and defense.barrierDamage for this hostile's hits.
  damage: z.number().int().positive().default(1),
  // Bosses announce themselves with a boss_spawned event; renderers draw a health bar.
  boss: z.boolean().default(false),
});
export type HostileDef = z.infer<typeof HostileDef>;

// ---------- Lassoables ----------
export const LassoableDef = z.object({
  release: z.enum(["inSafeRadius"]),
  releaseTime: seconds,
  // "recruit": opens into a colonist after releaseTime; "bundle": pays `bundle` the moment it enters the safe radius.
  result: z.enum(["recruit", "bundle"]),
  bundle: z.record(ResId, z.number().int().positive()).optional(),
  towSpacing: units,
  // Seconds an idle or towed one survives before it is lost (pod_lost). 0 = never; a manifest entity can override.
  freezeTime: seconds.default(0),
});
export type LassoableDef = z.infer<typeof LassoableDef>;

// ---------- Effects: data operations applied when something is built or an event runs ----------
// scope "params": a named level parameter (state.params); "target": a field of the targeted structure;
// "barriers": a field of every barrier section (optionally only gates / only walls).
export const Effect = z.object({
  op: z.enum(["set", "add", "multiply"]),
  scope: z.enum(["params", "target", "barriers"]),
  param: z.string().optional(),
  field: z.enum(["level", "hp", "hpMax"]).optional(),
  // A number, or the key of a content param whose value is used.
  value: z.union([z.number(), z.string()]),
  gate: z.boolean().optional(),
});
export type Effect = z.infer<typeof Effect>;

// Default pad cost for the generator (pads in a manifest always state their own cost).
const DefaultCost = z.record(ResId, z.number().int().positive()).optional();

// ---------- Structures ----------
export const StructureDef = z.object({
  hp: z.number().int().positive().optional(),
  // Ranged defenses: one entry per tier (level 1 first).
  tiers: z.array(z.object({ range: units, rate: seconds })).optional(),
  damage: z.number().int().positive().optional(),
  // Medical: heal duration and where the patient stands.
  healTime: seconds.optional(),
  healOffset: Offset.optional(),
  // Depot: haulers' work range; the player uses its pads: one drop-off, one pickup per stored resource
  // (offsets from the building, taken in the order resources first arrive), each with padRange.
  range: units.optional(),
  padRange: units.optional(),
  dropOffset: Offset.optional(),
  pickupOffsets: z.array(Offset).optional(),
  effects: z.array(Effect).default([]),
  cost: DefaultCost,
});
export type StructureDef = z.infer<typeof StructureDef>;

// ---------- Upgrades ----------
export const UpgradeDef = z.object({
  // Structure type the upgrade's pad must target; absent for level-wide upgrades.
  target: StructKey.optional(),
  effects: z.array(Effect).min(1),
  cost: DefaultCost,
});
export type UpgradeDef = z.infer<typeof UpgradeDef>;

// ---------- Events ----------
export const EventDef = z.object({ effects: z.array(Effect).min(1) });
export type EventDef = z.infer<typeof EventDef>;

// ---------- Consumers (supply routing) ----------
export const ConsumerDef = z.object({
  priority: z.number().positive(),
  // Haulers stop delivering once stock reaches this share of capacity.
  targetFill: z.number().min(0).max(1),
  // Below this share of capacity a fuel-carrying hauler diverts to this consumer first.
  critical: z.number().min(0).max(1),
});
export type ConsumerDef = z.infer<typeof ConsumerDef>;

// ---------- Sinks (stations that consume a resource) ----------
export const CoreLevelDef = z.object({ fuelCap: z.number().int().positive(), safeRadius: units });
export const CoreDef = z.object({
  kind: z.literal("core"),
  range: units,
  // Fuel added per deposited item, keyed by resource.
  accepts: z.record(ResId, z.number().int().positive()),
  depositInterval: seconds,
  // Nobody can stand closer than this to the core.
  exclusionRadius: units,
  levels: z.array(CoreLevelDef).min(1),
  // Fuel granted on each level upgrade.
  upgradeFuelBonus: z.number().int().nonnegative(),
  produces: MeterId,
});
export const SalesPointDef = z.object({
  kind: z.literal("sales_point"),
  range: units,
  shelfCap: z.number().int().positive(),
  depositInterval: seconds,
  registerOffset: Offset,
  registerRange: units,
  pileOffset: Offset,
  pileRange: units,
  queueOffset: Offset,
  queueMax: z.number().int().positive(),
  // Offset from one queue slot to the next.
  queueStep: Offset,
});
export const SinkDef = z.discriminatedUnion("kind", [CoreDef, SalesPointDef]);
export type SinkDef = z.infer<typeof SinkDef>;
export type CoreDef = z.infer<typeof CoreDef>;
export type SalesPointDef = z.infer<typeof SalesPointDef>;

// ---------- Converters ----------
export const ConverterDef = z.object({
  inputs: z.array(ResId).min(1),
  output: ResId,
  rate: seconds,
  inCap: z.number().int().positive(),
  outCap: z.number().int().positive(),
  role: RoleId,
  range: units,
  operatorOffset: Offset,
  pickupOffset: Offset,
  // Seconds per output at level 2, 3, ...; a converter's max level is 1 + upgradeRates.length.
  upgradeRates: z.array(seconds.positive()).default([]),
});
export type ConverterDef = z.infer<typeof ConverterDef>;

// ---------- Roles (worker behaviour templates) ----------
export const RoleDef = z.object({
  behavior: z.enum(["gather_deliver", "stand_at", "collect_deliver", "hunt", "guard", "haul"]),
  speed: units,
  carry: z.number().int().positive().optional(),
  gatherInterval: seconds.optional(),
  deliverInterval: seconds.optional(),
  attackInterval: seconds.optional(),
  attackRange: units.optional(),
  damage: z.number().int().positive().optional(),
  cost: DefaultCost,
});
export type RoleDef = z.infer<typeof RoleDef>;

// ---------- Customers ----------
export const CustomerDef = z.object({
  patience: seconds,
  // "range": draw order size in [orderMin, orderMax]; "max_plus": orderMax + extra; "fixed": exactly orderExtra.
  orderSize: z.enum(["range", "max_plus", "fixed"]),
  orderExtra: z.number().int().nonnegative(),
  pay: z.number().int().positive(),
});
export type CustomerDef = z.infer<typeof CustomerDef>;

// ---------- Goals ----------
export const GoalDef = z.object({
  description: z.string(),
  // Module that this goal type exercises; the generator picks goals by it.
  exercises: z.string(),
});

// ---------- Objectives (star objectives and main goals) ----------
export const FAMILIES = ["shelter", "rescue", "harvest", "industrialize", "defend"] as const;
export const Family = z.enum(FAMILIES);
export type Family = z.infer<typeof Family>;
// Param kinds; a trailing "?" marks an optional param.
export const ObjectiveParamKind = z.enum(["int", "seconds", "pct", "res", "role", "struct", "pad", "int?", "seconds?", "pct?", "res?", "role?", "struct?", "pad?"]);
export const ObjectiveDef = z.object({
  description: z.string(),
  families: z.array(Family).default([]),
  // Can be a level's main goal (and so a manifest goal type).
  main: z.boolean(),
  // "Never" objectives: fail on the first breach, count as done at level end if never breached.
  guard: z.boolean().default(false),
  params: z.record(z.string(), ObjectiveParamKind).default({}),
});
export type ObjectiveDef = z.infer<typeof ObjectiveDef>;

// ---------- Modules ----------
export const ModuleDef = z.object({
  alwaysOn: z.boolean().default(false),
  requires: z.array(z.string()).default([]),
  excludes: z.array(z.string()).default([]),
  // Position in the v1 introduction order; null = always on.
  introducedAt: z.number().int().positive().nullable(),
});
export type ModuleDef = z.infer<typeof ModuleDef>;

// ---------- Params (behaviour tunables, overridable per manifest) ----------
export const ParamDefaults = z.record(z.string(), z.number());

// ---------- Whole content set ----------
export const Content = z.object({
  version: z.string(),
  resources: z.record(ResId, ResourceDef),
  nodes: z.record(NodeKey, NodeDef),
  animals: z.record(NodeKey, AnimalDef),
  sinks: z.record(SinkId, SinkDef),
  converters: z.record(ConvKey, ConverterDef),
  roles: z.record(RoleId, RoleDef),
  customers: z.record(UnitId, CustomerDef),
  hostiles: z.record(HostileId, HostileDef),
  lassoables: z.record(CaptureKey, LassoableDef),
  structures: z.record(StructKey, StructureDef),
  upgrades: z.record(StructKey, UpgradeDef),
  events: z.record(EventId, EventDef),
  consumers: z.record(z.string(), ConsumerDef),
  goals: z.record(z.string(), GoalDef),
  objectives: z.record(z.string(), ObjectiveDef),
  modules: z.record(z.string(), ModuleDef),
  defaults: ParamDefaults,
});
export type Content = z.infer<typeof Content>;

function checkEffect(c: Content, where: string, e: Effect): void {
  if (typeof e.value === "string" && !(e.value in c.defaults)) throw new Error(`${where}: effect value references unknown param ${e.value}`);
  if (e.scope === "params" && !e.param) throw new Error(`${where}: params effect needs a param`);
  if (e.scope !== "params" && !e.field) throw new Error(`${where}: ${e.scope} effect needs a field`);
}

/** Cross-reference checks zod cannot express. Throws on the first failure. */
export function checkContentRefs(c: Content): void {
  const res = new Set(Object.keys(c.resources));
  for (const [id, n] of Object.entries(c.nodes)) {
    if (!res.has(n.yields)) throw new Error(`node ${id} yields unknown resource ${n.yields}`);
    if (n.stock === null && n.regrow !== null) throw new Error(`node ${id}: infinite stock cannot regrow`);
    if (n.stock !== null && n.regrow === null) throw new Error(`node ${id}: finite stock needs a regrow time`);
    if (c.animals[id]) throw new Error(`${id} is both a node and an animal`);
  }
  for (const [id, a] of Object.entries(c.animals)) {
    for (const r of Object.keys(a.drops)) if (!res.has(r)) throw new Error(`animal ${id} drops unknown resource ${r}`);
    if (a.speedMax < a.speedMin || a.turnMax < a.turnMin) throw new Error(`animal ${id}: max below min`);
    if (a.variantOf !== undefined && !c.animals[a.variantOf]) throw new Error(`animal ${id}: variantOf unknown ${a.variantOf}`);
    if (a.aggroRange > 0 && (a.chargeSpeed <= 0 || a.attackRange <= 0 || a.attackInterval <= 0)) throw new Error(`animal ${id}: a dangerous animal needs chargeSpeed, attackRange and attackInterval`);
  }
  for (const [id, h] of Object.entries(c.hostiles)) {
    for (const r of Object.keys(h.drops)) if (!res.has(r)) throw new Error(`hostile ${id} drops unknown resource ${r}`);
  }
  for (const [id, l] of Object.entries(c.lassoables)) {
    if (l.result === "bundle" && (!l.bundle || Object.keys(l.bundle).length === 0)) throw new Error(`lassoable ${id}: bundle result needs a bundle`);
    for (const r of Object.keys(l.bundle ?? {})) if (!res.has(r)) throw new Error(`lassoable ${id} bundles unknown resource ${r}`);
  }
  const costs: [string, Record<string, number> | undefined][] = [
    ...Object.entries(c.structures).map(([id, s]) => [id, s.cost] as [string, Record<string, number> | undefined]),
    ...Object.entries(c.upgrades).map(([id, u]) => [id, u.cost] as [string, Record<string, number> | undefined]),
    ...Object.entries(c.roles).map(([id, r]) => [id, r.cost] as [string, Record<string, number> | undefined]),
  ];
  for (const [id, cost] of costs) for (const r of Object.keys(cost ?? {})) if (!res.has(r)) throw new Error(`${id} default cost uses unknown resource ${r}`);
  for (const g of Object.keys(c.goals)) if (!c.objectives[g]?.main) throw new Error(`goal type ${g} needs a main objective entry`);
  if (c.converters["conv.level"]) throw new Error("conv.level is a build operation, not a converter id");
  for (const [id, s] of Object.entries(c.sinks)) {
    if (s.kind === "core") for (const r of Object.keys(s.accepts)) if (!res.has(r)) throw new Error(`sink ${id} accepts unknown resource ${r}`);
  }
  for (const [id, cv] of Object.entries(c.converters)) {
    for (const r of cv.inputs) if (!res.has(r)) throw new Error(`converter ${id} input ${r} unknown`);
    if (!res.has(cv.output)) throw new Error(`converter ${id} output ${cv.output} unknown`);
    if (!c.roles[cv.role]) throw new Error(`converter ${id} role ${cv.role} unknown`);
  }
  for (const [id, s] of Object.entries(c.structures)) for (const e of s.effects) checkEffect(c, `structure ${id}`, e);
  for (const [id, u] of Object.entries(c.upgrades)) {
    if (c.structures[id]) throw new Error(`${id} is both a structure and an upgrade`);
    if (u.target !== undefined && !c.structures[u.target]) throw new Error(`upgrade ${id} targets unknown structure ${u.target}`);
    for (const e of u.effects) {
      checkEffect(c, `upgrade ${id}`, e);
      if (e.scope === "target" && u.target === undefined) throw new Error(`upgrade ${id}: target effect without a target type`);
    }
  }
  for (const [id, ev] of Object.entries(c.events)) for (const e of ev.effects) checkEffect(c, `event ${id}`, e);
  for (const id of Object.keys(c.consumers)) {
    if (!c.sinks[id] && !c.converters[id]) throw new Error(`consumer ${id} is neither a sink nor a converter`);
  }
  for (const [id, m] of Object.entries(c.modules)) {
    for (const d of [...m.requires, ...m.excludes]) if (!c.modules[d]) throw new Error(`module ${id} references unknown module ${d}`);
    if (m.excludes.some((e) => m.requires.includes(e))) throw new Error(`module ${id} both requires and excludes a module`);
  }
  if (!c.structures["struct.barrier"]?.hp || !c.structures["struct.gate"]?.hp) throw new Error("struct.barrier and struct.gate need hp");
}

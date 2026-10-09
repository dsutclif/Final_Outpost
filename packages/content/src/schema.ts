import { z } from "zod";

// Canonical ids: category.function, never how a thing looks. Skins supply names.
const idOf = (cat: string) => z.string().regex(new RegExp(`^${cat}\\.[a-z0-9_]+(\\.[a-z0-9_]+)*$`));
export const ResId = idOf("res");
// Typed as a template literal so manifest entity unions can still discriminate on `type`.
export type NodeId = `node.${string}`;
export const NodeId = z.custom<NodeId>((v) => typeof v === "string" && /^node\.[a-z0-9_]+$/.test(v), "node id");
// Registry keys stay plain strings, so the record is total rather than Partial.
const NodeKey = idOf("node");
export const SinkId = idOf("sink");
export const ConvId = idOf("conv");
export const RoleId = idOf("role");
export const StructId = idOf("struct");
export const MeterId = idOf("meter");
export const UnitId = idOf("unit");

const seconds = z.number().nonnegative();
const units = z.number().nonnegative();

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
  // Items held before the node is empty. null = infinite.
  stock: z.number().int().positive().nullable(),
  // Seconds to regrow one item. null = never (only with infinite stock).
  regrow: seconds.nullable(),
});
export type NodeDef = z.infer<typeof NodeDef>;

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
  registerOffset: z.tuple([z.number(), z.number()]),
  registerRange: units,
  pileOffset: z.tuple([z.number(), z.number()]),
  pileRange: units,
  queueOffset: z.tuple([z.number(), z.number()]),
  queueSpacing: units,
  queueMax: z.number().int().positive(),
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
  operatorOffset: z.tuple([z.number(), z.number()]),
  pickupOffset: z.tuple([z.number(), z.number()]),
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
});
export type RoleDef = z.infer<typeof RoleDef>;

// ---------- Customers ----------
export const CustomerDef = z.object({
  patience: seconds,
  // "range": draw order size in [orderMin, orderMax]; "max_plus": orderMax + extra.
  orderSize: z.enum(["range", "max_plus"]),
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
  sinks: z.record(SinkId, SinkDef),
  converters: z.record(ConvId, ConverterDef),
  roles: z.record(RoleId, RoleDef),
  customers: z.record(UnitId, CustomerDef),
  goals: z.record(z.string(), GoalDef),
  modules: z.record(z.string(), ModuleDef),
  defaults: ParamDefaults,
});
export type Content = z.infer<typeof Content>;

/** Cross-reference checks zod cannot express. Throws on the first failure. */
export function checkContentRefs(c: Content): void {
  const res = new Set(Object.keys(c.resources));
  for (const [id, n] of Object.entries(c.nodes)) {
    if (!res.has(n.yields)) throw new Error(`node ${id} yields unknown resource ${n.yields}`);
    if (n.stock === null && n.regrow !== null) throw new Error(`node ${id}: infinite stock cannot regrow`);
    if (n.stock !== null && n.regrow === null) throw new Error(`node ${id}: finite stock needs a regrow time`);
  }
  for (const [id, s] of Object.entries(c.sinks)) {
    if (s.kind === "core") for (const r of Object.keys(s.accepts)) if (!res.has(r)) throw new Error(`sink ${id} accepts unknown resource ${r}`);
  }
  for (const [id, cv] of Object.entries(c.converters)) {
    for (const r of cv.inputs) if (!res.has(r)) throw new Error(`converter ${id} input ${r} unknown`);
    if (!res.has(cv.output)) throw new Error(`converter ${id} output ${cv.output} unknown`);
    if (!c.roles[cv.role]) throw new Error(`converter ${id} role ${cv.role} unknown`);
  }
  for (const [id, m] of Object.entries(c.modules)) {
    for (const d of [...m.requires, ...m.excludes]) if (!c.modules[d]) throw new Error(`module ${id} references unknown module ${d}`);
    if (m.excludes.some((e) => m.requires.includes(e))) throw new Error(`module ${id} both requires and excludes a module`);
  }
}

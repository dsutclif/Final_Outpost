import { z } from "zod";
import { NodeId, ResId, RoleId, SinkId, StructId, MeterId, type Content } from "./schema.js";

const Point = z.tuple([z.number(), z.number()]);
const EntityRef = z.string().min(1);
const Cost = z.record(ResId, z.number().int().positive());

// A pad can require another pad to be done and/or a minimum core level.
export const Requirement = z.object({
  pad: EntityRef.optional(),
  coreLevel: z.number().int().positive().optional(),
});

const base = { id: EntityRef.optional(), at: Point };

export const CoreEntity = z.object({
  ...base,
  type: z.literal("sink.core"),
  params: z.object({ fuel: z.number().int().nonnegative(), level: z.number().int().positive().default(1) }),
});
export const NodeEntity = z.object({
  ...base,
  type: NodeId,
  // Disabled nodes exist on the map but cannot be gathered until a pad enables them (source gating).
  enabled: z.boolean().default(true),
});
export const SalesPointEntity = z.object({
  ...base,
  type: z.literal("sink.sales_point"),
  sells: z.array(ResId).min(1),
});
export const HirePad = z.object({
  ...base,
  id: EntityRef,
  type: z.literal("pad.hire"),
  cost: Cost,
  role: z.object({
    role: RoleId,
    from: NodeId.optional(),
    to: SinkId.optional(),
    // Bind the worker to one specific node entity (a fisher for pond 2).
    node: EntityRef.optional(),
  }),
  requires: Requirement.optional(),
  repeatable: z.boolean().default(false),
});
export const BuildPad = z.object({
  ...base,
  id: EntityRef,
  type: z.literal("pad.build"),
  cost: Cost,
  // What paying the pad does. struct.* places a building; the others are data operations.
  build: z.union([StructId, z.enum(["node.enable", "sink.core.level", "zone.clear"])]),
  target: EntityRef.optional(),
  requires: Requirement.optional(),
  repeatable: z.boolean().default(false),
  big: z.boolean().default(false),
});

export const Entity = z.union([CoreEntity, NodeEntity, SalesPointEntity, HirePad, BuildPad]);
export type Entity = z.infer<typeof Entity>;

export const Person = z.object({
  role: z.union([z.literal("idle"), RoleId]),
  from: NodeId.optional(),
  to: SinkId.optional(),
  node: EntityRef.optional(),
});

export const Goal = z.discriminatedUnion("type", [
  z.object({ type: z.literal("build"), target: EntityRef }),
  z.object({ type: z.literal("population"), n: z.number().int().positive() }),
  z.object({ type: z.literal("currency"), n: z.number().int().positive() }),
  z.object({ type: z.literal("waves") }),
  z.object({ type: z.literal("serve_premium"), n: z.number().int().positive() }),
]);
export type Goal = z.infer<typeof Goal>;

export const Rating = z.object({
  difficulty: z.number().min(0).max(1),
  botMargin: z.number(),
  botsPassed: z.array(z.string()),
});

export const SkinText = z.object({
  title: z.string(),
  goal: z.string(),
  tips: z.array(z.string()).default([]),
});

export const Manifest = z.object({
  id: z.string().min(1),
  seed: z.number().int().nonnegative(),
  engineVersion: z.string(),
  contentVersion: z.string(),
  map: z.object({ w: z.number().positive(), h: z.number().positive(), zones: z.array(z.string()).default([]) }),
  modules: z.array(z.string()).min(1),
  start: Point,
  entities: z.array(Entity),
  people: z.array(Person).default([]),
  params: z.record(z.string(), z.number()).default({}),
  goal: Goal,
  fail: z.array(MeterId).min(1),
  rating: Rating.optional(),
  // Player-facing text per skin id. Never read by the sim.
  text: z.record(z.string(), SkinText).default({}),
});
export type Manifest = z.infer<typeof Manifest>;

/** Validate references between a manifest and the content set. Throws on the first failure. */
export function checkManifest(m: Manifest, c: Content): void {
  for (const mod of m.modules) if (!c.modules[mod]) throw new Error(`${m.id}: unknown module ${mod}`);
  const active = new Set(m.modules);
  for (const [id, def] of Object.entries(c.modules)) {
    if (def.alwaysOn && !active.has(id)) throw new Error(`${m.id}: module ${id} is always on but missing`);
    if (!active.has(id)) continue;
    for (const r of def.requires) if (!active.has(r)) throw new Error(`${m.id}: module ${id} requires ${r}`);
    for (const e of def.excludes) if (active.has(e)) throw new Error(`${m.id}: module ${id} excludes ${e}`);
  }
  const ids = new Map<string, Entity>();
  for (const e of m.entities) {
    if (e.id !== undefined) {
      if (ids.has(e.id)) throw new Error(`${m.id}: duplicate entity id ${e.id}`);
      ids.set(e.id, e);
    }
    if (e.type.startsWith("node.") && !c.nodes[e.type]) throw new Error(`${m.id}: unknown node type ${e.type}`);
    if (e.type === "sink.sales_point") for (const r of e.sells) if (!c.resources[r]) throw new Error(`${m.id}: sells unknown ${r}`);
    if (e.type === "pad.hire" || e.type === "pad.build") {
      for (const r of Object.keys(e.cost)) if (!c.resources[r]) throw new Error(`${m.id}: pad ${e.id} costs unknown ${r}`);
    }
    if (e.type === "pad.hire" && !c.roles[e.role.role]) throw new Error(`${m.id}: pad ${e.id} hires unknown role ${e.role.role}`);
  }
  const cores = m.entities.filter((e) => e.type === "sink.core");
  if (cores.length !== 1) throw new Error(`${m.id}: exactly one sink.core required, found ${cores.length}`);
  for (const e of m.entities) {
    if (e.type !== "pad.hire" && e.type !== "pad.build") continue;
    const req = e.requires?.pad;
    if (req !== undefined && !ids.has(req)) throw new Error(`${m.id}: pad ${e.id} requires unknown pad ${req}`);
    if (e.type === "pad.hire" && e.role.node !== undefined && !ids.has(e.role.node)) throw new Error(`${m.id}: pad ${e.id} binds unknown node ${e.role.node}`);
    if (e.type === "pad.build" && e.target !== undefined && !ids.has(e.target)) throw new Error(`${m.id}: pad ${e.id} targets unknown entity ${e.target}`);
  }
  if (m.goal.type === "build" && !ids.has(m.goal.target)) throw new Error(`${m.id}: goal targets unknown pad ${m.goal.target}`);
  for (const k of Object.keys(m.params)) if (!(k in c.defaults)) throw new Error(`${m.id}: param ${k} has no content default`);
}

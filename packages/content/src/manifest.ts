import { z } from "zod";
import {
  CaptureId, ConvId, EventId, HostileId, MeterId, NodeId, ResId, RoleId, SinkId, StructId, STORE_DEPOT,
  type Content,
} from "./schema.js";

const Point = z.tuple([z.number(), z.number()]);
const Rect = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);
const EntityRef = z.string().min(1);
const Cost = z.record(ResId, z.number().int().positive());

// Where a worker takes from and delivers to. Nodes and animals share the node.* namespace.
export const SourceRef = z.union([NodeId, ConvId, z.literal(STORE_DEPOT)]);
export const TargetRef = z.union([SinkId, ConvId, z.literal(STORE_DEPOT)]);

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
export const RoleBinding = z.object({
  role: RoleId,
  from: SourceRef.optional(),
  to: TargetRef.optional(),
  // Bind the worker to one specific node entity (a fisher for pond 2).
  node: EntityRef.optional(),
});
export const HirePad = z.object({
  ...base,
  id: EntityRef,
  type: z.literal("pad.hire"),
  cost: Cost,
  role: RoleBinding,
  requires: Requirement.optional(),
  repeatable: z.boolean().default(false),
});
export const BuildPad = z.object({
  ...base,
  id: EntityRef,
  type: z.literal("pad.build"),
  cost: Cost,
  // What paying the pad does. struct.* places a structure or applies an upgrade, conv.* places a
  // converter; the others are data operations on a target entity.
  build: z.union([StructId, ConvId, z.enum(["node.enable", "sink.core.level", "zone.clear"])]),
  target: EntityRef.optional(),
  requires: Requirement.optional(),
  repeatable: z.boolean().default(false),
  big: z.boolean().default(false),
});
// A pre-placed converter or structure.
export const ConverterEntity = z.object({ ...base, type: ConvId });
export const StructureEntity = z.object({
  ...base,
  type: StructId,
  // struct.gate only: recruits arrive here on a timer and queue until the player admits them.
  arrivals: z.object({ every: z.number().positive(), total: z.number().int().positive() }).optional(),
});
export const CaptureEntity = z.object({ ...base, type: CaptureId });
// Barrier lines: contiguous sections, each built by walking along it with the line's resource.
export const BarrierSection = z.object({
  a: Point,
  b: Point,
  gate: z.boolean().default(false),
  prebuilt: z.boolean().default(false),
});
export const BarrierLineEntity = z.object({
  id: EntityRef,
  type: z.literal("barrier.line"),
  res: ResId,
  costPerSection: z.number().int().positive(),
  sections: z.array(BarrierSection).min(1),
});
export const ZoneEntity = z.object({
  id: EntityRef,
  type: z.enum(["zone.blocked", "zone.waiting"]),
  rect: Rect,
});
export const PreyZoneEntity = z.object({
  id: EntityRef,
  type: z.literal("zone.prey"),
  rect: Rect,
  animal: NodeId,
  n: z.number().int().positive(),
});

export const Entity = z.union([
  CoreEntity, NodeEntity, SalesPointEntity, HirePad, BuildPad, ConverterEntity, StructureEntity,
  CaptureEntity, BarrierLineEntity, ZoneEntity, PreyZoneEntity,
]);
export type Entity = z.infer<typeof Entity>;

export const Person = z.object({
  role: z.union([z.literal("idle"), RoleId]),
  from: SourceRef.optional(),
  to: TargetRef.optional(),
  node: EntityRef.optional(),
});

export const Wave = z.object({ t: z.number().nonnegative(), counts: z.record(HostileId, z.number().int().positive()) });
export const LevelEvent = z.object({
  type: EventId,
  warnAt: z.number().nonnegative(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
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
  waves: z.array(Wave).default([]),
  events: z.array(LevelEvent).default([]),
  params: z.record(z.string(), z.number()).default({}),
  goal: Goal,
  fail: z.array(MeterId).min(1),
  rating: Rating.optional(),
  // Player-facing text per skin id. Never read by the sim.
  text: z.record(z.string(), SkinText).default({}),
});
export type Manifest = z.infer<typeof Manifest>;

const isHire = (e: Entity): e is z.infer<typeof HirePad> => e.type === "pad.hire";
const isBuild = (e: Entity): e is z.infer<typeof BuildPad> => e.type === "pad.build";

/** Validate references between a manifest and the content set. Throws on the first failure. */
export function checkManifest(m: Manifest, c: Content): void {
  const fail = (msg: string): never => { throw new Error(`${m.id}: ${msg}`); };
  for (const mod of m.modules) if (!c.modules[mod]) fail(`unknown module ${mod}`);
  const active = new Set(m.modules);
  for (const [id, def] of Object.entries(c.modules)) {
    if (def.alwaysOn && !active.has(id)) fail(`module ${id} is always on but missing`);
    if (!active.has(id)) continue;
    for (const r of def.requires) if (!active.has(r)) fail(`module ${id} requires ${r}`);
    for (const e of def.excludes) if (active.has(e)) fail(`module ${id} excludes ${e}`);
  }

  const ids = new Map<string, Entity>();
  for (const e of m.entities) {
    const id = "id" in e ? e.id : undefined;
    if (id !== undefined) {
      if (ids.has(id)) fail(`duplicate entity id ${id}`);
      ids.set(id, e);
    }
  }
  const padBuilds = new Map<string, string>(); // pad id -> what it builds
  const checkBinding = (where: string, b: z.infer<typeof RoleBinding> | z.infer<typeof Person>) => {
    if (b.role === "idle") return;
    const role = c.roles[b.role];
    if (!role) return fail(`${where} has unknown role ${b.role}`);
    if (b.from !== undefined) {
      if (b.from === STORE_DEPOT) { /* haulers take from the depot */ }
      else if (b.from.startsWith("node.")) { if (!c.nodes[b.from] && !c.animals[b.from]) fail(`${where} takes from unknown ${b.from}`); }
      else if (!c.converters[b.from]) fail(`${where} takes from unknown ${b.from}`);
    }
    if (b.to !== undefined && b.to !== STORE_DEPOT && !c.sinks[b.to] && !c.converters[b.to]) fail(`${where} delivers to unknown ${b.to}`);
    if (b.node !== undefined) {
      const n = ids.get(b.node);
      if (!n || !n.type.startsWith("node.")) fail(`${where} binds unknown node ${b.node}`);
    }
    if (role.behavior === "gather_deliver" && (b.from === undefined || b.to === undefined)) fail(`${where}: gather_deliver roles need from and to`);
    if (role.behavior === "collect_deliver" && (b.from === undefined || b.to === undefined)) fail(`${where}: collect_deliver roles need from and to`);
    if (role.behavior === "hunt" && (b.from === undefined || !c.animals[b.from])) fail(`${where}: hunt roles need an animal in from`);
    if (role.behavior === "haul" && b.from !== STORE_DEPOT) fail(`${where}: haul roles take from ${STORE_DEPOT}`);
    if (b.to === STORE_DEPOT && !m.entities.some((e) => isBuild(e) && e.build === "struct.depot") && !m.entities.some((e) => e.type === "struct.depot")) fail(`${where} delivers to a depot the level never builds`);
  };

  let barrierLines = 0;
  for (const e of m.entities) {
    switch (e.type) {
      case "sink.core": break;
      case "sink.sales_point":
        for (const r of e.sells) if (!c.resources[r]) fail(`sells unknown ${r}`);
        break;
      case "pad.hire":
        for (const r of Object.keys(e.cost)) if (!c.resources[r]) fail(`pad ${e.id} costs unknown ${r}`);
        checkBinding(`pad ${e.id}`, e.role);
        break;
      case "pad.build": {
        for (const r of Object.keys(e.cost)) if (!c.resources[r]) fail(`pad ${e.id} costs unknown ${r}`);
        const b = e.build;
        padBuilds.set(e.id, b);
        if (b === "node.enable") {
          const t = e.target !== undefined ? ids.get(e.target) : undefined;
          if (!t || !t.type.startsWith("node.") || !c.nodes[t.type]) fail(`pad ${e.id} must target a node to enable`);
        } else if (b === "zone.clear") {
          const t = e.target !== undefined ? ids.get(e.target) : undefined;
          if (!t || t.type !== "zone.blocked") fail(`pad ${e.id} must target a zone.blocked`);
        } else if (b === "sink.core.level") {
          // nothing to target
        } else if (b.startsWith("conv.")) {
          if (!c.converters[b]) fail(`pad ${e.id} builds unknown converter ${b}`);
        } else if (c.upgrades[b]) {
          const up = c.upgrades[b]!;
          if (up.target !== undefined) {
            const t = e.target !== undefined ? ids.get(e.target) : undefined;
            const builds = t && isBuild(t) ? t.build : t?.type;
            if (builds !== up.target) fail(`pad ${e.id} upgrade ${b} must target a pad or entity of type ${up.target}`);
          }
        } else if (!c.structures[b]) fail(`pad ${e.id} builds unknown ${b}`);
        if (e.repeatable && b !== "sink.core.level" && !c.structures[b] && !c.upgrades[b]) fail(`pad ${e.id} cannot repeat ${b}`);
        break;
      }
      case "barrier.line": {
        barrierLines++;
        if (!c.resources[e.res]) fail(`barrier ${e.id} uses unknown resource ${e.res}`);
        if (!e.sections.some((s) => s.gate)) fail(`barrier ${e.id} needs at least one gate section`);
        for (let i = 1; i < e.sections.length; i++) {
          const prev = e.sections[i - 1]!, cur = e.sections[i]!;
          if (prev.b[0] !== cur.a[0] || prev.b[1] !== cur.a[1]) fail(`barrier ${e.id} section ${i} is not contiguous`);
        }
        for (const s of e.sections) if (s.a[0] === s.b[0] && s.a[1] === s.b[1]) fail(`barrier ${e.id} has a zero-length section`);
        break;
      }
      case "zone.blocked":
      case "zone.waiting":
        break;
      case "zone.prey":
        if (!c.animals[e.animal]) fail(`zone ${e.id} roams unknown animal ${e.animal}`);
        break;
      default: {
        const t: string = e.type;
        if (t.startsWith("node.")) { if (!c.nodes[t]) fail(`unknown node type ${t}`); }
        else if (t.startsWith("conv.")) { if (!c.converters[t]) fail(`unknown converter type ${t}`); }
        else if (t.startsWith("struct.")) {
          if (!c.structures[t]) fail(`unknown structure type ${t}`);
          if ("arrivals" in e && e.arrivals && t !== "struct.gate") fail(`only struct.gate takes arrivals`);
        }
        else if (t.startsWith("capture.")) { if (!c.lassoables[t]) fail(`unknown lassoable ${t}`); }
        else fail(`unknown entity type ${t}`);
      }
    }
  }
  const cores = m.entities.filter((e) => e.type === "sink.core");
  if (cores.length !== 1) fail(`exactly one sink.core required, found ${cores.length}`);
  const waiting = m.entities.filter((e) => e.type === "zone.waiting");
  if (waiting.length > 1) fail(`at most one zone.waiting`);
  const gates = m.entities.filter((e) => e.type === "struct.gate" && "arrivals" in e && e.arrivals);
  if (gates.length > 1) fail(`at most one arrivals gate`);

  for (const e of m.entities) {
    if (!isHire(e) && !isBuild(e)) continue;
    const req = e.requires?.pad;
    if (req !== undefined && !padBuilds.has(req) && !m.entities.some((x) => isHire(x) && x.id === req)) fail(`pad ${e.id} requires unknown pad ${req}`);
    if (isBuild(e) && e.target !== undefined && !ids.has(e.target)) fail(`pad ${e.id} targets unknown entity ${e.target}`);
  }
  for (const [k, p] of m.people.entries()) checkBinding(`person ${k}`, p);
  for (const w of m.waves) for (const h of Object.keys(w.counts)) if (!c.hostiles[h]) fail(`wave spawns unknown hostile ${h}`);
  for (const ev of m.events) {
    if (!c.events[ev.type]) fail(`unknown event ${ev.type}`);
    if (!(ev.warnAt <= ev.start && ev.start < ev.end)) fail(`event ${ev.type} must have warnAt <= start < end`);
  }
  if (active.has("defense") && (m.waves.length === 0 || barrierLines === 0)) fail(`defense needs waves and a barrier line`);
  if (active.has("hazard_events") && m.events.length === 0) fail(`hazard_events needs at least one event`);
  if (active.has("hunting") && !m.entities.some((e) => e.type === "zone.prey")) fail(`hunting needs a zone.prey`);
  if (active.has("lasso") && !m.entities.some((e) => e.type.startsWith("capture."))) fail(`lasso needs a lassoable`);
  if (active.has("barrier_lines") && barrierLines === 0) fail(`barrier_lines needs a barrier.line`);
  if (!active.has("barrier_lines") && barrierLines > 0) fail(`barrier.line entities need the barrier_lines module`);
  if (m.fail.includes("meter.base_health") && !active.has("defense")) fail(`meter.base_health only fails with defense`);
  if (m.goal.type === "build") {
    const t = ids.get(m.goal.target);
    if (!t || !isBuild(t)) fail(`goal targets unknown pad ${m.goal.target}`);
  }
  if (m.goal.type === "waves" && m.waves.length === 0) fail(`waves goal needs waves`);
  for (const k of Object.keys(m.params)) if (!(k in c.defaults)) fail(`param ${k} has no content default`);
}

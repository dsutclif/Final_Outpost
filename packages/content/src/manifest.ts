import { z } from "zod";
import {
  CaptureId, ConvId, EventId, Family, HostileId, MeterId, NodeId, ResId, RoleId, SinkId, StructId, STORE_DEPOT,
  type Content,
} from "./schema.js";

const Point = z.tuple([z.number(), z.number()]);
const Rect = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);
const EntityRef = z.string().min(1);
const Cost = z.record(ResId, z.number().int().positive());

// Where a worker takes from and delivers to. Nodes and animals share the node.* namespace.
export const SourceRef = z.union([NodeId, ConvId, z.literal(STORE_DEPOT)]);
export const TargetRef = z.union([SinkId, ConvId, z.literal(STORE_DEPOT)]);

// A pad can require another pad to be done, a minimum core level, and/or that many attack waves to
// have started (turret sockets that open as the waves grow, Batch 3).
export const Requirement = z.object({
  pad: EntityRef.optional(),
  coreLevel: z.number().int().positive().optional(),
  wave: z.number().int().positive().optional(),
});

const base = { id: EntityRef.optional(), at: Point };

export const CoreEntity = z.object({
  ...base,
  type: z.literal("sink.core"),
  // lit: false starts the core dark: no burn and no reactor-out countdown until its first fuel lights it.
  params: z.object({ fuel: z.number().int().nonnegative(), level: z.number().int().positive().default(1), lit: z.boolean().optional() }),
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
  // Waypoints from the map edge to the back of the line, around structures and through a gate (generator).
  route: z.array(Point).optional(),
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
  // First hire of its job kind: hidden until the player has done that job by hand (docs/ECONOMY-PLAN.md).
  manual: z.boolean().optional(),
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
  // "conv.level" raises the targeted converter one level (content `upgradeRates`).
  build: z.union([StructId, ConvId, z.enum(["node.enable", "sink.core.level", "zone.clear", "conv.level"])]),
  target: EntityRef.optional(),
  requires: Requirement.optional(),
  repeatable: z.boolean().default(false),
  big: z.boolean().default(false),
  // Where the structure stands once built, when not on the pad itself: a wall tower's site is a
  // post on its barrier line while the pad sits just inside the wall (R3 item 18).
  site: Point.optional(),
  // struct.conveyor: the belt's source (a converter type or store.depot) and target (a converter
  // type, sink.sales_point, sink.core or store.depot), looked up by type like worker roles.
  link: z.object({ from: z.string(), to: z.string() }).optional(),
});
// A pre-placed converter or structure.
export const ConverterEntity = z.object({ ...base, type: ConvId });
export const StructureEntity = z.object({
  ...base,
  type: StructId,
  // struct.gate only: recruits arrive here on a timer and queue until the player admits them.
  arrivals: z.object({ every: z.number().positive(), total: z.number().int().positive() }).optional(),
});
export const CaptureEntity = z.object({
  ...base,
  type: CaptureId,
  // Seconds before it freezes over and is lost; overrides the lassoable's freezeTime (0 = never).
  freeze: z.number().nonnegative().optional(),
  // Story pods: the recruit starts this job on release (no hire pad), or the pod opens empty and
  // never counts as a rescue. Recruit lassoables only.
  joins: RoleBinding.optional(),
  decoy: z.boolean().optional(),
});
// Barrier lines: contiguous sections, each built by walking along it with the line's resource.
export const BarrierSection = z.object({
  a: Point,
  b: Point,
  gate: z.boolean().default(false),
  prebuilt: z.boolean().default(false),
});
/**
 * A ring or open polyline given as points instead of sections: `points` are the vertices, a
 * section joins each consecutive pair (and the last back to the first when `closed`), and
 * `gates` / `prebuilt` list section indices. Normalised to `sections` before validation.
 */
function ringToSections(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (o.type !== "barrier.line" || o.sections !== undefined || !Array.isArray(o.points)) return v;
  const pts = o.points as unknown[];
  const closed = o.closed === true;
  const gates = new Set(Array.isArray(o.gates) ? o.gates as unknown[] : []);
  const pre = new Set(Array.isArray(o.prebuilt) ? o.prebuilt as unknown[] : []);
  const n = closed ? pts.length : pts.length - 1;
  const sections = [];
  for (let i = 0; i < n; i++) sections.push({ a: pts[i], b: pts[(i + 1) % pts.length], gate: gates.has(i), prebuilt: pre.has(i) });
  return { ...o, sections };
}
export const BarrierLineEntity = z.preprocess(ringToSections, z.object({
  id: EntityRef,
  type: z.literal("barrier.line"),
  res: ResId,
  // Defaults to the content param barrier.costPerSection.
  costPerSection: z.number().int().positive().optional(),
  sections: z.array(BarrierSection).min(1),
  // A closed line is a ring: the last section ends where the first begins, and "outside" means outside the polygon.
  closed: z.boolean().optional(),
  points: z.array(Point).optional(),
  gates: z.array(z.number().int().nonnegative()).optional(),
  prebuilt: z.array(z.number().int().nonnegative()).optional(),
}));
export const ZoneEntity = z.object({
  id: EntityRef,
  type: z.enum(["zone.blocked", "zone.waiting"]),
  rect: Rect,
});
/** Impassable ground that never clears (a ridge, rock outcrop or chasm): routes bend around it. One rect per entity; an L-shaped ridge is two. */
export const TERRAIN_KINDS = ["ridge", "outcrop", "chasm"] as const;
export const TerrainEntity = z.object({
  id: EntityRef,
  type: z.literal("zone.terrain"),
  kind: z.enum(TERRAIN_KINDS).default("ridge"),
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
  CaptureEntity, BarrierLineEntity, ZoneEntity, TerrainEntity, PreyZoneEntity,
]);
export type Entity = z.infer<typeof Entity>;

export const Person = z.object({
  role: z.union([z.literal("idle"), RoleId]),
  from: SourceRef.optional(),
  to: TargetRef.optional(),
  node: EntityRef.optional(),
});

export const SIDES = ["n", "e", "s", "w"] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;
export const Wave = z.object({
  t: z.number().nonnegative(),
  counts: z.record(HostileId, z.number().int().positive()),
  // Map edge(s) the wave attacks from; with a list, spawn k comes from side k mod length. Default "n".
  side: z.union([Side, z.array(Side).min(1)]).optional(),
  // Seconds between spawns; defaults to defense.spawnGap.
  gap: z.number().positive().optional(),
  // Boss-flag hostiles of this wave break off at this percent of their hp and walk back to their edge.
  bossRetreat: z.number().int().min(1).max(99).optional(),
});
export const LevelEvent = z.object({
  type: EventId,
  warnAt: z.number().nonnegative(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
});

/** Goal types added for the level families; each is a main objective kind in content/data/objectives.json. */
export const FAMILY_GOAL_TYPES = [
  "core_level", "build_count", "hazard_survive", "heat_hold", "fuel_full", "admit", "clear_zones", "house_all", "survive",
  "rescue", "rescue_all", "tow_trip", "rescue_before_freeze", "hunt", "protein", "rescue_housed", "tow_full_trip", "crates",
  "sell", "earn", "unlock", "shelves_full", "streak", "sell_each", "hire", "earn_within", "bulk_order",
  "produce", "converters_running", "haul", "chain", "automate", "stockpile", "converter_level",
  "waves_survived", "kills", "boss", "turret_level", "salvage", "perimeter_before_wave1",
] as const;
const PosInt = z.number().int().positive();
/** Params an objective or family goal may carry; which ones a kind needs is data (objectives.json). */
export const GoalParams = {
  n: PosInt.optional(),
  k: PosInt.optional(),
  target: EntityRef.optional(),
  res: ResId.optional(),
  role: RoleId.optional(),
  build: StructId.optional(),
  pct: z.number().min(0).max(100).optional(),
  seconds: z.number().positive().optional(),
};
export const Goal = z.union([
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("build"), target: EntityRef }),
    z.object({ type: z.literal("population"), n: PosInt }),
    z.object({ type: z.literal("currency"), n: PosInt }),
    z.object({ type: z.literal("waves") }),
    z.object({ type: z.literal("serve_premium"), n: PosInt }),
  ]),
  z.object({ type: z.enum(FAMILY_GOAL_TYPES), ...GoalParams }),
]);
export type Goal = z.infer<typeof Goal>;

/** A named star objective. The first one of a level is its main goal and mirrors `goal`. */
export const Objective = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  params: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  label: z.string().optional(),
});
export type Objective = z.infer<typeof Objective>;

/** A goal as objective params: every field but `type`. */
export function goalParams(g: Goal): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(g)) if (k !== "type" && v !== undefined) out[k] = v as number | string;
  return out;
}

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
  // Level family (REDESIGN-R2 §5) and three star objectives; the first mirrors `goal`.
  family: Family.optional(),
  objectives: z.array(Objective).optional(),
  fail: z.array(MeterId).min(1),
  rating: Rating.optional(),
  // Client only, never read by the sim: "always" shows the guide arrow from the first tick (story
  // levels); "night" lighting for the 3D renderer.
  guide: z.literal("always").optional(),
  lighting: z.enum(["day", "night"]).optional(),
  // Player-facing text per skin id. Never read by the sim.
  text: z.record(z.string(), SkinText).default({}),
});
export type Manifest = z.infer<typeof Manifest>;

const isHire = (e: Entity): e is z.infer<typeof HirePad> => e.type === "pad.hire";
const isBuild = (e: Entity): e is z.infer<typeof BuildPad> => e.type === "pad.build";

/** Validate references between a manifest and the content set. Throws on the first failure. */
export function checkManifest(m: Manifest, c: Content): void {
  const fail = (msg: string): never => { throw new Error(`${m.id}: ${msg}`); };
  // Objective kinds and their params are data (objectives.json); main goals must be main-capable kinds.
  const checkObjective = (where: string, kind: string, params: Record<string, number | string>, main: boolean): void => {
    const def = c.objectives[kind];
    if (!def) return fail(`${where}: unknown objective kind ${kind}`);
    if (main && !def.main) fail(`${where}: ${kind} cannot be a main goal`);
    for (const k of Object.keys(params)) if (!(k in def.params)) fail(`${where}: ${kind} takes no param ${k}`);
    for (const [k, spec] of Object.entries(def.params)) {
      const v = params[k];
      if (v === undefined) { if (!spec.endsWith("?")) fail(`${where}: ${kind} needs param ${k}`); continue; }
      const t = spec.replace("?", "");
      const ok = typeof v === "number"
        ? (t === "int" && Number.isInteger(v) && v > 0) || (t === "seconds" && v > 0) || (t === "pct" && v >= 0 && v <= 100)
        : (t === "res" && c.resources[v] !== undefined) || (t === "role" && c.roles[v] !== undefined)
          || (t === "struct" && c.structures[v] !== undefined) || (t === "pad" && m.entities.some((e) => isBuild(e) && e.id === v));
      if (!ok) fail(`${where}: param ${k} of ${kind} must be a valid ${t}`);
    }
  };
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
        if (b === "conv.level") {
          const t = e.target !== undefined ? ids.get(e.target) : undefined;
          const conv: string | undefined = t && isBuild(t) ? t.build : t?.type;
          if (!conv || !conv.startsWith("conv.") || conv === "conv.level" || !c.converters[conv]) fail(`pad ${e.id} must target a converter or a pad that builds one`);
          else if (c.converters[conv]!.upgradeRates.length === 0) fail(`pad ${e.id}: ${conv} has no upgrade levels`);
        } else if (b === "node.enable") {
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
        if (e.repeatable && b !== "sink.core.level" && b !== "conv.level" && !c.structures[b] && !c.upgrades[b]) fail(`pad ${e.id} cannot repeat ${b}`);
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
        if (e.closed) {
          const first = e.sections[0]!, last = e.sections[e.sections.length - 1]!;
          if (e.sections.length < 3 || last.b[0] !== first.a[0] || last.b[1] !== first.a[1]) fail(`barrier ${e.id} is closed but does not form a ring`);
        }
        for (const i of [...(e.gates ?? []), ...(e.prebuilt ?? [])]) if (i >= e.sections.length) fail(`barrier ${e.id} names section ${i}, which does not exist`);
        break;
      }
      case "zone.blocked":
      case "zone.waiting":
      case "zone.terrain":
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
        else if (t.startsWith("capture.")) {
          if (!c.lassoables[t]) fail(`unknown lassoable ${t}`);
          const cap = e as z.infer<typeof CaptureEntity>;
          if ((cap.joins || cap.decoy) && c.lassoables[t]!.result !== "recruit") fail(`${t}: joins and decoy need a recruit lassoable`);
          if (cap.joins && cap.decoy) fail(`${t}: a decoy pod has nobody to join`);
          if (cap.joins) checkBinding(`capture ${cap.id ?? t}`, cap.joins);
        }
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
  for (const w of m.waves) if (w.bossRetreat !== undefined && !Object.keys(w.counts).some((h) => c.hostiles[h]?.boss)) fail(`bossRetreat needs a boss in its wave`);
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
  checkObjective("goal", m.goal.type, goalParams(m.goal), true);
  // Main goals that count something only a hazard or a wave produces need one scheduled.
  if (m.goal.type === "hazard_survive" && m.events.length === 0) fail(`hazard_survive goal needs events`);
  if (["waves_survived", "kills", "boss", "perimeter_before_wave1"].includes(m.goal.type) && m.waves.length === 0) fail(`${m.goal.type} goal needs waves`);
  if (m.goal.type === "boss" && !m.waves.some((w) => Object.keys(w.counts).some((h) => c.hostiles[h]?.boss))) fail(`boss goal needs a boss in a wave`);
  if (m.objectives !== undefined) {
    if (m.objectives.length !== 3) fail(`objectives must list exactly three (main goal first), found ${m.objectives.length}`);
    const seen = new Set<string>();
    m.objectives.forEach((o, i) => {
      if (seen.has(o.id)) fail(`duplicate objective id ${o.id}`);
      seen.add(o.id);
      checkObjective(`objective ${o.id}`, o.kind, o.params, i === 0);
    });
    const main = m.objectives[0];
    if (main) {
      const gp = goalParams(m.goal);
      const same = main.kind === m.goal.type && Object.keys(gp).length === Object.keys(main.params).length
        && Object.entries(gp).every(([k, v]) => main.params[k] === v);
      if (!same) fail(`objective ${main.id} must mirror the goal (${m.goal.type})`);
    }
  }
  for (const k of Object.keys(m.params)) if (!(k in c.defaults)) fail(`param ${k} has no content default`);
}

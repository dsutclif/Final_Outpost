import { content as defaultContent, CONTENT_VERSION, type Content } from "@fo/content";
import { LADDER, playBot, type BotProfile } from "@fo/bots";
import { createSim, salesLayout, ENGINE_VERSION } from "@fo/sim";
import genData from "../data/generator.json";
import { dist, segDist } from "./layout.js";
import { PAD_RADIUS, discPoints, hides, isUpgradePad, occludersAt, viewOf, type PadView, type Pt, type ViewEnt } from "./viewVisibility.js";

/**
 * Pads visible for their whole life (Doug, 2026-11-15): every pad must be on screen from the moment it appears until it is
 * fully spent. A spent pad no longer needs to be seen, so a building raised later may stand over where it was.
 *
 * - `padTimeline` plays the level with the bot ladder and records, per pad, when it appeared and when it was spent, and which
 *   pads had been paid by then. A pad no bot ever spent (or saw) gets every building that does not need it first.
 * - `lifetimeVisibility` measures each pad against the occluders that stand during its window (viewVisibility.occludersAt:
 *   buildings at their real size, nodes, the survivors' arrival gate; walls and wall-line gates are not counted).
 * - `repairPads` moves a hidden pad (with the pads stacked on its spot) around the building it belongs to, in one fixed order
 *   (see `candidates`): integer, rng-free, the same for the generator and the one-off level edit.
 */

export interface Manifest { id: string; map: { w: number; h: number }; start: Pt; entities: ViewEnt[]; params?: Record<string, unknown>; [k: string]: unknown }
export interface PadWindow { id: string; seen: boolean; /** Pads paid at the latest moment this pad was still unspent, over every run. */ paidBefore: Set<string> }

const padEnts = (m: Manifest) => m.entities.filter((e) => e.type.startsWith("pad.") && e.at);
const req = (e: ViewEnt) => (e["requires"] ?? {}) as { pad?: string; orPad?: string };

/** Pads that cannot appear before `id` is spent (they require it, directly or through other pads). */
export function dependents(m: Manifest, id: string): Set<string> {
  const out = new Set<string>([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of padEnts(m)) {
      const k = String(e.id), r = req(e);
      if (out.has(k) || !r.pad) continue;
      if (out.has(r.pad) && (!r.orPad || out.has(r.orPad))) { out.add(k); grew = true; }
    }
  }
  return out;
}

/**
 * Windows without playing (the generator's check): each pad may still be unspent while every pad that does not need it is
 * paid, whatever the order. A superset of what any run sees, so a layout clear here is clear for every play order.
 */
export function staticWindows(m: Manifest): Map<string, PadWindow> {
  const all = padEnts(m).map((e) => String(e.id));
  return new Map(all.map((id) => { const dep = dependents(m, id); return [id, { id, seen: true, paidBefore: new Set(all.filter((x) => !dep.has(x))) }]; }));
}

/** The ladder runs (seed 1 each) and what each pad saw: the default lifetime of a level's pads. */
export function padTimeline(m: Manifest, opts: { profiles?: readonly BotProfile[]; seeds?: readonly number[]; content?: Content } = {}): Map<string, PadWindow> {
  const pads = padEnts(m), all = pads.map((e) => String(e.id));
  const win = new Map<string, PadWindow>(all.map((id) => [id, { id, seen: false, paidBefore: new Set<string>() }]));
  const merge = (id: string, s: Iterable<string>) => { const w = win.get(id)!; for (const x of s) w.paidBefore.add(x); };
  for (const prof of opts.profiles ?? LADDER) for (const seed of opts.seeds ?? [1]) {
    const seen = new Set<string>(), spent = new Set<string>(), recorded = new Set<string>();
    playBot(m, prof, seed, {
      ...(opts.content ? { content: opts.content } : {}),
      onTick: (st) => {
        let changed = false;
        for (const p of st.pads) {
          if (p.visible && !seen.has(p.id)) { seen.add(p.id); win.get(p.id)!.seen = true; }
          if (p.done && !spent.has(p.id)) { spent.add(p.id); changed = true; }
        }
        // a pad spent this tick saw everything paid up to now (the same tick included); record the set as it stood
        if (changed) for (const p of st.pads) if (p.done && !recorded.has(p.id)) { recorded.add(p.id); merge(p.id, [...spent].filter((x) => x !== p.id)); }
      },
    });
    // a pad left unspent (or never shown) could stand while anything that does not need it is built
    for (const id of all) if (!spent.has(id)) {
      const dep = dependents(m, id);
      merge(id, all.filter((x) => !dep.has(x)));
    }
  }
  return win;
}

export interface LifeView extends PadView { seen: boolean; /** The pad's chain ids not counted as occluders (itself, what it upgrades). */ }

/** The pad chain a pad belongs to: itself and what it upgrades (a pad is not hidden by the thing it builds or upgrades). */
function chain(m: Manifest, e: ViewEnt): Set<string> {
  const s = new Set<string>([String(e.id)]);
  let t = e["target"] as string | undefined;
  for (let i = 0; t && i < 4; i++) { s.add(t); t = m.entities.find((x) => x.id === t)?.["target"] as string | undefined; }
  return s;
}

const radiusOf = (e: ViewEnt) => (e.type === "pad.build" && (e as { build?: string }).build === "struct.landmark" ? PAD_RADIUS * 1.4 : PAD_RADIUS);

/** One pad measured over its window. */
export function padLifeView(m: Manifest, e: ViewEnt, w: PadWindow, at: Pt = e.at!): PadView {
  const occ = occludersAt(m.entities, w.paidBefore);
  return viewOf(String(e.id), e.type, at, occ, radiusOf(e), chain(m, e));
}

export function lifetimeVisibility(m: Manifest, win: Map<string, PadWindow> = padTimeline(m)): LifeView[] {
  return padEnts(m).map((e) => ({ ...padLifeView(m, e, win.get(String(e.id))!), seen: win.get(String(e.id))!.seen }));
}

// ---------------- repair ----------------

type Box = [number, number, number, number];
const GEN = genData as unknown as { footprints: Record<string, Box>; spacing: { standR: number; screen: [number, number]; screenRadius: number; footprintGap: number } };
const FP = GEN.footprints, S = GEN.spacing;
const boxAt = (p: Pt, k: string): Box => { const f = FP[k]!; return [p[0] + f[0], p[1] + f[1], p[0] + f[2], p[1] + f[3]]; };
const hit = (u: Box, v: Box, g = S.footprintGap) => u[0] < v[2] + g && v[0] < u[2] + g && u[1] < v[3] + g && v[1] < u[3] + g;

/**
 * The south-east arc of the pad's own building at the pad's current distance (Doug, 2026-11-15: all pads go south-east of
 * their own building): straight toward the camera (+x +y, south-east on screen, where no building's shadow falls), then one
 * 30-degree step either side. x1000 integers, fixed order.
 */
export const REPAIR_DIRS: readonly Pt[] = [[707, 707], [966, 259], [259, 966]];
export function candidates(owner: Pt, r0: number): Pt[] {
  return REPAIR_DIRS.map((d) => [owner[0] + Math.round((d[0] * r0) / 1000), owner[1] + Math.round((d[1] * r0) / 1000)] as Pt);
}
/**
 * Pushing what hides the pad (Doug, 2026-11-15, keeps the settlement compact): at each distance d from its original spot
 * (PUSH_STEP, 2 x PUSH_STEP ... up to PUSH_CAP) try d south, then d south-east (along the diagonal), then d east; for each
 * trial position the pad's south-east arc is tried in full before the next direction.
 */
export const PUSH_DIRS: readonly { name: "south" | "south-east" | "east"; d: Pt }[] = [{ name: "south", d: [0, 1000] }, { name: "south-east", d: [707, 707] }, { name: "east", d: [1000, 0] }];
export const PUSH_STEP = 6, PUSH_CAP = 60;

/** The building (or node) a pad stack belongs to, by what its pads serve. */
export function ownerOf(m: Manifest, stack: readonly ViewEnt[]): { id: string; at: Pt } | null {
  const ents = m.entities, at = stack[0]!.at!;
  const byId = (id: string): { id: string; at: Pt } | null => {
    const e = ents.find((x) => x.id === id);
    if (!e) return null;
    const p = e.site ?? e.at ?? (Array.isArray(e["rect"]) ? ((r: number[]) => [r[0]! + r[2]! / 2, r[1]! + r[3]! / 2] as Pt)(e["rect"] as number[]) : undefined);
    return p ? { id, at: p } : null;
  };
  const nearestOf = (pred: (e: ViewEnt) => boolean): { id: string; at: Pt } | null => {
    const c = ents.filter((e) => pred(e) && (e.site ?? e.at)).map((e) => ({ id: String(e.id ?? e.type), at: (e.site ?? e.at)! }));
    return c.length ? c.reduce((a, b) => (dist(b.at, at) < dist(a.at, at) ? b : a)) : null;
  };
  const builds = (b: string) => (e: ViewEnt) => e.type === b || (e.type === "pad.build" && (e as { build?: string }).build === b);
  for (const e of stack) { const t = e["target"]; if (typeof t === "string") { const o = byId(t); if (o) return o; } }
  for (const e of stack) if ((e as { build?: string }).build === "sink.core.level") return nearestOf(builds("sink.core"));
  for (const e of stack) {
    const r = (e["role"] ?? {}) as { role?: string; to?: string; from?: string; node?: string };
    if (r.to && /^conv\./.test(r.to)) return nearestOf(builds(r.to));
    if (r.from === "store.depot" || r.to === "store.depot") return nearestOf(builds("struct.depot"));
  }
  for (const e of stack) {
    const r = (e["role"] ?? {}) as { role?: string; to?: string; node?: string };
    if (r.node) { const o = byId(r.node); if (o) return o; }
    if (r.role === "role.defender") return nearestOf(builds("struct.barracks"));
    if (r.role === "role.medic") return nearestOf(builds("struct.medical")) ?? nearestOf(builds("sink.core"));
    if (r.to === "sink.core") return nearestOf(builds("sink.core"));
    if (r.to === "sink.sales_point") return nearestOf(builds("sink.sales_point"));
  }
  return null;
}

let stub: ReturnType<typeof createSim>["compiled"] | null = null;
function salesSpots(stall: Pt, core: Pt, side: number, content: Content): Pt[] {
  stub ??= createSim({ id: "stub", seed: 1, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION, map: { w: 480, h: 900, zones: [] },
    modules: ["carry", "gather", "core", "sales"], start: [240, 500],
    entities: [{ type: "sink.core", at: [240, 450], params: { fuel: 10, level: 1 } }, { type: "sink.sales_point", at: [300, 600], sells: ["res.food_raw_1"] }],
    goal: { type: "currency", n: 5 }, fail: ["meter.lifeline"] } as never, { content }).compiled;
  const F = 1000, L = salesLayout(stub, { x: stall[0] * F, y: stall[1] * F }, { x: core[0] * F, y: core[1] * F }, side);
  return [[L.register.x / F, L.register.y / F], [L.pile.x / F, L.pile.y / F]];
}

interface St { id: string; at: Pt; r: number; fp?: Box }
interface World { st: St[]; spots: { id: string; at: Pt; r: number }[]; walls: [Pt, Pt][]; zones: number[][]; ring: Box | null; core: Pt; route: Pt[]; rpad: number; w: number; h: number }

function world(m: Manifest, content: Content): World {
  const c = content as unknown as { defaults: Record<string, number>; sinks: Record<string, { range?: number }>; nodes: Record<string, { range?: number }>; converters: Record<string, { operatorOffset?: number[]; pickupOffset?: number[] }> };
  const rpad = Number(m.params?.["pads.range"] ?? c.defaults["pads.range"] ?? 30);
  const core = m.entities.find((e) => e.type === "sink.core")!.at!;
  const W: World = { st: [], spots: [{ id: "start", at: m.start, r: 18 }], walls: [], zones: [], ring: null, core, route: [], rpad, w: m.map.w, h: m.map.h };
  m.entities.forEach((e, i) => {
    const id = String(e.id ?? `${e.type}#${i}`);
    if (e.type === "barrier.line" && e.points) {
      const p = e.points, n = p.length;
      for (let k = 0; k < (e.closed ? n : n - 1); k++) W.walls.push([p[k]!, p[(k + 1) % n]!]);
      if (e.closed) W.ring = [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
      return;
    }
    if (e.type.startsWith("zone.") && Array.isArray(e["rect"])) { W.zones.push(e["rect"] as number[]); return; }
    if (!e.at) return;
    if (e.type.startsWith("pad.")) {
      W.st.push({ id, at: e.at, r: rpad, fp: boxAt(e.at, "pad") });
      const b = (e as { build?: string }).build;
      if (e.type === "pad.build" && b && FP[b] && b !== "pad") {
        const at = e.site ?? e.at;
        W.st.push({ id: `${id}>${b}`, at, r: 0, fp: boxAt(at, b) });
        const cv = c.converters[b];
        if (cv) for (const [k, o] of [["op", cv.operatorOffset], ["pick", cv.pickupOffset]] as const) if (o) W.spots.push({ id: `${id}:${k}`, at: [at[0] + o[0]!, at[1] + o[1]!], r: S.standR });
      }
      return;
    }
    const r = c.sinks[e.type]?.range ?? c.nodes[e.type]?.range ?? (e.type.startsWith("capture.") ? 30 : 0);
    W.st.push({ id, at: e.at, r, ...(FP[e.type] ? { fp: boxAt(e.at, e.type) } : {}) });
    if (e.type === "struct.gate") W.spots.push({ id: `${id}:admit`, at: e.at, r: 40 });
    if (e.type === "sink.sales_point") {
      salesSpots(e.at, core, Number(m.params?.["sales.clerkSide"] ?? 0), content).forEach((p, k) => W.spots.push({ id: `clerk${k}`, at: p, r: S.standR }));
      ((e["queue"] as Pt[]) ?? []).forEach((q, k) => W.spots.push({ id: `queue${k}`, at: q, r: 12 }));
      W.route = (e["route"] as Pt[]) ?? [];
    }
  });
  return W;
}

const inRing = (p: Pt, W: World, mg = 0) => !!W.ring && p[0] > W.ring[0] + mg && p[0] < W.ring[2] - mg && p[1] > W.ring[1] + mg && p[1] < W.ring[3] - mg;

/** Every rule a pad on p breaks (ids in `skip` are not counted): map, frame, zone, wall, ring, near/box of a station, spot, path. */
export function padWhy(p: Pt, W: World, skip: ReadonlySet<string>, wasInRing: boolean): string[] {
  const { rpad } = W, out: string[] = [];
  if (p[0] < 16 || p[0] > W.w - 16 || p[1] < 40 || p[1] > W.h - 24) out.push("map");
  if (Math.abs(p[0] - W.core[0]) > S.screen[0] || Math.abs(p[1] - W.core[1]) > S.screen[1] || dist(p, W.core) > S.screenRadius) out.push("frame");
  if (W.zones.some((z) => p[0] >= z[0]! - rpad / 2 - 10 && p[0] <= z[0]! + z[2]! + rpad / 2 + 10 && p[1] >= z[1]! - rpad / 2 - 10 && p[1] <= z[1]! + z[3]! + rpad / 2 + 10)) out.push("zone");
  if (W.walls.some((w) => segDist(p, w[0], w[1]) < rpad + 10)) out.push("wall");
  if (W.ring && wasInRing && !inRing(p, W, 12)) out.push("ring");
  const pb = boxAt(p, "pad");
  for (const s of W.st) {
    if (skip.has(s.id)) continue;
    if (dist(p, s.at) < Math.max(rpad, s.r)) out.push(`near ${s.id}`);
    else if (s.fp && hit(pb, s.fp)) out.push(`box ${s.id}`);
  }
  for (const sp of W.spots) if (!skip.has(sp.id.split(":")[0]!) && dist(p, sp.at) < rpad + sp.r + (sp.id.startsWith("queue") ? 10 : 0)) out.push(`spot ${sp.id}`);
  for (let i = 0; i + 1 < W.route.length; i++) if (segDist(p, W.route[i]!, W.route[i + 1]!) < rpad) { out.push("path"); break; }
  return out;
}

/** Every rule a building or node standing at its station breaks (its own group in `skip`): map, frame, wall, overlap, spot, path. */
function entWhy(s: St, W: World, skip: ReadonlySet<string>): string[] {
  const out: string[] = [], b = s.fp ?? [s.at[0] - 4, s.at[1] - 4, s.at[0] + 4, s.at[1] + 4] as Box;
  if (b[0] < 4 || b[2] > W.w - 4 || b[1] < 4 || b[3] > W.h - 4) out.push("map");
  if (Math.abs(s.at[0] - W.core[0]) > S.screen[0] || Math.abs(s.at[1] - W.core[1]) > S.screen[1] || dist(s.at, W.core) > S.screenRadius) out.push("frame");
  if (W.walls.some((w) => segDist(s.at, w[0], w[1]) < Math.max(s.r, (b[2] - b[0]) / 2) + 6)) out.push("wall");
  for (const o of W.st) {
    if (skip.has(o.id) || o.id === s.id) continue;
    if (s.fp && o.fp && hit(s.fp, o.fp)) out.push(`box ${o.id}`);
    else if (dist(s.at, o.at) < Math.max(s.r, o.r, 1)) out.push(`near ${o.id}`);
  }
  for (const sp of W.spots) if (!skip.has(sp.id.split(":")[0]!) && sp.at[0] > b[0] - sp.r && sp.at[0] < b[2] + sp.r && sp.at[1] > b[1] - sp.r && sp.at[1] < b[3] + sp.r) out.push(`spot ${sp.id}`);
  for (let i = 0; i + 1 < W.route.length; i++) {
    const a = W.route[i]!, c = W.route[i + 1]!, n = Math.max(1, Math.ceil(dist(a, c) / 4));
    if (Array.from({ length: n + 1 }, (_, k) => [a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n] as Pt).some((q) => q[0] > b[0] && q[0] < b[2] && q[1] > b[1] && q[1] < b[3])) { out.push("path"); break; }
  }
  return out;
}

export interface PadMove { pads: string[]; from: Pt; to: Pt; owner: string; r: number; moved: number }
export interface Push { what: string[]; /** The hidden pads this push cleared. */ for: string[]; dir: string; by: Pt; units: number; pads: string[] }
export interface PadUnresolved { pads: string[]; at: Pt; owner: string | null; hidden: number; by: string | null; why: string }
export interface RepairResult { manifest: Manifest; moves: PadMove[]; pushes: Push[]; unresolved: PadUnresolved[] }

/** Pads grouped by the spot they share. */
function stacks(m: Manifest): ViewEnt[][] {
  const groups = new Map<string, ViewEnt[]>();
  for (const e of padEnts(m)) { const k = `${e.at![0]},${e.at![1]}`; groups.set(k, [...(groups.get(k) ?? []), e]); }
  return [...groups.values()];
}
/** Stacks with any pad hidden (any sample point covered) during its window. */
export function hiddenStacks(m: Manifest, win: Map<string, PadWindow>): ViewEnt[][] {
  return stacks(m).filter((g) => g.some((e) => padLifeView(m, e, win.get(String(e.id))!).hidden > 0));
}
const stackClear = (m: Manifest, win: Map<string, PadWindow>, stack: readonly ViewEnt[], at: Pt) => stack.every((e) => padLifeView(m, e, win.get(String(e.id))!, at).hidden === 0);
const stId = (m: Manifest, e: ViewEnt) => String(e.id ?? `${e.type}#${m.entities.indexOf(e)}`);
const subset = (a: readonly string[], b: readonly string[]) => a.every((x) => b.includes(x));

/** The first orbit angle that is legal (no rule broken that the old spot did not already break) and fully visible. */
function orbit(m: Manifest, win: Map<string, PadWindow>, stack: readonly ViewEnt[], owner: Pt, W: World, from?: Pt): Pt | null {
  const at = from ?? stack[0]!.at!, skip = new Set(stack.map((e) => String(e.id))), wasIn = inRing(at, W);
  const r0 = Math.max(Math.round(dist(at, owner)), 1);
  for (const q of candidates(owner, r0)) {
    if (padWhy(q, W, skip, wasIn).length) continue;
    if (stackClear(m, win, stack, q)) return q;
  }
  return null;
}

/** Shift an entity: its spot, its build site, the shop's line and the trader's walk (points off the map slide along their edge). */
function shift(e: ViewEnt, d: Pt, w: number, h: number): void {
  const mv = (p: Pt): Pt => [p[0] + d[0], p[1] + d[1]];
  if (e.at) e.at = mv(e.at);
  if (e.site) e.site = mv(e.site);
  if (Array.isArray(e["queue"])) e["queue"] = (e["queue"] as Pt[]).map(mv);
  if (Array.isArray(e["route"])) e["route"] = (e["route"] as Pt[]).map((p) => (p[0] < 0 || p[0] > w ? [p[0], p[1] + d[1]] : p[1] < 0 || p[1] > h ? [p[0] + d[0], p[1]] : mv(p)) as Pt);
}

/**
 * The repair loop (Doug, 2026-11-15), the same for the generator and the one-off level edit: (a) try the south-east arc of the
 * pad stack's own building at its current distance (`candidates`); the first spot that is legal and fully visible for every pad
 * of the stack during its window wins. (b) Otherwise push what hides it (a building or node no earlier than the pad's own
 * building, with every pad that belongs to it) by d south, south-east or east (PUSH_DIRS order), d growing by PUSH_STEP up to
 * PUSH_CAP, trying (a) at each. A push is kept
 * only when no pad of the level is more hidden than before and the moved group is legal and in view. The pad is never pushed
 * farther out; the Core, wall pieces and a pad that raises its building where it stands are never moved. Windows are those of
 * the level as it was (`win`).
 */
export function repairPads(m0: Manifest, win: Map<string, PadWindow>, opts: { content?: Content; push?: boolean } = {}): RepairResult {
  const content = opts.content ?? defaultContent;
  let m: Manifest = JSON.parse(JSON.stringify(m0)) as Manifest;
  const moves: PadMove[] = [], pushes: Push[] = [], unresolved: PadUnresolved[] = [];
  const lifeAll = (mm: Manifest) => new Map(padEnts(mm).map((e) => [String(e.id), padLifeView(mm, e, win.get(String(e.id))!).hidden]));
  for (const stack0 of hiddenStacks(m, win)) {
    const ids = stack0.map((e) => String(e.id));
    const stack = () => m.entities.filter((e) => ids.includes(String(e.id)));
    const at = stack()[0]!.at!;
    if (stackClear(m, win, stack(), at)) continue; // an earlier push cleared it
    const views = stack().map((e) => padLifeView(m, e, win.get(String(e.id))!));
    const worst = views.reduce((a, b) => (b.hidden > a.hidden ? b : a));
    const fixed = stack().find((e) => e.type === "pad.build" && !isUpgradePad(e) && !e.site);
    const owner = ownerOf(m, stack());
    const left = (why: string) => unresolved.push({ pads: ids, at, owner: owner?.id ?? null, hidden: worst.hidden, by: worst.by, why });
    if (!owner && !fixed) { left("no owning building found"); continue; }
    if (owner && !fixed) {
      const q = orbit(m, win, stack(), owner.at, world(m, content));
      if (q) {
        for (const e of stack()) e.at = [q[0], q[1]];
        moves.push({ pads: ids, from: at, to: q, owner: owner.id, r: Math.round(dist(q, owner.at)), moved: Math.round(dist(q, at)) });
        continue;
      }
    }
    if (opts.push === false) { left(fixed ? `${String(fixed.id)} raises its building on this spot` : "no orbit angle is clear"); continue; }
    // what hides the stack where it stands
    const blockers = new Set<number>();
    for (const e of stack()) {
      const occ = occludersAt(m.entities, win.get(String(e.id))!.paidBefore);
      for (const o of occ) if (o.ent !== undefined && o.owner !== String(e.id) && discPoints(at, PAD_RADIUS).some((q) => hides(o, q[0], q[1]))) blockers.add(o.ent);
    }
    const bl = [...blockers].map((i) => m.entities[i]!);
    if (!bl.length) { left("hidden, but no single building or node to push"); continue; }
    const core = bl.find((e) => e.type === "sink.core");
    if (core) { left(`hidden by the Core (never pushed)${fixed ? `; ${String(fixed.id)} raises its building on this spot` : ""}`); continue; }
    // only what appears no earlier than the pad's own building is pushed (Doug, 2026-11-15: the next wavefront). Things on the
    // map from the start rank 0, buildings a pad raises rank 1; two things that both stand from the start count as the same wave.
    const rank = (e: ViewEnt | undefined) => (e && e.type.startsWith("pad.") ? 1 : 0);
    const ownRank = fixed ? 1 : rank(m.entities.find((e) => owner !== null && String(e.id ?? "") === owner.id));
    const early = bl.filter((e) => rank(e) < ownRank);
    if (early.length) { left(`hidden by ${early.map((e) => String(e.id ?? e.type)).join(", ")}, which stands before the pad's own building (not pushed)`); continue; }
    // the group: each blocker and every pad stack it owns (a building raised by a pad moves with that pad)
    const group = new Set<ViewEnt>(bl);
    for (const g of stacks(m)) {
      if (g.some((e) => ids.includes(String(e.id)))) continue;
      const o = ownerOf(m, g);
      if (o && bl.some((b) => String(b.id ?? "") === o.id)) g.forEach((e) => group.add(e));
    }
    if ([...group].some((e) => ids.includes(String(e.id)))) { left("the pad belongs to what hides it"); continue; }
    const before = lifeAll(m), W0 = world(m, content);
    const gIdx = [...group].map((e) => m.entities.indexOf(e));
    const gIds = (mm: Manifest, Wm: World) => new Set(gIdx.flatMap((i) => { const e = mm.entities[i]!, id = stId(mm, e), b = (e as { build?: string }).build; return [id, ...(b ? [`${id}>${b}`] : [])]; }).concat(Wm.spots.filter((s) => gIdx.some((i) => s.id.startsWith(stId(mm, mm.entities[i]!) + ":"))).map((s) => s.id)));
    const ruleOf = (mm: Manifest, Wm: World, i: number): string[] => {
      const e = mm.entities[i]!, skip = new Set([...gIds(mm, Wm), ...ids]);
      if (e.type.startsWith("pad.")) { const b = Wm.st.find((x) => x.id === `${stId(mm, e)}>${String((e as { build?: string }).build)}`); return [...padWhy(e.at!, Wm, skip, W0.ring ? inRing(m.entities[i]!.at!, W0) : false), ...(b ? entWhy(b, Wm, skip).map((r) => `building ${r}`) : [])]; }
      const s = Wm.st.find((x) => x.id === stId(mm, e) || x.id.startsWith(stId(mm, e) + ">"));
      return s ? entWhy(s, Wm, skip) : [];
    };
    const was = new Map(gIdx.map((i) => [i, ruleOf(m, W0, i)]));
    let done: { mm: Manifest; d: Pt; units: number; dir: string; to: Pt } | null = null;
    for (let step = PUSH_STEP; step <= PUSH_CAP && !done; step += PUSH_STEP) {
      for (const dir of PUSH_DIRS) {
        const d: Pt = [Math.round((dir.d[0] * step) / 1000), Math.round((dir.d[1] * step) / 1000)];
        const mm = JSON.parse(JSON.stringify(m)) as Manifest;
        for (const i of gIdx) shift(mm.entities[i]!, d, mm.map.w, mm.map.h);
        const Wm = world(mm, content);
        if (gIdx.some((i) => !subset(ruleOf(mm, Wm, i), was.get(i)!))) continue;
        const st = mm.entities.filter((e) => ids.includes(String(e.id)));
        let to: Pt | null = stackClear(mm, win, st, at) ? at : null;
        if (!to && owner && !fixed) to = orbit(mm, win, st, owner.at, Wm, at);
        if (!to) continue;
        for (const e of st) e.at = [to[0], to[1]];
        const after = lifeAll(mm);
        const groupPads = gIdx.map((i) => mm.entities[i]!).filter((e) => e.type.startsWith("pad.")).map((e) => String(e.id));
        if ([...after].some(([id, h]) => h > (before.get(id) ?? 0) || ((groupPads.includes(id) || ids.includes(id)) && h > 0))) continue;
        done = { mm, d, units: step, dir: dir.name, to };
        break;
      }
    }
    if (!done) { left(`no orbit angle is clear and no push up to ${PUSH_CAP} units of ${bl.map((e) => String(e.id ?? e.type)).join(", ")} clears it`); continue; }
    m = done.mm;
    pushes.push({ what: bl.map((e) => String(e.id ?? e.type)), for: ids, dir: done.dir, by: done.d, units: done.units, pads: [...group].filter((e) => e.type.startsWith("pad.")).map((e) => String(e.id)) });
    if (done.to[0] !== at[0] || done.to[1] !== at[1]) moves.push({ pads: ids, from: at, to: done.to, owner: owner?.id ?? "", r: owner ? Math.round(dist(done.to, owner.at)) : 0, moved: Math.round(dist(done.to, at)) });
  }
  return { manifest: m, moves, pushes, unresolved };
}

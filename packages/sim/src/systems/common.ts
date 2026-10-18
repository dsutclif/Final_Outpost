import type { Compiled } from "../compile.js";
import type { HintKey, SimEvent } from "../events.js";
import { FP, clamp, isqrt, mulDiv, within, type Vec } from "../fixed.js";
import { between } from "../rng.js";
import type { DepotState, ResidentState, ResidentStatus, State } from "../state.js";

/** Hints repeat only after this many ticks, matching the prototype's 1.5 s hint life. */
const HINT_TICKS = 45;

export function hint(st: State, out: SimEvent[], key: HintKey): void {
  const last = st.lastHint;
  if (last && last.key === key && st.tick - last.tick < HINT_TICKS) return;
  st.lastHint = { key, tick: st.tick };
  out.push({ t: "hint", key });
}

export const countOf = (stack: readonly string[], res: string): number => {
  let n = 0;
  for (const s of stack) if (s === res) n++;
  return n;
};

export function canTake(cp: Compiled, stack: readonly string[], res: string): boolean {
  const cap = cp.resources[res]?.cap;
  if (cap === null || cap === undefined) return false;
  return countOf(stack, res) < cap;
}

/** Remove the most recently picked-up item of this type. Returns false if none. */
export function take(stack: string[], res: string): boolean {
  const i = stack.lastIndexOf(res);
  if (i < 0) return false;
  stack.splice(i, 1);
  return true;
}

/** Warehouse pads: the drop-off spot and the pickup spot of each stored resource. */
export const depotDrop = (d: DepotState, cp: Compiled): Vec => {
  const o = cp.structures["struct.depot"]!.dropOffset;
  return { x: d.pos.x + o.x, y: d.pos.y + o.y };
};
export const depotPickup = (d: DepotState, cp: Compiled, k: number): Vec => {
  const o = cp.structures["struct.depot"]!.pickupOffsets[k]!;
  return { x: d.pos.x + o.x, y: d.pos.y + o.y };
};
/**
 * Store one res. A resource seen for the first time takes the next free pickup pad; once every pad is
 * taken, further kinds are still stored (couriers move them) but have no pad of their own.
 */
export function depotPut(d: DepotState, cp: Compiled, res: string): void {
  if (!d.stores.includes(res) && d.stores.length < cp.structures["struct.depot"]!.pickupOffsets.length) d.stores.push(res);
  d.stock[res] = (d.stock[res] ?? 0) + 1;
}

export function endLevel(st: State, out: SimEvent[], won: boolean, reason: string): void {
  if (st.over) return;
  st.over = true;
  st.won = won;
  st.reason = reason;
  out.push({ t: "level_end", won, reason });
}

// ---------- geometry ----------

/** Is p closer than r to the open segment a-b? Endpoints are excluded so adjacent sections leave no seam. */
export function nearSegment(p: Vec, a: Vec, b: Vec, r: number): boolean {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return false;
  const t = apx * abx + apy * aby;
  if (t <= 0 || t >= len2) return false;
  const c: Vec = { x: a.x + mulDiv(abx, t, len2), y: a.y + mulDiv(aby, t, len2) };
  return within(p, c, r);
}

/** Even-odd test with cross-multiplication, so no division and no rounding. */
export function pointInPoly(pt: Vec, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > pt.y) === (b.y > pt.y)) continue;
    const dy = b.y - a.y;
    const lhs = (pt.x - a.x) * dy, rhs = (b.x - a.x) * (pt.y - a.y);
    if (dy > 0 ? lhs < rhs : lhs > rhs) inside = !inside;
  }
  return inside;
}

export const inRect = (p: Vec, r: { x: number; y: number; w: number; h: number }, margin = 0): boolean =>
  p.x > r.x && p.x < r.x + r.w && p.y > r.y - margin && p.y < r.y + r.h + margin;

// ---------- movement ----------

/**
 * Where segment p1→p2 crosses segment q1→q2 (endpoints included), as a fraction of p1→p2 in FP,
 * or -1 when they do not cross. Parallel segments never cross. Cross products only, so exact.
 */
export function segCross(p1: Vec, p2: Vec, q1: Vec, q2: Vec): number {
  const rx = p2.x - p1.x, ry = p2.y - p1.y, sx = q2.x - q1.x, sy = q2.y - q1.y;
  let d = rx * sy - ry * sx;
  if (d === 0) return -1;
  const qpx = q1.x - p1.x, qpy = q1.y - p1.y;
  let t = qpx * sy - qpy * sx, u = qpx * ry - qpy * rx;
  if (d < 0) { d = -d; t = -t; u = -u; }
  if (t < 0 || t > d || u < 0 || u > d) return -1;
  return mulDiv(t, FP, d);
}

/** Uncleared blocked zones and built wall sections block walkers; gates do not. */
export function blockedAt(st: State, cp: Compiled, x: number, y: number): boolean {
  const p = { x, y };
  for (const z of st.zones) if ((z.type === "zone.blocked" || z.type === "zone.terrain") && !z.cleared && inRect(p, z.rect, cp.zones.blockMargin)) return true;
  for (const line of st.barriers) {
    for (const s of line.sections) if (s.built && !s.gate && nearSegment(p, s.a, s.b, cp.barrier.thickness)) return true;
  }
  return false;
}

/** Move pos toward target by at most step, axis by axis so a wall slides rather than sticks. Returns true when arrived. */
export function moveAgent(st: State, cp: Compiled, pos: Vec, target: Vec, step: number, arrive: number): boolean {
  const dx = target.x - pos.x, dy = target.y - pos.y;
  const d = isqrt(dx * dx + dy * dy);
  if (d < arrive) return true;
  const s = d < step ? d : step;
  const nx = clamp(pos.x + mulDiv(dx, s, d), 0, cp.map.w);
  const ny = clamp(pos.y + mulDiv(dy, s, d), 0, cp.map.h);
  if (!blockedAt(st, cp, nx, pos.y)) pos.x = nx;
  if (!blockedAt(st, cp, pos.x, ny)) pos.y = ny;
  return false;
}

/** Twelve points on a circle in fixed point, so agents can ring a point or pick a heading without trig. */
export const RING: readonly (readonly [number, number])[] = [
  [1000, 0], [866, 500], [500, 866], [0, 1000], [-500, 866], [-866, 500],
  [-1000, 0], [-866, -500], [-500, -866], [0, -1000], [500, -866], [866, -500],
];

export const ringPoint = (center: Vec, k: number, rx: number, ry: number): Vec => {
  const [cx, cy] = RING[((k % RING.length) + RING.length) % RING.length]!;
  return { x: center.x + mulDiv(cx, rx, FP), y: center.y + mulDiv(cy, ry, FP) };
};

// ---------- residents and housing ----------

/** Residents who live in the base: working, injured or healing. Not waiting, frozen, towed or arriving. */
export const inBase = (r: ResidentState): boolean => r.status === "ok" || r.status === "injured" || r.status === "healing";
export const population = (st: State): number => st.residents.filter(inBase).length;
export const housingSlots = (st: State, cp: Compiled): number =>
  cp.housing.base + cp.housing.perBuilding * st.structures.filter((s) => s.type === "struct.housing").length;
export const freeSlots = (st: State, cp: Compiled): number => housingSlots(st, cp) - population(st);
export const idleResidents = (st: State): ResidentState[] => st.residents.filter((r) => r.status === "ok" && r.role === "idle");

export function newResident(st: State, pos: Vec, role: string, status: ResidentStatus, origin: ResidentState["origin"] = "start"): ResidentState {
  const r: ResidentState = {
    id: st.nextResidentId++,
    pos: { ...pos },
    role,
    status,
    carry: null,
    n: 0,
    mode: "gather",
    target: null,
    assign: { from: null, to: null, node: null, post: null },
    acc: 0,
    timer: 0,
    slot: st.residents.length,
    frost: 0,
    origin,
  };
  st.residents.push(r);
  return r;
}

/** A new recruit moves in if a slot is free, otherwise walks to the waiting area. */
export function admitRecruit(st: State, cp: Compiled, r: ResidentState, out: SimEvent[]): boolean {
  r.role = "idle";
  if (freeSlots(st, cp) > 0) {
    r.status = "ok";
    out.push({ t: "moved_in", resident: r.id });
    return true;
  }
  r.status = "waiting";
  return false;
}

// ---------- drops ----------

export function spawnDrops(st: State, cp: Compiled, drops: Record<string, number>, at: Vec, out: SimEvent[]): void {
  const sx = cp.drops.scatterX, sy = cp.drops.scatterY;
  for (const [res, n] of Object.entries(drops)) {
    for (let k = 0; k < n; k++) {
      const pos = { x: at.x + between(st.rng, -sx, sx + 1), y: at.y + between(st.rng, -sy, sy + 1) };
      st.drops.push({ id: st.nextDropId++, res, pos });
      out.push({ t: "drop", res, at: { ...pos } });
    }
  }
}

export const stepDown = (v: number): number => (v > 0 ? v - 1 : 0);

/** Terrain only (never clears). Hostiles ignore rubble and walls here: walls are handled by their own stop rule. */
export function terrainAt(st: State, cp: Compiled, x: number, y: number): boolean {
  const p = { x, y };
  for (const z of st.zones) if (z.type === "zone.terrain" && inRect(p, z.rect, cp.zones.blockMargin)) return true;
  return false;
}

/**
 * One walking step toward `target` that never enters terrain. A blocked step slides along the free
 * axis when that still makes real headway, otherwise sidesteps along the face away from the rect's
 * centre (stateless, so a hostile keeps to the side it met the rock on and rounds the corner).
 */
export function walkAround(st: State, cp: Compiled, pos: Vec, target: Vec, step: number): void {
  const dx = target.x - pos.x, dy = target.y - pos.y, d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  const s = d < step ? d : step;
  const mx = mulDiv(dx, s, d), my = mulDiv(dy, s, d);
  if (!st.zones.some((z) => z.type === "zone.terrain")) { pos.x += mx; pos.y += my; return; }
  if (!terrainAt(st, cp, pos.x + mx, pos.y + my)) { pos.x += mx; pos.y += my; return; }
  const half = step >> 1;
  const slideX = !terrainAt(st, cp, pos.x + mx, pos.y), slideY = !terrainAt(st, cp, pos.x, pos.y + my);
  const ax = Math.abs(mx), ay = Math.abs(my);
  if (slideX && ax >= half && ax >= ay) { pos.x += mx; return; }
  if (slideY && ay >= half) { pos.y += my; return; }
  if (slideX && ax >= half) { pos.x += mx; return; }
  // Head-on: sidestep across the dominant travel axis, away from the blocking rect's centre.
  const z = st.zones.find((q) => q.type === "zone.terrain" && inRect({ x: pos.x + mx, y: pos.y + my }, q.rect, cp.zones.blockMargin))!;
  if (ay >= ax) {
    const dir = pos.x * 2 < 2 * z.rect.x + z.rect.w ? -1 : 1;
    if (!terrainAt(st, cp, pos.x + dir * step, pos.y)) pos.x += dir * step;
    else if (!terrainAt(st, cp, pos.x - dir * step, pos.y)) pos.x -= dir * step;
  } else {
    const dir = pos.y * 2 < 2 * z.rect.y + z.rect.h ? -1 : 1;
    if (!terrainAt(st, cp, pos.x, pos.y + dir * step)) pos.y += dir * step;
    else if (!terrainAt(st, cp, pos.x, pos.y - dir * step)) pos.y -= dir * step;
  }
}

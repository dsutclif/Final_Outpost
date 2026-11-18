import type { Vec } from "../fixed.js";
import type { BarrierSectionState, BarrierState, State } from "../state.js";
import { inRect, nearSegment, segCross } from "./common.js";

/**
 * Derived lookup grids for the defend hot paths (outpost-ops#232). A pure speed-up: the answers are exactly those of the
 * plain scans over every wall section and blocked zone. Nothing here lives in `State` (a WeakMap keyed by the state
 * object), so saves, hashes and replays are untouched.
 *
 * The grids are rebuilt when the wall/zone layout changes: in-sim changes call `wallsChanged`, and a cheap signature
 * scan (built/gate bit per section, cleared bit per zone) re-checks once per tick for any change made from outside the
 * sim (tests, dev tools). Cell lists are clamped at the edges, so a point or segment outside the geometry still finds
 * the items it could touch.
 */

const N = 32; // cells per side; the cell size comes from the geometry extent

type Zone = State["zones"][number];
type Blocker = { z: Zone } | { s: BarrierSectionState };

interface Item { line: BarrierState; idx: number; s: BarrierSectionState }

interface Frame { x0: number; y0: number; cw: number; ch: number }

interface Cache {
  tick: number;
  dirty: boolean;
  sig: Uint8Array;
  frame: Frame;
  /** Every section in original line/section order; the index is the tie-break ordinal. */
  items: Item[];
  /** Built sections per cell, as ordinals. */
  walls: number[][];
  stamp: Int32Array;
  query: number;
  /** blockedAt candidates per cell; built on first use with that call's thickness and margin. */
  blocked: Blocker[][] | null;
  thickness: number;
  margin: number;
}

const caches = new WeakMap<State, Cache>();

/** Call whenever a section's built/gate state or a zone's cleared flag changes inside the sim. */
export function wallsChanged(st: State): void {
  const c = caches.get(st);
  if (c) c.dirty = true;
}

const sigLen = (st: State): number => {
  let n = st.zones.length;
  for (const line of st.barriers) n += line.sections.length;
  return n;
};

function sameSig(st: State, sig: Uint8Array): boolean {
  if (sig.length !== sigLen(st)) return false;
  let k = 0;
  for (const line of st.barriers) for (const s of line.sections) if (sig[k++] !== ((s.built ? 1 : 0) | (s.gate ? 2 : 0))) return false;
  for (const z of st.zones) if (sig[k++] !== (z.cleared ? 1 : 0)) return false;
  return true;
}

const cellOf = (f: Frame, x: number, y: number): number => cx(f, x) + cy(f, y) * N;
const cx = (f: Frame, x: number): number => { const c = Math.floor((x - f.x0) / f.cw); return c < 0 ? 0 : c >= N ? N - 1 : c; };
const cy = (f: Frame, y: number): number => { const c = Math.floor((y - f.y0) / f.ch); return c < 0 ? 0 : c >= N ? N - 1 : c; };

function emptyCells<T>(): T[][] {
  const cells: T[][] = new Array(N * N);
  for (let i = 0; i < cells.length; i++) cells[i] = [];
  return cells;
}

function put<T>(cells: T[][], f: Frame, v: T, x1: number, y1: number, x2: number, y2: number): void {
  const xa = cx(f, Math.min(x1, x2)), xb = cx(f, Math.max(x1, x2)), ya = cy(f, Math.min(y1, y2)), yb = cy(f, Math.max(y1, y2));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) cells[y * N + x]!.push(v);
}

function build(st: State, prev: Cache | undefined): Cache {
  const items: Item[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number): void => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  for (const line of st.barriers) line.sections.forEach((s, idx) => { items.push({ line, idx, s }); grow(s.a.x, s.a.y); grow(s.b.x, s.b.y); });
  for (const z of st.zones) { grow(z.rect.x, z.rect.y); grow(z.rect.x + z.rect.w, z.rect.y + z.rect.h); }
  if (minX === Infinity) { minX = minY = maxX = maxY = 0; }
  const frame: Frame = { x0: minX, y0: minY, cw: Math.max(1, Math.ceil((maxX - minX + 1) / N)), ch: Math.max(1, Math.ceil((maxY - minY + 1) / N)) };
  const walls = emptyCells<number>();
  items.forEach((it, ord) => { if (it.s.built) put(walls, frame, ord, it.s.a.x, it.s.a.y, it.s.b.x, it.s.b.y); });
  const sig = new Uint8Array(sigLen(st));
  let k = 0;
  for (const line of st.barriers) for (const s of line.sections) sig[k++] = (s.built ? 1 : 0) | (s.gate ? 2 : 0);
  for (const z of st.zones) sig[k++] = z.cleared ? 1 : 0;
  const need = items.length + 16;
  return { tick: st.tick, dirty: false, sig, frame, items, walls, stamp: prev && prev.stamp.length >= need ? prev.stamp : new Int32Array(need), query: prev?.query ?? 0, blocked: null, thickness: 0, margin: 0 };
}

function get(st: State): Cache {
  let c = caches.get(st);
  if (!c || c.dirty) { c = build(st, c); caches.set(st, c); }
  else if (c.tick !== st.tick) {
    if (sameSig(st, c.sig)) c.tick = st.tick; else { c = build(st, c); caches.set(st, c); }
  }
  return c;
}

/** The first built section (gates included) that segment a→b crosses, nearest to a (ties: original line/section order); null if none. */
export function gridFirstCrossing(st: State, a: Vec, b: Vec): { line: BarrierState; idx: number; t: number } | null {
  const c = get(st), f = c.frame;
  const q = ++c.query;
  let bestT = 0, bestOrd = -1;
  const xa = cx(f, Math.min(a.x, b.x)), xb = cx(f, Math.max(a.x, b.x)), ya = cy(f, Math.min(a.y, b.y)), yb = cy(f, Math.max(a.y, b.y));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const cell = c.walls[y * N + x]!;
    for (let i = 0; i < cell.length; i++) {
      const id = cell[i]!;
      if (c.stamp[id] === q) continue;
      c.stamp[id] = q;
      const s = c.items[id]!.s;
      if (!s.built) continue;
      const t = segCross(a, b, s.a, s.b);
      if (t >= 0 && (bestOrd < 0 || t < bestT || (t === bestT && id < bestOrd))) { bestT = t; bestOrd = id; }
    }
  }
  if (bestOrd < 0) return null;
  const it = c.items[bestOrd]!;
  return { line: it.line, idx: it.idx, t: bestT };
}

function buildBlocked(st: State, c: Cache, thickness: number, margin: number): Blocker[][] {
  const cells = emptyCells<Blocker>(), f = c.frame;
  const r = thickness + 2, m = margin + 2;
  for (const it of c.items) {
    const s = it.s;
    if (s.built && !s.gate) put(cells, f, { s }, Math.min(s.a.x, s.b.x) - r, Math.min(s.a.y, s.b.y) - r, Math.max(s.a.x, s.b.x) + r, Math.max(s.a.y, s.b.y) + r);
  }
  for (const z of st.zones) {
    if ((z.type !== "zone.blocked" && z.type !== "zone.terrain") || z.cleared) continue;
    put(cells, f, { z }, z.rect.x - 2, z.rect.y - m, z.rect.x + z.rect.w + 2, z.rect.y + z.rect.h + m);
  }
  return cells;
}

/** blockedAt: the same exact predicates as the plain scan, tested only on the items whose expanded box covers p's cell. */
export function gridBlockedAt(st: State, thickness: number, margin: number, x: number, y: number): boolean {
  const c = get(st);
  if (!c.blocked || c.thickness !== thickness || c.margin !== margin) { c.blocked = buildBlocked(st, c, thickness, margin); c.thickness = thickness; c.margin = margin; }
  const cell = c.blocked[cellOf(c.frame, x, y)]!;
  if (cell.length === 0) return false;
  const p = { x, y };
  for (let i = 0; i < cell.length; i++) {
    const it = cell[i]!;
    if ("z" in it) { if (!it.z.cleared && inRect(p, it.z.rect, margin)) return true; }
    else if (it.s.built && !it.s.gate && nearSegment(p, it.s.a, it.s.b, thickness)) return true;
  }
  return false;
}

/** Plain scans, kept as the reference the grid is tested against. */
export function plainFirstCrossing(st: State, a: Vec, b: Vec): { line: BarrierState; idx: number; t: number } | null {
  let best: { line: BarrierState; idx: number; t: number } | null = null;
  for (const line of st.barriers) {
    for (let i = 0; i < line.sections.length; i++) {
      const s = line.sections[i]!;
      if (!s.built) continue;
      const t = segCross(a, b, s.a, s.b);
      if (t >= 0 && (!best || t < best.t)) best = { line, idx: i, t };
    }
  }
  return best;
}

export function plainBlockedAt(st: State, thickness: number, margin: number, x: number, y: number): boolean {
  const p = { x, y };
  for (const z of st.zones) if ((z.type === "zone.blocked" || z.type === "zone.terrain") && !z.cleared && inRect(p, z.rect, margin)) return true;
  for (const line of st.barriers) {
    for (const s of line.sections) if (s.built && !s.gate && nearSegment(p, s.a, s.b, thickness)) return true;
  }
  return false;
}

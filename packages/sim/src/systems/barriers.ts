import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, isqrt, mulDiv, type Vec } from "../fixed.js";
import type { BarrierSectionState, BarrierState, HostileState, State } from "../state.js";
import { hint, nearSegment, pointInPoly, segCross, stepDown, take } from "./common.js";

export const sectionHpMax = (st: State, gate: boolean): number =>
  gate ? st.params["barrier.gateHpMax"]! : st.params["barrier.hpMax"]!;

/** A section becomes solid: full hp from the runtime params (reinforcement raises them). */
export function buildSection(st: State, cp: Compiled, line: BarrierState, s: BarrierSectionState): void {
  s.built = true;
  s.hpMax = sectionHpMax(st, s.gate);
  s.hp = s.hpMax;
  s.paid = line.costPerSection;
  if (!s.gate) unstick(st, cp, s);
}

/** A builder standing inside the new wall's band is pushed out perpendicular to it, toward the side they are on. */
function unstick(st: State, cp: Compiled, s: BarrierSectionState): void {
  const p = st.player.pos;
  const r = cp.barrier.thickness;
  if (!nearSegment(p, s.a, s.b, r)) return;
  const abx = s.b.x - s.a.x, aby = s.b.y - s.a.y;
  const len2 = abx * abx + aby * aby;
  const t = (p.x - s.a.x) * abx + (p.y - s.a.y) * aby;
  const c: Vec = { x: s.a.x + mulDiv(abx, t, len2), y: s.a.y + mulDiv(aby, t, len2) };
  let dx = p.x - c.x, dy = p.y - c.y;
  if (dx === 0 && dy === 0) { dx = -aby; dy = abx; if (dx * (st.core.pos.x - c.x) + dy * (st.core.pos.y - c.y) < 0) { dx = -dx; dy = -dy; } }
  const d = isqrt(dx * dx + dy * dy);
  p.x = c.x + mulDiv(dx, r + 1, d);
  p.y = c.y + mulDiv(dy, r + 1, d);
}

/** Only gates take damage (walls cannot be broken, Batch 3), and a broken gate stays broken for good. */
export function breakSection(st: State, line: BarrierState, idx: number, out: SimEvent[]): void {
  const s = line.sections[idx]!;
  s.built = false;
  s.hp = 0;
  s.paid = 0;
  s.broken = true;
  out.push({ t: "barrier_broken", line: line.id, section: idx });
  hint(st, out, "barrier_broken");
}

/**
 * Walking along an unbuilt section while carrying the line's resource pays for it one unit per interval.
 * Nothing is repaired and a broken gate is never rebuilt (Batch 3: the gate cannot be repaired).
 */
export function stepBarrierBuild(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player;
  p.buildCd = stepDown(p.buildCd);
  if (p.buildCd > 0) return;
  for (const line of st.barriers) {
    const cap = cp.resources[line.res]?.cap ?? null;
    for (let i = 0; i < line.sections.length; i++) {
      const s = line.sections[i]!;
      if (s.built || s.broken || !nearSegment(p.pos, s.a, s.b, cp.barrier.buildRange)) continue;
      // Currency lives in state.currency; everything else comes out of the backpack.
      if (cap === null) {
        if (st.currency <= 0) continue;
        st.currency--;
      } else if (!take(p.stack, line.res)) continue;
      s.paid++;
      p.buildCd = cp.barrier.buildTicks;
      out.push({ t: "barrier_progress", line: line.id, section: i, paid: s.paid, cost: line.costPerSection });
      if (s.paid >= line.costPerSection) {
        buildSection(st, cp, line, s);
        out.push({ t: "barrier_built", line: line.id, section: i });
      }
      return;
    }
  }
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** A closed line's vertices in order. */
export const ringOf = (line: BarrierState): Vec[] => line.sections.map((s) => s.a);

/**
 * A point is outside a closed line (a ring) when it is not inside its polygon. For an open line it
 * is outside when the line's chord separates it from the core and it stands within the chord's
 * extent; open lines are treated as their chord a→b, which is exact for straight runs.
 */
export function outsideLine(st: State, line: BarrierState, p: Vec): boolean {
  if (line.closed) return !pointInPoly(p, ringOf(line));
  const abx = line.b.x - line.a.x, aby = line.b.y - line.a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return false;
  const t = (p.x - line.a.x) * abx + (p.y - line.a.y) * aby;
  if (t < 0 || t > len2) return false;
  const coreSide = sign(abx * (st.core.pos.y - line.a.y) - aby * (st.core.pos.x - line.a.x));
  const pSide = sign(abx * (p.y - line.a.y) - aby * (p.x - line.a.x));
  return pSide !== 0 && pSide !== coreSide;
}

/** Outside any barrier line (see outsideLine). */
export const outsideLines = (st: State, p: Vec): boolean => st.barriers.some((line) => outsideLine(st, line, p));

/** The first built section (gates included) that segment a→b crosses, nearest to a; null if none. */
export function firstCrossing(st: State, a: Vec, b: Vec): { line: BarrierState; idx: number; t: number } | null {
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

/** Where segment a→b first meets any section of any line, built or not; null if it never does. */
export function lineCrossingPoint(st: State, a: Vec, b: Vec): Vec | null {
  let best = -1;
  for (const line of st.barriers) for (const s of line.sections) {
    const t = segCross(a, b, s.a, s.b);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  if (best < 0) return null;
  return { x: a.x + mulDiv(b.x - a.x, best, FP), y: a.y + mulDiv(b.y - a.y, best, FP) };
}

/** True when p is within r of any section of any line. */
export const nearAnyLine = (st: State, p: Vec, r: number): boolean =>
  st.barriers.some((line) => line.sections.some((s) => nearSegment(p, s.a, s.b, r)));

/**
 * Guard posts along the first line: section midpoints, then interior joints, then quarter points,
 * each offset along its section's normal toward the core side (straight inward on a ring).
 */
type Side = HostileState["side"];

/** The map side a section faces, seen from the core: the larger offset of its midpoint wins. */
export function sectionSide(st: State, s: BarrierSectionState): Side {
  const dx = (s.a.x + s.b.x) / 2 - st.core.pos.x, dy = (s.a.y + s.b.y) / 2 - st.core.pos.y;
  return Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "n" : "s") : dx < 0 ? "w" : "e";
}

/** The side most live hostiles came from (ties to n, e, s, w), or null when none are left. */
export function attackedSide(st: State): Side | null {
  const n: Record<Side, number> = { n: 0, e: 0, s: 0, w: 0 };
  for (const h of st.hostiles) if (h.hp > 0) n[h.side]++;
  let best: Side | null = null;
  for (const s of ["n", "e", "s", "w"] as const) if (n[s] > 0 && (best === null || n[s] > n[best])) best = s;
  return best;
}

/**
 * The gate attackers from a side make for: of the gate sections facing that side, the one nearest the
 * core (a trader gate further along the same side is left alone); null when that side has no gate.
 */
export function attackGate(st: State, side: Side): { line: BarrierState; idx: number } | null {
  let best: { line: BarrierState; idx: number } | null = null, bd = 0;
  for (const line of st.barriers) {
    for (let i = 0; i < line.sections.length; i++) {
      const s = line.sections[i]!;
      if (!s.gate || sectionSide(st, s) !== side) continue;
      const dx = (s.a.x + s.b.x) / 2 - st.core.pos.x, dy = (s.a.y + s.b.y) / 2 - st.core.pos.y, d = dx * dx + dy * dy;
      if (!best || d < bd) { best = { line, idx: i }; bd = d; }
    }
  }
  return best;
}

export const sectionMid = (s: BarrierSectionState): Vec => ({ x: (s.a.x + s.b.x) >> 1, y: (s.a.y + s.b.y) >> 1 });

export function guardPost(st: State, cp: Compiled, k: number, side: Side | null = null): Vec {
  const line = st.barriers[0];
  if (!line) return { ...st.core.pos };
  let pts: { p: Vec; s: BarrierSectionState; joint?: boolean }[] = [];
  const lerp = (s: BarrierSectionState, num: number, den: number): { p: Vec; s: BarrierSectionState } =>
    ({ p: { x: s.a.x + mulDiv(s.b.x - s.a.x, num, den), y: s.a.y + mulDiv(s.b.y - s.a.y, num, den) }, s });
  for (const s of line.sections) pts.push(lerp(s, 1, 2));
  for (let i = 1; i < line.sections.length; i++) pts.push({ p: { ...line.sections[i]!.a }, s: line.sections[i]!, joint: true });
  for (const s of line.sections) { pts.push(lerp(s, 1, 4)); pts.push(lerp(s, 3, 4)); }
  if (side !== null) {
    // rallying: attackers only hit the gate (Batch 3), so the guards stand inside that side's attack gate
    // and the wall either side of it; without one, the mid and quarter posts of the sections facing that side
    const g = attackGate(st, side);
    if (g) {
      const n = g.line.sections.length, at = (i: number) => g.line.sections[i]!;
      const gs = at(g.idx), prev = at((g.idx + n - 1) % n), next = at((g.idx + 1) % n);
      const near = [lerp(gs, 1, 2), lerp(gs, 1, 4), lerp(gs, 3, 4)];
      if ((g.line.closed || g.idx > 0) && sectionSide(st, prev) === side) near.push(lerp(prev, 3, 4));
      if ((g.line.closed || g.idx < n - 1) && sectionSide(st, next) === side) near.push(lerp(next, 1, 4));
      pts = near;
    } else {
      const facing = pts.filter((q) => !q.joint && sectionSide(st, q.s) === side);
      if (facing.length > 0) pts = facing;
    }
  }
  const { p: base, s } = pts[k % pts.length]!;
  let nx = -(s.b.y - s.a.y), ny = s.b.x - s.a.x;
  if (nx * (st.core.pos.x - base.x) + ny * (st.core.pos.y - base.y) < 0) { nx = -nx; ny = -ny; }
  const d = isqrt(nx * nx + ny * ny);
  if (d === 0) return base;
  return { x: base.x + mulDiv(nx, cp.defense.postOffset, d), y: base.y + mulDiv(ny, cp.defense.postOffset, d) };
}

import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { isqrt, mulDiv, type Vec } from "../fixed.js";
import type { BarrierSectionState, BarrierState, State } from "../state.js";
import { hint, nearSegment, stepDown, take } from "./common.js";

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

export function breakSection(st: State, line: BarrierState, idx: number, out: SimEvent[]): void {
  const s = line.sections[idx]!;
  s.built = false;
  s.hp = 0;
  s.paid = 0;
  out.push({ t: "barrier_broken", line: line.id, section: idx });
  hint(st, out, "barrier_broken");
}

/** Walking along an unbuilt section while carrying the line's resource pays for it one unit per interval. */
export function stepBarrierBuild(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player;
  p.buildCd = stepDown(p.buildCd);
  if (p.buildCd > 0) return;
  for (const line of st.barriers) {
    const cap = cp.resources[line.res]?.cap ?? null;
    for (let i = 0; i < line.sections.length; i++) {
      const s = line.sections[i]!;
      if (s.built || !nearSegment(p.pos, s.a, s.b, cp.barrier.buildRange)) continue;
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

/**
 * The player is outside when some line's chord separates them from the core and they stand
 * within the chord's extent. Lines are treated as their chord a→b, which is exact for straight runs.
 */
export function outsideLines(st: State, p: Vec): boolean {
  for (const line of st.barriers) {
    const abx = line.b.x - line.a.x, aby = line.b.y - line.a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) continue;
    const t = (p.x - line.a.x) * abx + (p.y - line.a.y) * aby;
    if (t < 0 || t > len2) continue;
    const coreSide = sign(abx * (st.core.pos.y - line.a.y) - aby * (st.core.pos.x - line.a.x));
    const pSide = sign(abx * (p.y - line.a.y) - aby * (p.x - line.a.x));
    if (pSide !== 0 && pSide !== coreSide) return true;
  }
  return false;
}

/** Guard posts along the first line: section midpoints, then interior joints, then quarter points, offset toward the core. */
export function guardPost(st: State, cp: Compiled, k: number): Vec {
  const line = st.barriers[0];
  if (!line) return { ...st.core.pos };
  const pts: Vec[] = [];
  const lerp = (s: { a: Vec; b: Vec }, num: number, den: number): Vec =>
    ({ x: s.a.x + mulDiv(s.b.x - s.a.x, num, den), y: s.a.y + mulDiv(s.b.y - s.a.y, num, den) });
  for (const s of line.sections) pts.push(lerp(s, 1, 2));
  for (let i = 1; i < line.sections.length; i++) pts.push({ ...line.sections[i]!.a });
  for (const s of line.sections) { pts.push(lerp(s, 1, 4)); pts.push(lerp(s, 3, 4)); }
  const base = pts[k % pts.length]!;
  const toward = st.core.pos.y >= base.y ? 1 : -1;
  return { x: base.x, y: base.y + toward * cp.defense.postOffset };
}

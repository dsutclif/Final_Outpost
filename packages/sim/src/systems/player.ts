import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, clamp, clampDir, dist, mulDiv, within, type Vec } from "../fixed.js";
import type { State } from "../state.js";
import { canTake, hint, take } from "./common.js";
import { coreFuelCap } from "./core.js";

export interface Input {
  /** Direction in fixed point; magnitude at most FP. Anything larger is normalised. */
  dx: number;
  dy: number;
}

export function movePlayer(st: State, cp: Compiled, input: Input): void {
  const p = st.player;
  const dir = clampDir(input.dx, input.dy);
  const speed = cp.player.speed; // lasso penalty applies here once the module exists
  const r = cp.player.radius;
  const nx = clamp(p.pos.x + mulDiv(dir.x, speed, FP), r, cp.map.w - r);
  const ny = clamp(p.pos.y + mulDiv(dir.y, speed, FP), r, cp.map.h - r);
  if (!blocked(st, nx, p.pos.y)) p.pos.x = nx;
  if (!blocked(st, p.pos.x, ny)) p.pos.y = ny;
  // Nobody stands on the core: push out to the exclusion radius.
  const c = st.core;
  const d = dist(p.pos, c.pos);
  if (d < cp.core.exclusion) {
    if (d === 0) p.pos.y = c.pos.y + cp.core.exclusion;
    else {
      p.pos.x = c.pos.x + mulDiv(p.pos.x - c.pos.x, cp.core.exclusion, d);
      p.pos.y = c.pos.y + mulDiv(p.pos.y - c.pos.y, cp.core.exclusion, d);
    }
  }
  if (dir.x > 0) p.face = 1;
  else if (dir.x < 0) p.face = -1;
}

/** Blocked zones and built barrier sections live here once those modules exist. */
function blocked(_st: State, _x: number, _y: number): boolean {
  return false;
}

/** Proximity actions, in the prototype's priority order: core, sales point, then gathering. */
export function playerAct(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player;
  if (p.actCd > 0) { p.actCd--; return; }
  p.actCd = cp.player.actTicks;

  if (feedCore(st, cp, out)) return;
  if (stockShelf(st, cp, out)) return;
  gather(st, cp, out);
}

function feedCore(st: State, cp: Compiled, out: SimEvent[]): boolean {
  const p = st.player, c = st.core;
  if (!within(p.pos, c.pos, cp.core.range)) return false;
  // Prefer the densest fuel carried, as the prototype did with coal before logs.
  let best: string | null = null;
  for (const [res, value] of Object.entries(cp.core.accepts)) {
    if (p.stack.includes(res) && (best === null || value > (cp.core.accepts[best] ?? 0))) best = res;
  }
  if (best === null) return false;
  const cap = coreFuelCap(st, cp);
  if (c.fuel >= cap) { hint(st, out, "core_full"); return false; }
  take(p.stack, best);
  const before = c.fuel;
  c.fuel = Math.min(cap, c.fuel + (cp.core.accepts[best] ?? 0));
  if (before === 0 && c.fuel > 0) out.push({ t: "core_fuel_restored" });
  out.push({ t: "deposited", res: best, to: "sink.core", at: { ...c.pos } });
  p.actCd = cp.core.depositTicks;
  return true;
}

function stockShelf(st: State, cp: Compiled, out: SimEvent[]): boolean {
  const s = st.sales;
  if (!s) return false;
  const p = st.player;
  if (!within(p.pos, s.pos, cp.sales.range)) return false;
  const res = s.sells.find((r) => p.stack.includes(r) && (s.shelf[r] ?? 0) < cp.sales.shelfCap);
  if (res === undefined) return false;
  take(p.stack, res);
  s.shelf[res] = (s.shelf[res] ?? 0) + 1;
  out.push({ t: "deposited", res, to: "sink.sales_point", at: { ...s.pos } });
  p.actCd = cp.sales.depositTicks;
  return true;
}

function gather(st: State, cp: Compiled, out: SimEvent[]): boolean {
  const p = st.player;
  for (let i = 0; i < st.nodes.length; i++) {
    const n = st.nodes[i]!;
    if (!n.enabled || n.stock === 0) continue;
    const def = cp.nodes[n.type]!;
    if (!within(p.pos, n.pos, def.range)) continue;
    if (!canTake(cp, p.stack, def.yields)) { hint(st, out, "carry_max"); return true; }
    if (n.stock !== null) n.stock--;
    p.stack.push(def.yields);
    p.actCd = def.rateTicks;
    out.push({ t: "gathered", res: def.yields, node: i, at: { ...n.pos } });
    return true;
  }
  return false;
}

/** Currency left at the register is picked up by walking over it. */
export function collectPile(st: State, cp: Compiled, out: SimEvent[]): void {
  const s = st.sales;
  if (!s || s.pileN <= 0) return;
  if (!within(st.player.pos, s.pile, cp.sales.pileRange)) return;
  st.currency += s.pileN;
  out.push({ t: "collected", res: "res.currency", n: s.pileN, at: pileAt(s.pile) });
  s.pileN = 0;
}

const pileAt = (v: Vec): Vec => ({ ...v });

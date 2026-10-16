import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, clamp, clampDir, dist, mulDiv, within, type Vec } from "../fixed.js";
import type { State } from "../state.js";
import { hitHostile, hitPrey, nearestDangerousPrey, nearestHostile, nearestPrey } from "./combat.js";
import { blockedAt, canTake, hint, stepDown, take } from "./common.js";
import { coreFuelCap, feedCoreWith } from "./core.js";
import { trackPadDwell, tryPayPad } from "./pads.js";

export interface Input {
  /** Direction in fixed point; magnitude at most FP. Anything larger is normalised. */
  dx: number;
  dy: number;
}

export function movePlayer(st: State, cp: Compiled, input: Input): void {
  const p = st.player;
  const dir = clampDir(input.dx, input.dy);
  p.moving = dir.x !== 0 || dir.y !== 0;
  // Each towed object slows the player by the lasso penalty.
  let speed = mulDiv(cp.player.speed, Math.max(0, FP - cp.lasso.speedPenalty * p.tow.length), FP);
  // A bite from a dangerous animal slows the walk for a moment.
  if (p.stun > 0) { p.stun--; speed = mulDiv(speed, p.stunSlow, FP); }
  const r = cp.player.radius;
  const nx = clamp(p.pos.x + mulDiv(dir.x, speed, FP), r, cp.map.w - r);
  const ny = clamp(p.pos.y + mulDiv(dir.y, speed, FP), r, cp.map.h - r);
  if (!blockedAt(st, cp, nx, p.pos.y)) p.pos.x = nx;
  if (!blockedAt(st, cp, p.pos.x, ny)) p.pos.y = ny;
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

/** Proximity actions, in the prototype's priority order: pads, core, sales point, converters, then gathering. */
export function playerAct(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player;
  trackPadDwell(st, cp);
  if (p.actCd > 0) { p.actCd--; return; }
  p.actCd = cp.player.actTicks;

  if (tryPayPad(st, cp, out)) return;
  if (feedCore(st, cp, out)) return;
  if (stockShelf(st, cp, out)) return;
  if (useConverters(st, cp, out)) return;
  if (stockDepot(st, cp, out)) return;
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
  if (c.fuel >= coreFuelCap(st, cp)) { hint(st, out, "core_full"); return false; }
  take(p.stack, best);
  feedCoreWith(st, cp, best, out);
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

/**
 * Drop carried goods into the warehouse when standing within its range. Currency is never dropped
 * here (it is spent at pads or banked at the register; the warehouse is a goods store). Core and
 * converter deposits run first, so fuel and machine inputs are not diverted away from what needs them.
 */
function stockDepot(st: State, cp: Compiled, out: SimEvent[]): boolean {
  const d = st.depot;
  if (!d) return false;
  const p = st.player;
  if (!within(p.pos, d.pos, cp.structures["struct.depot"]?.range ?? 0)) return false;
  const res = p.stack.find((r) => cp.resources[r]?.category !== "currency");
  if (res === undefined) return false;
  take(p.stack, res);
  d.stock[res] = (d.stock[res] ?? 0) + 1;
  out.push({ t: "deposited", res, to: "store.depot", at: { ...d.pos } });
  p.actCd = cp.sales.depositTicks;
  return true;
}

/** Deposit an input the player carries, or pick up output at the pickup spot. */
function useConverters(st: State, cp: Compiled, out: SimEvent[]): boolean {
  const p = st.player;
  for (const cv of st.converters) {
    const def = cp.converters[cv.type]!;
    if (within(p.pos, cv.pos, def.range)) {
      const res = def.inputs.find((r) => p.stack.includes(r));
      if (res !== undefined) {
        if (cv.inQ.length < def.inCap) {
          take(p.stack, res);
          cv.inQ.push(res);
          out.push({ t: "deposited", res, to: cv.type, at: { ...cv.pos } });
          p.actCd = cp.sales.depositTicks;
          return true;
        }
        hint(st, out, "input_full");
      }
    }
    if (within(p.pos, cv.pickupPos, cp.convParams.pickupRange) && cv.out > 0 && canTake(cp, p.stack, def.output)) {
      cv.out--;
      p.stack.push(def.output);
      out.push({ t: "picked", res: def.output, at: { ...cv.pickupPos } });
      p.actCd = cp.sales.depositTicks;
      return true;
    }
  }
  return false;
}

function gather(st: State, cp: Compiled, out: SimEvent[]): boolean {
  const p = st.player;
  let capped = false;
  for (let i = 0; i < st.nodes.length; i++) {
    const n = st.nodes[i]!;
    if (!n.enabled || n.stock === 0) continue;
    const def = cp.nodes[n.type]!;
    if (!within(p.pos, n.pos, def.range)) continue;
    // A node whose yield is at the backpack cap must not shadow an in-range node of another resource.
    if (!canTake(cp, p.stack, def.yields)) { capped = true; continue; }
    if (n.stock !== null) n.stock--;
    p.stack.push(def.yields);
    p.actCd = def.rateTicks;
    out.push({ t: "gathered", res: def.yields, node: i, at: { ...n.pos } });
    return true;
  }
  if (capped) { hint(st, out, "carry_max"); return true; }
  return false;
}

/** The player auto-attacks the nearest prey or hostile in range. */
export function playerCombat(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player;
  p.atkCd = stepDown(p.atkCd);
  p.shotCd = stepDown(p.shotCd);
  if (p.atkCd <= 0) {
    const h = nearestHostile(st, p.pos, cp.player.attackRange);
    const d = nearestPrey(st, p.pos, cp.player.attackRange);
    if (h || d) {
      const pickHostile = h && (!d || dist(h.pos, p.pos) <= dist(d.pos, p.pos));
      if (pickHostile) hitHostile(st, cp, h!, cp.player.attackDamage, "player", out);
      else hitPrey(st, cp, d!, cp.player.attackDamage, "player", out);
      p.atkCd = cp.player.attackTicks;
      if (pickHostile) return;
    }
  }
  // Ranged shot at the nearest hostile (integer squared distance, ties to the first in the list,
  // which is id order); fired while moving, hostiles only.
  if (p.shotCd > 0 || cp.player.rangedRange <= 0) return;
  // Dangerous animals count as foes for the auto-fire so they can be softened up before they close in;
  // plain prey is never shot, it is hunted in melee.
  const foe = nearestHostile(st, p.pos, cp.player.rangedRange);
  const beast = nearestDangerousPrey(st, cp, p.pos, cp.player.rangedRange);
  if (!foe && !beast) return;
  if (beast && (!foe || dist(beast.pos, p.pos) < dist(foe.pos, p.pos))) {
    out.push({ t: "shot", from: { ...p.pos }, to: { ...beast.pos }, id: beast.id });
    hitPrey(st, cp, beast, cp.player.attackDamage, "player", out);
  } else {
    out.push({ t: "shot", from: { ...p.pos }, to: { ...foe!.pos }, id: foe!.id });
    hitHostile(st, cp, foe!, cp.player.attackDamage, "player", out);
  }
  p.shotCd = cp.player.rangedTicks;
}

/** Drops are picked up by walking over them when the backpack has room for that type. */
export function pickDrops(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player;
  for (const d of [...st.drops]) {
    if (!within(p.pos, d.pos, cp.drops.pickupRange) || !canTake(cp, p.stack, d.res)) continue;
    st.drops.splice(st.drops.indexOf(d), 1);
    p.stack.push(d.res);
    out.push({ t: "picked", res: d.res, at: { ...d.pos } });
  }
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

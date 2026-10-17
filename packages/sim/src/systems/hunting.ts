import type { Compiled, CompiledAnimal } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, clamp, isqrt, mulDiv, within, type Vec } from "../fixed.js";
import { below, between } from "../rng.js";
import type { PreyState, ResidentState, State } from "../state.js";
import { RING, blockedAt, stepDown } from "./common.js";
import { dropTow } from "./lasso.js";

function place(st: State, cp: Compiled, d: PreyState): void {
  const z = st.preyZones[d.zone]!;
  const A = cp.animals[z.animal]!;
  d.pos = {
    x: between(st.rng, z.rect.x + A.margin, z.rect.x + z.rect.w - A.margin + 1),
    y: between(st.rng, z.rect.y + A.margin, z.rect.y + z.rect.h - A.margin + 1),
  };
  d.hp = A.hp;
  d.alive = true;
  d.respawn = 0;
  d.vel = { x: 0, y: 0 };
  d.turn = 0;
  d.atk = 0;
  d.charging = false;
}

export function spawnPrey(st: State, cp: Compiled, zone: number, id: number): PreyState {
  const d: PreyState = { id, pos: { x: 0, y: 0 }, hp: 0, alive: true, respawn: 0, zone, vel: { x: 0, y: 0 }, turn: 0, atk: 0, charging: false };
  place(st, cp, d);
  st.prey.push(d);
  return d;
}

/** True for animals that charge and bite (aggroRange in the content data). */
export const isDangerous = (A: CompiledAnimal): boolean => A.aggroRange > 0;

const d2 = (a: Vec, b: Vec): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** Who a dangerous animal goes for: the nearest of the player and the hunters inside its aggro range (player wins ties). */
function pickTarget(st: State, cp: Compiled, A: CompiledAnimal, d: PreyState): { pos: Vec; res: ResidentState | null } | null {
  const R2 = A.aggroRange * A.aggroRange;
  let best: { pos: Vec; res: ResidentState | null } | null = null, bd = R2 + 1;
  const pd = d2(st.player.pos, d.pos);
  if (pd <= R2) { best = { pos: st.player.pos, res: null }; bd = pd; }
  if (A.injuresWorkers) {
    for (const r of st.residents) {
      if (r.status !== "ok" || cp.roles[r.role]?.behavior !== "hunt") continue;
      const rd = d2(r.pos, d.pos);
      if (rd <= R2 && rd < bd) { best = { pos: r.pos, res: r }; bd = rd; }
    }
  }
  return best;
}

/**
 * A bite: the player loses the top item of the pack (or a towed captive when the pack is empty), is slowed
 * and loses hp; at 0 hp they are knocked down (the whole pack spills, the tow drops, they lie still for a
 * moment and get up healed). A hunter is injured.
 */
function bite(st: State, cp: Compiled, A: CompiledAnimal, d: PreyState, victim: ResidentState | null, out: SimEvent[]): void {
  if (victim) {
    out.push({ t: "hit", target: "resident", id: victim.id, at: { ...victim.pos }, by: "animal" });
    victim.status = "injured"; victim.n = 0; victim.carry = null; victim.mode = "gather"; victim.target = null;
    victim.timer = cp.residents.selfHealTicks;
    out.push({ t: "injured", resident: victim.id });
    return;
  }
  const p = st.player;
  out.push({ t: "hit", target: "player", id: 0, at: { ...p.pos }, by: "animal" });
  p.stun = A.stunTicks;
  p.stunSlow = A.stunSlow;
  p.healCd = cp.player.healDelayTicks;
  p.hp = Math.max(0, p.hp - A.damage);
  if (p.hp === 0 && A.damage > 0) {
    p.hp = cp.player.hp;
    p.stun = cp.player.downTicks;
    p.stunSlow = 0;
    // The animal backs off while the player is down.
    d.atk = cp.player.downTicks + A.attackTicks;
    out.push({ t: "downed", at: { ...p.pos } });
    let k = 0;
    while (p.stack.length > 0) fling(st, cp, d, p.stack.pop()!, k++, out);
    while (p.tow.length > 0) dropTow(st, p.tow[p.tow.length - 1]!, "hit", out);
    return;
  }
  if (p.stack.length > 0) fling(st, cp, d, p.stack.pop()!, 0, out);
  else if (p.tow.length > 0) dropTow(st, p.tow[p.tow.length - 1]!, "hit", out);
}

/** One item knocked off the pack, flung away from the animal past pickup range (fanned out by k), back toward open ground if that lands in terrain. */
function fling(st: State, cp: Compiled, d: PreyState, res: string, k: number, out: SimEvent[]): void {
  const p = st.player;
  const A = cp.animals[st.preyZones[d.zone]!.animal]!;
  // fan: alternate sides of the knock line, a little wider each item
  const sx = (k & 1 ? -1 : 1) * ((k + 1) >> 1) * 15 * FP;
  const dx = p.pos.x - d.pos.x, dy = p.pos.y - d.pos.y, L = isqrt(dx * dx + dy * dy);
  const ux = L === 0 ? FP : mulDiv(dx, FP, L), uy = L === 0 ? 0 : mulDiv(dy, FP, L);
  let reach = A.knockDistance, pos: Vec = { ...p.pos };
  for (let tries = 0; tries < 4; tries++, reach = reach >> 1) {
    const x = clamp(p.pos.x + mulDiv(ux, reach, FP) - mulDiv(uy, sx, FP), 0, cp.map.w), y = clamp(p.pos.y + mulDiv(uy, reach, FP) + mulDiv(ux, sx, FP), 0, cp.map.h);
    if (!blockedAt(st, cp, x, y)) { pos = { x, y }; break; }
  }
  st.drops.push({ id: st.nextDropId++, res, pos });
  out.push({ t: "drop", res, at: { ...pos } });
}

/** Prey wander inside their zone on random headings and respawn a while after being killed; dangerous ones charge and bite. */
export function stepHunting(st: State, cp: Compiled, out: SimEvent[]): void {
  for (const d of st.prey) {
    const z = st.preyZones[d.zone]!;
    const A = cp.animals[z.animal]!;
    if (!d.alive) {
      d.respawn = stepDown(d.respawn);
      if (d.respawn <= 0) place(st, cp, d);
      continue;
    }
    if (isDangerous(A)) {
      d.atk = stepDown(d.atk);
      const tgt = pickTarget(st, cp, A, d);
      if (tgt) {
        if (!d.charging) {
          d.charging = true;
          // A beat of wind-up before the first bite so a charge can be seen coming.
          d.atk = Math.max(d.atk, A.attackTicks >> 1);
          out.push({ t: "animal_charge", id: d.id, at: { ...d.pos } });
        }
        const dx = tgt.pos.x - d.pos.x, dy = tgt.pos.y - d.pos.y, L = isqrt(dx * dx + dy * dy);
        if (L > A.attackRange) {
          const step = Math.min(A.chargeSpeed, L - A.attackRange);
          d.pos.x = clamp(d.pos.x + mulDiv(dx, step, L), z.rect.x, z.rect.x + z.rect.w);
          d.pos.y = clamp(d.pos.y + mulDiv(dy, step, L), z.rect.y, z.rect.y + z.rect.h);
        }
        if (d.atk <= 0 && within(d.pos, tgt.pos, A.attackRange)) {
          d.atk = A.attackTicks;
          bite(st, cp, A, d, tgt.res, out);
        }
        continue;
      }
      d.charging = false;
    }
    d.turn = stepDown(d.turn);
    if (d.turn <= 0) {
      d.turn = between(st.rng, A.turnMin, A.turnMax + 1);
      const [hx, hy] = RING[below(st.rng, RING.length)]!;
      const sp = between(st.rng, A.speedMin, A.speedMax + 1);
      d.vel = { x: mulDiv(hx, sp, FP), y: mulDiv(hy, sp, FP) };
    }
    d.pos.x = clamp(d.pos.x + d.vel.x, z.rect.x, z.rect.x + z.rect.w);
    d.pos.y = clamp(d.pos.y + d.vel.y, z.rect.y, z.rect.y + z.rect.h);
  }
}

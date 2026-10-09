import type { Compiled } from "../compile.js";
import { FP, clamp, mulDiv } from "../fixed.js";
import { below, between } from "../rng.js";
import type { PreyState, State } from "../state.js";
import { RING, stepDown } from "./common.js";

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
}

export function spawnPrey(st: State, cp: Compiled, zone: number, id: number): PreyState {
  const d: PreyState = { id, pos: { x: 0, y: 0 }, hp: 0, alive: true, respawn: 0, zone, vel: { x: 0, y: 0 }, turn: 0 };
  place(st, cp, d);
  st.prey.push(d);
  return d;
}

/** Prey wander inside their zone on random headings and respawn a while after being killed. */
export function stepHunting(st: State, cp: Compiled): void {
  for (const d of st.prey) {
    const z = st.preyZones[d.zone]!;
    const A = cp.animals[z.animal]!;
    if (!d.alive) {
      d.respawn = stepDown(d.respawn);
      if (d.respawn <= 0) place(st, cp, d);
      continue;
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

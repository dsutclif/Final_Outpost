import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { within, type Vec } from "../fixed.js";
import type { HostileState, PreyState, State } from "../state.js";
import { spawnDrops } from "./common.js";

export type Attacker = "player" | "resident" | "structure" | "troop";

/** Nearest living hostile strictly within r of p, or null. */
export function nearestHostile(st: State, p: Vec, r: number): HostileState | null {
  let best: HostileState | null = null, bd = r * r;
  for (const h of st.hostiles) {
    const dx = h.pos.x - p.x, dy = h.pos.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = h; }
  }
  return best;
}

export function nearestPrey(st: State, p: Vec, r: number): PreyState | null {
  let best: PreyState | null = null, bd = r * r;
  for (const d of st.prey) {
    if (!d.alive) continue;
    const dx = d.pos.x - p.x, dy = d.pos.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = d; }
  }
  return best;
}

/** Nearest living dangerous animal strictly within r of p (the ranged auto-fire picks these; plain prey is left alone). */
export function nearestDangerousPrey(st: State, cp: Compiled, p: Vec, r: number): PreyState | null {
  let best: PreyState | null = null, bd = r * r;
  for (const d of st.prey) {
    if (!d.alive || cp.animals[st.preyZones[d.zone]!.animal]!.aggroRange <= 0) continue;
    const dx = d.pos.x - p.x, dy = d.pos.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = d; }
  }
  return best;
}

export function hitHostile(st: State, cp: Compiled, h: HostileState, dmg: number, by: Attacker, out: SimEvent[]): void {
  h.hp -= dmg;
  out.push({ t: "hit", target: "hostile", id: h.id, at: { ...h.pos }, by });
  if (h.hp > 0) return;
  st.hostiles = st.hostiles.filter((x) => x !== h);
  out.push({ t: "died", kind: h.type, id: h.id, at: { ...h.pos }, by });
  // Loot stays where the attacker fell, out on the road too: running out for it is the game (Batch 3).
  spawnDrops(st, cp, cp.hostiles[h.type]!.drops, h.pos, out);
}

export function hitPrey(st: State, cp: Compiled, d: PreyState, dmg: number, by: Attacker, out: SimEvent[]): void {
  d.hp -= dmg;
  out.push({ t: "hit", target: "prey", id: d.id, at: { ...d.pos }, by });
  if (d.hp > 0) return;
  const zone = st.preyZones[d.zone]!;
  d.alive = false;
  d.respawn = cp.animals[zone.animal]!.respawnTicks;
  out.push({ t: "died", kind: zone.animal, id: d.id, at: { ...d.pos } });
  spawnDrops(st, cp, cp.animals[zone.animal]!.drops, d.pos, out);
}

export const inRange = (a: Vec, b: Vec, r: number): boolean => within(a, b, r);

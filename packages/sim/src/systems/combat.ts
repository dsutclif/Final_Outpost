import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { mulDiv, within, type Vec } from "../fixed.js";
import type { HostileState, PreyState, State } from "../state.js";
import { spawnDrops } from "./common.js";

export type Attacker = "player" | "resident" | "structure";

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

export function hitHostile(st: State, cp: Compiled, h: HostileState, dmg: number, by: Attacker, out: SimEvent[]): void {
  h.hp -= dmg;
  out.push({ t: "hit", target: "hostile", id: h.id, at: { ...h.pos }, by });
  if (h.hp > 0) return;
  st.hostiles = st.hostiles.filter((x) => x !== h);
  out.push({ t: "died", kind: h.type, id: h.id, at: { ...h.pos } });
  // Loot that fell beyond the barrier is relocated to the inside so the player can reach it.
  const at = relocateInside(st, cp, h.pos);
  spawnDrops(st, cp, cp.hostiles[h.type]!.drops, at, out);
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

/** Height of the first barrier line at x (linear along its sections), or null when x is off the line. */
export function barrierYAt(st: State, x: number): number | null {
  const line = st.barriers[0];
  if (!line) return null;
  for (const s of line.sections) {
    const lo = Math.min(s.a.x, s.b.x), hi = Math.max(s.a.x, s.b.x);
    if (x <= lo || x >= hi) continue;
    if (s.a.x === s.b.x) return null;
    return s.a.y + mulDiv(s.b.y - s.a.y, x - s.a.x, s.b.x - s.a.x);
  }
  return null;
}

function relocateInside(st: State, cp: Compiled, p: Vec): Vec {
  const y = barrierYAt(st, p.x) ?? st.barriers[0]?.a.y;
  if (y === undefined) return { ...p };
  // Hostiles come from the far side of the line (toward smaller y, the spawn edge).
  const towardCore = st.core.pos.y >= y ? 1 : -1;
  const beyond = towardCore > 0 ? p.y < y + cp.defense.dropRelocateBand : p.y > y - cp.defense.dropRelocateBand;
  return beyond ? { x: p.x, y: y + towardCore * cp.defense.dropRelocateOffset } : { ...p };
}

export const inRange = (a: Vec, b: Vec, r: number): boolean => within(a, b, r);

import type { Compiled, CompiledRole } from "../compile.js";
import type { SimEvent } from "../events.js";
import { clamp, fp, isqrt, within, type Vec } from "../fixed.js";
import type { ResidentState, State } from "../state.js";
import { outsideLines } from "./barriers.js";
import { moveAgent, ringPoint } from "./common.js";

// R5 #26 (Doug): hired guards have the commander's health. At guards.downPct of it they stop fighting until
// healed: a medic patches them up where they fell, or (with no medic) they walk to the med bay, or the commander
// heals them by standing beside them. #92: a downed guard has guards.downSeconds (15 s, shown over it) before it
// dies, on every level; nobody can start healing it during its fall (guards.fallSeconds). A guard lying where it
// fell can't be hit (only one walking to the med bay can, and dies if it is), so the medic can reach it through a
// wave. A guard going down is not a settler injury.

const isGuard = (cp: Compiled, r: ResidentState): boolean => cp.roles[r.role]?.behavior === "guard" && cp.roles[r.role]!.hp > 0;

/** Walking to the med bay: the one time a downed guard can be hit. */
const onTheWay = (st: State, cp: Compiled, g: ResidentState): boolean =>
  g.status === "injured" && (g.downAge ?? 0) >= cp.guards.fallTicks && !hasMedic(st, cp) && st.structures.some((s) => s.type === "struct.medical");

/** Shown lying down: being healed, or a downed guard not walking to the med bay (it lies where it fell, from the moment it falls). */
export const lyingDown = (st: State, cp: Compiled, r: ResidentState): boolean =>
  r.status === "healing" || (r.status === "injured" && isGuard(cp, r) && !onTheWay(st, cp, r));

/** Ticks a downed guard has left before it dies (null when it is not downed): the HUD's countdown. */
export const downLeft = (cp: Compiled, r: ResidentState): number | null =>
  r.status === "injured" && isGuard(cp, r) ? Math.max(0, cp.guards.downTicks - (r.downAge ?? 0)) : null;

/** A guard that has finished falling and can be healed. */
const healable = (cp: Compiled, g: ResidentState): boolean => g.status === "injured" && isGuard(cp, g) && (g.downAge ?? 0) >= cp.guards.fallTicks;

/** Nearest guard strictly within r of p that hostiles can hit: fighting, or on its way to the med bay. */
export function nearestGuard(st: State, cp: Compiled, p: Vec, r: number): ResidentState | null {
  let best: ResidentState | null = null, bd = r * r;
  for (const g of st.residents) {
    if ((g.status !== "ok" && g.status !== "injured") || !isGuard(cp, g)) continue;
    const dx = g.pos.x - p.x, dy = g.pos.y - p.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

export function hitGuard(st: State, cp: Compiled, g: ResidentState, dmg: number, out: SimEvent[]): void {
  const hpMax = cp.roles[g.role]!.hp;
  out.push({ t: "hit", target: "resident", id: g.id, at: { ...g.pos }, by: "hostile" });
  if (g.status === "healing") return; // a medic is at work: nothing can hurt it
  if (g.status !== "ok") {
    // a guard lying where it fell still draws fire but cannot be killed by it (its timer is the only clock); one walking to the med bay takes half damage and dies at 0
    if (!onTheWay(st, cp, g)) return;
    const left = (g.hp ?? hpMax) - Math.max(1, dmg >> 1);
    if (left <= 0) return killGuard(st, g, out);
    g.hp = left;
    return;
  }
  // a big hit stops at 1: going down comes first, whatever hit it
  const hp = Math.max(1, (g.hp ?? hpMax) - dmg);
  g.hp = hp;
  if (hp * 100 > cp.guards.downPct * hpMax) return;
  g.status = "injured"; g.downAge = 0; g.n = 0; g.carry = null; g.mode = "gather"; g.target = null; g.timer = 0;
  out.push({ t: "guard_down", resident: g.id, at: { ...g.pos } });
}

function killGuard(st: State, g: ResidentState, out: SimEvent[]): void {
  st.residents = st.residents.filter((x) => x !== g);
  out.push({ t: "guard_died", resident: g.id, at: { ...g.pos } });
}

const hasMedic = (st: State, cp: Compiled): boolean => st.residents.some((m) => m.status === "ok" && cp.roles[m.role]?.behavior === "medic");

/**
 * A downed guard: lies where it fell while a medic is on hand, else walks to a built med bay (and lies there),
 * else waits for one to be built or a medic to be hired. True when this step handled the resident.
 */
export function downedGuardStep(st: State, cp: Compiled, r: ResidentState, out: SimEvent[]): boolean {
  if (r.status !== "injured" || !isGuard(cp, r)) return false;
  // #92: the clock runs from the fall; at downTicks the guard dies unless healing started (a healing guard is not here)
  r.downAge = (r.downAge ?? 0) + 1;
  if (r.downAge >= cp.guards.downTicks) { killGuard(st, r, out); return true; }
  if (r.downAge < cp.guards.fallTicks) return true; // falling: it does not get up and walk for the med bay either
  if (hasMedic(st, cp)) return true;
  const med = st.structures.find((s) => s.type === "struct.medical");
  if (!med) return true;
  const def = cp.structures[med.type]!;
  const spot = { x: med.pos.x + def.healOffset.x, y: med.pos.y + def.healOffset.y };
  if (boxedMove(st, cp, r.pos, spot, cp.residents.injuredSpeed, cp.residents.arrive)) { r.status = "healing"; r.timer = def.healTicks; }
  return true;
}

/** Healed guards are back at full health. */
export function healedGuard(r: ResidentState): void {
  delete r.downAge;
  if (r.hp !== undefined) delete r.hp;
}

/** A medic goes to the nearest downed guard and heals it in place; otherwise it waits by the med bay or the core. */
export function medicStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole, out: SimEvent[]): void {
  let patient = r.target === null ? null : st.residents.find((g) => String(g.id) === r.target && (g.status === "injured" || g.status === "healing")) ?? null;
  if (!patient) {
    r.target = null;
    const claimed = new Set(st.residents.filter((m) => m !== r && m.target !== null && cp.roles[m.role]?.behavior === "medic").map((m) => m.target));
    let bd = 0;
    for (const g of st.residents) {
      if (!healable(cp, g) || claimed.has(String(g.id))) continue;
      const dx = g.pos.x - r.pos.x, dy = g.pos.y - r.pos.y, d = dx * dx + dy * dy;
      if (!patient || d < bd) { patient = g; bd = d; }
    }
    if (patient) r.target = String(patient.id);
  }
  if (patient) {
    // it stays beside the patient until it is back on its feet
    if (boxedMove(st, cp, r.pos, patient.pos, role.speed, cp.residents.workRange) && healable(cp, patient)) {
      patient.status = "healing";
      patient.timer = role.healTicks;
      out.push({ t: "medic_heal", resident: patient.id, by: r.id, at: { ...patient.pos } });
    }
    return;
  }
  const med = st.structures.find((s) => s.type === "struct.medical");
  const home = med ? med.pos : ringPoint(st.core.pos, r.slot, cp.residents.idleRadiusX, cp.residents.idleRadiusY);
  boxedMove(st, cp, r.pos, home, role.speed, med ? cp.residents.workRange : cp.residents.arrive);
}

// ---------- R5 #23 leash ----------

/** Distance from p to segment ab (fixed point), with products kept below 2^53. */
export function segDist(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x, aby = b.y - a.y, apx = p.x - a.x, apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  const dot = apx * abx + apy * aby;
  if (len2 === 0 || dot <= 0) return isqrt(apx * apx + apy * apy);
  if (dot >= len2) { const bx = p.x - b.x, by = p.y - b.y; return isqrt(bx * bx + by * by); }
  return Math.floor(Math.abs(apx * aby - apy * abx) / isqrt(len2));
}

/** Distance from p to the nearest barrier section (built or not). */
export function wallDist(st: State, p: Vec): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const line of st.barriers) for (const s of line.sections) best = Math.min(best, segDist(p, s.a, s.b));
  return best;
}

/** How far outside the wall p stands (0 inside it). */
const pastWall = (st: State, p: Vec): number => (outsideLines(st, p) ? wallDist(st, p) : 0);

/**
 * The leash line (Doug, R5 #23): how far past the wall the farthest spot a turret can be built stands, built or
 * not ("even a turret space is sufficient"), so it holds from the first tick. Null without walls or turret spaces.
 * Set once when the sim is created.
 */
export function leashLine(st: State, cp: Compiled): number | null {
  if (st.barriers.length === 0) return null;
  let line: number | null = null;
  for (const e of cp.manifest.entities) {
    const type = e.type === "pad.build" ? e.build : e.type;
    if (!cp.structures[type]?.tiers || !("at" in e)) continue;
    const at = "site" in e && e.site ? e.site : e.at;
    line = Math.max(line ?? 0, pastWall(st, { x: fp(at[0]), y: fp(at[1]) }));
  }
  return line;
}

/** moveAgent held inside the player's walk box, on every level. */
export function boxedMove(st: State, cp: Compiled, pos: Vec, target: Vec, step: number, arrive: number): boolean {
  const wb = cp.player.walkBox, r = cp.player.radius;
  const inBox = { x: clamp(target.x, wb.x0 + r, wb.x1 - r), y: clamp(target.y, wb.y0 + r, wb.y1 - r) };
  return moveAgent(st, cp, pos, inBox, step, arrive);
}

/** boxedMove on the leash: a step that would take the agent further out past the line is not taken. */
export function leashedMove(st: State, cp: Compiled, pos: Vec, target: Vec, step: number, arrive: number): boolean {
  const line = cp.guards.leash;
  if (line === null) return boxedMove(st, cp, pos, target, step, arrive);
  const was = { x: pos.x, y: pos.y };
  const arrived = boxedMove(st, cp, pos, target, step, arrive);
  const now = pastWall(st, pos);
  if (now > line && now > pastWall(st, was)) { pos.x = was.x; pos.y = was.y; return within(pos, target, arrive); }
  return arrived;
}

/**
 * #92: the commander heals a downed guard by standing within guards.commanderHealRange of it once its fall is over
 * (no medic or med bay needed). The heal then takes guards.commanderHealSeconds, whether or not he stays.
 */
export function commanderRevive(st: State, cp: Compiled, out: SimEvent[]): void {
  if (st.player.stun > 0) return;
  for (const g of st.residents) {
    if (!healable(cp, g) || !within(g.pos, st.player.pos, cp.guards.reviveRange)) continue;
    g.status = "healing"; g.timer = cp.guards.reviveTicks;
    out.push({ t: "medic_heal", resident: g.id, by: -1, at: { ...g.pos } });
  }
}

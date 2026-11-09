const fs = require("fs");
const F = "packages/sim/src/systems/defense.ts";
let s = fs.readFileSync(F, "utf8");
function ed(a, b) { if (!s.includes(a)) throw new Error("missing: " + a.slice(0, 70)); s = s.replace(a, () => b); }
ed(`import { hitHostile, nearestHostile } from "./combat.js";
import { hint, moveAgent, ringPoint, stepDown, walkAround } from "./common.js";`, `import { hitHostile, nearestHostile, shotEvent } from "./combat.js";
import { blockedAt, hint, ringPoint, stepDown, walkAround } from "./common.js";`);
ed(`hp: def.hp, hpMax: def.hp, side, target: "core", acc: 0 };`, `hp: def.hp, hpMax: def.hp, side, target: "core", acc: 0, shotCd: 0, windup: 0, lungeCd: 0 };`);
ed(`    const def = cp.hostiles[h.type]!;
    // a soldier in reach is fought where it stands (Batch 3: the clash on the road)
    const foe = nearestTroop(st, h.pos, D.troopContact);`, `    const def = cp.hostiles[h.type]!;
    const shooter = def.shotRange > 0;
    h.shotCd = stepDown(h.shotCd);
    h.lungeCd = stepDown(h.lungeCd);
    // #18 lunge: a settler within reach is dashed at after a wind-up spent standing still
    if (def.lungeRange > 0) {
      if (h.windup > 0) {
        h.windup--;
        if (h.windup === 0) lungeDash(st, cp, h, def, out);
        continue;
      }
      if (h.lungeCd <= 0 && pickPerson(st, cp, h.pos, def.lungeRange)) {
        h.windup = Math.max(1, def.lungeWindTicks);
        out.push({ t: "lunge", id: h.id, at: { ...h.pos }, to: { ...h.pos }, windup: true });
        continue;
      }
    }
    // #17 ranged attack: fired while walking on (nobody stops to shoot)
    if (shooter && h.shotCd <= 0) fireShot(st, cp, h, def, out);
    // a soldier in reach is fought where it stands (Batch 3: the clash on the road); shooters keep their distance
    const foe = shooter ? null : nearestTroop(st, h.pos, D.troopContact);`);
ed(`    const guard = nearestGuard(st, cp, h.pos, D.troopContact);`, `    const guard = shooter ? null : nearestGuard(st, cp, h.pos, D.troopContact);`);
ed(`      h.target = "barrier";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0) {`, `      h.target = "barrier";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0 && !shooter) {`);
ed(`      h.target = "base";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0) {
        h.acc = D.baseHitTicks;
        st.meters.baseHealth = Math.max(0, st.meters.baseHealth - D.baseDamage * def.damage);
        out.push({ t: "hit", target: "base", id: 0, at: { ...st.core.pos }, by: "hostile" });
        const victims = st.residents.filter((r) => r.status === "ok" && cp.roles[r.role]?.behavior !== "guard");
        if (victims.length > 0) {
          const v = victims[below(st.rng, victims.length)]!;
          v.status = "injured"; v.n = 0; v.carry = null; v.mode = "gather"; v.target = null; v.timer = cp.residents.selfHealTicks;
          out.push({ t: "injured", resident: v.id });
        }
      }
      continue;`, `      h.target = "base";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0 && !shooter) {
        h.acc = D.baseHitTicks;
        hitBase(st, cp, def.damage, out);
      }
      continue;`);
ed(`  stepFleeing(st, cp);
  hitPlayer(st, cp, out);`, `  separate(st, cp);
  stepFleeing(st, cp);
  hitPlayer(st, cp, out);`);
ed(`      hitHostile(st, cp, foe, def.damage, "structure", out);`, `      shotEvent(out, s.pos, foe.pos, foe.id, "structure");
      hitHostile(st, cp, foe, def.damage, "structure", out);`);
ed(`  for (const s of st.structures) {
    const T = cp.structures[s.type]?.troops;
    if (!T || s.level < T.fromLevel) continue;
    s.acc = stepDown(s.acc);
    const alive = (st.troops ?? []).filter((t) => t.home === s.id).length;
    if (s.acc > 0 || alive >= T.max) continue;`, `  for (const s of st.structures) {
    const T = cp.structures[s.type]?.troops;
    if (!T || s.level < T.fromLevel) continue;
    // #28: drones dock between waves (keeping their hp) and launch one a tick when the next wave starts; new ones are only trained during a wave
    if (st.waves.active && s.docked && s.docked.length > 0) {
      const hp = s.docked.shift()!;
      const t: TroopState = { id: st.nextTroopId ?? 0, pos: { x: s.pos.x, y: s.pos.y + cp.defense.postOffset }, hp, hpMax: T.hp, acc: 0, home: s.id };
      st.nextTroopId = t.id + 1;
      (st.troops ??= []).push(t);
      out.push({ t: "troop_spawned", id: t.id, at: { ...t.pos }, home: s.id });
    }
    if (!st.waves.active) continue;
    s.acc = stepDown(s.acc);
    const alive = (st.troops ?? []).filter((t) => t.home === s.id).length + (s.docked?.length ?? 0);
    if (s.acc > 0 || alive >= T.max) continue;`);
ed(`      if (t.acc <= 0) { t.acc = T.attackTicks; hitHostile(st, cp, foe, T.damage, "troop", out); }
      continue;
    }`, `      if (t.acc <= 0) { t.acc = T.attackTicks; shotEvent(out, t.pos, foe.pos, foe.id, "troop"); hitHostile(st, cp, foe, T.damage, "troop", out); }
      continue;
    }
    if (!st.waves.active && st.hostiles.length === 0 && within(t.pos, home.pos, cp.defense.postOffset * 3)) {
      (home.docked ??= []).push(t.hp);
      st.troops = st.troops!.filter((x) => x !== t);
      out.push({ t: "troop_docked", id: t.id, home: home.id });
      continue;
    }`);
ed(`import type { HostileState, State, TroopState } from "../state.js";`, `import type { HostileState, ResidentState, State, TroopState } from "../state.js";`);
ed(`import { isqrt, mulDiv, within, type Vec } from "../fixed.js";`, `import { FP, isqrt, mulDiv, within, type Vec } from "../fixed.js";`);
s += `
// ---------- attackers' ranged hits, lunges, bodies (Release 2 combat) ----------

type Person = { kind: "guard"; g: ResidentState } | { kind: "troop"; t: TroopState } | { kind: "player" };

/** Nearest settler an attacker can hurt within r: a guard, a drone or the commander (medics are never hurt). */
function pickPerson(st: State, cp: Compiled, p: Vec, r: number): Person | null {
  let best: Person | null = null, bd = r * r;
  const consider = (q: Vec, who: Person): void => {
    const dx = q.x - p.x, dy = q.y - p.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = who; }
  };
  const g = nearestGuard(st, cp, p, r);
  if (g) consider(g.pos, { kind: "guard", g });
  const t = nearestTroop(st, p, r);
  if (t) consider(t.pos, { kind: "troop", t });
  if (st.player.stun === 0) consider(st.player.pos, { kind: "player" });
  return best;
}

const personPos = (w: Person, st: State): Vec => (w.kind === "guard" ? w.g.pos : w.kind === "troop" ? w.t.pos : st.player.pos);
const personId = (w: Person): number => (w.kind === "guard" ? w.g.id : w.kind === "troop" ? w.t.id : 0);

function hurt(st: State, cp: Compiled, w: Person, dmg: number, out: SimEvent[]): void {
  if (w.kind === "guard") return hitGuard(st, cp, w.g, dmg, out);
  if (w.kind === "troop") {
    w.t.hp -= dmg;
    out.push({ t: "hit", target: "troop", id: w.t.id, at: { ...w.t.pos }, by: "hostile" });
    if (w.t.hp <= 0) {
      st.troops = st.troops!.filter((x) => x !== w.t);
      out.push({ t: "died", kind: "unit.troop", id: w.t.id, at: { ...w.t.pos } });
    }
    return;
  }
  damagePlayer(st, cp, dmg, out);
}

/** #21: attackers can hurt the commander. At 0 hp he is down for downTicks (the pack spills, the tow drops), then up healed. */
export function damagePlayer(st: State, cp: Compiled, dmg: number, out: SimEvent[]): void {
  const p = st.player;
  out.push({ t: "hit", target: "player", id: 0, at: { ...p.pos }, by: "hostile" });
  p.healCd = cp.player.healDelayTicks;
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp > 0) return;
  p.hp = cp.player.hp;
  p.stun = cp.player.downTicks;
  p.stunSlow = 0;
  out.push({ t: "downed", at: { ...p.pos } });
  let k = 0;
  while (p.stack.length > 0) {
    const at = { x: p.pos.x + (k & 1 ? -1 : 1) * ((k + 1) >> 1) * 12 * FP, y: p.pos.y + 10 * FP };
    const pos = blockedAt(st, cp, at.x, at.y) ? { ...p.pos } : at;
    const res = p.stack.pop()!;
    st.drops.push({ id: st.nextDropId++, res, pos });
    out.push({ t: "drop", res, at: { ...pos } });
    k++;
  }
  while (p.tow.length > 0) dropTow(st, p.tow[p.tow.length - 1]!, "hit", out);
}

function hitBase(st: State, cp: Compiled, dmg: number, out: SimEvent[]): void {
  st.meters.baseHealth = Math.max(0, st.meters.baseHealth - cp.defense.baseDamage * dmg);
  out.push({ t: "hit", target: "base", id: 0, at: { ...st.core.pos }, by: "hostile" });
  // medics are never hurt (#21); guards have their own health
  const victims = st.residents.filter((r) => r.status === "ok" && cp.roles[r.role]?.behavior !== "guard" && cp.roles[r.role]?.behavior !== "medic");
  if (victims.length > 0) {
    const v = victims[below(st.rng, victims.length)]!;
    v.status = "injured"; v.n = 0; v.carry = null; v.mode = "gather"; v.target = null; v.timer = cp.residents.selfHealTicks;
    out.push({ t: "injured", resident: v.id });
  }
}

/** One shot at the nearest settler in range, else the gate ahead, else the base. Damage is the shot's, times the gate/base params. */
function fireShot(st: State, cp: Compiled, h: HostileState, def: Compiled["hostiles"][string], out: SimEvent[]): void {
  const D = cp.defense;
  const who = pickPerson(st, cp, h.pos, def.shotRange);
  if (who) {
    h.shotCd = def.shotTicks;
    shotEvent(out, h.pos, personPos(who, st), personId(who), "hostile", h.type);
    hurt(st, cp, who, def.shotDamage, out);
    return;
  }
  if (within(h.pos, st.core.pos, D.baseRange)) {
    h.shotCd = def.shotTicks;
    shotEvent(out, h.pos, st.core.pos, 0, "hostile", h.type);
    hitBase(st, cp, def.shotDamage, out);
    return;
  }
  const goal = walkTarget(st, cp, h);
  const dx = goal.x - h.pos.x, dy = goal.y - h.pos.y, d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  const reach = Math.min(d, def.shotRange);
  const hit = firstCrossing(st, h.pos, { x: h.pos.x + mulDiv(dx, reach, d), y: h.pos.y + mulDiv(dy, reach, d) });
  if (!hit) return;
  const sec = hit.line.sections[hit.idx]!;
  if (!sec.gate) return;
  h.shotCd = def.shotTicks;
  shotEvent(out, h.pos, sectionMid(sec), hit.idx, "hostile", h.type);
  sec.hp = Math.max(0, sec.hp - D.barrierDamage * def.shotDamage);
  out.push({ t: "hit", target: "barrier", id: hit.idx, at: { ...h.pos }, by: "hostile" });
  if (sec.hp <= 0) breakSection(st, hit.line, hit.idx, out);
}

/** The dash ends touching its victim and hits for the hostile's damage; a victim that got away costs only the cooldown. */
function lungeDash(st: State, cp: Compiled, h: HostileState, def: Compiled["hostiles"][string], out: SimEvent[]): void {
  h.lungeCd = def.lungeCoolTicks;
  const who = pickPerson(st, cp, h.pos, def.lungeRange + (def.lungeRange >> 1));
  if (!who) return;
  const q = personPos(who, st), dx = q.x - h.pos.x, dy = q.y - h.pos.y, d = isqrt(dx * dx + dy * dy);
  const touch = def.radius + (who.kind === "guard" ? cp.guards.radius : who.kind === "troop" ? cp.defense.troopRadius : cp.player.radius);
  if (d > touch) {
    const to = { x: h.pos.x + mulDiv(dx, d - touch, d), y: h.pos.y + mulDiv(dy, d - touch, d) };
    if (!blockedAt(st, cp, to.x, to.y)) h.pos = to;
  }
  out.push({ t: "lunge", id: h.id, at: { ...h.pos }, to: { ...q }, windup: false });
  hurt(st, cp, who, def.damage, out);
}

/**
 * #20/#29: no body overlaps another. Ground bodies (attackers, guards) push each other apart, drones only drones;
 * the commander walks through everyone. A spatial hash (cells in a Map, visited in body order) keeps ~200 bodies
 * near O(n) and the result deterministic. A push that would land in a wall or rubble is not taken.
 */
function separate(st: State, cp: Compiled): void {
  const bodies: { pos: Vec; r: number; fly: boolean }[] = [];
  for (const h of st.hostiles) bodies.push({ pos: h.pos, r: cp.hostiles[h.type]!.radius, fly: false });
  for (const r of st.residents) if (r.status === "ok" && cp.roles[r.role]?.behavior === "guard") bodies.push({ pos: r.pos, r: cp.guards.radius, fly: false });
  for (const t of st.troops ?? []) bodies.push({ pos: t.pos, r: cp.defense.troopRadius, fly: true });
  if (bodies.length < 2) return;
  const CELL = 32 * FP, key = (cx: number, cy: number): number => (cx + 64) * 1024 + (cy + 64);
  const grid = new Map<number, number[]>();
  bodies.forEach((b, i) => {
    const k = key(Math.floor(b.pos.x / CELL), Math.floor(b.pos.y / CELL)), cell = grid.get(k);
    if (cell) cell.push(i); else grid.set(k, [i]);
  });
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!, cx = Math.floor(a.pos.x / CELL), cy = Math.floor(a.pos.y / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (const j of grid.get(key(gx, gy)) ?? []) {
        if (j <= i) continue;
        const b = bodies[j]!;
        if (a.fly !== b.fly) continue;
        let dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, d = isqrt(dx * dx + dy * dy);
        const gap = a.r + b.r;
        if (d >= gap) continue;
        if (d === 0) { dx = FP; dy = 0; d = FP; }
        const push = (gap - d + 1) >> 1;
        const mx = mulDiv(dx, push, d), my = mulDiv(dy, push, d);
        if (!blockedAt(st, cp, a.pos.x - mx, a.pos.y - my)) { a.pos.x -= mx; a.pos.y -= my; }
        if (!blockedAt(st, cp, b.pos.x + mx, b.pos.y + my)) { b.pos.x += mx; b.pos.y += my; }
      }
    }
  }
}
`;
fs.writeFileSync(F, s);

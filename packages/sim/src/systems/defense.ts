import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, isqrt, mulDiv, within, type Vec } from "../fixed.js";
import { below, between } from "../rng.js";
import type { BarrierState, HostileState, ResidentState, State, TroopState } from "../state.js";
import { attackGate, breakSection, firstCrossing, outsideLines, sectionMid, sectionSide } from "./barriers.js";
import { hitHostile, nearestHostile, shotEvent } from "./combat.js";
import { blockedAt, hint, ringPoint, stepDown, walkAround } from "./common.js";
import { dropTow } from "./lasso.js";
import { hitGuard, leashedMove, nearestGuard, segDist, wallDist } from "./guards.js";

type Side = HostileState["side"];

/**
 * A spawn point just beyond the given map edge. `defense.spawnY` is the (negative) distance outside it.
 * With an attack gate on that side the wave comes down a narrow lane in line with it, spread
 * laneHalfWidth either way (Batch 3: attackers funnel to the gate); otherwise anywhere along the side.
 */
function spawnPoint(st: State, cp: Compiled, side: Side): Vec {
  const D = cp.defense, W = cp.map.w, H = cp.map.h;
  const g = attackGate(st, side);
  const mid = g ? sectionMid(g.line.sections[g.idx]!) : null;
  const along = (len: number, c: number | null): number => (c === null
    ? between(st.rng, D.spawnMarginX, len - D.spawnMarginX)
    : Math.max(0, Math.min(len, c + between(st.rng, -D.laneHalfWidth, D.laneHalfWidth))));
  switch (side) {
    case "n": return { x: along(W, mid && mid.x), y: D.spawnY };
    case "s": return { x: along(W, mid && mid.x), y: H - D.spawnY };
    case "w": return { x: D.spawnY, y: along(H, mid && mid.y) };
    case "e": return { x: W - D.spawnY, y: along(H, mid && mid.y) };
  }
}

/**
 * Where a hostile walks this tick (Batch 3). Walls cannot be broken, so from outside the barrier it makes
 * for the nearest opening facing its attack side (an unbuilt wall section, or its gate once broken), else
 * for that side's gate, which it hits until it breaks; once inside it heads straight for the core.
 */
function walkTarget(st: State, cp: Compiled, h: HostileState): Vec {
  if (st.barriers.length === 0 || !outsideLines(st, h.pos)) return st.core.pos;
  // An opening is walked through: aim a stand-off past its middle, toward the core.
  const through = (m: Vec): Vec => {
    const dx = st.core.pos.x - m.x, dy = st.core.pos.y - m.y, d = isqrt(dx * dx + dy * dy);
    const k = 2 * cp.defense.barrierStop;
    return d <= k ? st.core.pos : { x: m.x + mulDiv(dx, k, d), y: m.y + mulDiv(dy, k, d) };
  };
  let best: Vec | null = null, bd = 0;
  for (const line of st.barriers) for (const s of line.sections) {
    if (s.built || sectionSide(st, s) !== h.side) continue;
    const m = sectionMid(s), dx = m.x - h.pos.x, dy = m.y - h.pos.y, d = dx * dx + dy * dy;
    if (!best || d < bd) { best = m; bd = d; }
  }
  if (best) return through(best);
  const g = attackGate(st, h.side);
  return g ? fanPoint(st, cp, h, g) : st.core.pos;
}

/**
 * #91: attackers fan out in front of the gate instead of queueing at its middle. Each takes a stand-off spot by id:
 * a column (`defense.fanSlots` across, `fanStep` apart, centred on the gate), `barrierStop` out on the side facing away
 * from the core. Bodies that cannot fit are pushed back by the ones in front, so the fan thickens behind its front.
 */
function fanPoint(st: State, cp: Compiled, h: HostileState, gate: { line: BarrierState; idx: number }): Vec {
  const D = cp.defense, s = gate.line.sections[gate.idx]!, m = sectionMid(s);
  const tx = s.b.x - s.a.x, ty = s.b.y - s.a.y, len = isqrt(tx * tx + ty * ty);
  if (len === 0) return m;
  let nx = -ty, ny = tx;
  if (nx * (m.x - st.core.pos.x) + ny * (m.y - st.core.pos.y) < 0) { nx = -nx; ny = -ny; }
  const lat = ((h.id % D.fanSlots) - ((D.fanSlots - 1) >> 1)) * D.fanStep, depth = D.barrierStop;
  return { x: m.x + mulDiv(tx, lat, len) + mulDiv(nx, depth, len), y: m.y + mulDiv(ty, lat, len) + mulDiv(ny, depth, len) };
}

/** The gate this hostile is standing at, hitting it: outside, no opening on its side, and within a stand-off of the gate. */
function gateStand(st: State, cp: Compiled, h: HostileState, busy: Map<BarrierState, number>): { line: BarrierState; idx: number; wait: boolean } | null {
  if (st.barriers.length === 0 || !outsideLines(st, h.pos)) return null;
  for (const line of st.barriers) for (const s of line.sections) if (!s.built && sectionSide(st, s) === h.side) return null;
  const g = attackGate(st, h.side);
  if (!g) return null;
  // the old reach: a body hits the gate once it is a stand-off (plus a step) from it, wherever along it, so the number of
  // hitters is the front of the fan and the damage a wave does to the gate matches the queue's
  const s = g.line.sections[g.idx]!;
  if (segDist(h.pos, s.a, s.b) > cp.defense.barrierStop + cp.hostiles[h.type]!.speed) return null;
  // only gateHitters bodies work on a gate at once, in body order; the rest of the fan holds its place and waits its turn
  const key = g.line, n = busy.get(key) ?? 0;
  busy.set(key, n + 1);
  return { line: g.line, idx: g.idx, wait: n >= cp.defense.gateHitters };
}

/** A hit on the gate from a hostile standing at it. */
function hitGate(st: State, cp: Compiled, line: BarrierState, idx: number, h: HostileState, dmg: number, out: SimEvent[]): void {
  const s = line.sections[idx]!;
  s.hp = Math.max(0, s.hp - cp.defense.barrierDamage * dmg);
  out.push({ t: "hit", target: "barrier", id: idx, at: { ...h.pos }, by: "hostile" });
  if (s.hp <= 0) breakSection(st, line, idx, out);
}

/**
 * One wave at a time: a wave starts at its tick, but never while the last one is still on the field,
 * and only after a quiet spell once it is cleared (Doug, 2026-10-18).
 * Waves spawn beyond their attack side(s); hostiles walk to their gate (or an opening), hit the gate
 * until it breaks, then go on to hit the base.
 */
export function stepDefense(st: State, cp: Compiled, out: SimEvent[]): void {
  const W = st.waves;
  const wave = cp.waves[W.idx];
  if (wave && st.tick >= wave.tick && !W.active && st.tick >= W.quietUntil) {
    wave.types.forEach((type, k) => {
      const p: (typeof W.pending)[number] = { tick: st.tick + k * wave.gapTicks, type, side: wave.sides[k % wave.sides.length]! };
      if (wave.retreatPct !== undefined && cp.hostiles[type]!.boss) p.retreatPct = wave.retreatPct;
      W.pending.push(p);
    });
    W.idx++;
    W.active = true;
    out.push({ t: "wave_started", idx: W.idx });
    hint(st, out, "wave_incoming");
  }
  while (W.pending.length > 0 && st.tick >= W.pending[0]!.tick) {
    const { type, side, retreatPct } = W.pending.shift()!;
    const def = cp.hostiles[type]!;
    const h: HostileState = { id: st.nextHostileId++, type, pos: spawnPoint(st, cp, side), hp: def.hp, hpMax: def.hp, side, target: "core", acc: 0, shotCd: 0, windup: 0, lungeCd: 0 };
    if (retreatPct !== undefined) h.retreatHp = Math.max(1, mulDiv(def.hp, retreatPct, 100));
    st.hostiles.push(h);
    if (def.boss) out.push({ t: "boss_spawned", id: h.id, kind: type, at: { ...h.pos } });
  }

  const D = cp.defense;
  const busy = new Map<BarrierState, number>(); // bodies working each gate this tick (#91)
  for (const h of [...st.hostiles]) {
    const def = cp.hostiles[h.type]!;
    const shooter = def.shotRange > 0;
    h.shotCd = stepDown(h.shotCd ?? 0);
    h.lungeCd = stepDown(h.lungeCd ?? 0);
    // #18 lunge: a settler within reach is dashed at after a wind-up spent standing still
    if (def.lungeRange > 0) {
      if ((h.windup ?? 0) > 0) {
        h.windup = h.windup! - 1;
        if (h.windup === 0) lungeDash(st, cp, h, def, out);
        continue;
      }
      if (h.lungeCd! <= 0 && pickPerson(st, cp, h.pos, def.lungeRange)) {
        h.windup = Math.max(1, def.lungeWindTicks);
        out.push({ t: "lunge", id: h.id, at: { ...h.pos }, to: { ...h.pos }, windup: true });
        continue;
      }
    }
    // #91: at the gate, only the first gateHitters bodies hit it (counted once per tick)
    const stand = gateStand(st, cp, h, busy);
    // #17 ranged attack: fired while walking on (nobody stops to shoot)
    if (shooter && h.shotCd! <= 0) fireShot(st, cp, h, def, stand, out);
    // a soldier in reach is fought where it stands (Batch 3: the clash on the road); shooters keep their distance
    const foe = shooter ? null : nearestTroop(st, h.pos, D.troopContact);
    if (foe) {
      h.target = "troop";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0) {
        h.acc = D.barrierHitTicks;
        foe.hp -= def.damage;
        out.push({ t: "hit", target: "troop", id: foe.id, at: { ...foe.pos }, by: "hostile" });
        if (foe.hp <= 0) {
          st.troops = st.troops!.filter((x) => x !== foe);
          out.push({ t: "died", kind: "unit.troop", id: foe.id, at: { ...foe.pos } });
        }
      }
      continue;
    }
    // R5 #26: a guard in reach is fought too (it has health now)
    const guard = shooter ? null : nearestGuard(st, cp, h.pos, D.troopContact);
    if (guard) {
      h.target = "troop";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0) { h.acc = D.barrierHitTicks; hitGuard(st, cp, guard, def.damage, out); }
      continue;
    }
    if (stand) {
      h.target = "barrier";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0 && !shooter && !stand.wait) { h.acc = D.barrierHitTicks; hitGate(st, cp, stand.line, stand.idx, h, def.damage, out); }
      continue;
    }
    const goal = walkTarget(st, cp, h);
    const dx = goal.x - h.pos.x, dy = goal.y - h.pos.y, d = isqrt(dx * dx + dy * dy);
    // Look one step plus the stand-off distance ahead; a built section in the way stops the walk.
    const look = def.speed + D.barrierStop;
    const ahead = d === 0 ? null : firstCrossing(st, h.pos, { x: h.pos.x + mulDiv(dx, look, d), y: h.pos.y + mulDiv(dy, look, d) });
    // A standing wall only blocks (walls cannot be broken); a gate in the way is hit until it breaks.
    if (ahead && !ahead.line.sections[ahead.idx]!.gate) { h.target = "core"; continue; }
    if (ahead) {
      h.target = "barrier";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0 && !shooter) {
        h.acc = D.barrierHitTicks;
        const s = ahead.line.sections[ahead.idx]!;
        s.hp = Math.max(0, s.hp - D.barrierDamage * def.damage);
        out.push({ t: "hit", target: "barrier", id: ahead.idx, at: { ...h.pos }, by: "hostile" });
        if (s.hp <= 0) breakSection(st, ahead.line, ahead.idx, out);
      }
      continue;
    }
    if (within(h.pos, st.core.pos, D.baseRange)) {
      h.target = "base";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0 && !shooter) {
        h.acc = D.baseHitTicks;
        hitBase(st, cp, def.damage, out);
      }
      continue;
    }
    h.target = "core";
    walkAround(st, cp, h.pos, goal, def.speed);
  }

  separate(st, cp);
  stepFleeing(st, cp);
  hitPlayer(st, cp, out);
  stepTroops(st, cp, out);

  for (const s of st.structures) {
    const def = cp.structures[s.type]!;
    if (!def.tiers) continue;
    const tier = def.tiers[Math.min(s.level, def.tiers.length) - 1]!;
    s.acc = stepDown(s.acc);
    const foe = nearestHostile(st, s.pos, tier.range);
    if (foe && s.acc <= 0) {
      s.acc = tier.rateTicks;
      shotEvent(out, s.pos, foe.pos, foe.id, "structure");
      hitHostile(st, cp, foe, def.damage, "structure", out);
    }
  }

  if (W.active && W.pending.length === 0 && st.hostiles.length === 0) {
    W.active = false;
    W.quietUntil = st.tick + cp.defense.waveQuietTicks;
    out.push({ t: "wave_cleared", idx: W.idx });
  }
}

function nearestTroop(st: State, p: Vec, r: number): TroopState | null {
  let best: TroopState | null = null, bd = r * r;
  for (const t of st.troops ?? []) {
    const dx = t.pos.x - p.x, dy = t.pos.y - p.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/**
 * Guard posts at their troop level train a soldier every interval (up to their max alive). A soldier marches
 * out to the nearest attacker (through that side's gate), fights it hand to hand and can die; with the field
 * clear it walks back to its post (Batch 3, after Kingshot).
 */
function stepTroops(st: State, cp: Compiled, out: SimEvent[]): void {
  for (const s of st.structures) {
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
    if (s.acc > 0 || alive >= T.max) continue;
    s.acc = T.everyTicks;
    const t: TroopState = { id: st.nextTroopId ?? 0, pos: { x: s.pos.x, y: s.pos.y + cp.defense.postOffset }, hp: T.hp, hpMax: T.hp, acc: 0, home: s.id };
    st.nextTroopId = t.id + 1;
    (st.troops ??= []).push(t);
    out.push({ t: "troop_spawned", id: t.id, at: { ...t.pos }, home: s.id });
  }
  for (const t of [...(st.troops ?? [])]) {
    const home = st.structures.find((x) => x.id === t.home);
    const T = home ? cp.structures[home.type]!.troops! : null;
    if (!home || !T) continue;
    t.acc = stepDown(t.acc);
    const foe = nearestHostile(st, t.pos, T.attackRange);
    if (foe) {
      if (t.acc <= 0) { t.acc = T.attackTicks; shotEvent(out, t.pos, foe.pos, foe.id, "troop"); hitHostile(st, cp, foe, T.damage, "troop", out); }
      continue;
    }
    if (!st.waves.active && st.hostiles.length === 0 && within(t.pos, home.pos, cp.defense.postOffset * 3)) {
      (home.docked ??= []).push(t.hp);
      st.troops = st.troops!.filter((x) => x !== t);
      out.push({ t: "troop_docked", id: t.id, home: home.id });
      continue;
    }
    let target: HostileState | null = null, bd = 0;
    for (const h of st.hostiles) {
      const dx = h.pos.x - t.pos.x, dy = h.pos.y - t.pos.y, d = dx * dx + dy * dy;
      if (!target || d < bd) { target = h; bd = d; }
    }
    const outside = st.barriers.length > 0 && outsideLines(st, t.pos);
    // with the field clear they stand in a loose ring round their post, not on one spot
    let goal: Vec = target ? target.pos : ringPoint(home.pos, t.id, cp.defense.postOffset * 2, cp.defense.postOffset * 3 / 2);
    if (target && !outside && st.barriers.length > 0 && outsideLines(st, target.pos)) {
      const g = attackGate(st, target.side);
      const door = g ? sectionMid(g.line.sections[g.idx]!) : nearestGateMid(st, target.pos);
      if (door && !within(t.pos, door, cp.defense.barrierStop)) goal = door;
    } else if (!target && outside) {
      const g = nearestGateMid(st, t.pos);
      if (g && !within(t.pos, g, cp.defense.barrierStop)) goal = g;
    }
    leashedMove(st, cp, t.pos, goal, T.speed, cp.residents.arrive);
  }
}

function nearestGateMid(st: State, p: Vec): Vec | null {
  let best: Vec | null = null, bd = 0;
  for (const line of st.barriers) for (const s of line.sections) {
    if (!s.gate) continue;
    const m = sectionMid(s), dx = m.x - p.x, dy = m.y - p.y, d = dx * dx + dy * dy;
    if (!best || d < bd) { best = m; bd = d; }
  }
  return best;
}

/** A hostile in contact hits the player (no health of its own); a hit makes the tow drop its rearmost captive. */
function hitPlayer(st: State, cp: Compiled, out: SimEvent[]): void {
  const p = st.player;
  p.hitCd = stepDown(p.hitCd);
  if (p.hitCd > 0) return;
  const foe = nearestHostile(st, p.pos, cp.defense.playerHitRange);
  if (!foe) return;
  p.hitCd = cp.defense.playerHitTicks;
  out.push({ t: "hit", target: "player", id: 0, at: { ...p.pos }, by: "hostile" });
  if (p.tow.length > 0) dropTow(st, p.tow[p.tow.length - 1]!, "hit", out);
}

export const wavesDone = (st: State, cp: Compiled): boolean =>
  cp.waves.length > 0 && st.waves.idx >= cp.waves.length && st.waves.pending.length === 0 && st.hostiles.length === 0;

/** Retreating hostiles walk straight back out past their attack edge and are gone once they reach it. */
function stepFleeing(st: State, cp: Compiled): void {
  const F = st.fleeing;
  if (!F || F.length === 0) return;
  const D = cp.defense, W = cp.map.w, H = cp.map.h;
  for (const h of [...F]) {
    const goal: Vec = h.side === "n" ? { x: h.pos.x, y: D.spawnY } : h.side === "s" ? { x: h.pos.x, y: H - D.spawnY }
      : h.side === "w" ? { x: D.spawnY, y: h.pos.y } : { x: W - D.spawnY, y: h.pos.y };
    const speed = D.fleeSpeed > 0 ? D.fleeSpeed : cp.hostiles[h.type]!.speed;
    const dx = goal.x - h.pos.x, dy = goal.y - h.pos.y, d = isqrt(dx * dx + dy * dy);
    if (d <= speed) { F.splice(F.indexOf(h), 1); continue; }
    h.pos.x += mulDiv(dx, speed, d);
    h.pos.y += mulDiv(dy, speed, d);
  }
}

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
  // the commander is the last choice: guards and drones draw fire first (he is hit only when nobody else is in reach)
  if (!best && st.player.stun === 0) consider(st.player.pos, { kind: "player" });
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
function fireShot(st: State, cp: Compiled, h: HostileState, def: Compiled["hostiles"][string], stand: ReturnType<typeof gateStand>, out: SimEvent[]): void {
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
  if (stand) {
    if (stand.wait) return;
    h.shotCd = def.shotTicks;
    shotEvent(out, h.pos, sectionMid(stand.line.sections[stand.idx]!), stand.idx, "hostile", h.type);
    hitGate(st, cp, stand.line, stand.idx, h, def.shotDamage, out);
    return;
  }
  const goal = walkTarget(st, cp, h);
  const dx = goal.x - h.pos.x, dy = goal.y - h.pos.y, d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  // gates are hit from the stand-off distance only (as the old contact blow was); range matters for people, not walls
  const reach = Math.min(d, def.speed + D.barrierStop);
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
        // a push never carries a body across a wall or gate line, nor within the stand-off distance of one, nor into rubble
        const stop = cp.defense.barrierStop, ext = (k: number): number => (push === 0 ? 0 : mulDiv(k, push + stop, push));
        const ax = a.pos.x - mx, ay = a.pos.y - my, bx = b.pos.x + mx, by = b.pos.y + my;
        // (a sideways shove may not carry a body in toward a wall either: it stays outside the stand-off, or no nearer than it was)
        const nearer = (nx: number, ny: number, p: Vec): boolean => st.barriers.length > 0 && wallDist(st, { x: nx, y: ny }) < Math.min(stop, wallDist(st, p));
        if (!blockedAt(st, cp, ax, ay) && !firstCrossing(st, a.pos, { x: a.pos.x - ext(mx), y: a.pos.y - ext(my) }) && !nearer(ax, ay, a.pos)) { a.pos.x = ax; a.pos.y = ay; }
        if (!blockedAt(st, cp, bx, by) && !firstCrossing(st, b.pos, { x: b.pos.x + ext(mx), y: b.pos.y + ext(my) }) && !nearer(bx, by, b.pos)) { b.pos.x = bx; b.pos.y = by; }
      }
    }
  }
}

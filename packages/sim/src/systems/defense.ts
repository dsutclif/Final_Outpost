import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { isqrt, mulDiv, within, type Vec } from "../fixed.js";
import { below, between } from "../rng.js";
import type { HostileState, State, TroopState } from "../state.js";
import { attackGate, breakSection, firstCrossing, outsideLines, sectionMid, sectionSide } from "./barriers.js";
import { hitHostile, nearestHostile } from "./combat.js";
import { hint, moveAgent, ringPoint, stepDown, walkAround } from "./common.js";
import { dropTow } from "./lasso.js";

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
  return g ? sectionMid(g.line.sections[g.idx]!) : st.core.pos;
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
    wave.types.forEach((type, k) => W.pending.push({ tick: st.tick + k * wave.gapTicks, type, side: wave.sides[k % wave.sides.length]! }));
    W.idx++;
    W.active = true;
    out.push({ t: "wave_started", idx: W.idx });
    hint(st, out, "wave_incoming");
  }
  while (W.pending.length > 0 && st.tick >= W.pending[0]!.tick) {
    const { type, side } = W.pending.shift()!;
    const def = cp.hostiles[type]!;
    const h: HostileState = { id: st.nextHostileId++, type, pos: spawnPoint(st, cp, side), hp: def.hp, hpMax: def.hp, side, target: "core", acc: 0 };
    st.hostiles.push(h);
    if (def.boss) out.push({ t: "boss_spawned", id: h.id, kind: type, at: { ...h.pos } });
  }

  const D = cp.defense;
  for (const h of [...st.hostiles]) {
    const def = cp.hostiles[h.type]!;
    // a soldier in reach is fought where it stands (Batch 3: the clash on the road)
    const foe = nearestTroop(st, h.pos, D.troopContact);
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
      if (h.acc <= 0) {
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
      continue;
    }
    h.target = "core";
    walkAround(st, cp, h.pos, goal, def.speed);
  }

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
    s.acc = stepDown(s.acc);
    const alive = (st.troops ?? []).filter((t) => t.home === s.id).length;
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
      if (t.acc <= 0) { t.acc = T.attackTicks; hitHostile(st, cp, foe, T.damage, "troop", out); }
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
      const door = g ? sectionMid(g.line.sections[g.idx]!) : null;
      if (door && !within(t.pos, door, cp.defense.barrierStop)) goal = door;
    } else if (!target && outside) {
      const g = nearestGateMid(st, t.pos);
      if (g && !within(t.pos, g, cp.defense.barrierStop)) goal = g;
    }
    moveAgent(st, cp, t.pos, goal, T.speed, cp.residents.arrive);
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

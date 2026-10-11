import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, isqrt, moveToward, mulDiv, within, type Vec } from "../fixed.js";
import { below, between } from "../rng.js";
import type { HostileState, State } from "../state.js";
import { breakSection, firstCrossing, outsideLine } from "./barriers.js";
import { hitHostile, nearestHostile } from "./combat.js";
import { hint, nearSegment, stepDown } from "./common.js";
import { dropTow } from "./lasso.js";

type Side = HostileState["side"];

/** A spawn point just beyond the given map edge. `defense.spawnY` is the (negative) distance outside it. */
function spawnPoint(st: State, cp: Compiled, side: Side): Vec {
  const D = cp.defense, W = cp.map.w, H = cp.map.h;
  const along = (len: number): number => between(st.rng, D.spawnMarginX, len - D.spawnMarginX);
  switch (side) {
    case "n": return { x: along(W), y: D.spawnY };
    case "s": return { x: along(W), y: H - D.spawnY };
    case "w": return { x: D.spawnY, y: along(H) };
    case "e": return { x: W - D.spawnY, y: along(H) };
  }
}

/**
 * Where a hostile walks this tick. Until it is past an open barrier line (outside it, or within
 * steerBand of it) it drifts only slightly sideways toward the core, so attackers meet the wall
 * spread out along their attack side; after that, and always around a closed ring, it heads
 * straight for the core.
 */
function walkTarget(st: State, cp: Compiled, h: HostileState): Vec {
  const D = cp.defense, c = st.core.pos;
  const approaching = st.barriers.some((line) => !line.closed
    && (outsideLine(st, line, h.pos) || line.sections.some((s) => nearSegment(h.pos, s.a, s.b, D.steerBand))));
  if (!approaching) return c;
  if (h.side === "n" || h.side === "s") return { x: h.pos.x + mulDiv(c.x - h.pos.x, D.steerRate, FP), y: c.y };
  return { x: c.x, y: h.pos.y + mulDiv(c.y - h.pos.y, D.steerRate, FP) };
}

/**
 * Waves spawn beyond their attack side(s); hostiles walk to the core, stop at any built section
 * (gates included) their next step would cross, hit it until it breaks, then hit the base.
 */
export function stepDefense(st: State, cp: Compiled, out: SimEvent[]): void {
  const W = st.waves;
  const wave = cp.waves[W.idx];
  if (wave && st.tick >= wave.tick) {
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
    const goal = walkTarget(st, cp, h);
    const dx = goal.x - h.pos.x, dy = goal.y - h.pos.y, d = isqrt(dx * dx + dy * dy);
    // Look one step plus the stand-off distance ahead; a built section in the way stops the walk.
    const look = def.speed + D.barrierStop;
    const ahead = d === 0 ? null : firstCrossing(st, h.pos, { x: h.pos.x + mulDiv(dx, look, d), y: h.pos.y + mulDiv(dy, look, d) });
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
          v.status = "injured"; v.n = 0; v.carry = null; v.mode = "gather"; v.target = null;
          out.push({ t: "injured", resident: v.id });
        }
      }
      continue;
    }
    h.target = "core";
    moveToward(h.pos, goal, def.speed, 1);
  }

  hitPlayer(st, cp, out);

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
    out.push({ t: "wave_cleared", idx: W.idx });
  }
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

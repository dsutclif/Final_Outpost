import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, moveToward, mulDiv, within } from "../fixed.js";
import { below, between } from "../rng.js";
import type { BarrierSectionState, BarrierState, HostileState, State } from "../state.js";
import { breakSection } from "./barriers.js";
import { barrierYAt, hitHostile, nearestHostile } from "./combat.js";
import { hint, stepDown } from "./common.js";

interface Ahead { line: BarrierState; idx: number; s: BarrierSectionState; stopY: number }

/** The nearest built section ahead of a hostile walking toward larger y, if its x is covered. */
function sectionAhead(st: State, cp: Compiled, h: HostileState): Ahead | null {
  let best: Ahead | null = null;
  for (const line of st.barriers) {
    for (let i = 0; i < line.sections.length; i++) {
      const s = line.sections[i]!;
      if (!s.built || s.a.x === s.b.x) continue;
      const lo = Math.min(s.a.x, s.b.x), hi = Math.max(s.a.x, s.b.x);
      if (h.pos.x <= lo || h.pos.x >= hi) continue;
      const yAt = s.a.y + mulDiv(s.b.y - s.a.y, h.pos.x - s.a.x, s.b.x - s.a.x);
      const stopY = yAt - cp.defense.barrierStop;
      if (h.pos.y >= stopY) continue;
      if (!best || stopY < best.stopY) best = { line, idx: i, s, stopY };
    }
  }
  return best;
}

/** Waves spawn at the attack edge; hostiles walk to the core, stop at built barriers and hit them, then hit the base. */
export function stepDefense(st: State, cp: Compiled, out: SimEvent[]): void {
  const W = st.waves;
  const wave = cp.waves[W.idx];
  if (wave && st.tick >= wave.tick) {
    wave.types.forEach((type, k) => W.pending.push({ tick: st.tick + k * cp.defense.spawnGapTicks, type }));
    W.idx++;
    W.active = true;
    out.push({ t: "wave_started", idx: W.idx });
    hint(st, out, "wave_incoming");
  }
  while (W.pending.length > 0 && st.tick >= W.pending[0]!.tick) {
    const { type } = W.pending.shift()!;
    st.hostiles.push({
      id: st.nextHostileId++, type,
      pos: { x: between(st.rng, cp.defense.spawnMarginX, cp.map.w - cp.defense.spawnMarginX), y: cp.defense.spawnY },
      hp: cp.hostiles[type]!.hp, target: "core", acc: 0,
    });
  }

  const D = cp.defense;
  for (const h of [...st.hostiles]) {
    const def = cp.hostiles[h.type]!;
    const ahead = sectionAhead(st, cp, h);
    if (ahead && h.pos.y + def.speed >= ahead.stopY) {
      h.target = "barrier";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0) {
        h.acc = D.barrierHitTicks;
        ahead.s.hp -= D.barrierDamage;
        out.push({ t: "hit", target: "barrier", id: ahead.idx, at: { ...h.pos }, by: "hostile" });
        if (ahead.s.hp <= 0) breakSection(st, ahead.line, ahead.idx, out);
      }
      continue;
    }
    if (within(h.pos, st.core.pos, D.baseRange)) {
      h.target = "base";
      h.acc = stepDown(h.acc);
      if (h.acc <= 0) {
        h.acc = D.baseHitTicks;
        st.meters.baseHealth = Math.max(0, st.meters.baseHealth - D.baseDamage);
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
    // Before passing the line hostiles drift only slightly toward the core, so they meet the wall spread out.
    const lineY = barrierYAt(st, h.pos.x) ?? st.barriers[0]?.a.y;
    const tx = lineY !== undefined && h.pos.y < lineY + D.steerBand
      ? h.pos.x + mulDiv(st.core.pos.x - h.pos.x, D.steerRate, FP)
      : st.core.pos.x;
    moveToward(h.pos, { x: tx, y: st.core.pos.y }, def.speed, 1);
  }

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

export const wavesDone = (st: State, cp: Compiled): boolean =>
  cp.waves.length > 0 && st.waves.idx >= cp.waves.length && st.waves.pending.length === 0 && st.hostiles.length === 0;

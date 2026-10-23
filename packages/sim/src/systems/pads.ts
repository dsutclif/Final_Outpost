import type { Compiled, CompiledEffect } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, mulDiv, within, type Vec } from "../fixed.js";
import type { PadState, State, StructureState } from "../state.js";
import { hint, idleResidents, take } from "./common.js";
import { coreFuelCap } from "./core.js";
import { placeConverter } from "./converters.js";
import { isAutomation, isDefence, jobDone, jobOf, padCost } from "./economy.js";

type HireEnt = Extract<Compiled["entityById"][string], { type: "pad.hire" }>;
type BuildEnt = Extract<Compiled["entityById"][string], { type: "pad.build" }>;
const padEnt = (cp: Compiled, pad: PadState): HireEnt | BuildEnt => cp.entityById[pad.id] as HireEnt | BuildEnt;

const padDone = (st: State, id: string): boolean => st.pads.some((p) => p.id === id && p.done) || st.built.includes(id);

/** Visibility (required pad done, enough waves started) and locks (core level, idle resident) are recomputed every tick for renderers. */
export function refreshPads(st: State, cp: Compiled): void {
  const idle = idleResidents(st).length;
  for (const pad of st.pads) {
    const e = padEnt(cp, pad);
    const req = e.requires;
    pad.visible = !(req?.pad !== undefined && !padDone(st, req.pad)) && !(req?.wave !== undefined && st.waves.idx < req.wave);
    // manual first: the first hire of a job kind waits until the player has done that job by hand
    if (pad.visible && e.type === "pad.hire" && e.manual) { const job = jobOf(cp, e); if (job && !jobDone(st, job)) pad.visible = false; }
    pad.locked = (req?.coreLevel !== undefined && st.core.level < req.coreLevel) || (e.type === "pad.hire" && idle === 0);
  }
}

const padRange = (cp: Compiled, pad: PadState): number => {
  const e = padEnt(cp, pad);
  return e.type === "pad.build" && e.big ? cp.pads.bigRange : cp.pads.range;
};

/**
 * Which pad the player stands on and for how long. Payment waits until the player has stayed on
 * one pad for `pads.dwell`, so walking across a pad never spends by accident; leaving resets it.
 */
export function trackPadDwell(st: State, cp: Compiled): void {
  const p = st.player;
  let on: string | null = null;
  for (const pad of st.pads) {
    if (pad.done || !pad.visible) continue;
    if (within(p.pos, pad.pos, padRange(cp, pad))) { on = pad.id; break; }
  }
  // after a purchase the player steps off before the next pad (the next level on the same spot) takes scrap
  if (p.padLeave) {
    if (on !== null) { p.padId = null; p.padDwell = 0; return; }
    delete p.padLeave;
  }
  if (on !== p.padId) { p.padId = on; p.padDwell = 0; }
  if (on !== null && p.padDwell < cp.pads.dwellTicks) p.padDwell++;
}

/** The player stands on a pad: pay one unit (backpack first, then currency) or hint why not. Returns true if the pad consumed the action. */
export function tryPayPad(st: State, cp: Compiled, out: SimEvent[]): boolean {
  const p = st.player;
  for (const pad of st.pads) {
    if (pad.done || !pad.visible) continue;
    const e = padEnt(cp, pad);
    if (!within(p.pos, pad.pos, padRange(cp, pad))) continue;
    if (pad.id !== p.padId || p.padDwell < cp.pads.dwellTicks) continue;
    if (e.requires?.coreLevel !== undefined && st.core.level < e.requires.coreLevel) { hint(st, out, "needs_core_level"); return true; }
    if (e.type === "pad.hire" && idleResidents(st).length === 0) { hint(st, out, "no_idle_resident"); return true; }
    const costs = Object.entries(padCost(st, cp, e));
    // Carried items go first so a player holding salvage or planks sees them land before coins.
    for (const [res, n] of costs) {
      if (cp.resources[res]!.cap === null || (pad.paid[res] ?? 0) >= n || !take(p.stack, res)) continue;
      pad.paid[res] = (pad.paid[res] ?? 0) + 1;
      p.actCd = cp.pads.payItemTicks;
      out.push({ t: "pad_paid", pad: pad.id, res, n: pad.paid[res]! });
      if (fullyPaid(st, cp, e, pad)) build(st, cp, pad, e, out);
      return true;
    }
    const cur = costs.find(([res, n]) => cp.resources[res]!.cap === null && (pad.paid[res] ?? 0) < n);
    if (cur) {
      if (st.currency <= 0) { hint(st, out, "not_enough_currency"); return true; }
      st.currency--;
      pad.paid[cur[0]] = (pad.paid[cur[0]] ?? 0) + 1;
      p.actCd = cp.pads.payCurrencyTicks;
      out.push({ t: "pad_paid", pad: pad.id, res: cur[0], n: pad.paid[cur[0]]! });
      if (fullyPaid(st, cp, e, pad)) build(st, cp, pad, e, out);
      return true;
    }
    if (!fullyPaid(st, cp, e, pad)) { hint(st, out, "need_resource"); return true; }
    build(st, cp, pad, e, out);
    return true;
  }
  return false;
}

const fullyPaid = (st: State, cp: Compiled, e: HireEnt | BuildEnt, pad: PadState): boolean =>
  Object.entries(padCost(st, cp, e)).every(([res, n]) => (pad.paid[res] ?? 0) >= n);

function build(st: State, cp: Compiled, pad: PadState, e: HireEnt | BuildEnt, out: SimEvent[]): void {
  if (e.type === "pad.hire") {
    const pool = idleResidents(st).sort((a, b) => dist2(a.pos, pad.pos) - dist2(b.pos, pad.pos) || a.id - b.id);
    const s = pool[0];
    if (!s) return; // keep the payment; the pad stays locked until someone is free
    s.role = e.role.role;
    s.assign = { from: e.role.from ?? null, to: e.role.to ?? null, node: e.role.node ?? null, post: null };
    s.mode = "gather"; s.n = 0; s.carry = null; s.acc = 0; s.target = null;
    if (cp.roles[s.role]?.behavior === "guard") s.assign.post = st.residents.filter((r) => r.role === s.role).length - 1;
    out.push({ t: "hired", pad: pad.id, resident: s.id, role: s.role });
    st.automation = (st.automation ?? 0) + 1;
  } else {
    applyBuild(st, cp, pad, e, out);
    out.push({ t: "built", pad: pad.id, build: e.build, at: { ...pad.pos } });
    if (isAutomation(cp, e)) st.automation = (st.automation ?? 0) + 1;
    if (!st.built.includes(pad.id)) st.built.push(pad.id);
  }
  if (isDefence(cp, e)) st.defenceBought = (st.defenceBought ?? 0) + 1;
  st.player.padLeave = true;
  // A repeatable converter upgrade retires once the converter is at its top level.
  const maxed = e.type === "pad.build" && e.build === "conv.level" && convMaxed(st, cp, e.target);
  if (e.repeatable && !maxed) { pad.done = false; pad.paid = {}; }
  else pad.done = true;
}

function convMaxed(st: State, cp: Compiled, id: string | undefined): boolean {
  const cv = st.converters.find((c) => c.id === id);
  return !cv || cv.level >= cp.converters[cv.type]!.rateTicksByLevel.length;
}

const dist2 = (a: Vec, b: Vec): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

function applyBuild(st: State, cp: Compiled, pad: PadState, e: BuildEnt, out: SimEvent[]): void {
  const b = e.build;
  if (b === "node.enable") {
    const n = st.nodes.find((x) => x.id === e.target);
    if (n) n.enabled = true;
    out.push({ t: "unlocked", pad: pad.id, target: e.target! });
    return;
  }
  if (b === "sink.core.level") {
    st.core.level = Math.min(cp.core.levels.length, st.core.level + 1);
    st.core.fuel = Math.min(coreFuelCap(st, cp), st.core.fuel + cp.core.upgradeFuelBonus);
    out.push({ t: "core_upgraded", level: st.core.level });
    return;
  }
  if (b === "zone.clear") {
    const z = st.zones.find((x) => x.id === e.target);
    if (z) z.cleared = true;
    out.push({ t: "zone_cleared", zone: e.target! });
    return;
  }
  if (b === "conv.level") {
    const cv = st.converters.find((c) => c.id === e.target);
    if (cv && !convMaxed(st, cp, cv.id)) {
      cv.level++;
      out.push({ t: "converter_upgraded", conv: cv.id, level: cv.level });
    }
    return;
  }
  const at = pad.site ?? pad.pos;
  if (b.startsWith("conv.")) { placeConverter(st, cp, pad.id, b, at); return; }
  if (b === "struct.conveyor") {
    if (e.link) (st.conveyors ??= []).push({ id: pad.id, from: e.link.from, to: e.link.to, items: [], acc: 0 });
    return;
  }
  const up = cp.upgrades[b];
  if (up) {
    const target = e.target !== undefined ? st.structures.find((s) => s.id === e.target) ?? null : null;
    applyEffects(st, up.effects, target);
    return;
  }
  const def = cp.structures[b]!;
  const s: StructureState = { id: pad.id, type: b, pos: { ...at }, level: 1, acc: 0 };
  if (def.hp !== null) { s.hp = def.hp; s.hpMax = def.hp; }
  st.structures.push(s);
  if (b === "struct.depot") st.depot = { pos: { ...at }, stock: {}, stores: [] };
  applyEffects(st, def.effects, s);
}

/** Data operations from content: set/add/multiply on level params, a target structure, or every barrier section. */
export function applyEffects(st: State, effects: readonly CompiledEffect[], target: StructureState | null): void {
  const apply = (cur: number, e: CompiledEffect): number =>
    e.op === "set" ? e.value : e.op === "add" ? cur + e.value : mulDiv(cur, e.value, FP);
  for (const e of effects) {
    if (e.scope === "params") {
      st.params[e.param!] = apply(st.params[e.param!] ?? 0, e);
    } else if (e.scope === "target") {
      if (!target) continue;
      const f = e.field!;
      target[f] = apply(target[f] ?? 0, e);
    } else {
      for (const line of st.barriers) for (const s of line.sections) {
        if (e.gate !== null && s.gate !== e.gate) continue;
        if (e.field === "hp") { if (s.built) s.hp = Math.min(s.hpMax, apply(s.hp, e)); }
        else if (e.field === "hpMax") { s.hpMax = apply(s.hpMax, e); if (s.built) s.hp = Math.min(s.hp, s.hpMax); }
      }
    }
  }
}

import type { Compiled, CompiledRole } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, mulDiv, within, type Vec } from "../fixed.js";
import type { ConverterState, DropState, NodeState, PreyState, ResidentState, State } from "../state.js";
import { attackedSide, guardPost } from "./barriers.js";
import { hitHostile, hitPrey, nearestHostile } from "./combat.js";
import { depotPut, moveAgent, ringPoint, stepDown } from "./common.js";
import { coreFuelCap, feedCoreWith } from "./core.js";

// Residents are data-driven state machines: a role id picks the behaviour, the assignment
// supplies what to take and where to deliver. Gatherers fill up, then deliver until empty,
// and wait at a full sink rather than turning back.

export function stepResidents(st: State, cp: Compiled, out: SimEvent[]): void {
  for (const r of st.residents) stepResident(st, cp, r, out);
}

function stepResident(st: State, cp: Compiled, r: ResidentState, out: SimEvent[]): void {
  switch (r.status) {
    case "frozen": case "towed": case "releasing": case "arriving": case "waiting": case "dead": return;
    case "injured": {
      const med = st.structures.find((s) => s.type === "struct.medical");
      // On a level without a med bay the injured mend on their own, slowly; otherwise they wait for it.
      if (!med) {
        if (cp.residents.selfHealTicks === 0) return;
        r.timer = stepDown(r.timer);
        if (r.timer <= 0) { r.status = "ok"; out.push({ t: "healed", resident: r.id }); }
        return;
      }
      const def = cp.structures[med.type]!;
      const spot = { x: med.pos.x + def.healOffset.x, y: med.pos.y + def.healOffset.y };
      if (moveAgent(st, cp, r.pos, spot, cp.residents.injuredSpeed, cp.residents.arrive)) { r.status = "healing"; r.timer = def.healTicks; }
      return;
    }
    case "healing":
      r.timer = stepDown(r.timer);
      if (r.timer <= 0) { r.status = "ok"; out.push({ t: "healed", resident: r.id }); }
      return;
    case "ok": break;
  }
  const role = cp.roles[r.role];
  if (r.role === "idle" || !role) {
    moveAgent(st, cp, r.pos, ringPoint(st.core.pos, r.slot, cp.residents.idleRadiusX, cp.residents.idleRadiusY), cp.residents.idleSpeed, cp.residents.arrive);
    return;
  }
  switch (role.behavior) {
    case "gather_deliver": return supplierStep(st, cp, r, role, out);
    case "stand_at": return standStep(st, cp, r, role);
    case "collect_deliver": return serverStep(st, cp, r, role, out);
    case "hunt": return hunterStep(st, cp, r, role, out);
    case "guard": return guardStep(st, cp, r, role, out);
    case "haul": return haulerStep(st, cp, r, role, out);
  }
}

// ---------- helpers ----------

const closest = <T extends { pos: Vec }>(from: Vec, list: readonly T[]): T | null => {
  let best: T | null = null, bd = Number.MAX_SAFE_INTEGER;
  for (const x of list) {
    const dx = x.pos.x - from.x, dy = x.pos.y - from.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = x; }
  }
  return best;
};

/** Ready to act when the cooldown has run out; re-arms it. */
function ready(r: ResidentState, ticks: number): boolean {
  r.acc = stepDown(r.acc);
  if (r.acc > 0) return false;
  r.acc = ticks;
  return true;
}

function pickNode(st: State, cp: Compiled, r: ResidentState): NodeState | null {
  if (r.assign.node !== null) {
    const n = st.nodes.find((x) => x.id === r.assign.node);
    return n && n.enabled && n.stock !== 0 ? n : null;
  }
  return closest(r.pos, st.nodes.filter((n) => n.enabled && n.stock !== 0 && n.type === r.assign.from));
}

const converterOf = (st: State, type: string | null): ConverterState | null =>
  type === null ? null : st.converters.find((c) => c.type === type) ?? null;

function doneCarrying(r: ResidentState): void {
  if (r.n <= 0) { r.n = 0; r.carry = null; r.mode = "gather"; r.target = null; }
}

/**
 * Walk to the delivery target and hand over one item per interval. A full or missing target
 * makes the worker wait there; it never turns back with a partial load.
 */
function deliverStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole, to: string | null, out: SimEvent[]): void {
  const res = r.carry;
  if (res === null || to === null) { doneCarrying(r); return; }
  const deposited = (at: Vec, target: string) => out.push({ t: "deposited", res, to: target, at: { ...at }, by: r.id });
  if (to === "sink.core") {
    if (!moveAgent(st, cp, r.pos, st.core.pos, role.speed, cp.residents.coreDeliverRange)) return;
    if (!ready(r, role.deliverTicks)) return;
    if (feedCoreWith(st, cp, res, out, r.id)) r.n--;
    doneCarrying(r);
    return;
  }
  if (to === "sink.sales_point") {
    const s = st.sales;
    if (!s || !moveAgent(st, cp, r.pos, s.pos, role.speed, cp.residents.workRange)) return;
    if (!ready(r, role.deliverTicks)) return;
    if (s.sells.includes(res) && (s.shelf[res] ?? 0) < cp.sales.shelfCap) { s.shelf[res] = (s.shelf[res] ?? 0) + 1; r.n--; deposited(s.pos, to); }
    doneCarrying(r);
    return;
  }
  if (to === "store.depot") {
    const d = st.depot;
    if (!d || !moveAgent(st, cp, r.pos, d.pos, role.speed, cp.residents.workRange)) return;
    if (!ready(r, role.deliverTicks)) return;
    depotPut(d, cp, res); r.n--; deposited(d.pos, to);
    doneCarrying(r);
    return;
  }
  const cv = converterOf(st, to);
  if (!cv || !moveAgent(st, cp, r.pos, cv.pos, role.speed, cp.residents.workRange)) return;
  if (!ready(r, role.deliverTicks)) return;
  const def = cp.converters[cv.type]!;
  if (def.inputs.includes(res) && cv.inQ.length < def.inCap) { cv.inQ.push(res); r.n--; deposited(cv.pos, to); }
  doneCarrying(r);
}

// ---------- behaviours ----------

function supplierStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole, out: SimEvent[]): void {
  if (r.mode === "deliver") return deliverStep(st, cp, r, role, r.assign.to, out);
  const node = pickNode(st, cp, r);
  if (!node) { if (r.n > 0) r.mode = "deliver"; return; }
  const def = cp.nodes[node.type]!;
  if (!within(r.pos, node.pos, cp.residents.workRange) && !moveAgent(st, cp, r.pos, node.pos, role.speed, cp.residents.workRange)) return;
  if (!ready(r, def.workerRateTicks ?? role.gatherTicks)) return;
  if (node.stock !== null) node.stock--;
  r.n++;
  r.carry = def.yields;
  out.push({ t: "gathered", res: def.yields, node: st.nodes.indexOf(node), at: { ...node.pos }, by: r.id });
  if (r.n >= role.carry) r.mode = "deliver";
}

function standStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole): void {
  let spot: Vec | null = null;
  if (r.assign.to === "sink.sales_point" || (r.assign.to === null && st.sales)) spot = st.sales?.register ?? null;
  else spot = converterOf(st, r.assign.to)?.operatorPos ?? null;
  if (spot) moveAgent(st, cp, r.pos, spot, role.speed, cp.residents.arrive);
}

function serverStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole, out: SimEvent[]): void {
  if (r.mode === "deliver") return deliverStep(st, cp, r, role, r.assign.to, out);
  const cv = converterOf(st, r.assign.from);
  if (!cv) return;
  if (!moveAgent(st, cp, r.pos, cv.pickupPos, role.speed, cp.residents.workRange)) return;
  if (!ready(r, role.gatherTicks)) return;
  const output = cp.converters[cv.type]!.output;
  if (cv.out > 0 && r.n < role.carry) { cv.out--; r.n++; r.carry = output; out.push({ t: "picked", res: output, at: { ...cv.pickupPos }, by: r.id }); }
  if (r.n >= role.carry || (r.n > 0 && cv.out === 0)) r.mode = "deliver";
}

function hunterStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole, out: SimEvent[]): void {
  if (r.mode === "deliver") return deliverStep(st, cp, r, role, r.assign.to, out);
  const animal = r.assign.from === null ? null : cp.animals[r.assign.from];
  if (!animal) return;
  const dropRes = Object.keys(animal.drops);
  const drop = closest(r.pos, st.drops.filter((d) => dropRes.includes(d.res)));
  if (drop && within(r.pos, drop.pos, cp.residents.seekDropRange)) {
    if (moveAgent(st, cp, r.pos, drop.pos, role.speed, cp.residents.arrive)) pickDrop(st, r, role, drop, out);
    return;
  }
  // Hunters take the dangerous variants of their quarry too (and risk a bite for it).
  const zones = st.preyZones.map((z, i) => (z.animal === r.assign.from || cp.animals[z.animal]?.variantOf === r.assign.from ? i : -1));
  const prey: PreyState | null = closest(r.pos, st.prey.filter((d) => d.alive && zones.includes(d.zone)));
  if (!prey) { if (r.n > 0) r.mode = "deliver"; return; }
  if (!within(r.pos, prey.pos, role.attackRange) && !moveAgent(st, cp, r.pos, prey.pos, role.speed, role.attackRange)) return;
  if (!ready(r, role.attackTicks)) return;
  hitPrey(st, cp, prey, role.damage, "resident", out);
}

function pickDrop(st: State, r: ResidentState, role: CompiledRole, drop: DropState, out: SimEvent[]): void {
  st.drops.splice(st.drops.indexOf(drop), 1);
  r.n++;
  r.carry = drop.res;
  out.push({ t: "picked", res: drop.res, at: { ...drop.pos }, by: r.id });
  if (r.n >= role.carry) r.mode = "deliver";
}

function guardStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole, out: SimEvent[]): void {
  const foe = nearestHostile(st, r.pos, role.attackRange);
  if (foe) {
    if (ready(r, role.attackTicks)) hitHostile(st, cp, foe, role.damage, "resident", out);
    return;
  }
  // with nothing in reach, rally to the wall on the side under attack, or hold the own post when clear
  moveAgent(st, cp, r.pos, guardPost(st, cp, r.assign.post ?? 0, role.rally ? attackedSide(st) : null), role.speed, cp.residents.arrive);
}

// ---------- haulers (supply routing) ----------

interface ConsumerStock { id: string; stock: number; cap: number; accepts: boolean }

function consumerStock(st: State, cp: Compiled, id: string, res: string): ConsumerStock | null {
  if (id === "sink.core") return { id, stock: st.core.fuel, cap: coreFuelCap(st, cp), accepts: cp.core.accepts[res] !== undefined };
  if (id === "sink.sales_point") {
    const s = st.sales;
    return s ? { id, stock: s.shelf[res] ?? 0, cap: cp.sales.shelfCap, accepts: s.sells.includes(res) } : null;
  }
  const cv = converterOf(st, id);
  if (!cv) return null;
  const def = cp.converters[cv.type]!;
  return { id, stock: cv.inQ.length, cap: def.inCap, accepts: def.inputs.includes(res) };
}

/** need = priority × (target − stock) / target, in FP; null when nothing is below target. */
function bestNeed(st: State, cp: Compiled): { res: string; to: string } | null {
  const depot = st.depot!;
  let best: { res: string; to: string; need: number } | null = null;
  for (const [res, n] of Object.entries(depot.stock)) {
    if (n <= 0) continue;
    for (const [id, k] of Object.entries(cp.consumers)) {
      const c = consumerStock(st, cp, id, res);
      if (!c || !c.accepts) continue;
      const target = Math.max(1, mulDiv(c.cap, k.targetFill, FP));
      if (c.stock >= target) continue;
      const need = mulDiv(k.priority, target - c.stock, target);
      if (!best || need > best.need) best = { res, to: id, need };
    }
  }
  return best;
}

function haulerStep(st: State, cp: Compiled, r: ResidentState, role: CompiledRole, out: SimEvent[]): void {
  const depot = st.depot;
  if (!depot) return;
  if (r.mode === "deliver") {
    // Fuel override: a hauler carrying fuel feeds a critical core first, whatever it was sent to do.
    let to = r.target;
    const coreDef = cp.consumers["sink.core"];
    if (r.carry !== null && coreDef && cp.core.accepts[r.carry] !== undefined
      && st.core.fuel * FP < mulDiv(coreFuelCap(st, cp), coreDef.critical, FP) * FP) to = "sink.core";
    return deliverStep(st, cp, r, role, to, out);
  }
  if (!moveAgent(st, cp, r.pos, depot.pos, role.speed, cp.residents.workRange)) return;
  if (!ready(r, role.gatherTicks)) return;
  if (r.n === 0) {
    const pick = bestNeed(st, cp);
    if (!pick) return;
    r.carry = pick.res;
    r.target = pick.to;
  }
  const res = r.carry!;
  if ((depot.stock[res] ?? 0) > 0) {
    depot.stock[res]!--;
    r.n++;
    out.push({ t: "picked", res, at: { ...depot.pos }, by: r.id });
  }
  if (r.n >= role.carry || (depot.stock[res] ?? 0) === 0) r.mode = "deliver";
}

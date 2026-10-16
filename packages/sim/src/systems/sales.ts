import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, mulDiv, within, type Vec } from "../fixed.js";
import { below, between, chance } from "../rng.js";
import type { CustomerState, SalesState, State } from "../state.js";
import { hint } from "./common.js";
import { converterIdle, dropOnly, producible } from "./nodes.js";

/** Content offsets point "toward" a reference: each axis flips so a positive component faces it. */
const toward = (off: Vec, from: Vec, to: Vec): Vec => ({ x: to.x >= from.x ? off.x : 0 - off.x, y: to.y >= from.y ? off.y : 0 - off.y });

export interface SalesLayout {
  /** Clerk pad beside the kiosk, on the core-facing side. */
  register: Vec;
  pile: Vec;
  /** Queue slot 0, beside the kiosk on the side facing the map interior; slot k = queueAt + k × queueStep. */
  queueAt: Vec;
  queueStep: Vec;
  /** x of the edge customers come from and leave to: the map edge on the stall's side. */
  edgeX: number;
}

/**
 * Where the clerk pad, coin pile and customer line go for a stall. Register and pile sit on the
 * camera side (south, +y) so the stall never hides them (R3 playtest); the queue offset points toward
 * the map centre (so the line never runs off the map edge) and the queue step toward the core (the
 * content default is negative: the line grows away from it).
 * Exported so the generator can keep pads clear of these spots.
 */
export function salesLayout(cp: Compiled, pos: Vec, core: Vec): SalesLayout {
  const S = cp.sales;
  const centre = { x: cp.map.w / 2, y: cp.map.h / 2 };
  // horizontally still toward the core (pile side), vertically always toward the camera
  const south = { x: core.x, y: pos.y + FP };
  const r = toward(S.registerOffset, pos, south), p = toward(S.pileOffset, pos, south), q = toward(S.queueOffset, pos, centre);
  return {
    register: { x: pos.x + r.x, y: pos.y + r.y },
    pile: { x: pos.x + p.x, y: pos.y + p.y },
    queueAt: { x: pos.x + q.x, y: pos.y + q.y },
    queueStep: toward(S.queueStep, pos, core),
    edgeX: pos.x * 2 >= cp.map.w ? cp.map.w + 20 * FP : -20 * FP,
  };
}

/** Customers arrive, queue, give up, and are served while the register is staffed. */
export function stepSales(st: State, cp: Compiled, out: SimEvent[]): void {
  const s = st.sales;
  if (!s) return;
  spawn(st, cp, s, out);
  advanceQueue(cp, s);
  giveUp(s, out);
  serve(st, cp, s, out);
  leave(cp, s);
}

function spawn(st: State, cp: Compiled, s: SalesState, out: SimEvent[]): void {
  const S = cp.sales;
  s.spawnAcc--;
  // A short line refills fast, so three or four customers are usually waiting.
  if (s.queue.length < S.refillBelow && s.spawnAcc > S.refillTicks) s.spawnAcc = S.refillTicks;
  if (s.spawnAcc > 0 || s.queue.length >= S.queueMax) return;
  const base = s.queue.length + 1 < S.refillBelow ? S.refillTicks : S.spawnTicks;
  s.spawnAcc = mulDiv(base, between(st.rng, S.jitterMin, S.jitterMax + 1), FP);
  // Never ask for a good the level cannot produce yet, nor for a drop-only or idle-converter good while its
  // shelf is empty, so a quiet drop economy cannot clog the queue.
  const opts = s.sells.filter((r) => producible(st, cp, r)
    && !((s.shelf[r] ?? 0) === 0 && (dropOnly(st, cp, r) || converterIdle(st, cp, r))));
  if (opts.length === 0) return;
  // Demand leans toward what is on the shelf; the base weight keeps some variety.
  const weights = opts.map((r) => S.baseWeight + (s.shelf[r] ?? 0) * FP);
  let r = below(st.rng, weights.reduce((a, b) => a + b, 0));
  let res = opts[0]!;
  for (let i = 0; i < opts.length; i++) {
    r -= weights[i]!;
    if (r < 0) { res = opts[i]!; break; }
  }
  const premium = chance(st.rng, S.premiumShare, FP);
  const impatient = !premium && chance(st.rng, S.impatientShare, FP);
  // The bulk roll only happens when the level asks for bulk traders, so other levels keep their rng stream.
  const bulk = !premium && !impatient && S.bulkShare > 0 && chance(st.rng, S.bulkShare, FP);
  const kind = premium ? "unit.customer_premium" : impatient ? "unit.customer_impatient" : bulk ? "unit.customer_bulk" : "unit.customer";
  const def = S.customers[kind]!;
  const want = def.orderSize === "max_plus" ? S.orderMax + def.orderExtra
    : def.orderSize === "fixed" ? def.orderExtra
      : between(st.rng, S.orderMin, S.orderMax + 1);
  const id = s.nextCustomerId++;
  s.queue.push({
    id, kind, res, want,
    patience: def.patienceTicks, patienceMax: def.patienceTicks,
    pos: { x: s.edgeX, y: slot(s, s.queue.length).y },
    angry: false,
  });
  out.push({ t: "customer_arrived", kind, res, want, customer: id });
}

const slot = (s: SalesState, k: number): Vec => ({ x: s.queueAt.x + k * s.queueStep.x, y: s.queueAt.y + k * s.queueStep.y });

function advanceQueue(cp: Compiled, s: SalesState): void {
  const a = cp.sales.approach;
  s.queue.forEach((q, k) => {
    const g = slot(s, k);
    q.pos.x += mulDiv(g.x - q.pos.x, a, FP);
    q.pos.y += mulDiv(g.y - q.pos.y, a, FP);
    q.patience--;
  });
}

function giveUp(s: SalesState, out: SimEvent[]): void {
  const stay: CustomerState[] = [];
  for (const q of s.queue) {
    if (q.patience > 0) { stay.push(q); continue; }
    q.angry = true;
    s.leaving.push(q);
    out.push({ t: "customer_left", angry: true, at: { ...q.pos }, customer: q.id });
  }
  s.queue = stay;
}

/** A customer is at their slot once within this distance of it on both axes (not just in line with it). */
const ARRIVED = 6 * FP;

/**
 * Serve the first customer in line who stands at their slot and whose order can be filled, so one
 * missing good never blocks the queue. Every sale removes exactly that customer from the queue and
 * sends them off paid (B2: a customer still walking in from the map edge was once "arrived" because
 * only the y distance was checked, so sales fired with nobody visibly queued).
 */
function serve(st: State, cp: Compiled, s: SalesState, out: SimEvent[]): void {
  const T = cp.sales.serveTicks;
  let idx = -1;
  if (T > 0 && s.serving) {
    // Stay with the customer already at the window: if they left, clear it; if stock ran out, wait.
    const cur = s.serving.customer;
    const k = s.queue.findIndex((q) => q.id === cur);
    if (k < 0 || !within(s.queue[k]!.pos, slot(s, k), ARRIVED)) delete s.serving;
    else if ((s.shelf[s.queue[k]!.res] ?? 0) < s.queue[k]!.want) return;
    else idx = k;
  }
  if (idx < 0) idx = s.queue.findIndex((q, k) => within(q.pos, slot(s, k), ARRIVED) && (s.shelf[q.res] ?? 0) >= q.want);
  if (idx < 0) return;
  if (!registerStaffed(st, cp, s)) {
    if (within(st.player.pos, s.pos, 140 * FP)) hint(st, out, "stand_at_register");
    return;
  }
  const q = s.queue[idx]!;
  if (T > 0) {
    if (!s.serving || s.serving.customer !== q.id) s.serving = { customer: q.id, ticks: 0, of: T };
    if (++s.serving.ticks < T) return;
    delete s.serving;
  }
  const def = cp.sales.customers[q.kind]!;
  s.shelf[q.res] = (s.shelf[q.res] ?? 0) - q.want;
  const pay = (cp.resources[q.res]?.price ?? 0) * q.want * def.pay;
  s.pileN += pay;
  if (def.pay > 1) s.premiumServed++;
  s.queue.splice(idx, 1);
  s.leaving.push(q);
  out.push({ t: "sold", res: q.res, n: q.want, pay, premium: def.pay > 1, at: { ...s.register }, customer: q.id, kind: q.kind });
}

/** The player on the clerk pad, or a cashier standing on it. */
export function registerStaffed(st: State, cp: Compiled, s: SalesState): boolean {
  if (within(st.player.pos, s.register, cp.sales.registerRange)) return true;
  return st.residents.some((r) =>
    r.status === "ok" && cp.roles[r.role]?.behavior === "stand_at" && (r.assign.to === "sink.sales_point" || r.assign.to === null)
    && within(r.pos, s.register, cp.sales.cashierRange));
}

/** Leaving customers walk off toward their edge and are dropped once past it. */
function leave(cp: Compiled, s: SalesState): void {
  const dir = s.edgeX > 0 ? 1 : -1;
  for (const q of s.leaving) { q.pos.x += dir * cp.sales.leaveX; q.pos.y += cp.sales.leaveY; }
  s.leaving = s.leaving.filter((q) => (dir > 0 ? q.pos.x < cp.map.w + 40 * FP : q.pos.x > -40 * FP));
}

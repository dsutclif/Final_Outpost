import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { FP, mulDiv, within, type Vec } from "../fixed.js";
import { below, between, chance } from "../rng.js";
import type { CustomerState, SalesState, State } from "../state.js";
import { hint } from "./common.js";
import { producible } from "./nodes.js";

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
  if (s.spawnAcc > 0 || s.queue.length >= S.queueMax) return;
  s.spawnAcc = mulDiv(S.spawnTicks, between(st.rng, S.jitterMin, S.jitterMax + 1), FP);
  // Never ask for a good the level cannot produce yet.
  const opts = s.sells.filter((r) => producible(st, cp, r));
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
  const kind = premium ? "unit.customer_premium" : impatient ? "unit.customer_impatient" : "unit.customer";
  const def = S.customers[kind]!;
  const want = def.orderSize === "max_plus" ? S.orderMax + def.orderExtra : between(st.rng, S.orderMin, S.orderMax + 1);
  s.queue.push({
    kind, res, want,
    patience: def.patienceTicks, patienceMax: def.patienceTicks,
    pos: { x: cp.map.w + 20 * FP, y: s.pos.y },
    angry: false,
  });
  out.push({ t: "customer_arrived", kind, res, want });
}

const slot = (cp: Compiled, s: SalesState, k: number): Vec => ({
  x: s.pos.x + cp.sales.queueOffset.x,
  y: s.pos.y + cp.sales.queueOffset.y + k * cp.sales.queueSpacing,
});

function advanceQueue(cp: Compiled, s: SalesState): void {
  const a = cp.sales.approach;
  s.queue.forEach((q, k) => {
    const g = slot(cp, s, k);
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
    out.push({ t: "customer_left", angry: true, at: { ...q.pos } });
  }
  s.queue = stay;
}

/** Serve the first customer in line whose order can be filled, so one missing good never blocks the queue. */
function serve(st: State, cp: Compiled, s: SalesState, out: SimEvent[]): void {
  const arrived = 6 * FP;
  const idx = s.queue.findIndex((q, k) => {
    const g = slot(cp, s, k);
    return Math.abs(q.pos.y - g.y) < arrived && (s.shelf[q.res] ?? 0) >= q.want;
  });
  if (idx < 0) return;
  if (!registerStaffed(st, cp, s)) {
    if (within(st.player.pos, s.pos, 140 * FP)) hint(st, out, "stand_at_register");
    return;
  }
  const q = s.queue[idx]!;
  const def = cp.sales.customers[q.kind]!;
  s.shelf[q.res] = (s.shelf[q.res] ?? 0) - q.want;
  const pay = (cp.resources[q.res]?.price ?? 0) * q.want * def.pay;
  s.pileN += pay;
  if (def.pay > 1) s.premiumServed++;
  s.queue.splice(idx, 1);
  s.leaving.push(q);
  out.push({ t: "sold", res: q.res, n: q.want, pay, premium: def.pay > 1, at: { ...s.register } });
}

/** The player at the register, or a cashier standing on it. */
export function registerStaffed(st: State, cp: Compiled, s: SalesState): boolean {
  if (within(st.player.pos, s.register, cp.sales.registerRange)) return true;
  return st.residents.some((r) =>
    r.status === "ok" && cp.roles[r.role]?.behavior === "stand_at" && (r.assign.to === "sink.sales_point" || r.assign.to === null)
    && within(r.pos, s.register, cp.sales.cashierRange));
}

function leave(cp: Compiled, s: SalesState): void {
  for (const q of s.leaving) { q.pos.x += cp.sales.leaveX; q.pos.y += cp.sales.leaveY; }
  s.leaving = s.leaving.filter((q) => q.pos.x < cp.map.w + 40 * FP);
}

import type { Content, Manifest } from "@fo/content";
import type { Plan } from "@fo/bots";

// The economy flow model: a cheap analytical pass that discards bad parameter sets before any bot
// runs and sizes costs and goals. Steady-state rates per second for fuel and goods, then a walk over
// the bot's build order (the same planner the bots use) that waits for each price at the income of
// the hires made so far. Constants are the content's own numbers plus a small overhead per trip.

export interface Flow {
  /** Estimated completion time for the good bot, seconds. */
  T: number;
  /** Share of the player's time the core takes in the opening (player alone). */
  openingFeedShare: number;
  /** One core supplier's fuel rate over the burn rate (>= 1 sustains the core alone). */
  supplierRatio: number;
  /** Income per second once the economy hires are done. */
  income: number;
  /** Estimated share of the budget the player is busy (walking or acting). */
  busyShare: number;
  ok: boolean;
  reason: string | null;
}

type P2 = readonly [number, number];
const d = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function flowModel(m: Manifest, plan: Plan, c: Content, budgetSeconds: number): Flow {
  const P = (k: string): number => m.params[k] ?? c.defaults[k] ?? 0;
  const vp = P("player.speed");
  const roles = c.roles;
  const vw = roles["role.supplier"]?.speed ?? 80;
  const core = m.entities.find((e) => e.type === "sink.core")!;
  const coreAt = core.at as P2;
  const shop = m.entities.find((e) => e.type === "sink.sales_point");
  const shopAt = (shop?.at ?? coreAt) as P2;
  const sells = shop && shop.type === "sink.sales_point" ? shop.sells : [];
  const nodes = m.entities.filter((e) => e.type.startsWith("node.") && "at" in e) as { type: string; at: [number, number]; enabled?: boolean }[];
  const near = (type: string, from: P2, k = 3): number => {
    const same = (t: string) => t === type || (type === "node.material_source" && t === "node.fuel_scrap");
    const ds = nodes.filter((n) => same(n.type) && n.enabled !== false).map((n) => d(n.at, from)).sort((a, b) => a - b).slice(0, k);
    return ds.length === 0 ? Infinity : ds.reduce((a, b) => a + b, 0) / ds.length;
  };
  const dMat = near("node.material_source", coreAt);
  const dFuel = near("node.fuel_deposit", coreAt, 1);
  const dFood = near("node.food_source", shopAt, 1);
  const nodeDef = (id: string) => c.nodes[id]!;
  const burn = P("core.burn");
  const burnRate = 1 / burn;

  const playerMatRate = 6 / ((2 * Math.max(0, dMat - 50)) / vp + 6 * nodeDef("node.material_source").rate + 0.6 + 1.5);
  const playerDenseRate = Number.isFinite(dFuel) ? 24 / ((2 * Math.max(0, dFuel - 50)) / vp + 6 * nodeDef("node.fuel_deposit").rate + 0.6 + 1.5) : 0;
  const playerFuelRate = Math.max(playerMatRate, playerDenseRate);
  const supplier = roles["role.supplier"]!;
  const supRate = (dist: number, workerRate: number) =>
    (supplier.carry ?? 3) / ((2 * Math.max(0, dist - 50)) / vw + (supplier.carry ?? 3) * workerRate + (supplier.deliverInterval ?? 0.15) * 3 + 0.5);
  const coreSupRate = supRate(dMat, nodeDef("node.material_source").workerRate ?? 0.55);
  const openingFeedShare = burnRate / playerFuelRate;
  const supplierRatio = coreSupRate / burnRate;

  const orderAvg = (P("customers.orderMin") + P("customers.orderMax")) / 2;
  const premium = P("customers.premiumShare");
  const demand = (orderAvg * (1 + premium * 0.5)) / P("customers.spawn");
  const price = (r: string) => c.resources[r]?.price ?? 0;
  const raw1 = price("res.food_raw_1");
  const playerFood = 6 / ((2 * Math.max(0, dFood - 40)) / vp + 6 * nodeDef("node.food_source").rate + 0.6 + 2.5);
  const foodSup = supRate(dFood, nodeDef("node.food_source").workerRate ?? 0.8);

  // Economy state as the build order is bought.
  let coreSup = 0, foodSups = 0, cashier = false, grill = 0, hunter = 0;
  for (const p of m.people) {
    const b = roles[p.role]?.behavior;
    if (b === "gather_deliver" && p.to === "sink.core") coreSup++;
    if (b === "gather_deliver" && p.to === "sink.sales_point") foodSups++;
    if (b === "stand_at" && (p.to === undefined || p.to === "sink.sales_point")) cashier = true;
  }
  const feedShare = () => Math.min(1, Math.max(0, burnRate - coreSup * coreSupRate) / playerFuelRate);
  const income = () => {
    const free = Math.max(0, 1 - feedShare() - 0.1);
    const supply = foodSups * foodSup + hunter * 0.25 + free * playerFood * (cashier ? 1 : 0.65);
    const items = Math.min(demand, supply);
    // A running food processor turns raw goods into prepared ones at the higher price.
    const prepared = grill >= 2 && sells.includes("res.food_prepared") ? Math.min(items, 1 / (c.converters["conv.food_processor"]?.rate ?? 1.6)) : 0;
    const pay = (items - prepared) * raw1 + prepared * price("res.food_prepared");
    return Math.max(0.05, pay * (1 + premium));
  };

  let t = 0, cur = P("start.currency"), busy = 0;
  const advance = (dt: number) => { t += dt; busy += dt * Math.min(1, 0.55 + feedShare()); };
  const padById = new Map(m.entities.filter((e) => e.type === "pad.hire" || e.type === "pad.build").map((e) => [(e as { id: string }).id, e] as const));
  // The turret ladder (towers, their levels, guards) is paid in scrap from the waves, which are sized to it
  // (build.ts), so the flow walks the rest of the build order only (Batch 3).
  const ladder = (id: string): boolean => {
    const e = padById.get(id);
    return (e?.type === "pad.build" && e.build.startsWith("struct.ranged_defense")) || (e?.type === "pad.hire" && roles[e.role.role]?.behavior === "guard");
  };
  for (const s of plan.steps) {
    if (s.when !== "always" || ladder(s.pad)) continue;
    for (let k = 0; k < s.repeat; k++) {
      const cost = Object.entries(s.cost).reduce((a, [r, n]) => a + (c.resources[r]?.cap === null ? n : 0), 0);
      const capped = Object.entries(s.cost).reduce((a, [r, n]) => a + (c.resources[r]?.cap !== null ? n : 0), 0);
      const wait = Math.max(0, cost - cur) / income();
      advance(wait + 2.5 + capped * 2.2);
      cur = Math.max(0, cur + wait * income() - cost);
      const pad = padById.get(s.pad);
      if (pad && pad.type === "pad.hire") {
        const b = roles[pad.role.role]?.behavior;
        if (b === "gather_deliver" && pad.role.to === "sink.core") coreSup++;
        else if (b === "gather_deliver" && pad.role.to === "sink.sales_point") foodSups++;
        else if (b === "stand_at" && (pad.role.to === undefined || pad.role.to === "sink.sales_point")) cashier = true;
        else if (pad.role.to === "conv.food_processor" || pad.role.from === "conv.food_processor") grill++;
        else if (b === "hunt") hunter++;
      } else if (pad && pad.type === "pad.build" && pad.build === "conv.food_processor") grill++;
    }
  }
  const barrierCost = plan.barriers.reduce((a, b) => a + (c.resources[b.res]?.cap === null ? b.cost : 0), 0);
  if (barrierCost > 0) { const w = Math.max(0, barrierCost - cur) / income(); advance(w + plan.barriers.length * 2); cur = Math.max(0, cur + w * income() - barrierCost); }

  const g = m.goal;
  let reason: string | null = null;
  if (g.type === "currency") { const w = Math.max(0, g.n - cur) / income(); advance(w); }
  else if (g.type === "serve_premium") {
    const perSec = premium / P("customers.spawn");
    advance(Math.max(0, g.n / Math.max(1e-3, perSec) - t));
  } else if (g.type === "population") {
    const containers = m.entities.filter((e) => e.type.startsWith("capture.")) as { at: [number, number] }[];
    const trips = containers.reduce((a, e) => a + (2 * d(e.at, coreAt)) / vp + 9, 0);
    const gate = m.entities.find((e) => e.type === "struct.gate" && "arrivals" in e && e.arrivals) as { arrivals: { every: number; total: number } } | undefined;
    const arrivals = gate ? P("gate.initialDelay") + gate.arrivals.every * gate.arrivals.total + 6 : 0;
    advance(trips);
    t = Math.max(t, arrivals);
  } else if (g.type === "waves") {
    const last = m.waves.length > 0 ? m.waves[m.waves.length - 1]!.t : 0;
    const first = m.waves[0]?.t ?? 0;
    // The bot buys the economy first; the defense must at least be affordable before the last wave.
    if (t > last * 1.25) reason = `defense not affordable by the last wave (${Math.round(t)} s > ${last} s)`;
    void first;
    t = Math.max(t, last + 25);
  }
  const fin = income();
  const ok0 = openingFeedShare <= 0.6;
  if (!ok0) reason = `core unsustainable for the player alone (${(openingFeedShare * 100).toFixed(0)}% of the opening)`;
  else if (plan.steps.some((s) => s.reason === "economy") && supplierRatio < 0.75) reason = `one core supplier covers only ${(supplierRatio * 100).toFixed(0)}% of the burn`;
  else if (g.type !== "waves" && t > 0.85 * budgetSeconds) reason = `goal needs ${Math.round(t)} s of ${budgetSeconds} s (> 85%)`;
  return { T: t, openingFeedShare, supplierRatio, income: fin, busyShare: busy / Math.max(1, budgetSeconds), ok: reason === null, reason };
}

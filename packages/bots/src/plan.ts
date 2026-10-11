import { Manifest as ManifestSchema, content as defaultContent, type Content, type Manifest } from "@fo/content";

// The planner turns a manifest into a build order, from data only: the goal and its requirement
// chain, economy hires in a fixed sensible order, converters with their operators, defense when
// waves exist, and conditional steps (medical once injuries happen, housing once recruits wait).

export type StepWhen = "always" | "injuries" | "waiting";

export interface PlanStep {
  pad: string;
  kind: "hire" | "build";
  /** Why the step is on the plan: economy, goal, requirement, defense, housing, medical, upgrade, routing. */
  reason: string;
  when: StepWhen;
  /** How many times to buy a repeatable pad (1 otherwise). */
  repeat: number;
  cost: Record<string, number>;
  /** True for the goal pad and everything it requires. */
  goalPath: boolean;
}

export interface BarrierTask { line: string; section: number; res: string; cost: number }

export interface Plan {
  goal: Manifest["goal"];
  steps: PlanStep[];
  /** Unbuilt barrier sections to build (before the first wave when waves exist). */
  barriers: BarrierTask[];
  /** Currency cost of every unconditional step and barrier section. */
  currencyNeeded: number;
  /** Currency cost of the goal pad and its requirement chain only. */
  goalCurrency: number;
  /** Lassoable captures the bot should rescue. */
  lasso: boolean;
  /** Arrivals gate the bot should staff. */
  gate: boolean;
  /** Modules the plan expects to exercise. */
  modules: string[];
}

type Ent = Manifest["entities"][number];
type HireEnt = Extract<Ent, { type: "pad.hire" }>;
type BuildEnt = Extract<Ent, { type: "pad.build" }>;
type PadEnt = HireEnt | BuildEnt;

const sumCurrency = (cost: Record<string, number>, c: Content): number =>
  Object.entries(cost).reduce((a, [r, n]) => a + (c.resources[r]?.cap === null ? n : 0), 0);

export function planBot(manifestIn: unknown, c: Content = defaultContent): Plan {
  const m = ManifestSchema.parse(manifestIn);
  const pads = m.entities.filter((e): e is PadEnt => e.type === "pad.hire" || e.type === "pad.build");
  const byId = new Map(pads.map((p) => [p.id, p] as const));
  const core = m.entities.find((e) => e.type === "sink.core");
  const coreLevel0 = core && core.type === "sink.core" ? core.params.level : 1;
  const sales = m.entities.find((e) => e.type === "sink.sales_point");
  const sells = sales && sales.type === "sink.sales_point" ? sales.sells : [];
  const role = (id: string) => c.roles[id];
  const cost = (p: PadEnt) => sumCurrency(p.cost, c);
  const byCost = (a: PadEnt, b: PadEnt) => cost(a) - cost(b) || (a.id < b.id ? -1 : 1);

  const steps: PlanStep[] = [];
  const inPlan = new Set<string>();
  let levelPadsUsed = 0;

  const add = (id: string, reason: string, opts: { when?: StepWhen; repeat?: number; goalPath?: boolean } = {}): void => {
    if (inPlan.has(id)) return;
    const p = byId.get(id);
    if (!p) return;
    inPlan.add(id);
    const sub = { goalPath: opts.goalPath ?? false };
    if (p.requires?.pad !== undefined) add(p.requires.pad, "requirement", sub);
    if (p.requires?.coreLevel !== undefined) needCoreLevel(p.requires.coreLevel, sub.goalPath);
    for (const res of Object.keys(p.cost)) if (c.resources[res]?.cap !== null) ensureSource(res, sub.goalPath);
    steps.push({
      pad: id, kind: p.type === "pad.hire" ? "hire" : "build", reason, when: opts.when ?? "always",
      repeat: opts.repeat ?? 1, cost: { ...p.cost }, goalPath: sub.goalPath,
    });
  };

  const needCoreLevel = (lvl: number, goalPath: boolean): void => {
    const lv = pads.filter((p): p is BuildEnt => p.type === "pad.build" && p.build === "sink.core.level").sort(byCost);
    while (coreLevel0 + levelPadsUsed < lvl && levelPadsUsed < lv.length) add(lv[levelPadsUsed++]!.id, "requirement", { goalPath });
  };

  const operatorFor = (conv: string) => pads.find((p): p is HireEnt =>
    p.type === "pad.hire" && role(p.role.role)?.behavior === "stand_at" && p.role.to === conv);
  const hasPerson = (pred: (b: { role: string; from?: string | undefined; to?: string | undefined }) => boolean) => m.people.some(pred);

  /** A capped cost resource needs a converter that makes it (and its operator), unless one is pre-placed. */
  const ensureSource = (res: string, goalPath: boolean): void => {
    const conv = Object.entries(c.converters).find(([, d]) => d.output === res)?.[0];
    if (!conv) return; // drops (salvage) or gathered resources need no pad
    const placed = m.entities.some((e) => e.type === conv);
    const pad = pads.find((p): p is BuildEnt => p.type === "pad.build" && p.build === conv);
    if (!placed && pad) add(pad.id, "requirement", { goalPath });
    const op = operatorFor(conv);
    if (op && !hasPerson((b) => b.role === op.role.role && b.to === conv)) add(op.id, "operator", { goalPath });
  };

  // ---------- economy: core supplier, sales supplier, cashier ----------
  const hires = pads.filter((p): p is HireEnt => p.type === "pad.hire").sort(byCost);
  const isSupplierTo = (to: string) => (b: { role: string; to?: string | undefined }) => role(b.role)?.behavior === "gather_deliver" && b.to === to;
  if (!hasPerson(isSupplierTo("sink.core"))) {
    const h = hires.find((p) => isSupplierTo("sink.core")(p.role) && p.requires === undefined);
    if (h) add(h.id, "economy");
  }
  if (sales && !hasPerson(isSupplierTo("sink.sales_point"))) {
    const h = hires.find((p) => isSupplierTo("sink.sales_point")(p.role) && p.requires === undefined);
    if (h) add(h.id, "economy");
  }
  const isCashier = (b: { role: string; to?: string | undefined }) => role(b.role)?.behavior === "stand_at" && (b.to === undefined || b.to === "sink.sales_point");
  if (sales && !hasPerson(isCashier)) {
    const h = hires.find((p) => isCashier(p.role));
    if (h) add(h.id, "economy");
  }

  // ---------- converters whose output sells: converter, operator, feeders, servers ----------
  for (const p of pads) {
    if (p.type !== "pad.build" || !p.build.startsWith("conv.")) continue;
    const def = c.converters[p.build];
    if (!def || !sells.includes(def.output)) continue;
    add(p.id, "economy");
    const op = operatorFor(p.build);
    if (op) add(op.id, "operator");
    for (const h of hires) if (h.role.to === p.build && role(h.role.role)?.behavior !== "stand_at") add(h.id, "feeder");
    for (const h of hires) if (h.role.from === p.build) add(h.id, "server");
  }

  // ---------- goal ----------
  const goal = m.goal;
  const barriers: BarrierTask[] = [];
  const recruitsTotal = m.entities.filter((e) => e.type.startsWith("capture.")).length
    + m.entities.reduce((a, e) => a + (e.type === "struct.gate" && "arrivals" in e && e.arrivals ? e.arrivals.total : 0), 0);
  if (goal.type === "build") {
    add(goal.target, "goal", { goalPath: true });
  } else if (goal.type === "population") {
    const base = m.params["housing.base"] ?? c.defaults["housing.base"] ?? 0;
    const per = m.params["housing.perBuilding"] ?? c.defaults["housing.perBuilding"] ?? 0;
    const housing = pads.filter((p): p is BuildEnt => p.type === "pad.build" && p.build === "struct.housing")
      .sort((a, b) => (a.requires ? 1 : 0) - (b.requires ? 1 : 0) || byCost(a, b));
    let slots = base;
    for (const h of housing) { if (slots >= goal.n) break; add(h.id, "goal", { goalPath: true }); slots += per; }
    // Recruits behind an uncleared blocked zone need its clearing pad when the rest fall short.
    const reachable = reachableCaptures(m);
    const have = m.people.length + reachable.open + gateArrivals(m);
    if (have < goal.n) {
      for (const p of pads) if (p.type === "pad.build" && p.build === "zone.clear") add(p.id, "goal", { goalPath: true });
    }
  } else if (goal.type === "waves") {
    const towers = pads.filter((p): p is BuildEnt => p.type === "pad.build" && p.build === "struct.ranged_defense").sort(byCost);
    for (const t of towers) add(t.id, "defense");
    const counts = m.waves.map((w) => Object.values(w.counts).reduce((a, b) => a + b, 0));
    const scaling = counts.length >= 2 && counts[counts.length - 1]! > counts[0]!;
    if (scaling) {
      const trainers = hires.filter((h) => role(h.role.role)?.behavior === "guard");
      const idle = m.people.filter((p) => p.role === "idle").length + recruitsTotal;
      for (const t of trainers) add(t.id, "defense", { repeat: t.repeatable ? Math.max(1, idle) : 1 });
    }
    const salvage = m.waves.some((w) => Object.keys(w.counts).some((h) => Object.keys(c.hostiles[h]?.drops ?? {}).some((r) => r !== "res.currency" && !sells.includes(r))));
    if (salvage) {
      for (const p of pads) if (p.type === "pad.build" && c.upgrades[p.build] && Object.keys(p.cost).every((r) => c.resources[r]?.cap !== null)) add(p.id, "upgrade");
    }
  }

  // Barrier sections on any goal (DECISIONS 1): a wall can be built wherever a line exists, and the
  // lasso's tow line works outside it, so a standalone barrier-lines level must use the module.
  for (const e of m.entities) {
    if (e.type !== "barrier.line") continue;
    e.sections.forEach((s, i) => { if (!s.prebuilt) barriers.push({ line: e.id, section: i, res: e.res, cost: e.costPerSection ?? c.defaults["barrier.costPerSection"] ?? 2 }); });
  }

  // ---------- conditional steps ----------
  for (const p of pads) {
    if (p.type === "pad.build" && p.build === "struct.medical") add(p.id, "medical", { when: "injuries" });
  }
  if (goal.type !== "population") {
    for (const p of pads) if (p.type === "pad.build" && p.build === "struct.housing") add(p.id, "housing", { when: "waiting" });
  }
  // Supply routing: a depot and its haulers once the economy is up.
  for (const p of pads) {
    if (p.type === "pad.build" && p.build === "struct.depot") {
      add(p.id, "routing");
      for (const h of hires) if (role(h.role.role)?.behavior === "haul") add(h.id, "routing");
    }
  }

  const always = steps.filter((s) => s.when === "always");
  const currencyNeeded = always.reduce((a, s) => a + sumCurrency(s.cost, c) * s.repeat, 0)
    + barriers.reduce((a, b) => a + (c.resources[b.res]?.cap === null ? b.cost : 0), 0);
  const goalCurrency = steps.filter((s) => s.goalPath).reduce((a, s) => a + sumCurrency(s.cost, c) * s.repeat, 0)
    + barriers.reduce((a, b) => a + (c.resources[b.res]?.cap === null ? b.cost : 0), 0);
  const lasso = m.modules.includes("lasso") && m.entities.some((e) => e.type.startsWith("capture."));
  const gate = gateArrivals(m) > 0;
  return { goal, steps, barriers, currencyNeeded, goalCurrency, lasso, gate, modules: [...m.modules] };
}

const gateArrivals = (m: Manifest): number =>
  m.entities.reduce((a, e) => a + (e.type === "struct.gate" && "arrivals" in e && e.arrivals ? e.arrivals.total : 0), 0);

/** Captures whose straight line to the core crosses no blocked zone. */
function reachableCaptures(m: Manifest): { open: number; behind: number } {
  const core = m.entities.find((e) => e.type === "sink.core")!;
  const zones = m.entities.flatMap((e) => (e.type === "zone.blocked" ? [e] : []));
  let open = 0, behind = 0;
  for (const e of m.entities) {
    if (!e.type.startsWith("capture.") || !("at" in e)) continue;
    const blocked = zones.some((z) => segRect(e.at, core.at, z.rect));
    if (blocked) behind++; else open++;
  }
  return { open, behind };
}

function segRect(a: readonly [number, number], b: readonly [number, number], r: readonly [number, number, number, number]): boolean {
  const n = 64;
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
    if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return true;
  }
  return false;
}

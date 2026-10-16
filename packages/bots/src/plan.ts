import { Manifest as ManifestSchema, content as defaultContent, type Content, type Manifest } from "@fo/content";

// The planner turns a manifest into a build order, from data only: the goal and its requirement
// chain, economy hires in a fixed sensible order, converters with their operators, defense when
// waves exist, and conditional steps (medical once injuries happen, housing once recruits wait).
// It also derives the controller's policies from the goal and the star objectives (REDESIGN-R2 §6).

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

/** How the controller should play beyond the build order: derived from the goal and objectives. */
export interface Policies {
  /** Keep core fuel at or above this share of capacity (0 = default behaviour). */
  heatFloor: number;
  /** Keep topping the core up to full (fuel_full goals). */
  fillCore: boolean;
  /** Serve customers before anything that is not an emergency (no angry customers, streaks). */
  serveFirst: boolean;
  /** Stock the shelf but do not serve (every shelf full at once). */
  holdShelf: boolean;
  /** Keep converter outputs and shelves below their caps. */
  noOverload: boolean;
  /** Once the economy runs itself, stop depositing anything (automate goals). */
  handsOff: boolean;
  /** Pick up this resource from drops even when nothing needs it (salvage goals). */
  collect: string[];
  /** Hunt prey for its own sake (hunt / protein goals). */
  hunt: boolean;
  /** Captives to gather before towing home (tow-trip goals and objectives). */
  towWant: number;
  /** Rescue every pod, oldest timer first. */
  rescueAll: boolean;
  /** Build every barrier section before the first wave. */
  wallsFirst: boolean;
}

export const DEFAULT_POLICIES: Policies = {
  heatFloor: 0, fillCore: false, serveFirst: false, holdShelf: false, noOverload: false, handsOff: false,
  collect: [], hunt: false, towWant: 1, rescueAll: false, wallsFirst: false,
};

export interface Plan {
  goal: Manifest["goal"];
  steps: PlanStep[];
  /** Unbuilt barrier sections to build (attack-facing first when waves exist). */
  barriers: BarrierTask[];
  /** Currency cost of every unconditional step and barrier section. */
  currencyNeeded: number;
  /** Currency cost of the goal pad and its requirement chain only. */
  goalCurrency: number;
  /** Lassoable captures the bot should bring home. */
  lasso: boolean;
  /** Arrivals gate the bot should staff. */
  gate: boolean;
  /** Modules the plan expects to exercise. */
  modules: string[];
  policies: Policies;
}

type Ent = Manifest["entities"][number];
type HireEnt = Extract<Ent, { type: "pad.hire" }>;
type BuildEnt = Extract<Ent, { type: "pad.build" }>;
type PadEnt = HireEnt | BuildEnt;

const sumCurrency = (cost: Record<string, number>, c: Content): number =>
  Object.entries(cost).reduce((a, [r, n]) => a + (c.resources[r]?.cap === null ? n : 0), 0);

/** Goal kinds whose end time is set by the clock (a schedule or a duration), not by the player's speed. */
export const TIME_FIXED_GOALS: ReadonlySet<string> = new Set(["waves", "waves_survived", "survive", "hazard_survive"]);

const SIDE_DIR: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export function planBot(manifestIn: unknown, c: Content = defaultContent): Plan {
  const m = ManifestSchema.parse(manifestIn);
  const pads = m.entities.filter((e): e is PadEnt => e.type === "pad.hire" || e.type === "pad.build");
  const byId = new Map(pads.map((p) => [p.id, p] as const));
  const core = m.entities.find((e) => e.type === "sink.core");
  const coreAt = core?.at ?? [240, 450];
  const coreLevel0 = core && core.type === "sink.core" ? core.params.level : 1;
  const sales = m.entities.find((e) => e.type === "sink.sales_point");
  const sells = sales && sales.type === "sink.sales_point" ? sales.sells : [];
  const role = (id: string) => c.roles[id];
  const cost = (p: PadEnt) => sumCurrency(p.cost, c);
  const byCost = (a: PadEnt, b: PadEnt) => cost(a) - cost(b) || (a.id < b.id ? -1 : 1);
  const goal = m.goal;
  const objectives = m.objectives ?? [];
  const kinds = new Set(objectives.map((o) => o.kind));
  kinds.add(goal.type);

  const steps: PlanStep[] = [];
  const inPlan = new Set<string>();
  let levelPadsUsed = 0;

  const add = (id: string, reason: string, opts: { when?: StepWhen; repeat?: number; goalPath?: boolean } = {}): void => {
    if (inPlan.has(id)) {
      // Already planned for another reason: the goal path still counts it (and its repeats).
      const st = steps.find((x) => x.pad === id);
      if (st && opts.goalPath) { st.goalPath = true; if (opts.repeat !== undefined) st.repeat = Math.max(st.repeat, opts.repeat); }
      return;
    }
    const p = byId.get(id);
    if (!p) return;
    inPlan.add(id);
    const sub = { goalPath: opts.goalPath ?? false };
    if (p.requires?.pad !== undefined) add(p.requires.pad, "requirement", sub);
    if (p.requires?.coreLevel !== undefined) needCoreLevel(p.requires.coreLevel, sub.goalPath);
    if (p.type === "pad.build" && p.build === "conv.level" && p.target !== undefined && byId.has(p.target)) add(p.target, "requirement", sub);
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
  const hires = pads.filter((p): p is HireEnt => p.type === "pad.hire").sort(byCost);
  const convPad = (conv: string) => pads.find((p): p is BuildEnt => p.type === "pad.build" && p.build === conv);

  /** A converter with its operator, the hires that feed it and the servers that carry its output. */
  const addConverter = (conv: string, reason: string, goalPath: boolean): void => {
    const placed = m.entities.some((e) => e.type === conv);
    const pad = convPad(conv);
    if (!placed && pad) add(pad.id, reason, { goalPath });
    const op = operatorFor(conv);
    if (op && !hasPerson((b) => b.role === op.role.role && b.to === conv)) add(op.id, "operator", { goalPath });
    for (const h of hires) if (h.role.to === conv && role(h.role.role)?.behavior !== "stand_at") add(h.id, "feeder");
    for (const h of hires) if (h.role.from === conv) add(h.id, "server");
    // Inputs made by another converter need that one running too (two-step chains).
    for (const input of c.converters[conv]?.inputs ?? []) {
      const src = Object.entries(c.converters).find(([, d]) => d.output === input)?.[0];
      if (src && src !== conv && (m.entities.some((e) => e.type === src) || convPad(src))) addConverter(src, "requirement", goalPath);
    }
  };

  /** A capped cost resource needs a converter that makes it (and its operator), unless one is pre-placed. */
  const ensureSource = (res: string, goalPath: boolean): void => {
    const conv = Object.entries(c.converters).find(([, d]) => d.output === res)?.[0];
    if (!conv) return; // drops (salvage) or gathered resources need no pad
    const placed = m.entities.some((e) => e.type === conv);
    const pad = convPad(conv);
    if (!placed && pad) add(pad.id, "requirement", { goalPath });
    const op = operatorFor(conv);
    if (op && !hasPerson((b) => b.role === op.role.role && b.to === conv)) add(op.id, "operator", { goalPath });
  };

  // ---------- economy: core supplier, sales supplier, cashier ----------
  const isSupplierTo = (to: string) => (b: { role: string; to?: string | undefined }) => role(b.role)?.behavior === "gather_deliver" && b.to === to;
  // Unconditional hires first; one hung on a requirement chain still counts (its chain comes with it).
  const firstHire = (pred: (b: { role: string; to?: string | undefined }) => boolean) =>
    hires.find((p) => pred(p.role) && p.requires === undefined) ?? hires.find((p) => pred(p.role));
  if (!hasPerson(isSupplierTo("sink.core"))) {
    const h = firstHire(isSupplierTo("sink.core"));
    if (h) add(h.id, "economy");
  }
  if (sales && !hasPerson(isSupplierTo("sink.sales_point"))) {
    const h = firstHire(isSupplierTo("sink.sales_point"));
    if (h) add(h.id, "economy");
  }
  const isCashier = (b: { role: string; to?: string | undefined }) => role(b.role)?.behavior === "stand_at" && (b.to === undefined || b.to === "sink.sales_point");
  // A cashier would sell the shelf empty on a "fill every shelf" goal; it comes after the goal there.
  const cashierLater = goal.type === "shelves_full";
  if (sales && !hasPerson(isCashier) && !cashierLater) {
    const h = hires.find((p) => isCashier(p.role));
    if (h) add(h.id, "economy");
  }

  // ---------- converters whose output sells ----------
  for (const p of pads) {
    if (p.type !== "pad.build" || !p.build.startsWith("conv.") || p.build === "conv.level") continue;
    const def = c.converters[p.build];
    if (!def || !sells.includes(def.output)) continue;
    addConverter(p.build, "economy", false);
  }

  // ---------- goal ----------
  const barriers: BarrierTask[] = [];
  const g = goal as { type: string; n?: number; k?: number; target?: string; res?: string; role?: string; build?: string };
  const recruitsTotal = m.entities.filter((e) => e.type === "capture.recruit_container").length + gateArrivals(m);
  const slotsBase = m.params["housing.base"] ?? c.defaults["housing.base"] ?? 0;
  const perHousing = m.params["housing.perBuilding"] ?? c.defaults["housing.perBuilding"] ?? 0;
  const housingPads = pads.filter((p): p is BuildEnt => p.type === "pad.build" && p.build === "struct.housing")
    .sort((a, b) => (a.requires ? 1 : 0) - (b.requires ? 1 : 0) || byCost(a, b));
  const buyHousing = (slotsWanted: number) => {
    let slots = slotsBase;
    for (const h of housingPads) { if (slots >= slotsWanted) break; add(h.id, "goal", { goalPath: true }); slots += perHousing; }
  };
  const buildPads = (build: string) => pads.filter((p): p is BuildEnt => p.type === "pad.build" && p.build === build).sort(byCost);
  const defenseOn = m.waves.length > 0;

  switch (g.type) {
    case "build": add(g.target!, "goal", { goalPath: true }); break;
    case "population": {
      buyHousing(g.n ?? 0);
      const have = m.people.length + reachableCaptures(m).open + gateArrivals(m);
      if (have < (g.n ?? 0)) for (const p of buildPads("zone.clear")) add(p.id, "goal", { goalPath: true });
      break;
    }
    case "house_all": buyHousing(m.people.length + recruitsTotal); break;
    case "rescue_housed": buyHousing(m.people.length + (g.n ?? 0)); break;
    case "build_count": {
      const have = m.entities.filter((e) => e.type === g.build).length;
      buildPads(g.build ?? "").slice(0, Math.max(0, (g.n ?? 0) - have)).forEach((p) => add(p.id, "goal", { goalPath: true }));
      break;
    }
    case "core_level": needCoreLevel(g.n ?? 1, true); break;
    case "clear_zones": buildPads("zone.clear").slice(0, g.n ?? 1).forEach((p) => add(p.id, "goal", { goalPath: true })); break;
    case "unlock": buildPads("node.enable").slice(0, g.n ?? 1).forEach((p) => add(p.id, "goal", { goalPath: true })); break;
    case "hire": {
      let left = g.n ?? 1;
      for (const h of hires) {
        if (left <= 0) break;
        if (g.role !== undefined && h.role.role !== g.role) continue;
        const rep = h.repeatable ? left : 1;
        add(h.id, "goal", { goalPath: true, repeat: rep });
        left -= rep;
      }
      break;
    }
    case "converter_level": {
      const lv = pads.filter((p): p is BuildEnt => p.type === "pad.build" && p.build === "conv.level");
      let left = (g.n ?? 2) - 1;
      for (const p of lv) {
        if (left <= 0) break;
        const rep = p.repeatable ? left : 1;
        add(p.id, "goal", { goalPath: true, repeat: rep });
        left -= rep;
      }
      break;
    }
    case "produce": case "converters_running": case "chain": {
      const convs = pads.filter((p): p is BuildEnt => p.type === "pad.build" && p.build.startsWith("conv.") && p.build !== "conv.level")
        .filter((p) => g.type !== "produce" || g.res === undefined || c.converters[p.build]?.output === g.res)
        .filter((p) => g.type !== "chain" || p.build === tierTwo(c));
      for (const p of convs) addConverter(p.build, "goal", true);
      break;
    }
    case "haul": case "stockpile": {
      for (const p of buildPads("struct.depot")) add(p.id, "goal", { goalPath: true });
      for (const h of hires) if (h.role.to === "store.depot" || role(h.role.role)?.behavior === "haul") add(h.id, "goal", { goalPath: true });
      break;
    }
    case "turret_level": {
      // Any one upgrade reaches the tier; the dearest is the goal pad, the rest come before it.
      for (const p of buildPads("struct.ranged_defense")) add(p.id, "defense");
      const ups = buildPads("struct.ranged_defense.t2");
      if (ups.length > 0) add(ups[ups.length - 1]!.id, "goal", { goalPath: true });
      break;
    }
    default: break;
  }
  // Lasso goals: captives behind a blocked zone (the pass) need it cleared.
  const LASSO_GOALS = ["rescue", "rescue_all", "tow_trip", "rescue_before_freeze", "tow_full_trip", "crates", "rescue_housed", "house_all"];
  if (LASSO_GOALS.includes(g.type) && reachableCaptures(m).behind > 0) for (const p of buildPads("zone.clear")) add(p.id, "goal", { goalPath: true });

  // The med bay comes before upgrades: it only waits for the first injury.
  for (const p of pads) {
    if (p.type === "pad.build" && p.build === "struct.medical") add(p.id, "medical", { when: "injuries" });
  }
  // On defend goals without a goal pad the towers are the goal path (the anchor anything else hangs from).
  const towerGoal = defenseOn && !["turret_level", "hire", "build"].includes(g.type);
  if (defenseOn) {
    for (const t of buildPads("struct.ranged_defense")) add(t.id, "defense", { goalPath: towerGoal });
    const counts = m.waves.map((w) => Object.values(w.counts).reduce((a, b) => a + b, 0));
    const scaling = counts.length >= 2 && counts[counts.length - 1]! > counts[0]!;
    if (scaling) {
      const trainers = hires.filter((h) => role(h.role.role)?.behavior === "guard");
      // With a med bay, two colonists stay untrained so injuries (and healing) still happen.
      const medic = pads.some((p) => p.type === "pad.build" && p.build === "struct.medical") ? 2 : 0;
      const idle = Math.max(1, m.people.filter((p) => p.role === "idle").length + recruitsTotal - medic);
      for (const t of trainers) add(t.id, "defense", { repeat: t.repeatable ? Math.max(1, idle) : 1 });
    }
    const salvage = m.waves.some((w) => Object.keys(w.counts).some((h) => Object.keys(c.hostiles[h]?.drops ?? {}).some((r) => r !== "res.currency" && !sells.includes(r))));
    if (salvage) {
      for (const p of pads) if (p.type === "pad.build" && c.upgrades[p.build] && Object.keys(p.cost).every((r) => c.resources[r]?.cap !== null)) add(p.id, "upgrade");
    }
  }

  // Barrier sections on any goal (DECISIONS 1). With waves, the sections facing the attack sides first.
  const sideW: [number, number] = [0, 0];
  for (const w of m.waves) for (const s of (Array.isArray(w.side) ? w.side : [w.side ?? "n"])) { sideW[0] += SIDE_DIR[s]![0]; sideW[1] += SIDE_DIR[s]![1]; }
  for (const e of m.entities) {
    if (e.type !== "barrier.line") continue;
    const sects = e.sections.map((s, i) => ({ s, i })).filter(({ s }) => !s.prebuilt);
    const facing = ({ s }: { s: typeof e.sections[number] }) => {
      const mx = (s.a[0] + s.b[0]) / 2 - coreAt[0], my = (s.a[1] + s.b[1]) / 2 - coreAt[1];
      const L = Math.hypot(mx, my) || 1;
      return (mx * sideW[0] + my * sideW[1]) / L;
    };
    sects.sort((a, b) => facing(b) - facing(a) || a.i - b.i);
    for (const { i } of sects) barriers.push({ line: e.id, section: i, res: e.res, cost: e.costPerSection ?? c.defaults["barrier.costPerSection"] ?? 2 });
  }

  // ---------- conditional steps ----------
  for (const p of pads) {
    if (p.type === "pad.build" && p.build === "struct.medical") add(p.id, "medical", { when: "injuries" });
  }
  for (const p of housingPads) add(p.id, "housing", { when: "waiting" });
  for (const p of pads) {
    if (p.type === "pad.build" && p.build === "struct.depot") {
      add(p.id, "routing");
      for (const h of hires) if (role(h.role.role)?.behavior === "haul" || h.role.to === "store.depot") add(h.id, "routing");
    }
  }
  // Anything still off the plan that the economy can use: converter-level pads and remaining converters.
  for (const p of pads) if (p.type === "pad.build" && p.build.startsWith("conv.") && p.build !== "conv.level" && !inPlan.has(p.id)) addConverter(p.build, "economy", false);
  for (const p of pads) if (p.type === "pad.build" && p.build === "conv.level" && !inPlan.has(p.id)) add(p.id, "upgrade", { repeat: 1 });
  // Conveyors automate a link the economy already runs; on the goal path (after their hauler) so every belt is laid and used.
  for (const p of pads) if (p.type === "pad.build" && p.build === "struct.conveyor" && !inPlan.has(p.id)) add(p.id, "goal", { goalPath: true });
  if (cashierLater) { const h = hires.find((p) => isCashier(p.role)); if (h) add(h.id, "economy"); }

  const always = steps.filter((s) => s.when === "always");
  const currencyNeeded = always.reduce((a, s) => a + sumCurrency(s.cost, c) * s.repeat, 0)
    + barriers.reduce((a, b) => a + (c.resources[b.res]?.cap === null ? b.cost : 0), 0);
  const goalCurrency = steps.filter((s) => s.goalPath).reduce((a, s) => a + sumCurrency(s.cost, c) * s.repeat, 0)
    + barriers.reduce((a, b) => a + (c.resources[b.res]?.cap === null ? b.cost : 0), 0);
  const lasso = m.modules.includes("lasso") && m.entities.some((e) => e.type.startsWith("capture."));
  const gate = gateArrivals(m) > 0;

  const maxTowed = m.params["lasso.maxTowed"] ?? c.defaults["lasso.maxTowed"] ?? 3;
  let towWant = 1;
  for (const o of [{ kind: goal.type, params: g as Record<string, unknown> }, ...objectives]) {
    if (o.kind === "tow_trip" || o.kind === "tow_full_trip") towWant = Math.max(towWant, Math.min(maxTowed, Number(o.params["n"] ?? maxTowed)));
  }
  const heatKinds = ["settlement_never_freezes", "no_colonist_freezes", "heat_floor"];
  // Under attack the core is easy to forget: keep a reserve on defend levels.
  let heatFloor = heatKinds.some((k) => kinds.has(k)) ? 0.5 : defenseOn ? 0.35 : 0;
  if (goal.type === "heat_hold") heatFloor = Math.max(heatFloor, Math.min(0.95, Number((g as { pct?: number }).pct ?? 50) / 100 + 0.12));
  const policies: Policies = {
    heatFloor,
    fillCore: goal.type === "fuel_full",
    serveFirst: kinds.has("no_angry_customers") || kinds.has("streak"),
    holdShelf: goal.type === "shelves_full",
    noOverload: kinds.has("no_stockpile_overload"),
    handsOff: goal.type === "automate",
    collect: kinds.has("salvage") ? ["res.salvage"] : [],
    hunt: goal.type === "hunt" || goal.type === "protein",
    towWant,
    rescueAll: kinds.has("rescue_all") || goal.type === "rescue_before_freeze",
    wallsFirst: kinds.has("perimeter_before_wave1"),
  };
  return { goal, steps, barriers, currencyNeeded, goalCurrency, lasso, gate, modules: [...m.modules], policies };
}

const tierTwo = (c: Content): string | undefined => {
  const made = new Set(Object.values(c.converters).map((d) => d.output));
  return Object.entries(c.converters).find(([, d]) => d.inputs.some((r) => made.has(r)))?.[0];
};

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

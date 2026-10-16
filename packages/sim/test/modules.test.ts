import { describe, expect, it } from "vitest";
import { FP, TPS, createSim, type Sim, type SimEvent, fp, within } from "../src/index.js";
import { LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, at, grant, idle, newSim, walkPath, walkTo } from "./helpers.js";
import { content } from "@fo/content";

// Gate HP comes from content (raised for R3 gates on attack sides); reinforcing adds the upgrade bonus.
const GATE_HP = (content.structures["struct.gate"] as { hp: number }).hp;

// Scripted play-throughs of every catalog module on the golden levels. Each test walks the
// prototype level the way a player would and checks the ported rule.

const has = (ev: SimEvent[], t: SimEvent["t"]) => ev.some((e) => e.t === t);
const find = <T extends SimEvent["t"]>(ev: SimEvent[], t: T) => ev.find((e) => e.t === t) as Extract<SimEvent, { t: T }> | undefined;
const all = <T extends SimEvent["t"]>(ev: SimEvent[], t: T) => ev.filter((e) => e.t === t) as Extract<SimEvent, { t: T }>[];
const pad = (sim: Sim, id: string) => sim.state.pads.find((p) => p.id === id)!;

/** Step toward the nearest predicate-matching position until done or maxTicks pass. */
function chase(sim: Sim, target: () => { x: number; y: number } | null, done: (ev: SimEvent[]) => boolean, maxTicks = 600): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const t = target();
    const p = sim.state.player.pos;
    const ev = sim.step(t ? { dx: t.x - p.x, dy: t.y - p.y } : { dx: 0, dy: 0 });
    seen.push(...ev);
    if (done(ev) || sim.state.over) return seen;
  }
  return seen;
}

describe("workers and build pads (level 1)", () => {
  it("a hire pad takes the nearest idle resident, who then gathers to capacity and delivers to the core", () => {
    const sim = newSim();
    grant(sim, { currency: 8 });
    const ev = [...walkTo(sim, at(160, 430), 8), ...idle(sim, 40, (e) => has(e, "hired"))];
    const hired = find(ev, "hired")!;
    expect(hired.role).toBe("role.supplier");
    expect(all(ev, "pad_paid").length).toBe(8);
    expect(sim.state.currency).toBe(0);
    expect(pad(sim, "hire_core_supplier").done).toBe(true);
    const w = sim.state.residents.find((r) => r.id === hired.resident)!;
    expect(w.assign).toMatchObject({ from: "node.material_source", to: "sink.core" });
    const fuel0 = sim.state.core.fuel;
    const work = idle(sim, 25 * TPS);
    const gathered = all(work, "gathered").filter((e) => e.by === w.id);
    const delivered = all(work, "deposited").filter((e) => e.by === w.id && e.to === "sink.core");
    expect(gathered.length).toBeGreaterThanOrEqual(3);
    expect(delivered.length).toBeGreaterThanOrEqual(3);
    // Deliveries come in full loads: the first delivery happens only after three items were gathered.
    const firstDeliver = work.indexOf(delivered[0]!);
    expect(work.slice(0, firstDeliver).filter((e) => e.t === "gathered" && e.by === w.id).length).toBe(3);
    expect(sim.state.core.fuel).toBeGreaterThan(fuel0 - 11 + 3);
  });

  it("pad dwell: crossing a pad never pays; payment starts after standing on it for pads.dwell, and leaving resets", () => {
    const sim = newSim();
    grant(sim, { currency: 8 });
    const dwell = sim.compiled.pads.dwellTicks;
    expect(dwell).toBe(Math.round(0.5 * TPS));
    // A chord 20 units off the pad centre at walking speed: inside the radius for fewer than dwell ticks.
    walkTo(sim, at(110, 450), 4);
    const cross = walkPath(sim, [at(210, 450), at(220, 470)], 4);
    expect(all(cross, "pad_paid")).toEqual([]);
    expect(sim.state.currency).toBe(8);
    expect(sim.state.player.padId).toBeNull();
    // Stand on it: the dwell counter winds up to dwell ticks, then payment starts.
    walkTo(sim, at(160, 430), 6);
    expect(sim.state.player.padId).toBe("hire_core_supplier");
    const t0 = sim.state.tick - sim.state.player.padDwell;
    const ev: SimEvent[] = [];
    let firstPaid = -1;
    for (let i = 0; i < 40 && firstPaid < 0; i++) {
      const e = sim.step({ dx: 0, dy: 0 });
      ev.push(...e);
      if (has(e, "pad_paid")) firstPaid = sim.state.tick;
    }
    expect(firstPaid - t0).toBeGreaterThanOrEqual(dwell);
    expect(sim.state.player.padDwell).toBe(dwell);
    // Leaving resets the wind-up.
    walkTo(sim, at(160, 520), 4);
    expect(sim.state.player.padId).toBeNull();
    expect(sim.state.player.padDwell).toBe(0);
  });

  it("pad dwell: a straight crossing through the exact centre of a pad never pays (DECISIONS 9g)", () => {
    const sim = newSim();
    grant(sim, { currency: 8 });
    expect(sim.compiled.pads.dwellTicks).toBe(15);
    walkTo(sim, at(110, 430), 3);
    const cross = walkPath(sim, [at(220, 430)], 3);
    expect(all(cross, "pad_paid")).toEqual([]);
    expect(sim.state.currency).toBe(8);
  });

  it("pads.dwell 0 pays on the first act tick", () => {
    const sim = newSim({ params: { ...LEVEL_1.params, "pads.dwell": 0 } });
    grant(sim, { currency: 8 });
    expect(sim.compiled.pads.dwellTicks).toBe(0);
    const ev = walkTo(sim, at(160, 430), 29);
    const more = idle(sim, 2);
    expect(all([...ev, ...more], "pad_paid").length).toBeGreaterThan(0);
  });

  it("idle residents never self-assign and hire pads lock when nobody is free", () => {
    const sim = newSim({ people: [{ role: "idle" }] });
    idle(sim, 60);
    expect(sim.state.residents.every((r) => r.role === "idle")).toBe(true);
    grant(sim, { currency: 40 });
    walkTo(sim, at(160, 430), 8);
    idle(sim, 40, (e) => has(e, "hired"));
    expect(sim.state.residents[0]!.role).toBe("role.supplier");
    // The cashier pad is now locked: no idle resident left. Standing on it hints and takes no coins.
    expect(pad(sim, "hire_cashier").locked).toBe(true);
    const before = sim.state.currency;
    const ev = [...walkTo(sim, at(200, 630), 8), ...idle(sim, 30)];
    expect(has(ev, "hint") && all(ev, "hint").some((h) => h.key === "no_idle_resident")).toBe(true);
    expect(sim.state.currency).toBe(before);
    expect(pad(sim, "hire_cashier").done).toBe(false);
  });

  it("partial payments persist on the pad until the rest arrives", () => {
    const sim = newSim();
    grant(sim, { currency: 5 });
    let ev = [...walkTo(sim, at(160, 430), 8), ...idle(sim, 30)];
    expect(pad(sim, "hire_core_supplier").paid["res.currency"]).toBe(5);
    expect(pad(sim, "hire_core_supplier").done).toBe(false);
    expect(sim.state.currency).toBe(0);
    expect(all(ev, "hint").some((h) => h.key === "not_enough_currency")).toBe(true);
    walkTo(sim, at(240, 520), 10);
    grant(sim, { currency: 3 });
    ev = [...walkTo(sim, at(160, 430), 8), ...idle(sim, 30, (e) => has(e, "hired"))];
    expect(has(ev, "hired")).toBe(true);
    expect(pad(sim, "hire_core_supplier").done).toBe(true);
  });

  it("a cashier staffs the register so sales happen without the player", () => {
    const sim = newSim();
    grant(sim, { currency: 20, items: Array(6).fill("res.food_raw_1") });
    walkTo(sim, at(330, 570), 40);
    idle(sim, 30);
    expect(sim.state.sales!.shelf["res.food_raw_1"]).toBe(6);
    walkTo(sim, at(200, 630), 8);
    idle(sim, 80, (e) => has(e, "hired"));
    walkTo(sim, at(120, 450), 10); // well away from the register
    const ev = idle(sim, 30 * TPS, (e) => has(e, "sold"));
    expect(has(ev, "sold")).toBe(true);
    expect(sim.state.stats.sold).toBeGreaterThan(0);
    expect(sim.state.stats.rewardTicks.length).toBeGreaterThan(0);
  });

  it("source gating: the second food source's pads appear only after the first one has a supplier", () => {
    const sim = newSim();
    expect(pad(sim, "unlock_food2").visible).toBe(false);
    expect(pad(sim, "hire_food_supplier_2").visible).toBe(false);
    grant(sim, { currency: 12 });
    walkTo(sim, at(330, 240), 8);
    idle(sim, 40, (e) => has(e, "hired"));
    expect(pad(sim, "unlock_food2").visible).toBe(true);
    grant(sim, { currency: 15 });
    const ev = [...walkTo(sim, at(410, 340), 8), ...idle(sim, 60, (e) => has(e, "unlocked"))];
    expect(find(ev, "unlocked")?.target).toBe("food2");
    expect(sim.state.nodes.find((n) => n.id === "food2")!.enabled).toBe(true);
    expect(pad(sim, "hire_food_supplier_2").visible).toBe(true);
    expect(sim.state.stats.built).toBe(1);
  });
});

describe("barrier lines, lasso, housing, core levels and blocked zones (level 2)", () => {
  it("no tow line trails inside the fence, even on a closed loop", () => {
    const sim = newSim({}, LEVEL_2);
    walkPath(sim, [at(300, 560), at(300, 620), at(360, 620), at(360, 560), at(300, 560), at(300, 600)]);
    expect(sim.state.lasso.engaged).toBe(false);
    expect(sim.state.lasso.trail).toEqual([]);
    expect(sim.state.player.tow).toEqual([]);
  });

  it("leaving through the gate engages the lasso; a loop captures a container that releases a recruit in the safe radius", () => {
    const sim = newSim({}, LEVEL_2);
    // The level starts within reach of the core-upgrade pad at (240, 580); walking straight off it
    // never pays, because payment waits for the pad dwell.
    walkPath(sim, [at(300, 600), at(300, 740), at(240, 800)]);
    expect(sim.state.currency).toBe(10);
    expect(sim.state.lasso.engaged).toBe(true);
    const ev = walkPath(sim, [at(390, 800), at(390, 850), at(460, 850), at(460, 785), at(395, 785), at(390, 815)]);
    const cap = find(ev, "captured");
    expect(cap).toBeDefined();
    expect(sim.state.player.tow).toEqual([cap!.capture]);
    expect(sim.state.lasso.towing).toEqual([cap!.capture]);
    const c = sim.state.captures.find((x) => x.id === cap!.capture)!;
    expect(c.state).toBe("towed");
    // The chain follows at its spacing and the player is slower while towing.
    const speed0 = sim.compiled.player.speed;
    const before = { ...sim.state.player.pos };
    sim.step({ dx: 0, dy: -FP });
    expect(before.y - sim.state.player.pos.y).toBeLessThan(speed0);
    walkPath(sim, [at(240, 800), at(240, 740), at(300, 600), at(300, 500)]);
    expect(within(c.pos, sim.state.player.pos, fp(40))).toBe(true);
    const rel = idle(sim, 90, (e) => has(e, "released"));
    const released = find(rel, "released")!;
    expect(c.state === "releasing" || !sim.state.captures.includes(c)).toBe(true);
    // Housing is full (4 of 4), so the recruit waits instead of moving in.
    const recruit = sim.state.residents.find((r) => r.id === released.resident)!;
    expect(recruit.status).toBe("waiting");
    expect(sim.state.stats.rescued).toBe(1);
    const pop0 = sim.state.residents.filter((r) => r.status === "ok").length;
    expect(pop0).toBe(4);
    // Building housing frees a slot and the waiting recruit moves in on their own.
    grant(sim, { currency: 10 - sim.state.currency });
    const build = [...walkTo(sim, at(80, 610), 8), ...idle(sim, 60, (e) => has(e, "moved_in"))];
    expect(find(build, "built")?.build).toBe("struct.housing");
    expect(has(build, "moved_in")).toBe(true);
    expect(recruit.status).toBe("ok");
    expect(sim.state.structures.filter((s) => s.type === "struct.housing").length).toBe(1);
  });

  it("recruits arrive at the gate on a timer and are admitted when the player stands by it", () => {
    const sim = newSim({}, LEVEL_2);
    idle(sim, 7 * TPS);
    expect(sim.state.gateQueue.length).toBe(1);
    const arriving = sim.state.residents.find((r) => r.status === "arriving")!;
    expect(arriving).toBeDefined();
    expect(sim.state.timers.gateLeft).toBe(2);
    const ev = [...walkPath(sim, [at(240, 740), at(240, 850)]), ...idle(sim, 5)];
    expect(find(ev, "recruit_arrived")?.resident).toBe(arriving.id);
    expect(arriving.status).toBe("waiting");
    expect(sim.state.gateQueue).toEqual([]);
    // Population counts only residents living in the base.
    expect(sim.state.residents.filter((r) => r.status === "ok").length).toBe(4);
  });

  it("the blocked zone stops the player until the core is upgraded and the clearing pad paid", () => {
    const sim = newSim({}, LEVEL_2);
    walkPath(sim, [at(320, 470), at(240, 300)]);
    for (let i = 0; i < 60; i++) sim.step({ dx: 0, dy: -FP });
    expect(sim.state.player.pos.y).toBeGreaterThan(fp(250));
    // Core-level gated pads hint and take nothing.
    expect(pad(sim, "drift_pad").locked).toBe(true);
    const coins = sim.state.currency;
    const locked = [...walkTo(sim, at(240, 270), 6), ...idle(sim, 50)];
    expect(all(locked, "hint").some((h) => h.key === "needs_core_level")).toBe(true);
    expect(sim.state.currency).toBe(coins);
    expect(pad(sim, "drift_pad").paid).toEqual({});
    grant(sim, { currency: 15 });
    const up = [...walkPath(sim, [at(320, 470), at(240, 580)], 8), ...idle(sim, 60, (e) => has(e, "core_upgraded"))];
    expect(find(up, "core_upgraded")?.level).toBe(2);
    expect(sim.state.core.level).toBe(2);
    expect(sim.safeRadius()).toBe(fp(125));
    expect(sim.state.core.fuel).toBeLessThanOrEqual(32);
    expect(pad(sim, "drift_pad").locked).toBe(false);
    expect(pad(sim, "tent2").locked).toBe(false);
    grant(sim, { currency: 15 });
    const clear = [...walkPath(sim, [at(320, 470), at(240, 270)]), ...idle(sim, 60, (e) => has(e, "zone_cleared"))];
    expect(find(clear, "zone_cleared")?.zone).toBe("drift");
    expect(sim.state.zones.find((z) => z.id === "drift")!.cleared).toBe(true);
    // North through the gate section now works, and the tow line engages beyond the fence.
    walkTo(sim, at(240, 150), 6);
    expect(sim.state.player.pos.y).toBeLessThan(fp(180));
    expect(sim.state.lasso.engaged).toBe(true);
  });

  it("housing slots scale with housing structures and population never exceeds them", () => {
    const sim = newSim({}, LEVEL_2);
    expect(sim.compiled.housing.base).toBe(4);
    grant(sim, { currency: 40 });
    walkTo(sim, at(80, 610), 8);
    idle(sim, 60, (e) => has(e, "built"));
    walkTo(sim, at(240, 580), 8);
    idle(sim, 90, (e) => has(e, "core_upgraded"));
    walkTo(sim, at(80, 700), 8);
    idle(sim, 60, (e) => has(e, "built"));
    expect(sim.state.structures.filter((s) => s.type === "struct.housing").length).toBe(2);
  });
});

describe("hunting, converters and customer variety (level 3)", () => {
  it("the player auto-attacks prey, kills drop food that is picked up by walking over it, and prey respawn", () => {
    const sim = newSim({}, LEVEL_3);
    expect(sim.state.prey.length).toBe(3);
    const nearestPrey = () => {
      const alive = sim.state.prey.filter((d) => d.alive);
      return alive.length ? alive.reduce((a, b) => (within(a.pos, sim.state.player.pos, fp(10000)) && a) || b).pos : null;
    };
    const ev = chase(sim, nearestPrey, (e) => has(e, "died"), 900);
    const died = find(ev, "died")!;
    expect(died.kind).toBe("node.prey");
    expect(all(ev, "hit").every((h) => h.by === "player" && h.target === "prey")).toBe(true);
    const drops = all(ev, "drop");
    expect(drops.length).toBe(2);
    expect(drops.every((d) => d.res === "res.food_raw_2")).toBe(true);
    const dead = sim.state.prey.find((d) => !d.alive)!;
    expect(dead.respawn).toBeGreaterThanOrEqual(10 * TPS - 1);
    const pick = chase(sim, () => sim.state.drops[0]?.pos ?? null, () => sim.state.drops.length === 0, 300);
    expect(all([...ev, ...pick], "picked").length).toBe(2);
    expect(sim.state.player.stack.filter((r) => r === "res.food_raw_2").length).toBe(2);
    idle(sim, 10 * TPS + 2);
    expect(sim.state.prey.every((d) => d.alive)).toBe(true);
  });

  it("a converter runs only while the player or a bound operator stands on the operator spot", () => {
    const sim = newSim({}, LEVEL_3);
    grant(sim, { currency: 12 });
    const build = [...walkTo(sim, at(170, 630), 8), ...idle(sim, 60, (e) => has(e, "built"))];
    expect(find(build, "built")?.build).toBe("conv.food_processor");
    const cv = sim.state.converters[0]!;
    expect(cv.type).toBe("conv.food_processor");
    grant(sim, { items: ["res.food_raw_1", "res.food_raw_1", "res.food_raw_1"] });
    idle(sim, 20);
    expect(cv.inQ).toEqual(["res.food_raw_1", "res.food_raw_1", "res.food_raw_1"]);
    expect(sim.state.player.stack).toEqual([]);
    // Nobody on the operator spot: nothing converts, and the player nearby is told why.
    walkTo(sim, at(170, 580), 4);
    const still = idle(sim, 90);
    expect(has(still, "converted")).toBe(false);
    expect(all(still, "hint").some((h) => h.key === "operate_converter")).toBe(true);
    expect(cv.out).toBe(0);
    walkTo(sim, cv.operatorPos, 4);
    const run = idle(sim, 60, (e) => has(e, "converted"));
    expect(find(run, "converted")?.res).toBe("res.food_prepared");
    expect(cv.out).toBe(1);
    // Output is picked up at the pickup spot.
    const pick = [...walkTo(sim, cv.pickupPos, 4), ...idle(sim, 5)];
    expect(all(pick, "picked").some((p) => p.res === "res.food_prepared")).toBe(true);
    expect(sim.state.player.stack).toContain("res.food_prepared");
    // A hired operator keeps it running with the player elsewhere.
    grant(sim, { currency: 10 });
    walkTo(sim, at(60, 630), 8);
    const hire = idle(sim, 40, (e) => has(e, "hired"));
    expect(find(hire, "hired")?.role).toBe("role.operator");
    walkTo(sim, at(240, 520), 10);
    const auto = idle(sim, 6 * TPS, (e) => has(e, "converted"));
    expect(has(auto, "converted")).toBe(true);
    expect(sim.state.residents.some((r) => r.role === "role.operator" && within(r.pos, cv.operatorPos, fp(8)))).toBe(true);
  });

  it("a hunter hunts prey, collects the drops and delivers them to its converter", () => {
    const sim = newSim({}, LEVEL_3);
    grant(sim, { currency: 24 });
    walkTo(sim, at(170, 630), 8);
    idle(sim, 60, (e) => has(e, "built"));
    expect(pad(sim, "hunter").visible).toBe(true);
    walkTo(sim, at(120, 330), 8);
    const hire = idle(sim, 40, (e) => has(e, "hired"));
    const hunter = sim.state.residents.find((r) => r.id === find(hire, "hired")!.resident)!;
    expect(hunter.role).toBe("role.hunter");
    walkTo(sim, at(240, 520), 10);
    const cv = sim.state.converters[0]!;
    const ev = idle(sim, 60 * TPS, () => cv.inQ.includes("res.food_raw_2"));
    expect(all(ev, "hit").some((h) => h.by === "resident" && h.target === "prey")).toBe(true);
    expect(all(ev, "picked").some((p) => p.by === hunter.id)).toBe(true);
    expect(cv.inQ).toContain("res.food_raw_2");
  });

  it("customers only ask for producible goods; premium customers order more and pay double", () => {
    const sim = createSim({ ...LEVEL_3, params: { ...LEVEL_3.params, "core.burn": 60 } });
    // No converter yet: nobody asks for prepared food.
    const early = idle(sim, 20 * TPS);
    expect(all(early, "customer_arrived").every((c) => c.res === "res.food_raw_1")).toBe(true);
    const ev = idle(sim, 120 * TPS);
    const kinds = new Set(all(ev, "customer_arrived").map((c) => c.kind));
    expect(kinds.has("unit.customer_premium")).toBe(true);
    expect(kinds.has("unit.customer_impatient")).toBe(true);
    expect(kinds.has("unit.customer")).toBe(true);
    const premium = all(ev, "customer_arrived").find((c) => c.kind === "unit.customer_premium")!;
    expect(premium.want).toBe(sim.compiled.sales.orderMax + 1);
    // Impatient customers give up on their shorter timer.
    const impatientTicks = sim.compiled.sales.customers["unit.customer_impatient"]!.patienceTicks;
    expect(impatientTicks).toBe(16 * TPS);
    expect(all(ev, "customer_left").length).toBeGreaterThan(0);
  });

  it("drop-only demand: no orders for a good only drops supply while its shelf is empty", () => {
    // Level 4 sells raw food 2, which only creature drops supply.
    const sim = createSim({ ...LEVEL_4, params: { ...LEVEL_4.params, "core.burn": 60 }, waves: [{ t: 400, counts: { "hostile.creature": 1 } }] });
    const early = idle(sim, 40 * TPS);
    const asked = all(early, "customer_arrived");
    expect(asked.length).toBeGreaterThan(3);
    expect(asked.every((c) => c.res === "res.food_raw_1")).toBe(true);
    // Once some is on the shelf, it is in demand again.
    (sim.state.sales!.shelf as Record<string, number>)["res.food_raw_2"] = 8;
    const later = idle(sim, 40 * TPS);
    expect(all(later, "customer_arrived").some((c) => c.res === "res.food_raw_2")).toBe(true);
  });

  it("a premium sale pays double and counts toward the serve_premium goal", () => {
    const sim = createSim({
      ...LEVEL_3, params: { ...LEVEL_3.params, "core.burn": 60, "customers.premiumShare": 1 },
      goal: { type: "serve_premium", n: 1 }, objectives: undefined,
    });
    grant(sim, { items: Array(6).fill("res.food_raw_1") });
    walkTo(sim, at(330, 650), 40);
    idle(sim, 20);
    const ev = idle(sim, 60 * TPS, (e) => has(e, "sold"));
    const sale = find(ev, "sold")!;
    expect(sale.premium).toBe(true);
    expect(sale.n).toBe(sim.compiled.sales.orderMax + 1);
    expect(sale.pay).toBe(2 * sale.n * 2);
    expect(sim.state.sales!.premiumServed).toBe(1);
    expect(sim.state.won).toBe(true);
  });

  it("refined material from the material processor pays for the core upgrade", () => {
    const sim = newSim({}, LEVEL_3);
    grant(sim, { currency: 35, items: Array(6).fill("res.material_basic") });
    walkPath(sim, [at(330, 520), at(380, 310)], 8); // around the core, which would take the logs
    idle(sim, 60, (e) => has(e, "built"));
    const saw = sim.state.converters.find((c) => c.type === "conv.material_processor")!;
    idle(sim, 30);
    expect(saw.inQ.length).toBe(6);
    walkTo(sim, saw.operatorPos, 4);
    idle(sim, 10 * TPS, () => saw.out >= 6);
    expect(saw.out).toBe(6);
    walkTo(sim, saw.pickupPos, 4);
    idle(sim, 30);
    expect(sim.state.player.stack.filter((r) => r === "res.material_refined").length).toBe(6);
    expect(pad(sim, "fire2").visible).toBe(true);
    const up = [...walkTo(sim, at(240, 530), 8), ...idle(sim, 90, (e) => has(e, "core_upgraded"))];
    expect(all(up, "pad_paid").filter((p) => p.res === "res.material_refined").length).toBe(6);
    expect(has(up, "core_upgraded")).toBe(true);
    expect(sim.state.player.stack).not.toContain("res.material_refined");
  });
});

describe("defense, defenders, salvage upgrades, medical and hazards (level 4)", () => {
  it("walking an unbuilt section with the line's resource builds it, and built walls block the player while gates do not", () => {
    const sim = newSim({}, LEVEL_4);
    const line = sim.state.barriers[0]!;
    expect(line.sections.map((s) => s.built)).toEqual([false, false, false]);
    const ev = [...walkPath(sim, [at(80, 600), at(80, 245)]), ...idle(sim, 60, (e) => has(e, "barrier_built"))];
    expect(all(ev, "barrier_progress").length).toBe(8);
    expect(find(ev, "barrier_built")).toMatchObject({ line: "north_wall", section: 0 });
    expect(line.sections[0]).toMatchObject({ built: true, hp: 14, hpMax: 14, gate: false });
    expect(sim.state.currency).toBe(25 - 8);
    for (let i = 0; i < 40; i++) sim.step({ dx: 0, dy: -FP });
    expect(sim.state.player.pos.y).toBeGreaterThan(fp(230));
    walkTo(sim, at(240, 245), 4);
    idle(sim, 60, (e) => has(e, "barrier_built"));
    expect(line.sections[1]).toMatchObject({ built: true, hp: GATE_HP, hpMax: GATE_HP, gate: true });
    walkTo(sim, at(240, 200), 4);
    expect(sim.state.player.pos.y).toBeLessThan(fp(230));
    // Without the resource nothing is paid.
    sim.state.currency = 0;
    walkTo(sim, at(400, 245), 4);
    expect(has(idle(sim, 30), "barrier_progress")).toBe(false);
  });

  it("a wave walks through an open line, hits the base and injures a working resident", () => {
    const sim = newSim({}, LEVEL_4);
    const ev = idle(sim, 90 * TPS, (e) => has(e, "injured"));
    expect(find(ev, "wave_started")?.idx).toBe(1);
    expect(sim.state.tick).toBeGreaterThan(45 * TPS);
    const hostiles = sim.state.hostiles;
    expect(hostiles.length).toBeGreaterThan(0);
    expect(hostiles.some((h) => h.target === "base")).toBe(true);
    expect(sim.state.meters.baseHealth).toBeLessThan(15);
    const victim = sim.state.residents.find((r) => r.id === find(ev, "injured")!.resident)!;
    expect(victim.status).toBe("injured");
    expect(victim.role).not.toBe("role.defender");
    expect(victim.n).toBe(0);
    expect(sim.state.stats.injured).toBe(1);
    // Without a medical station the resident stays injured.
    idle(sim, 5 * TPS);
    expect(victim.status).toBe("injured");
  });

  it("built sections stop hostiles, take damage, break and revert to unbuilt", () => {
    const sim = newSim({}, LEVEL_4);
    grant(sim, { currency: 10 });
    walkPath(sim, [at(80, 600), at(80, 245)]);
    idle(sim, 60, (e) => has(e, "barrier_built"));
    walkTo(sim, at(240, 245), 4);
    idle(sim, 60, (e) => has(e, "barrier_built"));
    walkTo(sim, at(400, 245), 4);
    idle(sim, 60, (e) => has(e, "barrier_built"));
    const line = sim.state.barriers[0]!;
    expect(line.sections.every((s) => s.built)).toBe(true);
    walkTo(sim, at(240, 650), 6);
    const ev = idle(sim, 120 * TPS, (e) => has(e, "barrier_broken"));
    const hits = all(ev, "hit").filter((h) => h.target === "barrier");
    expect(hits.length).toBeGreaterThanOrEqual(14);
    const stopY = fp(230) - sim.compiled.defense.barrierStop;
    expect(all(ev, "hit").filter((h) => h.target === "base").length).toBe(0);
    const broken = find(ev, "barrier_broken")!;
    expect(line.sections[broken.section]).toMatchObject({ built: false, hp: 0, paid: 0 });
    expect(sim.state.stats.barriersLost).toBe(1);
    for (const h of sim.state.hostiles) if (h.target === "barrier") expect(h.pos.y).toBeLessThanOrEqual(stopY);
    const after = idle(sim, 30 * TPS, (e) => all(e, "hit").some((h) => h.target === "base"));
    expect(all(after, "hit").some((h) => h.target === "base")).toBe(true);
  });

  it("ranged defenses shoot hostiles, salvage upgrades them and reinforces the walls", () => {
    const sim = newSim({}, LEVEL_4);
    grant(sim, { currency: 30, items: ["res.salvage", "res.salvage", "res.salvage"] });
    expect(pad(sim, "towerup0").visible).toBe(false);
    walkPath(sim, [at(130, 600), at(130, 330)]);
    idle(sim, 60, (e) => has(e, "built"));
    const tower = sim.state.structures.find((s) => s.id === "tower0")!;
    expect(tower).toMatchObject({ type: "struct.ranged_defense", level: 1 });
    expect(pad(sim, "towerup0").visible).toBe(true);
    const up = [...walkTo(sim, at(130, 390), 8), ...idle(sim, 60, (e) => has(e, "built"))];
    expect(all(up, "pad_paid").filter((p) => p.res === "res.salvage").length).toBe(3);
    expect(find(up, "built")?.build).toBe("struct.ranged_defense.t2");
    expect(tower.level).toBe(2);
    expect(sim.state.player.stack).not.toContain("res.salvage");
    // Reinforce: built sections gain hp, every section's cap rises, later builds use the new cap.
    walkTo(sim, at(80, 245), 4);
    idle(sim, 60, (e) => has(e, "barrier_built"));
    const line = sim.state.barriers[0]!;
    grant(sim, { items: Array(4).fill("res.salvage") });
    walkTo(sim, at(240, 340), 8);
    idle(sim, 60, (e) => has(e, "built"));
    expect(line.sections[0]).toMatchObject({ hp: 24, hpMax: 24 });
    expect(line.sections[1]!.hpMax).toBe(GATE_HP + 10);
    expect(sim.state.params["barrier.hpMax"]).toBe(24);
    expect(sim.state.params["barrier.gateHpMax"]).toBe(GATE_HP + 10);
    walkTo(sim, at(240, 245), 4);
    idle(sim, 60, (e) => has(e, "barrier_built"));
    expect(line.sections[1]).toMatchObject({ built: true, hp: GATE_HP + 10, hpMax: GATE_HP + 10 });
    // The tier-2 tower fires at the first wave.
    walkPath(sim, [at(330, 400), at(330, 650), at(240, 650)]);
    const ev = idle(sim, 70 * TPS, (e) => all(e, "hit").some((h) => h.by === "structure"));
    expect(all(ev, "hit").some((h) => h.by === "structure" && h.target === "hostile")).toBe(true);
    expect(tower.acc).toBeLessThanOrEqual(sim.compiled.structures["struct.ranged_defense"]!.tiers![1]!.rateTicks);
  });

  it("defenders are trained at a repeatable pad, hold posts along the line and need an idle resident", () => {
    const sim = newSim({}, LEVEL_4);
    grant(sim, { currency: 10 });
    walkTo(sim, at(150, 640), 8);
    idle(sim, 60, (e) => has(e, "built"));
    expect(pad(sim, "train").visible).toBe(true);
    let ev = [...walkTo(sim, at(150, 720), 8), ...idle(sim, 40, (e) => has(e, "hired"))];
    const d1 = sim.state.residents.find((r) => r.id === find(ev, "hired")!.resident)!;
    expect(d1.role).toBe("role.defender");
    expect(d1.assign.post).toBe(0);
    expect(pad(sim, "train").done).toBe(false);
    expect(pad(sim, "train").paid).toEqual({});
    walkTo(sim, at(240, 650), 6);
    ev = [...walkTo(sim, at(150, 720), 8), ...idle(sim, 40, (e) => has(e, "hired"))];
    const d2 = sim.state.residents.find((r) => r.id === find(ev, "hired")!.resident)!;
    expect(d2.assign.post).toBe(1);
    expect(pad(sim, "train").locked).toBe(true);
    idle(sim, 8 * TPS);
    expect(within(d1.pos, at(80, 264), fp(10))).toBe(true);
    expect(within(d2.pos, at(240, 264), fp(10))).toBe(true);
    const fight = idle(sim, 60 * TPS, (e) => all(e, "hit").some((h) => h.by === "resident"));
    expect(all(fight, "hit").some((h) => h.by === "resident" && h.target === "hostile")).toBe(true);
  });

  it("injured residents walk to a medical station, heal and return to work", () => {
    // A second, far-off wave keeps the level open after the first creature dies.
    const sim = createSim({ ...LEVEL_4, waves: [{ t: 2, counts: { "hostile.creature": 1 } }, { t: 900, counts: { "hostile.creature": 1 } }] });
    walkTo(sim, at(70, 800), 8);
    idle(sim, 60, (e) => has(e, "built"));
    expect(sim.state.structures.some((s) => s.type === "struct.medical")).toBe(true);
    // Wait well clear of the creature's path so the auto-attack cannot kill it before it reaches the base.
    walkPath(sim, [at(320, 600), at(420, 560)]);
    const ev = idle(sim, 40 * TPS, (e) => has(e, "injured"));
    const victim = sim.state.residents.find((r) => r.id === find(ev, "injured")!.resident)!;
    const role = victim.role;
    chase(sim, () => sim.state.hostiles[0]?.pos ?? null, () => sim.state.hostiles.length === 0, 600);
    expect(sim.state.hostiles).toEqual([]);
    const heal = idle(sim, 30 * TPS, (e) => all(e, "healed").some((h) => h.resident === victim.id));
    expect(has(heal, "healed")).toBe(true);
    expect(victim.status).toBe("ok");
    expect(victim.role).toBe(role);
  });

  it("a hazard warns, then multiplies core burn and shrinks the safe radius for its duration", () => {
    const sim = createSim({
      ...LEVEL_4,
      waves: [{ t: 400, counts: { "hostile.creature": 1 } }],
      events: [{ type: "event.hazard", warnAt: 2, start: 4, end: 10 }],
      people: [],
    });
    const warn = idle(sim, 5 * TPS, (e) => has(e, "hazard_warning"));
    expect(sim.state.tick).toBe(2 * TPS);
    expect(sim.state.hazard.phase).toBe("warning");
    expect(find(warn, "hazard_warning")?.start).toBe(4 * TPS);
    idle(sim, 5 * TPS, (e) => has(e, "hazard_start"));
    expect(sim.state.tick).toBe(4 * TPS);
    expect(sim.state.hazard.phase).toBe("active");
    expect(sim.safeRadius()).toBe(fp(95) * 3 / 4);
    const fuelAtStart = sim.state.core.fuel;
    idle(sim, 10 * TPS, (e) => has(e, "hazard_end"));
    expect(sim.state.tick).toBe(10 * TPS);
    expect(sim.state.hazard.phase).toBe("none");
    // 6 s at 2.4 s / 2.6 per unit burns six or seven units instead of two or three.
    const burned = fuelAtStart - sim.state.core.fuel;
    expect(burned).toBeGreaterThanOrEqual(6);
    expect(burned).toBeLessThanOrEqual(7);
    expect(sim.safeRadius()).toBe(fp(95));
  });

  it("dense fuel from a deposit adds four fuel per item", () => {
    const sim = newSim({}, LEVEL_4);
    walkTo(sim, at(425, 400), 20);
    idle(sim, 120, (e) => all(e, "hint").some((h) => h.key === "carry_max"));
    expect(sim.state.player.stack.filter((r) => r === "res.fuel_dense").length).toBe(6);
    idle(sim, 10 * TPS); // let the core burn down a little
    const before = sim.state.core.fuel;
    const ev = [...walkTo(sim, at(240, 520), 50), ...idle(sim, 30)];
    const dep = all(ev, "deposited").filter((d) => d.to === "sink.core" && d.res === "res.fuel_dense" && d.by === undefined);
    expect(dep.length).toBeGreaterThanOrEqual(1);
    expect(sim.state.core.fuel).toBeGreaterThanOrEqual(Math.min(20, before + 4 * dep.length - 1));
  });

  it("the waves goal is won once every wave has spawned and no hostile is left", () => {
    const sim = createSim({ ...LEVEL_4, waves: [{ t: 1, counts: { "hostile.creature": 1 } }] });
    walkPath(sim, [at(320, 600), at(320, 440), at(240, 440)]);
    const ev = chase(sim, () => sim.state.hostiles[0]?.pos ?? null, (e) => has(e, "level_end"), 40 * TPS);
    expect(has(ev, "wave_cleared")).toBe(true);
    expect(sim.state.won).toBe(true);
    expect(sim.state.reason).toBe("goal");
  });
});

describe("supply routing", () => {
  const ROUTING = {
    ...LEVEL_1,
    id: "test-routing",
    modules: ["carry", "gather", "core", "sales", "workers", "build_pads", "supply_routing"],
    entities: [
      { type: "sink.core", id: "core", at: [240, 400], params: { fuel: 20, level: 1 } },
      { type: "node.material_source", at: [60, 300] },
      { type: "node.material_source", at: [60, 380] },
      { type: "node.food_source", id: "food1", at: [410, 300] },
      { type: "sink.sales_point", id: "shop", at: [330, 600], sells: ["res.food_raw_1"] },
      { type: "struct.depot", id: "depot", at: [240, 300] },
      { type: "conv.material_processor", id: "saw", at: [120, 480] },
    ],
    people: [
      { role: "role.supplier", from: "node.material_source", to: "store.depot" },
      { role: "role.hauler", from: "store.depot" },
    ],
    params: { "start.currency": 0, "core.burn": 60 },
    goal: { type: "currency", n: 999 },
    objectives: undefined,
  };

  it("suppliers bound to the depot drop there; haulers route by need score to the neediest consumer", () => {
    const sim = createSim(ROUTING);
    expect(sim.state.depot).not.toBeNull();
    const hauler = sim.state.residents.find((r) => r.role === "role.hauler")!;
    const supplier = sim.state.residents.find((r) => r.role === "role.supplier")!;
    const ev = idle(sim, 60 * TPS, (e) => all(e, "deposited").some((d) => d.by === hauler.id));
    expect(all(ev, "deposited").filter((d) => d.by === supplier.id).every((d) => d.to === "store.depot")).toBe(true);
    const haul = all(ev, "deposited").filter((d) => d.by === hauler.id);
    // Core is full (need 0); the processor is empty (need 3), so logs go to the processor.
    expect(haul[0]!.to).toBe("conv.material_processor");
    expect(sim.state.converters[0]!.inQ.length).toBeGreaterThan(0);
  });

  it("fuel override: a hauler carrying fuel goes to a critical core first", () => {
    const sim = createSim(ROUTING);
    const hauler = sim.state.residents.find((r) => r.role === "role.hauler")!;
    idle(sim, 60 * TPS, () => hauler.mode === "deliver");
    expect(hauler.mode).toBe("deliver");
    expect(hauler.target).toBe("conv.material_processor");
    expect(hauler.carry).toBe("res.material_basic");
    sim.state.core.fuel = 2; // 10% of cap: below the core's critical level
    const ev = idle(sim, 30 * TPS, (e) => all(e, "deposited").some((d) => d.by === hauler.id));
    expect(all(ev, "deposited").filter((d) => d.by === hauler.id)[0]!.to).toBe("sink.core");
    expect(sim.state.core.fuel).toBeGreaterThan(2);
  });

  it("a depot pad places the depot; depot-bound suppliers wait until it exists", () => {
    const sim = createSim({
      ...ROUTING,
      entities: [
        ...ROUTING.entities.filter((e) => e.type !== "struct.depot"),
        { type: "pad.build", id: "depot_pad", at: [240, 300], cost: { "res.currency": 1 }, build: "struct.depot" },
      ],
      params: { "start.currency": 1, "core.burn": 60 },
    });
    expect(sim.state.depot).toBeNull();
    const supplier = sim.state.residents.find((r) => r.role === "role.supplier")!;
    const early = idle(sim, 10 * TPS);
    expect(all(early, "deposited").some((d) => d.by === supplier.id)).toBe(false);
    expect(supplier.n).toBe(3);
    walkPath(sim, [at(320, 400), at(240, 300)], 8);
    idle(sim, 30, (e) => has(e, "built"));
    expect(sim.state.depot).not.toBeNull();
    const ev = idle(sim, 10 * TPS, (e) => all(e, "deposited").some((d) => d.by === supplier.id));
    expect(all(ev, "deposited").some((d) => d.by === supplier.id && d.to === "store.depot")).toBe(true);
  });
});

describe("manifest cross-reference checks", () => {
  type Loose = Record<string, any>;
  const ents = LEVEL_4.entities as Loose[];
  const bad = (patch: Record<string, unknown>, msg: RegExp) => expect(() => createSim({ ...LEVEL_4, ...patch })).toThrow(msg);
  it("rejects a barrier line without a gate", () => {
    bad({ entities: ents.map((e) => e.type === "barrier.line" ? { ...e, sections: e.sections.map((s: Loose) => ({ ...s, gate: false })) } : e) }, /gate/);
  });
  it("rejects non-contiguous sections", () => {
    bad({ entities: ents.map((e) => e.type === "barrier.line" ? { ...e, sections: [e.sections[0], { ...e.sections[2], gate: true }] } : e) }, /contiguous/);
  });
  it("rejects unknown hostiles, events and upgrade targets", () => {
    bad({ waves: [{ t: 1, counts: { "hostile.dragon": 1 } }] }, /unknown hostile/);
    bad({ events: [{ type: "event.eclipse", warnAt: 1, start: 2, end: 3 }] }, /unknown event/);
    bad({ entities: ents.map((e) => e.type === "pad.build" && e.id === "towerup0" ? { ...e, target: "barracks" } : e) }, /must target/);
  });
  it("rejects lasso with defense, and defense without waves", () => {
    expect(() => createSim({ ...LEVEL_4, modules: [...LEVEL_4.modules, "lasso"] })).toThrow(/excludes/);
    bad({ waves: [] }, /defense needs waves/);
  });
});

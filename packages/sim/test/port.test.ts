import { describe, expect, it } from "vitest";
import { content } from "@fo/content";
import { IMPLEMENTED_MODULES, METER_MAX, TPS, createSim } from "../src/index.js";
import { LEVELS, at, idle, newSim, walkTo } from "./helpers.js";

// the kiosk at (330, 570): its clerk spot, coin pile and queue head follow content's offsets (the plot layout moves them)
const KS = content.sinks["sink.sales_point"] as unknown as { registerOffset: [number, number]; pileOffset: [number, number]; queueOffset: [number, number] };
const REG = at(330, 570 + KS.registerOffset[1]), PILE = at(330 + Math.abs(KS.pileOffset[0]), 570 + KS.pileOffset[1]);

// Each test walks the prototype's level 1 the way a player would and checks the
// ported rules: gather to the per-type cap, feed the core, stock the shelf, sell
// at the register, collect the pile, and lose when the core goes out.

describe("prototype level 1 port", () => {
  it("gathers material up to the per-type cap, then hints", () => {
    const sim = newSim();
    const ev = walkTo(sim, at(50, 220), 30);
    // The hint needs a node in range with stock, so it fires once the emptied node regrows (6 s).
    const more = idle(sim, 300, (e) => e.some((x) => x.t === "hint" && x.key === "carry_max"));
    const gathered = [...ev, ...more].filter((e) => e.t === "gathered");
    // The walk brushes past two other nodes, so items come from several sources.
    expect(gathered.length).toBe(6);
    expect(sim.state.player.stack.filter((r) => r === "res.material_basic").length).toBe(6);
    expect(sim.state.nodes[0]!.stock).toBeLessThan(4);
    expect(more.some((e) => e.t === "hint" && e.key === "carry_max")).toBe(true);
  });

  it("skips a capped node and gathers from another in-range node", () => {
    const sim = newSim();
    const st = sim.state;
    const mat = st.nodes.findIndex((n) => n.type === "node.material_source");
    const food = st.nodes.findIndex((n) => n.type === "node.food_source");
    expect(mat).toBeLessThan(food);
    st.nodes[food]!.pos = { ...st.nodes[mat]!.pos };
    st.player.pos = { ...st.nodes[mat]!.pos };
    st.player.stack = Array(6).fill("res.material_basic");
    const ev = idle(sim, 60);
    expect(ev.some((e) => e.t === "gathered" && e.res === "res.food_raw_1")).toBe(true);
    expect(ev.some((e) => e.t === "hint" && e.key === "carry_max")).toBe(false);
  });

  it("hints carry_max only when every in-range node is capped", () => {
    const sim = newSim();
    const st = sim.state;
    const mat = st.nodes.findIndex((n) => n.type === "node.material_source");
    const food = st.nodes.findIndex((n) => n.type === "node.food_source");
    st.nodes[food]!.pos = { ...st.nodes[mat]!.pos };
    st.player.pos = { ...st.nodes[mat]!.pos };
    st.player.stack = [...Array(6).fill("res.material_basic"), ...Array(6).fill("res.food_raw_1")];
    const ev = idle(sim, 60);
    expect(ev.some((e) => e.t === "hint" && e.key === "carry_max")).toBe(true);
    expect(ev.some((e) => e.t === "gathered")).toBe(false);
  });

  it("feeds the core with carried material", () => {
    const sim = newSim();
    walkTo(sim, at(50, 220), 30);
    idle(sim, 90);
    const before = sim.state.core.fuel;
    // Deposits start at 58 units out, before the walk helper's 50-unit stop, so count both.
    const ev = [...walkTo(sim, at(240, 400), 50), ...idle(sim, 60)];
    const deposits = ev.filter((e) => e.t === "deposited" && e.to === "sink.core");
    expect(deposits.length).toBe(6);
    expect(sim.state.player.stack.length).toBe(0);
    // Fuel rose by six, less whatever burned on the walk (one unit every 2.4 s).
    expect(sim.state.core.fuel).toBeGreaterThanOrEqual(before + 6 - 2);
    expect(sim.state.core.fuel).toBeLessThanOrEqual(20);
  });

  it("sells food at a staffed register and the player collects the pay", () => {
    const sim = newSim();
    walkTo(sim, at(410, 240), 30);
    idle(sim, 120, (e) => e.some((x) => x.t === "hint" && x.key === "carry_max"));
    expect(sim.state.player.stack.filter((r) => r === "res.food_raw_1").length).toBe(6);

    // Stock from the east side of the kiosk, clear of the clerk pad, so nothing sells yet.
    walkTo(sim, at(372, 580), 6);
    idle(sim, 60);
    expect(sim.state.sales!.shelf["res.food_raw_1"]).toBe(6);
    expect(sim.state.player.stack.length).toBe(0);

    // The clerk pad is on the camera side (south) of the counter; stand on it and wait.
    // Customers queued while the shelf was being stocked, so sales can start as the player steps in.
    expect(sim.state.sales!.register).toEqual(REG);
    const ev = [...walkTo(sim, REG, 10), ...idle(sim, 60 * TPS, (e) => e.some((x) => x.t === "sold"))];
    const sales = ev.filter((e) => e.t === "sold");
    expect(sales.length).toBeGreaterThan(0);
    let paid = 0;
    for (const s of sales) {
      if (s.t !== "sold") continue;
      expect(s.res).toBe("res.food_raw_1");
      expect(s.pay).toBe(2 * s.n);
      paid += s.pay;
    }
    expect(sim.state.sales!.pileN).toBe(paid);
    expect(sim.state.currency).toBe(0);

    expect(sim.state.sales!.pile).toEqual(PILE);
    const got = [...walkTo(sim, PILE, 20), ...idle(sim, 5)];
    expect(got.some((e) => e.t === "collected")).toBe(true);
    expect(sim.state.currency + sim.state.sales!.pileN).toBeGreaterThanOrEqual(paid);
    expect(sim.state.currency).toBeGreaterThanOrEqual(paid);
  });

  it("the disabled second food source cannot be gathered", () => {
    const sim = newSim();
    walkTo(sim, at(410, 340), 20);
    const ev = idle(sim, 60);
    expect(ev.some((e) => e.t === "gathered")).toBe(false);
  });

  it("a customer who waits too long leaves angry", () => {
    const sim = newSim();
    // Nothing on the shelf, nobody at the register: the first customer times out after 45 s.
    const ev = idle(sim, 60 * TPS, (e) => e.some((x) => x.t === "customer_left"));
    const left = ev.find((e) => e.t === "customer_left");
    expect(left).toBeDefined();
    expect(left?.t === "customer_left" && left.angry).toBe(true);
    expect(sim.state.tick).toBeGreaterThan(45 * TPS);
  });

  it("an unfed core burns out and the lifeline fails after the grace period", () => {
    const sim = newSim();
    const ev = idle(sim, 120 * TPS, (e) => e.some((x) => x.t === "level_end"));
    const out = ev.find((e) => e.t === "core_fuel_out");
    expect(out).toBeDefined();
    expect(sim.state.over).toBe(true);
    expect(sim.state.won).toBe(false);
    expect(sim.state.reason).toBe("meter.lifeline");
    // 12 fuel at 2.4 s each = 28.8 s, then 22 s of grace.
    const expected = Math.round((12 * 2.4 + 22) * TPS);
    expect(Math.abs(sim.state.tick - expected)).toBeLessThan(TPS);
    expect(sim.state.core.lifeline).toBe(0);
    // Stepping after the end is a no-op.
    expect(sim.step({ dx: 0, dy: 0 })).toEqual([]);
  });

  it("the lifeline recovers once the core is fed again", () => {
    const sim = newSim();
    idle(sim, Math.round(12 * 2.4 * TPS) + 5 * TPS);
    expect(sim.state.core.fuel).toBe(0);
    expect(sim.state.core.lifeline).toBeLessThan(METER_MAX);
    const shrunk = sim.safeRadius();
    walkTo(sim, at(50, 220), 30);
    idle(sim, 90);
    walkTo(sim, at(240, 400), 50);
    idle(sim, 90);
    expect(sim.state.core.fuel).toBeGreaterThan(0);
    expect(sim.safeRadius()).toBeGreaterThan(shrunk);
    expect(sim.state.over).toBe(false);
    idle(sim, 5 * TPS);
    expect(sim.state.core.lifeline).toBe(METER_MAX);
  });

  it("loads the manifest's inert pads and residents as data", () => {
    const sim = newSim();
    expect(sim.state.pads.map((p) => p.id)).toContain("landmark");
    expect(sim.state.residents.length).toBe(4);
    expect(sim.state.pads.every((p) => !p.done)).toBe(true);
  });

  it("implements every catalog module, so no golden level warns", () => {
    const warns: string[] = [];
    for (const L of LEVELS) createSim(L, { onWarn: (m) => warns.push(m) });
    expect(warns).toEqual([]);
    for (const mod of Object.keys(content.modules)) expect(IMPLEMENTED_MODULES.has(mod), mod).toBe(true);
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fp, type Sim, type SimEvent } from "../src/index.js";
import { breakSection } from "../src/systems/barriers.js";
import { LEVEL_4, idle, newSim } from "./helpers.js";

// Level 4: north_wall is a line of three sections at y=230 (res.currency, costPerSection 8, middle one a gate).
const withRepair = (k: number, seed = 1): Sim =>
  newSim({ seed, params: { ...(LEVEL_4.params as Record<string, number>), "barrier.repairK": k } }, LEVEL_4);

/** Mark every section standing at full hp (no hostiles are around this early), and park the hero by section 0. */
function standWalls(sim: Sim): void {
  for (const s of sim.state.barriers[0]!.sections) { s.built = true; s.hpMax = 14; s.hp = 14; s.paid = 8; delete s.broken; }
  sim.state.player.pos = { x: fp(80), y: fp(245) };
}

const repairs = (ev: SimEvent[]) => ev.filter((e): e is Extract<SimEvent, { t: "barrier_repaired" }> => e.t === "barrier_repaired");

describe("wall repair (barrier.repairK)", () => {
  it("is off by default: a damaged wall is left alone and no param is added to the state", () => {
    const sim = newSim({}, LEVEL_4);
    expect(sim.state.params["barrier.repairPm"]).toBeUndefined();
    standWalls(sim);
    sim.state.barriers[0]!.sections[0]!.hp = 3;
    sim.state.currency = 20;
    const ev = idle(sim, 60);
    expect(repairs(ev)).toHaveLength(0);
    expect(sim.state.barriers[0]!.sections[0]!.hp).toBe(3);
    expect(sim.state.currency).toBe(20);
  });

  it("restores full hp for ceil(cost * repairK) units", () => {
    const sim = withRepair(0.5);
    standWalls(sim);
    sim.state.barriers[0]!.sections[0]!.hp = 3;
    sim.state.currency = 20;
    const ev = idle(sim, 60, (e) => e.some((x) => x.t === "barrier_repaired"));
    expect(repairs(ev)).toEqual([{ t: "barrier_repaired", line: "north_wall", section: 0, cost: 4, rebuilt: false }]);
    expect(sim.state.barriers[0]!.sections[0]!.hp).toBe(sim.state.barriers[0]!.sections[0]!.hpMax);
    expect(sim.state.currency).toBe(16);
  });

  it("rounds the price up", () => {
    const sim = withRepair(0.5);
    standWalls(sim);
    sim.state.barriers[0]!.costPerSection = 5;
    sim.state.barriers[0]!.sections[0]!.hp = 1;
    sim.state.currency = 10;
    idle(sim, 60, (e) => e.some((x) => x.t === "barrier_repaired"));
    expect(sim.state.currency).toBe(7);
  });

  it("never repairs an undamaged section and never charges without the resource", () => {
    const sim = withRepair(0.5);
    standWalls(sim);
    sim.state.currency = 20;
    expect(repairs(idle(sim, 90))).toHaveLength(0);
    expect(sim.state.currency).toBe(20);
    sim.state.barriers[0]!.sections[0]!.hp = 2;
    sim.state.currency = 3; // one short of the price
    const ev = idle(sim, 90);
    expect(repairs(ev)).toHaveLength(0);
    expect(ev.some((e) => e.t === "hint" && e.key === "barrier_damaged")).toBe(true);
    expect(sim.state.currency).toBe(3);
    expect(sim.state.barriers[0]!.sections[0]!.hp).toBe(2);
  });

  it("rebuilds a destroyed section at the repair price", () => {
    const sim = withRepair(0.5);
    standWalls(sim);
    breakSection(sim.state, sim.state.barriers[0]!, 0, []);
    expect(sim.state.barriers[0]!.sections[0]!.broken).toBe(true);
    sim.state.currency = 20;
    const ev = idle(sim, 120, (e) => e.some((x) => x.t === "barrier_repaired"));
    expect(repairs(ev)).toEqual([{ t: "barrier_repaired", line: "north_wall", section: 0, cost: 4, rebuilt: true }]);
    const s = sim.state.barriers[0]!.sections[0]!;
    expect(s).toMatchObject({ built: true, hp: s.hpMax });
    expect(s.broken).toBeUndefined();
    expect(sim.state.currency).toBe(16);
  });

  it("holds hp within bounds and conserves paid resources for any damage and purse", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 30 }), fc.array(fc.integer({ min: 0, max: 14 }), { minLength: 3, maxLength: 3 }),
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), fc.integer({ min: 100, max: 500 }),
        (seed, purse, hps, breaks, ticks) => {
          const sim = withRepair(0.5, seed);
          standWalls(sim);
          const line = sim.state.barriers[0]!;
          hps.forEach((hp, i) => { line.sections[i]!.hp = hp; });
          breaks.forEach((b, i) => { if (b) breakSection(sim.state, line, i, []); });
          sim.state.currency = purse;
          let spent = 0;
          for (let t = 0; t < ticks; t++) {
            const ev = sim.step({ dx: t % 200 < 100 ? 1 : -1, dy: 0 });
            for (const e of ev) {
              if (e.t === "barrier_progress") spent += 1;
              if (e.t === "barrier_repaired" && !e.rebuilt) spent += e.cost;
            }
            for (const s of line.sections) {
              expect(s.hp).toBeGreaterThanOrEqual(0);
              expect(s.hp).toBeLessThanOrEqual(s.hpMax);
            }
            expect(purse - sim.state.currency).toBe(spent);
            if (sim.state.over) break;
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

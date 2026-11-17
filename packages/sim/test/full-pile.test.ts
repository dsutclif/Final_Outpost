import { describe, expect, it } from "vitest";
import { TPS } from "../src/index.js";
import { LEVEL_3, newSim } from "./helpers.js";

type Loose = Record<string, any>;
const NONE = { dx: 0, dy: 0 };

// A full output pile only stops its processor; it never ends the level (the old collapse rule is gone).
describe("full output pile", () => {
  const make = () => {
    const base = LEVEL_3 as Loose;
    return newSim({ entities: [...base.entities, { type: "conv.food_processor", id: "oven", at: [170, 630] }] }, LEVEL_3);
  };

  it("held at its cap far past the old 8 s limit, the level keeps running and no goods are lost", () => {
    const sim = make();
    const cv = sim.state.converters[0]!;
    const cap = sim.compiled.converters[cv.type]!.outCap;
    cv.out = cap;
    for (let i = 0; i < 30 * TPS; i++) sim.step(NONE);
    expect(sim.state.over).toBe(false);
    expect(sim.state.reason).not.toBe("pile_collapse");
    expect(cv.out).toBe(cap);
  });

  it("a processor with a full tray does not run", () => {
    const sim = make();
    const cv = sim.state.converters[0]!;
    const cap = sim.compiled.converters[cv.type]!.outCap;
    cv.out = cap;
    cv.inQ.push(sim.state.converters[0]!.inQ[0] ?? "res.food_raw_1");
    for (let i = 0; i < 5 * TPS; i++) sim.step(NONE);
    expect(cv.out).toBeLessThanOrEqual(cap);
  });
});

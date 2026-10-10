import { describe, expect, it } from "vitest";
import { LEVEL_3, newSim } from "./helpers.js";

describe("customers and idle converters (DECISIONS 9f)", () => {
  const withGrill = () => {
    const m = structuredClone(LEVEL_3) as { entities: object[] };
    m.entities.push({ type: "conv.food_processor", id: "grill_placed", at: [170, 630] });
    return newSim(m as Record<string, unknown>);
  };

  it("nobody orders a converter-only good while its shelf is empty and the converter is idle", () => {
    const sim = withGrill();
    const asked = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      sim.step({ dx: 0, dy: 0 });
      for (const q of sim.state.sales!.queue) asked.add(q.res);
    }
    expect(asked.has("res.food_raw_1")).toBe(true);
    expect(asked.has("res.food_prepared")).toBe(false);
  });

  it("orders resume once the converter holds output", () => {
    const sim = withGrill();
    sim.state.converters[0]!.out = 3;
    const asked = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      sim.step({ dx: 0, dy: 0 });
      for (const q of sim.state.sales!.queue) asked.add(q.res);
    }
    expect(asked.has("res.food_prepared")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { createSim, seedRng } from "@fo/sim";
import { Brain, PROFILES, planBot, playBot } from "../src/index.js";
import level3 from "../../../levels/golden/proto-L003.json";

// Overstock collapse (REDESIGN-R3 item 9): with the rule on, the bots keep converter outputs
// off the cap; with it off, play is exactly what it was.

const on = (seconds: number) => ({ ...level3, params: { ...level3.params, "stock.collapseSeconds": seconds } });
const good = PROFILES["good"]!;

describe("bots and the pile collapse rule", () => {
  it("the reference bot never lets an output sit at cap long enough to collapse", () => {
    for (const seed of [1, 2, 3]) {
      const r = playBot(on(8), good, seed);
      expect(r.reason, `seed ${seed}`).not.toBe("pile_collapse");
      expect(r.trace.capHoldMax, `seed ${seed}`).toBeLessThan(8);
    }
  });

  it("collects from a pile left at cap before the countdown runs out", () => {
    // An unwanted converter (its output is neither sold nor planned) with a full tray would
    // sit at cap for good, because no plan step ever asks for it.
    const m = { ...on(8), seed: 1, entities: [...level3.entities, { type: "conv.alloy_works", id: "alloy", at: [40, 860] }] };
    const sim = createSim(m);
    const cv = sim.state.converters[0]!;
    const cap = sim.compiled.converters[cv.type]!.outCap;
    cv.out = cap;
    const brain = new Brain(sim.compiled, planBot(m), { ...good, reactionTicks: 0 }, seedRng(1));
    let fetchedBelowCap = false;
    for (let t = 0; t < 30 * 60 && !sim.state.over; t++) {
      sim.step(brain.tick(sim.state));
      if (cv.out < cap) fetchedBelowCap = true;
    }
    expect(sim.state.reason).not.toBe("pile_collapse");
    expect(fetchedBelowCap).toBe(true);
  });

  it("with the rule on (the default since engine 0.6.0) golden level 3 is still won, never by collapse", () => {
    for (const seed of [1, 2, 3]) {
      const r = playBot(level3, good, seed);
      expect(r.won).toBe(true);
      expect(r.reason).not.toBe("pile_collapse");
    }
  });
});

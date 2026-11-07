import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSim } from "../src/index.js";
import { LEVEL_3 } from "./helpers.js";

// Plot plan Q7: a parts works' input worker is withdrawn once its belt is built first, and the operator
// follows either one. Modelled here on the golden level 3 pads: "server" plays the input worker (withdrawn by
// "saw"), and "cook" plays the operator (after "server" or "saw").
type Loose = Record<string, any>;
const level = (): Loose => {
  const m = structuredClone(LEVEL_3) as Loose;
  for (const e of m.entities) {
    if (e.id === "server") e.dropWhen = { pad: "saw" };
    if (e.id === "cook") e.requires = { pad: "server", orPad: "saw" };
  }
  return m;
};
const pad = (sim: ReturnType<typeof createSim>, id: string) => sim.state.pads.find((p) => p.id === id)!;
const NONE = { dx: 0, dy: 0 };

describe("pad alternatives (orPad, dropWhen)", () => {
  it("whichever of the input worker and the belt comes first opens the operator; the belt first withdraws the unpaid input worker", () => {
    // order: which of grill / saw / server get done, in which order; paid: whether the player paid into server first
    fc.assert(fc.property(fc.shuffledSubarray(["grill", "saw", "server"]), fc.boolean(), (order, paidIn) => {
      const sim = createSim(level());
      sim.step(NONE);
      if (paidIn) pad(sim, "server").paid["res.currency"] = 1;
      for (const id of order) { pad(sim, id).done = true; sim.step(NONE); }
      const done = new Set(order);
      expect(pad(sim, "cook").visible).toBe(done.has("server") || done.has("saw"));
      const server = pad(sim, "server");
      if (!server.done) expect(server.visible).toBe(done.has("grill") && (!done.has("saw") || paidIn));
    }), { numRuns: 60 });
  });

  it("levels without the options are unchanged: a plain requirement still needs its pad", () => {
    const sim = createSim(structuredClone(LEVEL_3) as Loose);
    sim.step(NONE);
    pad(sim, "saw").done = true;
    sim.step(NONE);
    expect(pad(sim, "cook").visible).toBe(false);
  });
});

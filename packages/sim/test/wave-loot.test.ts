import { describe, expect, it } from "vitest";
import { fp } from "../src/index.js";
import { LEVEL_4, newSim } from "./helpers.js";

// R3 playtest: surviving a wave sweeps its leftover loot (anything hostiles drop) into the hero's
// pack, up to the carry caps; drops no hostile makes stay where they fell.

describe("loot pickup", () => {
  // Batch 3: no sweep any more; loot stays where it fell and the hero runs out for it.
  it("picks up ground drops within the shooting range", () => {
    const sim = newSim({}, LEVEL_4);
    expect(sim.compiled.drops.pickupRange).toBe(fp(90));
  });
});

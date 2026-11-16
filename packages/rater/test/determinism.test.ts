import { describe, expect, it } from "vitest";
import { historyEntry, rate } from "../src/index.js";
import level2 from "../../../levels/golden/proto-L002.json";
import level3 from "../../../levels/golden/proto-L003.json";

// outpost-ops#196: the same manifest (recipe + seed) must always rate the same, so a regenerated
// pack's "on target" numbers are reproducible. Two independent rate calls on fresh clones, with a
// different level rated in between, must agree exactly on difficulty and fun.
describe("rating determinism", () => {
  const opts = { refSeeds: 3, otherSeeds: 1, history: [historyEntry(level2)] };
  it("the same manifest rated twice gives the same D and F", () => {
    const a = rate(structuredClone(level3), opts);
    rate(structuredClone(level2), { refSeeds: 1, otherSeeds: 1 }); // unrelated rating in between must not leak state
    const b = rate(structuredClone(level3), opts);
    expect(b.D).toBe(a.D);
    expect(b.F).toBe(a.F);
    expect(b).toEqual(a);
  }, 180_000);
});

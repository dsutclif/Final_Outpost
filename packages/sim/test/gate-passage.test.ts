import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSim, fp, blockedAt } from "../src/index.js";
import { gatedMove } from "../src/systems/barriers.js";
import { LEVEL_4 } from "./helpers.js";

// #81 (Doug, 2026-11-08): every character must be able to pass through gates. A hunter at a gate on level 17 walked
// in and out of it for ever because the straight line through a gate ran on into the wall behind it.

type Loose = Record<string, any>;
const RING = {
  type: "barrier.line", id: "ring", res: "res.salvage", closed: true, costPerSection: 1,
  points: [[120, 400], [240, 400], [360, 400], [360, 520], [360, 640], [240, 640], [120, 640], [120, 520]],
  gates: [1, 5], prebuilt: [0, 1, 2, 3, 4, 5, 6, 7],
};
const sim = () => {
  const base = LEVEL_4 as Loose;
  return createSim({ ...base, id: "test-passage", entities: [...base.entities.filter((e: Loose) => e.type !== "barrier.line"), RING] });
};

describe("gatedMove: any character gets through a gate", () => {
  it("reaches any open spot from any open spot, inside or out, round corners too", () => {
    const s = sim();
    const open = fc.record({ x: fc.integer({ min: 20, max: 460 }), y: fc.integer({ min: 300, max: 740 }) })
      .filter((p) => !blockedAt(s.state, s.compiled, fp(p.x), fp(p.y)) && ![[120, 400], [240, 400], [360, 400], [360, 520], [360, 640], [240, 640], [120, 640], [120, 520]].some(([x, y]) => Math.abs(x! - p.x) < 30 && Math.abs(y! - p.y) < 30));
    fc.assert(fc.property(open, open, (a, b) => {
      const pos = { x: fp(a.x), y: fp(a.y) }, target = { x: fp(b.x), y: fp(b.y) };
      let arrived = false;
      for (let i = 0; i < 1200 && !arrived; i++) arrived = gatedMove(s.state, s.compiled, pos, target, 2667, 3000);
      expect(arrived).toBe(true);
    }), { numRuns: 120 });
  });
});

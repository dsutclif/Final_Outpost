import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, METER_MAX, type Input, type Sim } from "../src/index.js";
import { newSim } from "./helpers.js";

// Invariants that must hold on every tick under any input stream.
function checkInvariants(sim: Sim): void {
  const st = sim.state, cp = sim.compiled;
  const counts: Record<string, number> = {};
  for (const r of st.player.stack) counts[r] = (counts[r] ?? 0) + 1;
  for (const [r, n] of Object.entries(counts)) {
    const cap = cp.resources[r]!.cap;
    expect(cap, `${r} is not carriable`).not.toBeNull();
    expect(n, `${r} over cap`).toBeLessThanOrEqual(cap!);
  }
  expect(st.core.fuel).toBeGreaterThanOrEqual(0);
  expect(st.core.fuel).toBeLessThanOrEqual(cp.core.levels[st.core.level - 1]!.fuelCap);
  expect(st.core.lifeline).toBeGreaterThanOrEqual(0);
  expect(st.core.lifeline).toBeLessThanOrEqual(METER_MAX);
  for (const n of st.nodes) if (n.stock !== null) {
    expect(n.stock).toBeGreaterThanOrEqual(0);
    expect(n.stock).toBeLessThanOrEqual(cp.nodes[n.type]!.stock!);
  }
  const p = st.player.pos;
  expect(p.x).toBeGreaterThanOrEqual(cp.player.radius);
  expect(p.x).toBeLessThanOrEqual(cp.map.w - cp.player.radius);
  expect(p.y).toBeGreaterThanOrEqual(cp.player.radius);
  expect(p.y).toBeLessThanOrEqual(cp.map.h - cp.player.radius);
  if (st.sales) {
    for (const [r, n] of Object.entries(st.sales.shelf)) {
      expect(n, `${r} shelf`).toBeGreaterThanOrEqual(0);
      expect(n, `${r} shelf`).toBeLessThanOrEqual(cp.sales.shelfCap);
    }
    expect(st.sales.queue.length).toBeLessThanOrEqual(cp.sales.queueMax);
    expect(st.sales.pileN).toBeGreaterThanOrEqual(0);
  }
  expect(st.currency).toBeGreaterThanOrEqual(0);
}

const segment = fc.record({
  dx: fc.integer({ min: -2 * FP, max: 2 * FP }),
  dy: fc.integer({ min: -2 * FP, max: 2 * FP }),
  hold: fc.integer({ min: 1, max: 90 }),
});

describe("sim invariants", () => {
  it("hold for any input stream", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.array(segment, { minLength: 1, maxLength: 40 }), (seed, segs) => {
        const sim = newSim({ seed });
        for (const s of segs) {
          const inp: Input = { dx: s.dx, dy: s.dy };
          for (let i = 0; i < s.hold; i++) {
            sim.step(inp);
            checkInvariants(sim);
            if (sim.state.over) return;
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it("events never reference a negative or missing node", () => {
    const sim = newSim();
    for (let i = 0; i < 600; i++) {
      for (const e of sim.step({ dx: i < 300 ? -FP : FP, dy: -FP })) {
        if (e.t === "gathered") expect(sim.state.nodes[e.node]).toBeDefined();
      }
    }
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { OBJECTIVE_KINDS, TPS } from "../src/index.js";
import { converterRunnable, operated, placeConverter } from "../src/systems/converters.js";
import type { ObjectiveState } from "../src/state.js";
import { LEVEL_3, newSim } from "./helpers.js";

// automate `machines`: the hands-off clock only grows while at least that many converters run
// (input queued, tray not full, operated). machines absent/0 keeps the old deposit-gap clock.

const fresh = (): ObjectiveState => ({ id: "x", kind: "automate", progress: 0, target: 0, done: false, failed: false, doneTick: -1 });

describe("automate machines", () => {
  it("the clock never advances while fewer than N converters run", () => {
    const tick = fc.record({ q: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }), op: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }), hands: fc.boolean() });
    fc.assert(fc.property(fc.integer({ min: 1, max: 3 }), fc.array(tick, { minLength: 1, maxLength: 120 }), (machines, ticks) => {
      const sim = newSim({}, LEVEL_3);
      const { state: st, compiled: cp } = sim;
      ["conv.food_processor", "conv.material_processor", "conv.food_processor", "conv.material_processor"].forEach((ty, i) => placeConverter(st, cp, `c${i}`, ty, { x: i * 50_000, y: 0 }));
      const o = fresh(), main = fresh();
      let prev = 0;
      for (const t of ticks) {
        st.tick++;
        st.converters.forEach((cv, i) => {
          cv.inQ = t.q[i % 4] ? [cp.converters[cv.type]!.inputs[0]!] : [];
          cv.out = 0;
        });
        // the player stands on the first converter's operator spot, or far away
        st.player.pos = t.op[0] ? { ...st.converters[0]!.operatorPos } : { x: -1_000_000, y: -1_000_000 };
        st.stats.salesSinceDeposit = t.hands ? 1 : 0;
        const running = st.converters.filter((cv) => converterRunnable(cp, cv) && operated(st, cp, cv)).length;
        OBJECTIVE_KINDS.automate!({ st, cp, p: { seconds: 5, machines }, o, main });
        if (running < machines || !t.hands) expect(o.progress).toBe(0);
        else expect(o.progress).toBe(prev + 1);
        prev = o.progress;
      }
    }), { numRuns: 60 });
  });

  it("machines 0 or absent matches the deposit-gap clock", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 3 }), (gap, sales) => {
      const sim = newSim({}, LEVEL_3);
      const { state: st, compiled: cp } = sim;
      st.tick = 1000;
      st.stats.lastPlayerDeposit = st.tick - gap;
      st.stats.salesSinceDeposit = sales;
      const want = sales > 0 ? Math.min(gap, 5 * TPS) : 0;
      for (const p of [{ seconds: 5 }, { seconds: 5, machines: 0 }]) {
        const o = fresh();
        OBJECTIVE_KINDS.automate!({ st, cp, p, o, main: fresh() });
        expect(o.progress).toBe(want);
        expect(o.target).toBe(5 * TPS);
      }
    }), { numRuns: 100 });
  });
});

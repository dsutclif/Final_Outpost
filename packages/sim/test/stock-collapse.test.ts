import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, TPS, collapseSecondsLeft, converterStockKey, type SimEvent } from "../src/index.js";
import { LEVEL_3, newSim } from "./helpers.js";

// Overstock collapse (REDESIGN-R3 item 9): a converter output held at its cap for
// stock.collapseSeconds topples and fails the level; below cap resets the clock.

const KEY = converterStockKey("oven");
type Loose = Record<string, any>;

const make = (seconds?: number, extra: Loose = {}) => {
  const base = LEVEL_3 as Loose;
  const params = seconds === undefined ? base.params : { ...base.params, "stock.collapseSeconds": seconds };
  return newSim({ ...extra, params, entities: [...base.entities, { type: "conv.food_processor", id: "oven", at: [170, 630] }] }, LEVEL_3);
};
const NONE = { dx: 0, dy: 0 };

describe("pile collapse", () => {
  it("with collapseSeconds 0 a full output never fails the level", () => {
    const sim = make(0);
    expect(sim.compiled.stock.collapseTicks).toBe(0);
    const cv = sim.state.converters[0]!;
    const cap = sim.compiled.converters[cv.type]!.outCap;
    for (let i = 0; i < 20 * TPS; i++) { cv.out = cap; sim.step(NONE); }
    expect(sim.state.over).toBe(false);
    expect(sim.state.collapse).toBeUndefined();
  });

  it("disabled runs write no collapse state", () => {
    const b = make(0);
    for (let i = 0; i < 600; i++) b.step({ dx: 3, dy: -1 });
    expect(b.state.collapse).toBeUndefined();
  });

  it("starts counting the tick the output reaches cap, and resets when it drops below", () => {
    const sim = make(2);
    const cv = sim.state.converters[0]!;
    const cap = sim.compiled.converters[cv.type]!.outCap;
    sim.step(NONE);
    expect(sim.state.collapse?.[KEY]).toBeUndefined();
    cv.out = cap;
    for (let i = 0; i < 10; i++) sim.step(NONE);
    expect(sim.state.collapse![KEY]).toBe(10);
    expect(collapseSecondsLeft(sim.state, sim.compiled, KEY)).toBe(2);
    cv.out = cap - 1;
    sim.step(NONE);
    expect(sim.state.collapse![KEY]).toBeUndefined();
    cv.out = cap;
    sim.step(NONE);
    expect(sim.state.collapse![KEY]).toBe(1);
  });

  it("fails the level with reason pile_collapse after collapseSeconds at cap, and loses no goods", () => {
    const sim = make(2);
    const cv = sim.state.converters[0]!;
    const cap = sim.compiled.converters[cv.type]!.outCap;
    cv.out = cap;
    const seen: SimEvent[] = [];
    for (let i = 0; i < 2 * TPS - 1; i++) seen.push(...sim.step(NONE));
    expect(sim.state.over).toBe(false);
    seen.push(...sim.step(NONE));
    expect(sim.state.over).toBe(true);
    expect(sim.state.won).toBe(false);
    expect(sim.state.reason).toBe("pile_collapse");
    expect(seen.find((e) => e.t === "pile_collapsed")).toEqual({ t: "pile_collapsed", conv: "oven" });
    expect(seen.find((e) => e.t === "level_end")).toMatchObject({ won: false, reason: "pile_collapse" });
    expect(cv.out).toBe(cap);
  });

  it("a reset just before zero buys a whole new countdown", () => {
    const sim = make(1);
    const cv = sim.state.converters[0]!;
    const cap = sim.compiled.converters[cv.type]!.outCap;
    cv.out = cap;
    for (let i = 0; i < TPS - 1; i++) sim.step(NONE);
    cv.out = cap - 1;
    sim.step(NONE);
    cv.out = cap;
    for (let i = 0; i < TPS - 1; i++) sim.step(NONE);
    expect(sim.state.over).toBe(false);
    sim.step(NONE);
    expect(sim.state.reason).toBe("pile_collapse");
  });

  it("kiosk shelves never count: a shelf held at cap does not collapse", () => {
    const sim = make(1);
    const st = sim.state;
    for (let i = 0; i < 5 * TPS; i++) {
      for (const r of st.sales!.sells) st.sales!.shelf[r] = sim.compiled.sales.shelfCap;
      sim.step(NONE);
    }
    expect(st.reason).not.toBe("pile_collapse");
  });

  const segment = fc.record({
    dx: fc.integer({ min: -FP, max: FP }), dy: fc.integer({ min: -FP, max: FP }),
    hold: fc.integer({ min: 1, max: 40 }), atCap: fc.boolean(),
  });

  it("property: never fails by collapse while the stock stays below cap", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.array(segment, { minLength: 1, maxLength: 25 }), (seed, segs) => {
      const sim = make(1, { seed });
      const cv = sim.state.converters[0]!;
      const cap = sim.compiled.converters[cv.type]!.outCap;
      for (const s of segs) for (let i = 0; i < s.hold; i++) {
        cv.out = Math.min(cv.out, cap - 1);
        sim.step({ dx: s.dx, dy: s.dy });
        cv.out = Math.min(cv.out, cap - 1);
        if (sim.state.reason === "pile_collapse") return false;
      }
      return true;
    }), { numRuns: 25 });
  });

  it("property: a collapse only ever follows an unbroken stretch at cap of the full countdown", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.array(segment, { minLength: 1, maxLength: 25 }), (seed, segs) => {
      const sim = make(1, { seed });
      const cv = sim.state.converters[0]!;
      const cap = sim.compiled.converters[cv.type]!.outCap;
      let run = 0;
      for (const s of segs) for (let i = 0; i < s.hold; i++) {
        if (s.atCap) cv.out = cap; else cv.out = Math.min(cv.out, cap - 1);
        sim.step({ dx: s.dx, dy: s.dy });
        run = cv.out >= cap ? run + 1 : 0;
        if (sim.state.reason === "pile_collapse") return run >= sim.compiled.stock.collapseTicks;
        if (run >= sim.compiled.stock.collapseTicks) return false;
      }
      return true;
    }), { numRuns: 25 });
  });
});

import { describe, expect, it } from "vitest";
import { closure, sequenceRange } from "@fo/sequencer";
import { buildLevel, knobsFor, templateById, GEN } from "../src/index.js";

// Defend redesign S1 switches (outpost-ops#272, spec 1.1/1.2): default off gives today's output; on changes only what the spec names.
type M = { params?: Record<string, number>; waves: { t: number }[]; entities: { type: string; build?: string; cost?: Record<string, number> }[] };
const defs = sequenceRange(1, 60).filter((r) => r.family === "defend");
const single = defs.find((r) => !r.secondary)!, two = defs.find((r) => !!r.secondary);
const mk = (r: (typeof defs)[number]): M => {
  for (let salt = 0; salt < GEN.search.layoutTries; salt++) {
    try {
      return buildLevel({ id: r.id, seed: r.seed, family: r.family, secondary: r.secondary, features: r.features, goalType: r.goalType,
        modules: closure(r.modules), template: templateById(r.template), knobs: knobsFor(0.5), walls: true }, salt).manifest as unknown as M;
    } catch { /* next layout draw */ }
  }
  throw new Error("no build");
};
const towers = (m: M) => m.entities.filter((e) => e.type === "pad.build" && e.build?.startsWith("struct.ranged_defense"));

describe("defend S1 generator switches", () => {
  it("ship default off", () => {
    expect(GEN.defendWaves.maxLive).toEqual({ single: 1, twoFamily: 1 });
    expect(GEN.defendWaves.singleFamilyGap).toBe(0);
    expect(GEN.defendCosts.coinTowers).toBe(false);
  }, 60_000);
  it("default off: no maxLive param, salvage-priced towers", () => {
    for (const r of [single, two].filter(Boolean)) {
      const m = mk(r!);
      expect(m.params?.["defense.maxLive"]).toBeUndefined();
      for (const t of towers(m)) expect(Object.keys(t.cost ?? {})).toEqual(["res.salvage"]);
    }
  }, 120_000);
  it("on: single-family gets maxLive 2 and 20 s gaps; two-family keeps its waves and pays towers in coins", () => {
    const save = structuredClone({ w: GEN.defendWaves.maxLive, g: GEN.defendWaves.singleFamilyGap, c: GEN.defendCosts });
    const offSingle = mk(single), offTwo = two ? mk(two) : null;
    try {
      GEN.defendWaves.maxLive = { single: 2, twoFamily: 1 };
      GEN.defendWaves.singleFamilyGap = 20;
      GEN.defendCosts.coinTowers = true;
      const s = mk(single);
      expect(s.params?.["defense.maxLive"]).toBe(2);
      expect(s.waves.slice(1).every((w, k) => w.t - s.waves[k]!.t === 20)).toBe(true);
      expect(s.waves.length).toBe(offSingle.waves.length);
      if (two && offTwo) {
        const t = mk(two);
        expect(t.params?.["defense.maxLive"]).toBeUndefined();
        expect(t.waves.map((w) => w.t)).toEqual(offTwo.waves.map((w) => w.t));
        for (const p of towers(t)) expect(Object.keys(p.cost ?? {})).toEqual(["res.currency"]);
      }
    } finally {
      GEN.defendWaves.maxLive = save.w; GEN.defendWaves.singleFamilyGap = save.g; Object.assign(GEN.defendCosts, save.c);
    }
  }, 120_000);

  it("S2 random sides: default off; on, a multi_side level gets sideMode 1 and every attack side as each wave's pool", () => {
    expect(GEN.defendWaves.randomSides).toBe(false);
    expect(GEN.defendWaves.warnSeconds).toBe(6);
    const multi = defs.filter((r) => r.features.includes("multi_side"));
    expect(multi.length).toBeGreaterThan(0);
    const save = GEN.defendWaves.randomSides;
    try {
      let found = 0;
      for (const r of multi.slice(0, 4)) {
        GEN.defendWaves.randomSides = false;
        const off = mk(r) as M & { attackSides?: string[]; defend?: { attackSides?: string[] } };
        expect(off.params?.["defense.sideMode"]).toBeUndefined();
        GEN.defendWaves.randomSides = true;
        const on = mk(r) as unknown as { params?: Record<string, number>; waves: { side?: string | string[] }[] };
        if (on.params?.["defense.sideMode"] !== 1) continue; // a multi_side level that drew one attack side keeps rotating
        found++;
        expect(on.params?.["defense.warnSeconds"]).toBe(6);
        for (const w of on.waves) { expect(Array.isArray(w.side)).toBe(true); expect((w.side as string[]).length).toBeGreaterThan(1); }
      }
      expect(found).toBeGreaterThan(0);
    } finally { GEN.defendWaves.randomSides = save; }
  }, 240_000);
});

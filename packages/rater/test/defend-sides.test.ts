import { describe, expect, it } from "vitest";
import { playBot, strategyProfile } from "@fo/bots";
import { sideMetrics } from "../src/index.js";
import level4 from "../../../levels/golden/proto-L004.json";

// Defend redesign S2 metrics: read-only observers, so a measured run is the plain run.
const lv = (random: boolean): any => {
  const base = level4 as any;
  return { ...base, id: "test-sides", params: { ...base.params, ...(random ? { "defense.sideMode": 1 } : {}) },
    waves: [10, 60, 110].map((t) => ({ t, counts: { "hostile.swarmling": 3 }, side: random ? ["n", "e", "s", "w"] : "n", gap: 1 })) };
};

describe("sideMetrics", () => {
  it("random: warned waves, read time within the warning, same hash as the plain run", () => {
    const p = strategyProfile("turrets_first"), m = sideMetrics(lv(true), p, 3);
    expect(m.warned).toBeGreaterThan(0);
    expect(m.sideReadTime).toBeGreaterThanOrEqual(0);
    expect(m.sideReadTime).toBeLessThanOrEqual(60);
    expect(m.wrongSideShare).toBeGreaterThanOrEqual(0);
    expect(m.wrongSideShare).toBeLessThanOrEqual(1);
    expect(m.hash).toBe(playBot(lv(true), p, 3).hash);
  });
  it("rotate: nothing warned, metrics null", () => {
    const m = sideMetrics(lv(false), strategyProfile("turrets_first"), 3);
    expect(m.warned).toBe(0);
    expect(m.sideReadTime).toBeNull();
    expect(m.wrongSideShare).toBeNull();
  });
});

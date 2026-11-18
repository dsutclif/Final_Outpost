import { describe, expect, it } from "vitest";
import { content, type Manifest } from "@fo/content";
import genData from "../data/generator.json";
import { GEN } from "../src/index.js";
import { wavePoints } from "../src/build.js";
import { scaleAttack, tuneScale, type AttackTune } from "../src/attackTune.js";

// Per-level defend tuning (outpost-ops#98, 98.1): a candidate that misses its target keeps its layout and has its
// attack scaled, a secant step on the rating each time, at most maxSteps re-ratings.
const T = (genData as unknown as { attackTune: AttackTune }).attackTune;
const DW = GEN.defendWaves;
const lim = { maxPoints: DW.maxPoints, cap: DW.waveCap, spawnMax: DW.spawnMax, minGap: DW.minGap };

describe("tuneScale on a synthetic rating curve", () => {
  // D rises with the attack scale and flattens out, like the rater's difficulty does
  const curves: [string, (f: number) => number][] = [
    ["steep", (f) => 1 - Math.exp(-1.4 * f)],
    ["shallow", (f) => 0.15 + 0.3 * Math.log(1 + f)],
    ["s-shaped", (f) => 1 / (1 + Math.exp(-3 * (f - 1.2)))],
  ];
  for (const [name, curve] of curves) for (const target of [0.3, 0.5, 0.7]) {
    const d0 = curve(1);
    // targets the curve cannot reach within [minScale, maxScale] are the out-of-reach case below
    if (Math.abs(d0 - target) <= T.trigger || target < curve(T.minScale) || target > curve(T.maxScale)) continue;
    it(`${name} curve reaches ${target} within ${T.maxSteps} steps (built D ${d0.toFixed(2)})`, () => {
      let calls = 0;
      const r = tuneScale(target, d0, (f) => { calls++; return curve(f); }, T);
      expect(r.tuned).toBe(true);
      expect(calls).toBeLessThanOrEqual(T.maxSteps);
      expect(Math.abs(r.D - target)).toBeLessThanOrEqual(T.trigger);
      expect(r.D).toBeCloseTo(curve(r.scale), 6);
    });
  }

  it("a level already within the trigger is not re-rated", () => {
    let calls = 0;
    const r = tuneScale(0.5, 0.5 + T.trigger * 0.9, () => { calls++; return 0; }, T);
    expect(calls).toBe(0);
    expect(r).toMatchObject({ scale: 1, tuned: false, steps: [] });
  });

  it("stops at maxSteps and keeps the closest point when the target is out of reach", () => {
    let calls = 0;
    const r = tuneScale(0.95, 0.4, (f) => { calls++; return Math.min(0.6, 0.4 * f); }, T);
    expect(calls).toBeLessThanOrEqual(T.maxSteps);
    expect(r.D).toBe(Math.max(...r.steps.map((s) => s.D), 0.4));
    for (const s of r.steps) expect(s.scale).toBeLessThanOrEqual(T.maxScale + 1e-9);
  });
});

describe("scaleAttack", () => {
  const waves: Manifest["waves"] = [
    { t: 20, counts: { "hostile.swarmling": 20 }, side: "e", gap: 0.7 },
    { t: 80, counts: { "hostile.swarmling": 60, "hostile.raider_humanoid": 6 }, side: "n", gap: 0.45 },
    { t: 140, counts: { "hostile.swarmling": 40, "hostile.boss": 2 }, side: "n", gap: 0.45 },
  ];
  it("keeps warlords, wave times and sides; scales the rest", () => {
    const up = scaleAttack(waves, 1.5, content, lim), down = scaleAttack(waves, 0.5, content, lim);
    expect(up.map((w) => w.t)).toEqual(waves.map((w) => w.t));
    expect(up[2]!.counts["hostile.boss"]).toBe(2);
    expect(down[2]!.counts["hostile.boss"]).toBe(2);
    expect(down[0]!.counts["hostile.swarmling"]).toBe(10);
    expect(up[0]!.counts["hostile.swarmling"]).toBe(30);
  });
  it("no wave goes over maxPoints or past the dense-wave cap it did not already exceed", () => {
    for (const w of scaleAttack(waves, DW.maxPoints, content, lim)) {
      expect(wavePoints(w.counts, content)).toBeLessThanOrEqual(DW.maxPoints);
      const own = wavePoints(waves.find((x) => x.t === w.t)!.counts, content);
      if (DW.waveCap > 0) expect(wavePoints(w.counts, content)).toBeLessThanOrEqual(Math.max(own, DW.waveCap));
      const size = Object.values(w.counts).reduce((a, n) => a + n, 0);
      expect(size * w.gap! <= DW.spawnMax || w.gap === DW.minGap).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { METRIC_NAMES, gradedSkillNeeded, type Metrics } from "../src/index.js";
import { SD_FLOOR, Z_CLAMP, zScores, type ReferenceStats } from "../src/rate.js";

const run = (won: boolean, margin: number) => ({ won, margin });
const rungs = (good: ReturnType<typeof run>, lower: ReturnType<typeof run>[]) => ({
  good: [good], average: [lower[0]!], weak: [lower[1]!], novice: [lower[2]!], floor: [lower[3]!],
});
const WIN = run(true, 0.6), LOSS0 = run(false, -1);

describe("graded skillNeeded", () => {
  it("is ~0 when every rung wins clearly and 1.25 when the good bot fails", () => {
    expect(gradedSkillNeeded(rungs(WIN, [WIN, WIN, WIN, WIN]))).toBeLessThan(0.01);
    expect(gradedSkillNeeded(rungs(LOSS0, [WIN, WIN, WIN, WIN]))).toBe(1.25);
  });
  it("a floor bot that just misses adds a little; one failing at half progress adds ~0.25 less than a clean loss", () => {
    const near = gradedSkillNeeded(rungs(WIN, [WIN, WIN, WIN, run(false, -0.05)]));
    const half = gradedSkillNeeded(rungs(WIN, [WIN, WIN, WIN, run(false, -0.5)]));
    const full = gradedSkillNeeded(rungs(WIN, [WIN, WIN, WIN, LOSS0]));
    expect(near).toBeGreaterThan(0.05); expect(near).toBeLessThan(0.17); // sigmoid(-0.5) = .38 pass -> (1-.38)/4
    expect(half).toBeGreaterThan(near); expect(half).toBeLessThan(full);
    expect(full).toBeCloseTo(0.25, 1);
    expect(half).toBeGreaterThan(0.23);
  });
  it("moves smoothly: margins from +0.2 to -0.2 never jump by a rung", () => {
    let prev = gradedSkillNeeded(rungs(WIN, [WIN, WIN, WIN, run(true, 0.2)]));
    for (let m = 0.2; m >= -0.2; m -= 0.01) {
      const s = gradedSkillNeeded(rungs(WIN, [WIN, WIN, WIN, run(m >= 0, m)]));
      expect(Math.abs(s - prev)).toBeLessThan(0.02);
      prev = s;
    }
  });
});

describe("robust z", () => {
  const ref: ReferenceStats = {
    source: "t", n: 3,
    metrics: Object.fromEntries(METRIC_NAMES.map((k) => [k, { mean: 0, sd: 0.0014 }])) as ReferenceStats["metrics"],
  };
  const m = Object.fromEntries(METRIC_NAMES.map((k) => [k, 0])) as Metrics;
  it("a near-zero reference sd cannot give a huge z (#262)", () => {
    const z = zScores({ ...m, concurrentDemand: 0.068 }, ref);
    expect(z.concurrentDemand).toBeCloseTo(0.068 / SD_FLOOR.concurrentDemand, 6);
    expect(z.concurrentDemand).toBeLessThan(Z_CLAMP + 1e-9);
  });
  it("clamps every z to +-3", () => {
    const z = zScores(Object.fromEntries(METRIC_NAMES.map((k) => [k, 1e6])) as Metrics, ref);
    for (const k of METRIC_NAMES) expect(z[k]).toBe(Z_CLAMP);
    const lo = zScores(Object.fromEntries(METRIC_NAMES.map((k) => [k, -1e6])) as Metrics, ref);
    for (const k of METRIC_NAMES) expect(lo[k]).toBe(-Z_CLAMP);
  });
});

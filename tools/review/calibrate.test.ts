import { describe, expect, it } from "vitest";
import { loadLimits } from "./lib.js";
import { bestSplit, calibrate, join } from "./calibrate-core.js";
import type { LevelPulse, PulseFile } from "./pulse-core.js";
import type { LevelAgg, TelemetryAgg } from "./telemetry-core.js";

const L = loadLimits();

function pulseLevel(id: string, over: { gap: number; stars?: number; oneTask?: number }): LevelPulse {
  return {
    levelId: id, pack: "p", index: 0, family: "f", goal: "build", template: "t", seeds: 3,
    stars: { good: 3, human: over.stars ?? 3 }, winRate: { human: 1 }, D: 0.5, F: 0.5, feasible: true, filters: [], metrics: {},
    proxies: { deadTime: { value: 0.02, y: 1 } },
    shape: { durS: 100, stillS: 10, longestStillS: 3, distU: 500, acts: { gathered: 10 }, firstRewardS: 5, rewardGapMaxS: over.gap, sameRunMax: 3 },
    oneTaskS: over.oneTask ?? 5, oneTaskKinds: "", noTaskS: 1, choiceShare: 0.5, loopMax: 2, loopKey: "",
    human: { winRate: 1, earned: [], lossAfterS: -1, stalls: 0, seeds: 3 },
  };
}

function teleLevel(up: number, down: number, playerGap?: number): LevelAgg {
  const total = up + down;
  return {
    starts: total, plays: total, outcomes: {}, installs: total, starsMean: null,
    ratings: { up, down, total, downShare: total ? down / total : null, chips: {}, chipsOnDown: {} },
    byNp: { new: { plays: 0, up: 0, down: 0 }, returning: { plays: 0, up: 0, down: 0 }, unknown: { plays: 0, up: 0, down: 0 } },
    shape: playerGap === undefined ? null : { plays: 6, median: { rewardGapMaxS: playerGap, durS: 100, stillS: 10, longestStillS: 3, distU: 500, firstRewardS: 5, sameRunMax: 3 }, stillShare: 0.1, acts: {} },
    perf: null,
  };
}

function files(levels: { id: string; gap: number; up: number; down: number; stars?: number }[]): { pulse: PulseFile; tele: TelemetryAgg } {
  const pulse: PulseFile = {
    v: 1, meta: { generated: "", engine: "", content: "", seeds: 3, packs: [], levels: levels.length, runtimeS: 0, errors: [] },
    levels: Object.fromEntries(levels.map((l) => [l.id, pulseLevel(l.id, { gap: l.gap, ...(l.stars !== undefined ? { stars: l.stars } : {}) })])), moved: [],
  };
  const tele = {
    v: 1, generated: "", levels: Object.fromEntries(levels.map((l) => [l.id, teleLevel(l.up, l.down, l.gap + 3)])),
    overall: { ratings: { total: levels.reduce((a, l) => a + l.up + l.down, 0), up: 0, down: 0, perLevelEnd: 0 } },
  } as unknown as TelemetryAgg;
  return { pulse, tele };
}

describe("best split", () => {
  it("finds the threshold that separates the bad levels from the good ones", () => {
    const xs = [5, 8, 10, 12, 40, 55, 70, 90];
    const bad = [false, false, false, false, true, true, true, true];
    expect(bestSplit(xs, bad, ">")).toMatchObject({ value: 26, tpr: 1, fpr: 0, j: 1 });
    expect(bestSplit(xs, bad, "<")!.j).toBeLessThan(0.5);
  });

  it("gives nothing when every level is on one side", () => {
    expect(bestSplit([1, 2, 3], [true, true, true], ">")).toBeNull();
  });
});

describe("calibrate", () => {
  // Twelve levels: the longer the reward gap, the more 👎.
  const levels = Array.from({ length: 12 }, (_, i) => ({ id: `s1-L0${10 + i}`, gap: 8 + i * 6, up: i < 6 ? 9 : 2, down: i < 6 ? 1 : 8 }));

  it("joins pulse and telemetry per level and reports which numbers go with 👎", () => {
    const { pulse, tele } = files(levels);
    const r = calibrate(pulse, tele, L, "2026-11-06T00:00:00.000Z");
    expect(r.status).toBe("ok");
    expect(r.have).toMatchObject({ joined: 12, withEnoughRatings: 12, bad: 6, good: 6, unmatched: [] });
    const gap = r.predictors.find((p) => p.name === "shape.rewardGapMaxS")!;
    expect(gap.rho).toBeGreaterThan(0.85);
    expect(gap.best).toMatchObject({ dir: ">", tpr: 1, fpr: 0 });
    expect(gap.atLimit).toMatchObject({ flagged: 8 }); // gaps of 32.. exceed the 30 s limit
    expect(r.predictors[0]!.rho).not.toBeNull();
    // sorted by strength of the link
    const strengths = r.predictors.map((p) => Math.abs(p.rho ?? 0));
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
  });

  it("suggests the split between the 👍 and 👎 levels as the new limit", () => {
    const { pulse, tele } = files(levels);
    const r = calibrate(pulse, tele, L);
    const s = r.suggestedLimits.find((x) => x.key === "rewardDrought.gapS")!;
    expect(s.current).toBe(30);
    // levels 0-5 have gaps 8..38, levels 6-11 have 44..74: the split sits between 38 and 44
    expect(s.suggested).toBe(41);
    expect(s.basis).toMatch(/rank correlation/);
  });

  it("does not suggest a limit when the data points the other way", () => {
    const flipped = levels.map((l) => ({ ...l, up: l.down, down: l.up }));
    const { pulse, tele } = files(flipped);
    const r = calibrate(pulse, tele, L);
    expect(r.suggestedLimits.find((x) => x.key === "rewardDrought.gapS")).toBeUndefined();
    expect(r.predictors.find((p) => p.name === "shape.rewardGapMaxS")!.note).toMatch(/other way/);
  });

  it("compares the bot's shape with the players' on the same levels", () => {
    const { pulse, tele } = files(levels);
    const r = calibrate(pulse, tele, L);
    const gap = r.botVsPlayers.find((b) => b.field === "shape.rewardGapMaxS")!;
    expect(gap.n).toBe(12);
    expect(gap.rho).toBeGreaterThan(0.99);
    expect(r.botVsPlayers.find((b) => b.field === "shape.durS")!.rho).toBeNull(); // the same value everywhere: no ranking
  });

  it("says there is not enough data instead of guessing", () => {
    const { pulse, tele } = files(levels.slice(0, 5));
    const r = calibrate(pulse, tele, L);
    expect(r.status).toBe("not_enough_data");
    expect(r.reason).toMatch(/levels have at least 5 ratings \(need 8\)/);
    expect(r.suggestedLimits).toEqual([]);
    expect(r.predictors).toEqual([]);
    expect(r.have.withEnoughRatings).toBe(5);
  });

  it("handles no ratings at all, and levels the pulse does not know", () => {
    const { pulse, tele } = files(levels.slice(0, 3).map((l) => ({ ...l, up: 0, down: 0 })));
    expect(calibrate(pulse, tele, L).status).toBe("not_enough_data");
    const only = files(levels.slice(0, 3));
    delete only.pulse.levels["s1-L011"];
    const r = calibrate(only.pulse, only.tele, L);
    expect(r.have.unmatched).toEqual(["s1-L011"]);
    expect(join(only.pulse, only.tele).joined.map((j) => j.levelId)).toEqual(["s1-L010", "s1-L012"]);
  });

  it("needs both kinds of level: all 👍 gives no split", () => {
    const happy = levels.map((l) => ({ ...l, up: 10, down: 0 }));
    const { pulse, tele } = files(happy);
    const r = calibrate(pulse, tele, L);
    expect(r.status).toBe("not_enough_data");
    expect(r.reason).toMatch(/mostly-👎 levels/);
  });
});

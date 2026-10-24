import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION, METER_MAX, createSim } from "@fo/sim";
import { describe, expect, it } from "vitest";
import level1 from "../../../levels/golden/proto-L001.json";
import level4 from "../../../levels/golden/proto-L004.json";
import type { LevelMeta } from "../src/levels.js";
import { budgetSeconds, chapters, isUnlocked, nextLevel, starsFor, winMargin } from "../src/progress.js";
import { DEFAULT_PROGRESS, type Progress } from "../src/save.js";
import { autoTier } from "../src/render.js";

const pin = <T extends object>(m: T): T => ({ ...m, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });
const meta = (i: number): LevelMeta => ({ id: `L${i}`, index: i, modules: [], goalType: "build", text: {}, engineVersion: "", contentVersion: "" });
const levels = Array.from({ length: 25 }, (_, i) => meta(i));
const prog = (p: Partial<Progress>): Progress => ({ ...structuredClone(DEFAULT_PROGRESS), ...p });

describe("progression", () => {
  it("unlocks levels one after another", () => {
    const p = prog({ cleared: { L0: true } });
    expect(isUnlocked(levels, levels[0]!, p)).toBe(true);
    expect(isUnlocked(levels, levels[1]!, p)).toBe(true);
    expect(isUnlocked(levels, levels[2]!, p)).toBe(false);
    expect(isUnlocked(levels, levels[2]!, p, true)).toBe(true);
  });

  it("Play continues at the next uncleared level, never a locked one", () => {
    expect(nextLevel(levels, prog({}))!.id).toBe("L0");
    expect(nextLevel(levels, prog({ cleared: { L0: true, L1: true } }))!.id).toBe("L2");
    expect(nextLevel(levels, prog({ cleared: { L0: true }, current: "L7" }))!.id).toBe("L1");
    expect(nextLevel(levels, prog({ cleared: { L0: true, L1: true }, current: "L1" }))!.id).toBe("L2");
  });

  it("groups levels in chapters of ten", () => {
    const c = chapters(levels, 10);
    expect(c.map((x) => [x.n, x.levels.length])).toEqual([[1, 10], [2, 10], [3, 5]]);
  });

  it("rates a win 1 to 3 stars from the margin", () => {
    expect([starsFor(0), starsFor(0.24), starsFor(0.25), starsFor(0.49), starsFor(0.5), starsFor(1)]).toEqual([1, 1, 2, 2, 3, 3]);
    const s1 = createSim(pin(level1));
    // no timer and no hull: time left of the rating budget (level.budgetSeconds)
    expect(winMargin(s1.state, s1.compiled, METER_MAX)).toBe(1);
    s1.state.tick = Math.round(budgetSeconds(s1.compiled) * 30 * 0.7);
    expect(winMargin(s1.state, s1.compiled, METER_MAX)).toBeCloseTo(0.3, 2);
    const s4 = createSim(pin(level4));
    const st = s4.state;
    if (st.meters.baseHealthMax > 0) {
      st.meters.baseHealth = Math.round(st.meters.baseHealthMax * 0.4);
      expect(winMargin(st, s4.compiled, METER_MAX)).toBeCloseTo(0.4, 1);
    }
  });
});

describe("quality tier", () => {
  it("tiers the 3D renderer by the probed frame rate, else the core count", () => {
    expect(autoTier(60, 8)).toBe("high");
    expect(autoTier(60, 4)).toBe("medium");
    expect(autoTier(45, 8)).toBe("medium");
    expect(autoTier(30, 8)).toBe("low");
    expect(autoTier(null, 2)).toBe("low");
  });
});

describe("native save mirror", async () => {
  const { MirroredStore } = await import("../src/platform.js");
  const { MemoryStore } = await import("../src/save.js");
  it("mirrors progress to the key-value store and restores it into an empty save", async () => {
    const kv = new Map<string, string>();
    const store = { get: async (k: string) => kv.get(k) ?? null, set: async (k: string, v: string) => { kv.set(k, v); } };
    const a = new MirroredStore(new MemoryStore(), store);
    await a.setProgress(prog({ cleared: { L0: true }, current: "L1" }));
    const b = new MirroredStore(new MemoryStore(), store);
    expect(await b.restore()).toBe(true);
    expect((await b.getProgress()).cleared).toEqual({ L0: true });
    expect(await b.restore()).toBe(false);
  });
});

describe("progress epoch (alpha rule: a regenerated pack restarts at L1)", () => {
  it("clears level progress from an older epoch but keeps coach marks and discoveries", async () => {
    const { mergeProgress, PROGRESS_EPOCH } = await import("../src/save.js");
    const old = { cleared: { "s1-L001": true }, best: { "s1-L001": 900 }, stars: { "s1-L001": 3 }, current: "s1-L002", coach: { move: 3 }, discovered: { "node.food_source": true } };
    const m = mergeProgress(old);
    expect(m.epoch).toBe(PROGRESS_EPOCH);
    expect(m.cleared).toEqual({});
    expect(m.stars).toEqual({});
    expect(m.current).toBeNull();
    expect(m.coach).toEqual({ move: 3 });
    expect(m.discovered).toEqual({ "node.food_source": true });
    const same = mergeProgress({ ...old, epoch: PROGRESS_EPOCH });
    expect(same.cleared).toEqual({ "s1-L001": true });
  });

  it("keep mode carries cleared levels and Play's level, not times, stars or tries", async () => {
    const { mergeProgress, PROGRESS_EPOCH } = await import("../src/save.js");
    const old = { epoch: PROGRESS_EPOCH - 1, cleared: { "s1-L001": true }, best: { "s1-L001": 900 }, stars: { "s1-L001": 3 }, starSet: { "s1-L001": ["main"] }, tries: { "s1-L001": 2 }, quits: { "s1-L002": 1 }, current: "s1-L002", coach: { move: 3 }, discovered: { "node.food_source": true } };
    const m = mergeProgress(old, "keep");
    expect(m.epoch).toBe(PROGRESS_EPOCH);
    expect(m.cleared).toEqual({ "s1-L001": true });
    expect(m.current).toBe("s1-L002");
    expect([m.best, m.stars, m.starSet, m.tries, m.quits]).toEqual([{}, {}, {}, {}, {}]);
    expect(m.coach).toEqual({ move: 3 });
    expect(m.discovered).toEqual({ "node.food_source": true });
    // a current-epoch save ignores the mode
    expect(mergeProgress({ ...old, epoch: PROGRESS_EPOCH }, "keep").stars).toEqual({ "s1-L001": 3 });
  });

  it("asks only for an older-epoch save that has level progress", async () => {
    const { needsProgressChoice, PROGRESS_EPOCH } = await import("../src/save.js");
    expect(needsProgressChoice(null)).toBe(false); // fresh install
    expect(needsProgressChoice({ cleared: {}, current: null, coach: { move: 1 } })).toBe(false); // nothing cleared
    expect(needsProgressChoice({ cleared: { L0: true } })).toBe(true); // no epoch field: the first generation
    expect(needsProgressChoice({ epoch: PROGRESS_EPOCH - 1, cleared: {}, current: "L0" })).toBe(true);
    expect(needsProgressChoice({ epoch: PROGRESS_EPOCH, cleared: { L0: true } })).toBe(false);
  });

  it("the native mirror does not overwrite an older-epoch save waiting for the choice", async () => {
    const { MirroredStore } = await import("../src/platform.js");
    const { MemoryStore, PROGRESS_EPOCH } = await import("../src/save.js");
    const kv = new Map<string, string>([["fo-save-v1", JSON.stringify({ progress: { cleared: { other: true }, epoch: PROGRESS_EPOCH } })]]);
    const inner = new MemoryStore();
    await inner.setProgress({ ...prog({ cleared: { L0: true }, current: "L1" }), epoch: PROGRESS_EPOCH - 1 });
    const store = new MirroredStore(inner, { get: async (k) => kv.get(k) ?? null, set: async (k, v) => { kv.set(k, v); } });
    expect(await store.restore()).toBe(false);
    expect(await store.progressChoicePending()).toBe(true);
    expect((await store.getProgress("keep")).cleared).toEqual({ L0: true });
  });
});

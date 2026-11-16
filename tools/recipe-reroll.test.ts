import { describe, expect, it } from "vitest";
import { recipeKey, recipeOf, sequenceRange, type LevelRequest, type RecipeRegister } from "../packages/sequencer/src/index.js";
import { buildWithRerolls, describeRecipe, stopMessage, type SlotOutcome } from "./recipe-reroll.js";

// Builder re-roll loop with a stub search (outpost-ops#198).

const ENGINE = "0.29.0";
const fresh = (maxRerolls = 8): RecipeRegister => ({ settings: { failGap: 0.1, maxRerolls, targetBand: 0.1 }, entries: [] });
const requestsFor = (indices: number[]) => (reg: RecipeRegister) => {
  const all = sequenceRange(1, Math.max(...indices), [], { register: reg, engine: ENGINE });
  return new Map(indices.map((i) => [i, all[i - 1]!] as const));
};
const key = (r: LevelRequest) => recipeKey(recipeOf(r));

/** A stub search: `fails(req)` decides whether the recipe can be built. */
function stub(fails: (req: LevelRequest) => boolean) {
  const calls: { index: number; key: string }[] = [];
  const build = async (index: number, req: LevelRequest): Promise<SlotOutcome<string>> => {
    calls.push({ index, key: key(req) });
    await new Promise((ok) => setTimeout(ok, 1));
    return fails(req)
      ? { req, ok: false, closestD: req.target - 0.3, seeds: 4, rejects: { too_easy: 3 } }
      : { req, ok: true, result: key(req), closestD: req.target, seeds: 1, rejects: {} };
  };
  return { build, calls };
}

describe("builder re-roll (outpost-ops#198)", () => {
  it("registers a recipe that always fails and builds the slot with another one", async () => {
    const today = requestsFor([25])(fresh()).get(25)!;
    const bad = key(today);
    const { build, calls } = stub((r) => key(r) === bad);
    const reg = fresh();
    const rep = await buildWithRerolls({ indices: [25], register: reg, engine: ENGINE, jobs: 2, date: "2026-11-16", requests: requestsFor([25]), build });
    expect(rep.stopped).toBeNull();
    expect(reg.entries.map((e) => e.key)).toEqual([bad]);
    expect(reg.entries[0]).toMatchObject({ engine: ENGINE, date: "2026-11-16", seeds: 4, rejects: { too_easy: 3 }, target: today.target });
    expect(rep.results.get(25)).not.toBe(bad);
    expect(calls.map((c) => c.key)).toEqual([bad, rep.results.get(25)]);
    expect(rep.events).toHaveLength(1);
    expect(rep.builtWith.get(25)).toEqual(recipeOf(requestsFor([25])(reg).get(25)!));
  });

  it("rebuilds later slots whose request changed after a re-roll, and drops their stale results", async () => {
    const idx = [24, 25, 26, 27, 28, 29, 30];
    const before = requestsFor(idx)(fresh());
    const bad = key(before.get(24)!);
    const { build, calls } = stub((r) => key(r) === bad);
    const reg = fresh();
    const rep = await buildWithRerolls({ indices: idx, register: reg, engine: ENGINE, jobs: idx.length, date: "2026-11-16", requests: requestsFor(idx), build });
    expect(rep.stopped).toBeNull();
    const after = requestsFor(idx)(reg);
    for (const i of idx) expect(rep.results.get(i)).toBe(key(after.get(i)!)); // every result matches the final sequence
    const changed = idx.filter((i) => JSON.stringify(before.get(i)) !== JSON.stringify(after.get(i)));
    expect(changed).toContain(24);
    expect(changed.length).toBeGreaterThan(1); // a later slot took 24 as history and changed too
    // every slot started at once, so each changed slot was built with its old request and again with its new one
    for (const i of changed) expect(calls.filter((c) => c.index === i).map((c) => c.key).slice(-1)).toEqual([key(after.get(i)!)]);
    for (const i of changed) expect(calls.filter((c) => c.index === i).length).toBeGreaterThanOrEqual(2);
  });

  it("stops at the cap naming the in-game level and every recipe tried", async () => {
    const { build, calls } = stub((r) => r.index === 30);
    const reg = fresh(3);
    const rep = await buildWithRerolls({ indices: [29, 30], register: reg, engine: ENGINE, jobs: 2, date: "2026-11-16", requests: requestsFor([29, 30]), build });
    expect(rep.stopped).not.toBeNull();
    expect(rep.stopped!.index).toBe(30);
    expect(rep.stopped!.tried).toHaveLength(4); // the first recipe and 3 re-rolls
    expect(new Set(rep.stopped!.tried.map((r) => recipeKey(r))).size).toBe(4); // never the same recipe twice
    expect(reg.entries).toHaveLength(4);
    expect(calls.filter((c) => c.index === 30)).toHaveLength(4);
    const msg = stopMessage(rep.stopped!);
    expect(msg).toMatch(/^Level 30 cannot be built/);
    for (const r of rep.stopped!.tried) expect(msg).toContain(describeRecipe(r));
  });

  it("stops when the sequencer runs out of recipes for the slot", async () => {
    const { build } = stub((r) => r.index === 25);
    const reg = fresh(1000);
    const rep = await buildWithRerolls({ indices: [25], register: reg, engine: ENGINE, jobs: 1, date: "2026-11-16", requests: requestsFor([25]), build });
    expect(rep.stopped?.index).toBe(25);
    expect(rep.stopped?.reason).toMatch(/no recipe left/);
    expect(rep.stopped!.tried.length).toBe(reg.entries.length);
  });

  it("a crashed worker is not a failed recipe", async () => {
    const reg = fresh();
    const rep = await buildWithRerolls({
      indices: [25], register: reg, engine: ENGINE, jobs: 1, date: "2026-11-16", requests: requestsFor([25]),
      build: async (_i, req) => ({ req, ok: false, crashed: true, closestD: null, seeds: 0, rejects: {} }),
    });
    expect(rep.crashed).toEqual([25]);
    expect(reg.entries).toHaveLength(0);
    expect(rep.stopped).toBeNull();
  });
});

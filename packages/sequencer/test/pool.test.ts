import { describe, expect, it } from "vitest";
import { historyOf, sequenceRange } from "../src/index.js";
import { findFit, whyNotFit, type LevelPool, type PoolEntry } from "../src/pool.js";

// Pool placement rule (outpost-ops#254): D within failGap, family, goal, features, engine, duplicate window.
const reqs = sequenceRange(1, 40);
const slot = reqs[29]!; // a mix level
const hist = reqs.slice(0, 29).map(historyOf);
const entryFor = (r: typeof slot, over: Partial<PoolEntry> = {}): PoolEntry => ({
  id: "e1", file: "e1.json", D: r.target, F: 0.9, family: r.family, secondary: r.secondary, goalId: r.goalId, goalType: r.goalType, template: r.template,
  features: [...r.features], modules: [...r.modules], introduced: [], engine: "0.36.0", recipeId: "k", slotId: "x", slotTarget: r.target, seed: 1, attempt: 0, iteration: 0, starsByRung: {}, date: "2026-11-19", ...over,
});
const o = { failGap: 0.1 };
const pool = (...entries: PoolEntry[]): LevelPool => ({ settings: { maxEntries: 400 }, entries });
// a template this slot's history does not use, so the duplicate rule does not trip the other tests
const freeTpl = (r: typeof slot) => ["a", "b", "c", "d", "e", "f"].find((t) => !hist.slice(-10).some((h) => h.template === t)) ?? "zz";

describe("pool fit", () => {
  const base = () => entryFor(slot, { template: "zz-free" });
  it("fits a level of the slot's own recipe, and by D within failGap", () => {
    expect(whyNotFit(base(), slot, hist, o)).toBeNull();
    expect(whyNotFit({ ...base(), D: slot.target + 0.09 }, slot, hist, o)).toBeNull();
    expect(whyNotFit({ ...base(), D: slot.target + 0.11 }, slot, hist, o)).toMatch(/D /);
  });
  it("needs the slot's family and its fun bar", () => {
    expect(whyNotFit({ ...base(), family: slot.family === "defend" ? "shelter" : "defend" }, slot, hist, o)).toMatch(/family/);
    expect(whyNotFit({ ...base(), F: 0 }, slot, hist, o)).toMatch(/fun/);
  });
  it("needs a goal the entry's features allow, and unlocked features", () => {
    expect(whyNotFit({ ...base(), goalId: "no_such_goal" }, slot, hist, o)).toMatch(/goal/);
    expect(whyNotFit({ ...base(), features: ["not_a_feature"] }, slot, hist, o)).not.toBeNull();
    expect(whyNotFit({ ...base(), introduced: ["x"] }, slot, hist, o)).toMatch(/introduces/);
  });
  it("teach and intro slots take only the exact same introduced features", () => {
    const intro = reqs[7]!;
    const e = entryFor(intro, { introduced: [...intro.introduced], template: "zz-free" });
    expect(whyNotFit(e, intro, reqs.slice(0, 7).map(historyOf), o)).toBeNull();
    expect(whyNotFit({ ...e, introduced: [] }, intro, reqs.slice(0, 7).map(historyOf), o) !== null || intro.introduced.length === 0).toBe(true);
  });
  it("is not a duplicate of a level in duplicateWindow", () => {
    const seen = [...hist, { modules: slot.modules, goal: slot.goalType, template: "zz-free" }];
    expect(whyNotFit(base(), slot, seen, o)).toMatch(/duplicate/);
    // the same modules and goal with another template are not duplicates, and a level older than the window does not count
    expect(whyNotFit({ ...base(), template: "zz-other" }, slot, seen, o)).toBeNull();
    const old = [seen[seen.length - 1]!, ...Array.from({ length: 10 }, () => ({ modules: ["x"], goal: "y", template: "t" }))];
    expect(whyNotFit(base(), slot, old, o)).toBeNull();
    expect(freeTpl(slot)).toBeTruthy();
  });
  it("ignores entries from an older engine", () => {
    const old = base();
    expect(findFit(pool(old), slot, hist, { ...o, engine: "0.36.0" })).not.toBeNull();
    expect(findFit(pool({ ...old, engine: "0.35.0" }), slot, hist, { ...o, engine: "0.36.0" })).toBeNull();
    expect(findFit(pool({ ...old, engine: "0.37.0" }), slot, hist, { ...o, engine: "0.36.0" })).not.toBeNull();
  });
  it("picks the closest D and skips claimed entries", () => {
    const a = { ...base(), id: "a", D: slot.target + 0.08 }, b = { ...base(), id: "b", D: slot.target + 0.02 };
    expect(findFit(pool(a, b), slot, hist, o)?.id).toBe("b");
    expect(findFit(pool(a, b), slot, hist, { ...o, claimed: new Set(["b"]) })?.id).toBe("a");
  });
});

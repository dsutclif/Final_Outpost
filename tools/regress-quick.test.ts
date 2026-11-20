import { describe, expect, it } from "vitest";
import { QUICK_LABEL, pickLevels, planRun } from "./regress-quick.js";

const levels = [{ id: "a", file: "a.json" }, { id: "b", file: "b.json" }, { id: "c", file: "c.json" }];

describe("levels:check --quick", () => {
  it("full mode keeps the old defaults and the cache", () => {
    expect(planRun([])).toEqual({ quick: false, seeds: "10", others: "3", useCache: true, only: null });
    expect(pickLevels(levels, planRun([]), ["levels/packs/s1/a.json"])).toEqual(levels);
  });
  it("quick uses fewer seeds, skips the cache, and explicit seeds still win", () => {
    const p = planRun(["--quick"]);
    expect(p).toMatchObject({ quick: true, seeds: "3", others: "1", useCache: false });
    expect(planRun(["--quick", "--seeds", "5"]).seeds).toBe("5");
    expect(Number(p.seeds)).toBeLessThan(10);
  });
  it("quick replays only the named levels, else only the changed ones", () => {
    expect(pickLevels(levels, planRun(["--quick", "--levels", "a,c"]), []).map((l) => l.id)).toEqual(["a", "c"]);
    expect(pickLevels(levels, planRun(["--quick"]), ["levels/packs/s1/b.json", "README.md"]).map((l) => l.id)).toEqual(["b"]);
    expect(pickLevels(levels, planRun(["--quick"]), [])).toEqual([]);
  });
  it("the label says it is not a ship check", () => {
    expect(QUICK_LABEL).toMatch(/NOT A SHIP CHECK/);
  });
});

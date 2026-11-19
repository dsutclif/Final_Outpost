import { describe, expect, it } from "vitest";
import { duplicatesInOrder, packDuplicates, varietyPass, type Signed } from "./variety-pass.js";

// Pack-build variety pass (outpost-ops#150): levels built in parallel are re-checked in order and duplicates rebuilt.
const lv = (index: number, signature: string): Signed => ({ index, id: `s1-L${String(index).padStart(3, "0")}`, signature });

describe("variety pass", () => {
  it("finds a later level that repeats an earlier one, including pack levels outside the build", () => {
    const res = new Map([[8, lv(8, "a")], [9, lv(9, "b")], [10, lv(10, "a")]]);
    expect(duplicatesInOrder([], res)).toEqual([{ index: 10, sameAs: "s1-L008" }]);
    expect(duplicatesInOrder([lv(7, "b")], res)).toEqual([{ index: 9, sameAs: "s1-L007" }, { index: 10, sameAs: "s1-L008" }]);
  });

  it("rebuilds duplicates in order with every earlier signature to avoid, until clean", async () => {
    const res = new Map([[8, lv(8, "a")], [9, lv(9, "a")], [10, lv(10, "c")]]);
    const seen: string[][] = [];
    // the rebuilt Level 9 lands on Level 10's signature, so Level 10 must be rebuilt on the next walk
    const next: Record<number, string[]> = { 9: ["c"], 10: ["d"] };
    const rep = await varietyPass({
      before: [], results: res, maxPasses: 5,
      rebuild: async (i, avoid) => { seen.push(avoid.map((a) => a.signature)); return lv(i, next[i]!.shift()!); },
    });
    expect(rep.unresolved).toEqual([]);
    expect([...rep.reruns.entries()]).toEqual([[9, 1], [10, 1]]);
    expect(seen).toEqual([["a"], ["a", "c"]]);
    expect([...rep.results.values()].map((r) => r.signature)).toEqual(["a", "c", "d"]);
  });

  it("reports a level it could not make different", async () => {
    const res = new Map([[8, lv(8, "a")], [9, lv(9, "a")]]);
    const rep = await varietyPass({ before: [], results: res, maxPasses: 3, rebuild: async () => null });
    expect(rep.unresolved).toEqual([{ index: 9, id: "s1-L009", sameAs: "s1-L008" }]);
    expect(rep.reruns.get(9)).toBe(1);
  });

  it("levels:check asserts no two shipped levels share a signature; unsigned levels match nothing (150.2)", () => {
    expect(packDuplicates([lv(7, "a"), lv(8, "b"), lv(9, "a")])).toEqual([{ id: "s1-L009", sameAs: "s1-L007" }]);
    expect(packDuplicates([{ id: "x" }, { id: "y" }, lv(9, "a"), lv(10, "b")])).toEqual([]);
  });
});

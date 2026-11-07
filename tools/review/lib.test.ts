import { describe, expect, it } from "vitest";
import { Args, candidate, fingerprint, median, percentile, ranks, segment, spearman } from "./lib.js";

describe("review lib", () => {
  it("parses options, numbers and lists", () => {
    const a = new Args(["--", "--out", "x/y", "--seeds", "5", "--packs", "a, b,,c", "--flag"]);
    expect(a.get("--out")).toBe("x/y");
    expect(a.num("--seeds", 3)).toBe(5);
    expect(a.num("--missing", 3)).toBe(3);
    expect(a.list("--packs")).toEqual(["a", "b", "c"]);
    expect(a.list("--none", ["z"])).toEqual(["z"]);
    expect(a.has("--flag")).toBe(true);
    expect(a.get("--flag")).toBeUndefined();
  });

  it("median, percentile and ranks (ties share a rank)", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  it("spearman: +1 for the same order, -1 reversed, null with no variation or too few pairs", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8);
  });

  it("fingerprints carry no measured numbers, only canonical ids", () => {
    expect(segment("gather:3")).toBe("gather:#");
    expect(segment("res.food_raw_1")).toBe("res.food_raw_1");
    expect(segment("struct.ranged_defense.t2")).toBe("struct.ranged_defense.t2");
    expect(segment("p95")).toBe("p95");
    expect(segment("12.5 s")).toBe("#_s");
    expect(segment("a|b c")).toBe("a_b_c");
    expect(fingerprint(9, "s1-L012", "reward_gap", "drought")).toBe("cat9|s1-L012|reward_gap|drought");
  });

  it("builds a candidate with pillar, track and rounded metric", () => {
    const c = candidate({ category: 9, severity: 2, via: "trace", levelId: "s1-L001", subject: "x", check: "y", title: "t", detail: "d", metric: { name: "m", value: 1.23456, limit: 1 } });
    expect(c).toMatchObject({ fingerprint: "cat9|s1-L001|x|y", pillar: 2, track: "main", via: "trace", evidence: [] });
    expect(c.metric.value).toBe(1.235);
    expect(candidate({ category: 5, severity: 1, via: "probe", levelId: "story-L001", subject: "s", check: "c", title: "", detail: "", metric: { name: "m", value: 0, limit: 0 } }).track).toBe("story");
    expect(candidate({ category: 18, severity: 1, via: "data", levelId: "*", subject: "s", check: "c", title: "", detail: "", metric: { name: "m", value: 0, limit: 0 } }).pillar).toBeNull();
  });
});

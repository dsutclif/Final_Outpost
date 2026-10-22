import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepContiguous, planBatch } from "./levels-next.js";

describe("level supply planning", () => {
  const pub = { count: 60, offset: 0 };

  it("never plans past `ahead` levels beyond the player", () => {
    for (const cleared of [0, 5, 30, 59, 60]) {
      const p = planBatch(pub, cleared, [], 60, 20);
      if (p) expect(p.to).toBeLessThanOrEqual(cleared + 60);
    }
    expect(planBatch(pub, 0, [], 60, 20)).toBeNull();
  });

  it("builds the next contiguous batch, capped by the batch size", () => {
    expect(planBatch(pub, 60, [], 60, 20)).toMatchObject({ from: 61, to: 80, packId: "s1-061" });
    expect(planBatch({ count: 80, offset: 0 }, 60, [], 60, 20)).toMatchObject({ from: 81, to: 100 });
  });

  it("skips gaps smaller than the minimum batch", () => {
    expect(planBatch(pub, 5, [], 60, 20, 10)).toBeNull();
    expect(planBatch(pub, 10, [], 60, 20, 10)).toMatchObject({ from: 61, to: 70 });
  });

  it("counts no more cleared levels than are published", () => {
    expect(planBatch(pub, 500, [], 60, 20)).toMatchObject({ from: 61, to: 80, tuning: { cleared: 60 } });
  });
});

describe("keepContiguous", () => {
  const make = (nums: number[]) => {
    const root = mkdtempSync(join(tmpdir(), "packs-"));
    mkdirSync(join(root, "s1-081"));
    for (const n of nums) writeFileSync(join(root, "s1-081", `s1-L${n}.json`), "{}");
    writeFileSync(join(root, "s1-081", "pack.json"), JSON.stringify({ id: "s1-081", levels: nums.map((n) => ({ id: `s1-L${n}`, file: `s1-L${n}.json` })) }));
    writeFileSync(join(root, "index.json"), JSON.stringify({ packs: ["s1", "s1-081"] }));
    return root;
  };

  it("stops at the first missing level and removes the files after it", () => {
    const root = make([81, 82, 83, 85, 86]);
    expect(keepContiguous(root, "s1-081", 81)).toBe(3);
    expect(JSON.parse(readFileSync(join(root, "s1-081", "pack.json"), "utf8")).levels.map((l: { id: string }) => l.id)).toEqual(["s1-L81", "s1-L82", "s1-L83"]);
    expect(existsSync(join(root, "s1-081", "s1-L85.json"))).toBe(false);
  });

  it("drops the pack and its index entry when the first level failed", () => {
    const root = make([82, 83]);
    expect(keepContiguous(root, "s1-081", 81)).toBe(0);
    expect(existsSync(join(root, "s1-081"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "index.json"), "utf8")).packs).toEqual(["s1"]);
  });
});

import { describe, expect, it } from "vitest";
import { measure } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";

// outpost-ops#149: the beat sheet is the ordered first occurrence of each beat, from the median bot's run.
describe("beat sheet", () => {
  const opts = { refSeeds: 1, otherSeeds: 1 };
  const a = measure(level1, opts).beats;

  it("is a non-empty list of unique beats ordered by tick", () => {
    expect(a.length).toBeGreaterThan(0);
    expect(new Set(a.map((b) => b.beat)).size).toBe(a.length);
    for (let i = 1; i < a.length; i++) expect(a[i]!.tick).toBeGreaterThanOrEqual(a[i - 1]!.tick);
  });

  it("matches the expected order for story Level 1 (EXPECTED_L1)", () => {
    expect(a.map((b) => b.beat)).toEqual(EXPECTED_L1);
  });

  it("is the same twice for the same level", () => {
    expect(measure(level1, opts).beats).toEqual(a);
  });
});
const EXPECTED_L1 = ["sold", "hired:role.supplier", "hired:role.cashier", "built:struct.landmark"];

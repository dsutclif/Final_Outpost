import { describe, expect, it } from "vitest";
import { planBatch } from "./levels-next.js";

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

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { batchUsable, planBatch, published } from "./levels-next.js";

describe("level supply planning", () => {
  const pub = { count: 60, top: 60, offset: 0 };

  it("never plans past `ahead` levels beyond the player", () => {
    for (const cleared of [0, 5, 30, 59, 60]) {
      const p = planBatch(pub, cleared, [], 60, 20);
      if (p) expect(p.to).toBeLessThanOrEqual(cleared + 60);
    }
    expect(planBatch(pub, 0, [], 60, 20)).toBeNull();
  });

  it("builds the next contiguous batch, capped by the batch size", () => {
    expect(planBatch(pub, 60, [], 60, 20)).toMatchObject({ from: 61, to: 80, packId: "s1-061" });
    expect(planBatch({ count: 80, top: 80, offset: 0 }, 60, [], 60, 20)).toMatchObject({ from: 81, to: 100 });
  });

  it("skips gaps smaller than the minimum batch", () => {
    expect(planBatch(pub, 5, [], 60, 20, 10)).toBeNull();
    expect(planBatch(pub, 10, [], 60, 20, 10)).toMatchObject({ from: 61, to: 70 });
  });

  it("counts no more cleared levels than are published", () => {
    expect(planBatch(pub, 500, [], 60, 20)).toMatchObject({ from: 61, to: 80, tuning: { cleared: 60 } });
  });
});

describe("level numbering past gaps", () => {
  const packs = (files: Record<string, object>) => {
    const root = mkdtempSync(join(tmpdir(), "packs-"));
    for (const [id, body] of Object.entries(files)) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, "pack.json"), JSON.stringify({ id, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION, ...body }));
    }
    writeFileSync(join(root, "index.json"), JSON.stringify({ packs: Object.keys(files) }));
    return root;
  };
  const ids = (...ns: number[]) => ns.map((n) => ({ id: `s1-L${String(n).padStart(3, "0")}` }));

  it("starts after the highest number, not the level count", () => {
    const pub = published(packs({ s1: { levels: ids(6, 7, 9, 10) } }));
    expect(pub).toMatchObject({ count: 4, top: 10 });
    expect(planBatch(pub, 4, [], 60, 20)).toMatchObject({ from: 11, packId: "s1-011" });
  });

  it("never retries a dropped level, even at the end of a batch", () => {
    const pub = published(packs({ s1: { levels: ids(6, 7) }, "s1-008": { levels: ids(8), dropped: [{ index: 9 }, { index: 10 }] }, "s1-011": { levels: [], dropped: [{ index: 11 }] } }));
    expect(pub).toMatchObject({ count: 3, top: 11 });
    expect(planBatch(pub, 3, [], 60, 20)).toMatchObject({ from: 12 });
  });
});

describe("batchUsable", () => {
  it("keeps a batch with any built level", () => {
    expect(batchUsable({ levels: [{ id: "s1-L052" }], dropped: [{ index: 51 }] }, 20)).toBe(true);
  });

  it("keeps a fully dropped batch so the supply moves on", () => {
    expect(batchUsable({ levels: [], dropped: [{ index: 51 }, { index: 52 }] }, 2)).toBe(true);
  });

  it("rejects a build that broke", () => {
    expect(batchUsable(null, 2)).toBe(false);
    expect(batchUsable({ levels: [] }, 2)).toBe(false);
    expect(batchUsable({ levels: [], dropped: [{ index: 51 }] }, 2)).toBe(false);
  });
});

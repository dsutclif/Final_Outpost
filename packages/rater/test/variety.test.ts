import { describe, expect, it } from "vitest";
import { Manifest } from "@fo/content";
import { historyEntry, layoutGrid, rate, sameAsEarlier, VARIETY, varietySignature } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level2 from "../../../levels/golden/proto-L002.json";

// Variety rule (outpost-ops#150): signature and the whole-pack duplicate check.
const FAST = { refSeeds: 2, otherSeeds: 1 };

describe("variety signature", () => {
  it("is stable for one level and seed, and differs between levels", () => {
    const a = rate(level1, FAST), b = rate(level1, FAST), c = rate(level2, FAST);
    expect(a.signature).toMatch(/^v1-[0-9a-f]{8}$/);
    expect(b.signature).toBe(a.signature);
    expect(c.signature).not.toBe(a.signature);
  });

  it("changes with the beat order and with the coarse layout", () => {
    const m = Manifest.parse(level1);
    const beats = [{ beat: "sold", tick: 10 }, { beat: "hired:role.worker", tick: 20 }];
    const base = varietySignature(m, "t", beats);
    expect(varietySignature(m, "t", [...beats].reverse())).not.toBe(base);
    // ticks are not part of it: the same order later is the same level
    expect(varietySignature(m, "t", beats.map((b) => ({ ...b, tick: b.tick * 3 })))).toBe(base);
    const moved = structuredClone(m);
    const core = moved.entities.find((e) => e.type === "sink.core") as { at: [number, number] };
    const before = layoutGrid(moved).join(" ");
    core.at = [core.at[0] < moved.map.w / 2 ? moved.map.w - 1 : 1, core.at[1] < moved.map.h / 2 ? moved.map.h - 1 : 1];
    expect(layoutGrid(moved).join(" ")).not.toBe(before);
    expect(varietySignature(moved, "t", beats)).not.toBe(base);
  });

  it("a candidate identical to any earlier level in the pack is a duplicate, however far back", () => {
    const sig = rate(level1, FAST).signature;
    const far = [{ id: "s1-L007", modules: [], goal: "x", signature: sig }, ...Array.from({ length: 30 }, (_, k) => ({ id: `s1-L${k + 8}`, modules: [], goal: "x", signature: `v1-${k}` }))];
    const r = rate(level1, { ...FAST, history: far });
    expect(r.filters.duplicate).toBe(true);
    expect(r.evidence.duplicateOf).toBe("s1-L007");
    expect(r.ok).toBe(false);
  });

  it("history without a signature (planned requests, older levels) never matches", () => {
    const r = rate(level1, { ...FAST, history: [historyEntry(level2), historyEntry(level1)] });
    expect(r.filters.duplicate).toBe(false);
  });

  it("an exempt level is not checked, and is not matched", () => {
    const sig = rate(level1, FAST).signature;
    VARIETY.exempt.push(level1.id);
    try {
      expect(rate(level1, { ...FAST, history: [{ id: "other", modules: [], goal: "x", signature: sig }] }).filters.duplicate).toBe(false);
    } finally { VARIETY.exempt.pop(); }
    VARIETY.exempt.push("s1-L009");
    try {
      expect(sameAsEarlier("s1-L010", sig, [{ id: "s1-L009", signature: sig }])).toBeNull();
      expect(sameAsEarlier("s1-L010", sig, [{ id: "s1-L008", signature: sig }])).toBe("s1-L008");
    } finally { VARIETY.exempt.pop(); }
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SIZES } from "@fo/render-3d/sizes";

// The story levels carry the decor pods' scale and lift as plain numbers (tools/relayout.ts wrote them from
// render-3d/src/sizes.ts). If sizes.ts changes, this fails until the levels are regenerated to match.
const ART_M = 28;
const levels = [1, 2, 3, 4, 5].map((n) => resolve(__dirname, `../../../levels/story/story-L00${n}.json`));

describe("sizes", () => {
  it("story levels draw decor pods at sizes.ts: scale and base depth", () => {
    const scale = +(0.833 * (SIZES.pod.length / 3.32)).toFixed(4);
    const lift = Math.round(-SIZES.pod.buried * ART_M * 10) / 10;
    for (const f of levels) {
      const pods = (JSON.parse(readFileSync(f, "utf8")).entities as { id?: string; scale?: number; lift?: number }[]).filter((e) => /^pod\d/.test(e.id ?? ""));
      expect(pods.length, f).toBeGreaterThan(0);
      for (const p of pods) { expect(p.scale, `${f} ${p.id} scale`).toBe(scale); expect(p.lift, `${f} ${p.id} lift`).toBe(lift); }
    }
  });
});

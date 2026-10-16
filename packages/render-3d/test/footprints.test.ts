import { marsGreenhouse } from "@fo/skins";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createBuildCtx } from "../src/assets/context.js";
import { buildModel } from "../src/assets/registry.js";
import { ART_M } from "../src/units.js";

// The generator keeps drawn models apart using its own footprint table (generator.json
// "footprints"), since it cannot import the renderer. This keeps that table honest: every entry
// must cover its model's real ground bounds, so a bigger model fails here until the table grows.

const gen = JSON.parse(readFileSync(new URL("../../generator/data/generator.json", import.meta.url), "utf8")) as { footprints: Record<string, [number, number, number, number]> };
const fp = gen.footprints;
const ctx = createBuildCtx(marsGreenhouse);

describe("generator footprints", () => {
  for (const [id, [x0, y0, x1, y1]] of Object.entries(fp)) {
    if (id === "pad" || id === "pad.big") continue;
    it(`${id} covers its model`, () => {
      const m = buildModel(id, ctx);
      m.root.updateMatrixWorld(true);
      const b = new Box3().setFromObject(m.root);
      expect(m.root.userData["fallback"]).toBeUndefined();
      expect(x0).toBeLessThanOrEqual(b.min.x * ART_M);
      expect(y0).toBeLessThanOrEqual(b.min.z * ART_M);
      expect(x1).toBeGreaterThanOrEqual(b.max.x * ART_M);
      expect(y1).toBeGreaterThanOrEqual(b.max.z * ART_M);
    });
  }

  it("pads cover the floor decal the renderer draws (1.75 art m, 1.4x when big)", () => {
    const half = (1.75 * ART_M) / 2;
    expect(fp["pad"]![2]).toBeGreaterThanOrEqual(half);
    expect(fp["pad.big"]![2]).toBeGreaterThanOrEqual(half * 1.4);
  });
});

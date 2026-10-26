import { LOOK, PLOT, modelScaleFor } from "@fo/content";
import { marsGreenhouse } from "@fo/skins";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createBuildCtx } from "../src/assets/context.js";
import { meshyBounds, meshyFor } from "../src/assets/meshy.js";
import { buildModel } from "../src/assets/registry.js";
import { ART_M } from "../src/units.js";

// The generator keeps drawn models apart using its own footprint table (generator.json
// "footprints"), since it cannot import the renderer. This keeps that table honest: every entry
// must cover its model's real ground bounds, so a bigger model fails here until the table grows.

const gen = JSON.parse(readFileSync(new URL("../../generator/data/generator.json", import.meta.url), "utf8")) as { footprints: Record<string, [number, number, number, number]> };
const fp = gen.footprints;
const OCCLUDE = 1 / Math.tan((50 * Math.PI) / 180);
const ctx = createBuildCtx(marsGreenhouse);

describe("generator footprints", () => {
  // Plot layout (look.json plotLayout): a plotted building's footprint is content/data/plot.json's, measured from the
  // Meshy model the game shows at its in-game size; it must cover that model (every level for the core) and the ground it hides.
  for (const [id, [x0, y0, x1, y1]] of Object.entries(PLOT?.generator.footprints ?? {})) {
    if (id === "pad" || id === "pad.big") continue;
    it(`plot: ${id} covers its drawn model`, () => {
      for (const lv of id === "sink.core" ? [1, 2, 3] : [1]) {
        const e = meshyFor(id, lv), mb = e && meshyBounds(e.file);
        expect(mb).toBeDefined();
        const k = ART_M * LOOK.buildScale * modelScaleFor(LOOK.modelScale, id, lv), h = (mb![4]! - mb![1]!) * k;
        expect(x0).toBeLessThanOrEqual(Math.floor(mb![0]! * k) + 1);
        expect(x1).toBeGreaterThanOrEqual(Math.ceil(mb![3]! * k) - 1);
        expect(y1).toBeGreaterThanOrEqual(Math.ceil(mb![5]! * k) - 1);
        expect(y0).toBeLessThanOrEqual(Math.floor(mb![2]! * k - OCCLUDE * h) + 1);
      }
    });
  }
  for (const [id, [x0, y0, x1, y1]] of Object.entries(fp)) {
    if (id === "pad" || id === "pad.big" || PLOT?.generator.footprints[id]) continue;
    it(`${id} covers its model`, () => {
      const m = buildModel(id, ctx);
      m.root.updateMatrixWorld(true);
      const b = new Box3().setFromObject(m.root);
      expect(m.root.userData["fallback"]).toBeUndefined();
      expect(x0).toBeLessThanOrEqual(b.min.x * ART_M);
      expect(y0).toBeLessThanOrEqual(b.min.z * ART_M);
      // The camera looks down ~50 degrees from the south, so a tall model hides the ground north of it
      // (smaller y) by height * cot(50 deg); the footprint reaches that far so no pad hides behind it.
      // (low ground piles under 10 world units hide nothing a pad could sit behind, and forests pack them tight)
      if (b.max.y * ART_M >= 10) expect(y0).toBeLessThanOrEqual(b.min.z * ART_M - OCCLUDE * b.max.y * ART_M);
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

// Meshy GLBs (src/assets/meshy.ts) stand in for the code bodies once loaded, so their fitted
// ground bounds (meshy.built.json, art metres) must sit inside the same footprints. The occlusion
// reach is left to the code models: the footprints were kept as they are at the 2026-10-18
// regeneration (docs/DECISIONS.md), and hidden pads are left to the planned silhouette pass.
describe("meshy footprints", () => {
  const built = JSON.parse(readFileSync(new URL("../src/assets/meshy.built.json", import.meta.url), "utf8")) as Record<string, { bounds: number[] }>;
  const config = JSON.parse(readFileSync(new URL("../src/assets/meshy.json", import.meta.url), "utf8")) as { models: { file: string; id: string; slot?: string[]; batch?: string; kind?: string }[] };
  // parts (doors, turret heads), wall sections, held props, the gate (sized by its wall section)
  // captures (towed about) and zone dressing (prey burrows) have no footprint of their own
  for (const e of config.models.filter((m) => !m.slot && !m.batch && !m.kind && m.id !== "struct.gate" && !m.id.startsWith("capture.") && !m.id.startsWith("zone.") && fp[m.id])) {
    it(`${e.file} is built and covered by ${e.id}`, () => {
      const b = built[e.file]?.bounds;
      expect(b, "run pnpm models:build").toBeDefined();
      expect(existsSync(new URL(`../../client/public/models/${e.file}.glb`, import.meta.url))).toBe(true);
      const [x0, y0, x1, y1] = fp[e.id]!;
      const [bx0, , bz0, bx1, , bz1] = b!.map((v) => v * ART_M) as [number, number, number, number, number, number];
      expect(x0).toBeLessThanOrEqual(bx0);
      expect(y0).toBeLessThanOrEqual(bz0);
      expect(x1).toBeGreaterThanOrEqual(bx1);
      expect(y1).toBeGreaterThanOrEqual(bz1);
    });
  }
});

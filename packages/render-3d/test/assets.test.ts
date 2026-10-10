import { content } from "@fo/content";
import { CONTRACT_IDS, SKINS, marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import { createBuildCtx } from "../src/assets/context.js";
import { getAnchor } from "../src/assets/common.js";
import { ROLE_GEAR } from "../src/assets/characters.js";
import { buildModel, hasModel, requiredAnchors } from "../src/assets/registry.js";
import { objectTriangles } from "../src/geom.js";
import { CLASS_ANCHORS, TRI_BUDGET, modelIds } from "../src/ids.js";

// Builds every procedural asset headless (no WebGL, no DOM) and holds each to the spec's
// per-class triangle budget and its anchor contract.

const ids = modelIds(content);

describe("procedural assets", () => {
  for (const skin of Object.values(SKINS)) {
    const ctx = createBuildCtx(skin);
    for (const id of ids) {
      it(`${skin.id}: ${id} fits its budget and exposes its anchors`, () => {
        const m = buildModel(id, ctx);
        const tris = objectTriangles(m.root);
        expect(tris, `${id} has geometry`).toBeGreaterThan(0);
        expect(tris, `${id} (${m.cls}) triangles`).toBeLessThanOrEqual(TRI_BUDGET[m.cls]);
        for (const a of [...CLASS_ANCHORS[m.cls], ...requiredAnchors(id)]) {
          expect(getAnchor(m.root, a), `${id} anchor ${a}`).toBeDefined();
        }
      });
    }
  }

  it("builds every character role variant with its headgear and tool", () => {
    const ctx = createBuildCtx(marsGreenhouse);
    const silhouettes = new Set<string>();
    for (const role of Object.keys(ROLE_GEAR)) {
      const m = buildModel(role, ctx);
      expect(m.cls).toBe("character");
      const names = new Set<string>();
      m.root.traverse((o) => names.add(o.name));
      const gear = ROLE_GEAR[role]!;
      if (gear.hat !== "hat.none") expect(names.has(gear.hat), `${role} wears ${gear.hat}`).toBe(true);
      if (gear.tool !== "tool.none") expect(names.has(gear.tool), `${role} holds ${gear.tool}`).toBe(true);
      silhouettes.add(`${gear.hat}|${gear.tool}`);
    }
    // roles differ in silhouette (headgear + tool), never colour alone
    expect(silhouettes.size).toBe(Object.keys(ROLE_GEAR).length);
  });

  it("keeps the hero buildings inside the 3k-5k band's ceiling and reports their size", () => {
    const ctx = createBuildCtx(marsGreenhouse);
    for (const id of ["sink.core", "sink.sales_point", "conv.food_processor", "conv.material_processor", "struct.landmark", "struct.ranged_defense.t2"]) {
      const m = buildModel(id, ctx);
      expect(m.cls).toBe("hero");
      expect(objectTriangles(m.root)).toBeLessThanOrEqual(TRI_BUDGET.hero);
    }
  });
});

describe("model registry", () => {
  it("has a builder for every canonical id in content and Contract 1", () => {
    const need = [...new Set([...ids, ...CONTRACT_IDS.filter((id) => !id.startsWith("meter."))])];
    const missing = need.filter((id) => !hasModel(id));
    expect(missing).toEqual([]);
  });

  it("only the debug skin may fall back to the labelled crate", () => {
    const ctx = createBuildCtx(marsGreenhouse);
    const fell = ids.filter((id) => buildModel(id, ctx).root.userData["fallback"]);
    expect(fell).toEqual([]);
    // an unknown id falls back rather than throwing (debug skin labels it)
    expect(buildModel("struct.not_a_thing", createBuildCtx(SKINS["debug"]!)).root.userData["fallback"]).toBe(true);
  });
});

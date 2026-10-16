import type { BufferGeometry } from "three";
import { mix } from "@fo/skins";
import { GeoBuilder } from "../geom.js";
import { resToken, type Tokens } from "../tokens.js";
import { mesh, model, type BuildCtx, type Model } from "./common.js";

// Resource items: big chunky icons about 0.35 m across (ART-DIRECTION.md), pivot at the
// bottom centre so they stack. One geometry per resource, instanced for every carried,
// shelved, dropped and flying item in the scene.

/** Item kinds by resource id; unknown resources fall back to a tinted crate. */
const KIND: Readonly<Record<string, string>> = {
  "res.material_basic": "ore",
  "res.material_refined": "bar",
  "res.fuel_dense": "cell",
  "res.food_raw_1": "greens",
  "res.food_raw_2": "protein",
  "res.food_prepared": "meal",
  "res.salvage": "scrap",
  "res.currency": "coin",
  "res.component": "component",
};

/** Stack height of one item, art metres. */
export function itemHeight(res: string): number {
  switch (KIND[res]) {
    case "coin": return 0.075;
    case "bar": return 0.14;
    case "component": return 0.12;
    case "meal": return 0.13;
    case "cell": return 0.3;
    default: return 0.24;
  }
}

export function buildItemGeo(res: string, t: Tokens): BufferGeometry {
  const c = resToken(t, res);
  const dk = mix(c, t.ink, 0.35), lt = mix(c, t.structure, 0.45);
  const g = new GeoBuilder();
  switch (KIND[res]) {
    case "ore":
      g.rock(0.15, c, { at: [0, 0.12, 0], scale: [1.15, 0.85, 1] }, 0).rock(0.08, dk, { at: [0.1, 0.17, 0.05] }, 1).rock(0.06, lt, { at: [-0.08, 0.2, -0.03] }, 2);
      break;
    case "bar":
      g.rbox(0.36, 0.12, 0.17, 0.03, c, { at: [0, 0.06, 0] }, 1).box(0.26, 0.02, 0.1, lt, { at: [0, 0.125, 0] });
      break;
    case "cell":
      g.cyl(0.085, 0.085, 0.22, 10, c, { at: [0, 0.14, 0] }).cyl(0.09, 0.09, 0.04, 10, t.metal, { at: [0, 0.03, 0] }).cyl(0.09, 0.09, 0.04, 10, t.metal, { at: [0, 0.26, 0] }).cyl(0.035, 0.035, 0.04, 6, lt, { at: [0, 0.3, 0] });
      break;
    case "greens":
      g.sphere(0.12, 7, 5, c, { at: [0, 0.12, 0], scale: [1, 0.9, 1] }).sphere(0.08, 6, 4, lt, { at: [0.08, 0.2, 0.02] }).sphere(0.08, 6, 4, dk, { at: [-0.08, 0.18, -0.03] }).cone(0.05, 0.1, 5, dk, { at: [0, 0.27, 0] });
      break;
    case "protein":
      g.sphere(0.13, 8, 6, c, { at: [0, 0.12, 0], scale: [1.2, 0.85, 0.95] }).cyl(0.03, 0.03, 0.2, 5, t.structure, { at: [0.15, 0.13, 0], rot: [0, 0, Math.PI / 2] }).sphere(0.04, 5, 4, t.structure, { at: [0.26, 0.13, 0] });
      break;
    case "meal":
      g.rbox(0.36, 0.05, 0.26, 0.02, t.metal, { at: [0, 0.025, 0] }, 1).sphere(0.07, 6, 4, c, { at: [-0.09, 0.07, 0] }).sphere(0.06, 6, 4, resToken(t, "res.food_raw_1"), { at: [0.07, 0.07, 0.04] }).sphere(0.05, 6, 4, resToken(t, "res.food_raw_2"), { at: [0.08, 0.07, -0.06] });
      break;
    case "scrap":
      g.box(0.28, 0.05, 0.2, c, { at: [0, 0.05, 0], rot: [0.1, 0.3, 0.15] }).box(0.2, 0.05, 0.14, dk, { at: [0.03, 0.11, 0.02], rot: [-0.2, -0.4, 0] }).torus(0.07, 0.025, 4, 8, lt, { at: [-0.06, 0.17, 0], rot: [1.2, 0, 0] });
      break;
    case "component":
      g.cyl(0.13, 0.13, 0.07, 8, c, { at: [0, 0.05, 0] }).cyl(0.05, 0.05, 0.09, 8, dk, { at: [0, 0.05, 0] })
        .box(0.08, 0.06, 0.32, lt, { at: [0, 0.05, 0] }).box(0.32, 0.06, 0.08, lt, { at: [0, 0.05, 0] })
        .box(0.06, 0.12, 0.06, t.metal, { at: [0.09, 0.14, 0.09] });
      break;
    case "coin":
      g.cyl(0.14, 0.14, 0.05, 12, c, { at: [0, 0.035, 0] }).cyl(0.09, 0.09, 0.06, 12, lt, { at: [0, 0.04, 0] });
      break;
    default:
      g.rbox(0.28, 0.24, 0.28, 0.04, c, { at: [0, 0.12, 0] }, 1).box(0.3, 0.04, 0.3, dk, { at: [0, 0.12, 0] });
  }
  return g.build();
}

export function buildItem(res: string, ctx: BuildCtx): Model {
  const m = model("prop");
  m.root.add(mesh(buildItemGeo(res, ctx.t), ctx.mats.std, res));
  return m;
}

/**
 * The clerk pad beside the kiosk (sink.sales_point.register): a ground plate with a person
 * glyph, like a converter's operator spot. Whoever stands on it (the player or a clerk) rings
 * up the queue; there is no register object to hide behind.
 */
/**
 * The "someone stands here" plate shared by the clerk pad and every converter's operator spot:
 * a raised disc with a bright ring and a person glyph lying flat, head toward -z.
 */
export function stationPlate(g: GeoBuilder, t: Tokens, x = 0, z = 0): GeoBuilder {
  const glyph = t.interactive;
  return g
    .cyl(0.46, 0.5, 0.08, 20, t.metalDark, { at: [x, 0.04, z] })
    .torus(0.42, 0.05, 4, 24, glyph, { at: [x, 0.085, z], rot: [Math.PI / 2, 0, 0] })
    .cyl(0.09, 0.09, 0.02, 12, glyph, { at: [x, 0.09, z - 0.12] })
    .cyl(0.17, 0.17, 0.02, 14, glyph, { at: [x, 0.09, z + 0.12], scale: [1, 1, 0.62] })
    .box(0.34, 0.02, 0.1, mix(t.metalDark, t.ink, 0.2), { at: [x, 0.085, z + 0.2] });
}

export function buildClerkPad(ctx: BuildCtx): Model {
  const m = model("prop");
  m.root.add(mesh(stationPlate(new GeoBuilder(), ctx.t).build(), ctx.mats.std, "plate"));
  return m;
}

/** An open shelf crate (one per sellable good on the kiosk ledge); items sit inside it. */
export function buildCrateGeo(t: Tokens): BufferGeometry {
  const wall = mix(t.structureDark, t.metal, 0.35), rim = t.metal;
  return new GeoBuilder()
    .box(0.5, 0.04, 0.4, t.metalDark, { at: [0, 0.02, 0] })
    .box(0.5, 0.16, 0.035, wall, { at: [0, 0.1, 0.18] })
    .box(0.5, 0.2, 0.035, wall, { at: [0, 0.12, -0.18] })
    .box(0.035, 0.16, 0.4, wall, { at: [0.235, 0.1, 0] })
    .box(0.035, 0.16, 0.4, wall, { at: [-0.235, 0.1, 0] })
    .box(0.52, 0.025, 0.04, rim, { at: [0, 0.18, 0.18] })
    .build();
}

/** Currency pile by the clerk pad: a short coin stack (the renderer instances the real pile). */
export function buildPile(ctx: BuildCtx): Model {
  const coin = buildItemGeo("res.currency", ctx.t);
  const g = new GeoBuilder();
  for (let i = 0; i < 5; i++) g.add(coin, null, { at: [((i * 37) % 5) * 0.012, i * itemHeight("res.currency"), ((i * 53) % 7) * 0.01] });
  const m = model("prop");
  m.root.add(mesh(g.build(), ctx.mats.std, "pile"));
  coin.dispose();
  return m;
}

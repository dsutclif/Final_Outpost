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
};

/** Stack height of one item, art metres. */
export function itemHeight(res: string): number {
  switch (KIND[res]) {
    case "coin": return 0.075;
    case "bar": return 0.14;
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

/** Register terminal at the kiosk. */
export function buildRegister(ctx: BuildCtx): Model {
  const t = ctx.t;
  const g = new GeoBuilder()
    .rbox(0.5, 0.7, 0.4, 0.06, t.structure, { at: [0, 0.35, 0] }, 1)
    .box(0.52, 0.06, 0.42, t.trim, { at: [0, 0.6, 0] })
    .rbox(0.4, 0.28, 0.06, 0.03, t.metalDark, { at: [0, 0.86, 0.02], rot: [-0.35, 0, 0] }, 1)
    .box(0.32, 0.2, 0.02, t.interactive, { at: [0, 0.87, 0.06], rot: [-0.35, 0, 0] });
  const m = model("prop");
  m.root.add(mesh(g.build(), ctx.mats.std, "register"));
  return m;
}

/** Currency pile at the register: a short coin stack (the renderer instances the real pile). */
export function buildPile(ctx: BuildCtx): Model {
  const coin = buildItemGeo("res.currency", ctx.t);
  const g = new GeoBuilder();
  for (let i = 0; i < 5; i++) g.add(coin, null, { at: [((i * 37) % 5) * 0.012, i * itemHeight("res.currency"), ((i * 53) % 7) * 0.01] });
  const m = model("prop");
  m.root.add(mesh(g.build(), ctx.mats.std, "pile"));
  coin.dispose();
  return m;
}

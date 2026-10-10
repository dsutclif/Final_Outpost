import { Color, Group, type MeshBasicMaterial } from "three";
import { mix } from "@fo/skins";
import { GeoBuilder } from "../geom.js";
import { resToken } from "../tokens.js";
import { anchor, mesh, model, type BuildCtx, type Model } from "./common.js";

// Scatter (nodes, pods, rubble, wall panels) and ground decals (pads, markers, outlines).
// Scatter stays under 500 triangles per model. Depletion is a draw range over rocks that
// were added bottom-first, so a pile shrinks from the top without extra meshes.

const TAU = Math.PI * 2;
const WHITE = new Color(1, 1, 1);

/** Seeded 0..1 noise so scatter variation is stable per call site. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Ore pile. userData.steps holds vertex counts for each fill step (drawRange depletion). */
export function buildOrePile(ctx: BuildCtx, seed = 1): Model {
  const { t, mats } = ctx;
  const m = model("scatter");
  const ore = resToken(t, "res.material_basic");
  const b = new GeoBuilder();
  const steps: number[] = [];
  b.cyl(0.95, 1.05, 0.08, 9, mix(t.groundDark, t.ground, 0.4), { at: [0, 0.04, 0] });
  steps.push(b.triangles * 3);
  const rocks: [number, number, number, number][] = [
    [-0.45, 0.22, 0.2, 0.34], [0.42, 0.2, 0.25, 0.32], [0.0, 0.24, -0.38, 0.36], [-0.1, 0.2, 0.42, 0.28],
    [0.15, 0.55, 0.05, 0.3], [-0.3, 0.5, -0.12, 0.26], [0.32, 0.48, -0.25, 0.24], [0.0, 0.82, -0.05, 0.22],
  ];
  rocks.forEach(([x, y, z, r], i) => {
    const c = i % 3 === 0 ? ore : i % 3 === 1 ? mix(ore, t.ink, 0.25) : mix(ore, t.structure, 0.3);
    b.rock(r, c, { at: [x, y, z], rot: [hash01(seed + i) * 3, hash01(seed * 7 + i) * 3, 0], scale: [1.1, 0.85, 1] }, (i % 3) as 0 | 1 | 2);
    if (i % 2 === 1) steps.push(b.triangles * 3);
  });
  // glinting crystals on the top rocks
  b.rock(0.1, mix(ore, t.interactive, 0.4), { at: [0.05, 1.0, -0.05] }, 2);
  steps.push(b.triangles * 3);
  const body = mesh(b.build(), mats.std, "body");
  body.userData["steps"] = steps;
  m.root.add(body);
  m.parts["body"] = body;
  anchor(m.root, "pickup", 0, 0.6, 0);
  anchor(m.root, "interact", 0, 0, 0.9);
  return m;
}

export function buildGrowDome(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("scatter");
  const green = resToken(t, "res.food_raw_1");
  const b = new GeoBuilder()
    .cyl(1.05, 1.12, 0.22, 12, t.structure, { at: [0, 0.11, 0] })
    .torus(1.0, 0.05, 3, 12, t.trim, { at: [0, 0.24, 0], rot: [Math.PI / 2, 0, 0] })
    .rbox(0.42, 0.5, 0.14, 0.05, t.metal, { at: [0, 0.3, 1.0] }, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 + 0.3;
    b.cone(0.2, 0.45, 5, i % 2 ? green : mix(green, t.ink, 0.2), { at: [Math.sin(a) * 0.5, 0.45, Math.cos(a) * 0.5] });
  }
  b.sphere(0.24, 6, 4, green, { at: [0, 0.48, 0] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  const lamp = mesh(new GeoBuilder().cyl(0.9, 0.9, 0.03, 12, WHITE, { at: [0, 0.24, 0] }).build(), lampMat(mats.glow, t.plasmaHot), "lamp");
  m.root.add(lamp);
  const glass = mesh(new GeoBuilder().dome(1.0, 12, 5, t.glass, { at: [0, 0.22, 0] }).build(), mats.glass, "glass");
  m.root.add(glass);
  Object.assign(m.parts, { lamp, glass });
  anchor(m.root, "pickup", 0, 0.5, 1.0);
  anchor(m.root, "interact", 0, 0, 1.2);
  return m;
}

const lampMat = (base: MeshBasicMaterial, c: string): MeshBasicMaterial => { const x = base.clone(); x.color.set(c); return x; };

export function buildFuelCache(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("scatter");
  const cell = resToken(t, "res.fuel_dense");
  const b = new GeoBuilder()
    .rbox(1.4, 0.14, 1.0, 0.05, t.metalDark, { at: [0, 0.07, 0] }, 1)
    .box(1.3, 0.06, 0.08, t.metal, { at: [0, 0.75, -0.42] })
    .box(0.08, 0.7, 0.08, t.metal, { at: [-0.62, 0.42, -0.42] })
    .box(0.08, 0.7, 0.08, t.metal, { at: [0.62, 0.42, -0.42] });
  for (let i = 0; i < 6; i++) {
    const x = -0.45 + (i % 3) * 0.45, z = i < 3 ? -0.15 : 0.22;
    b.cyl(0.13, 0.13, 0.5, 7, cell, { at: [x, 0.4, z] }).cyl(0.14, 0.14, 0.06, 7, t.metal, { at: [x, 0.66, z] });
  }
  m.root.add(mesh(b.build(), mats.std, "body"));
  anchor(m.root, "pickup", 0, 0.7, 0);
  anchor(m.root, "interact", 0, 0, 0.9);
  return m;
}

/** Stasis pod with a sleeper inside; the lid lifts on release. */
export function buildStasisPod(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("scatter");
  const b = new GeoBuilder()
    .rbox(1.0, 0.18, 0.7, 0.06, t.structureDark, { at: [0, 0.09, 0] }, 1)
    .box(1.02, 0.06, 0.72, t.trim, { at: [0, 0.2, 0] })
    // sleeper: a tiny suited figure lying inside
    .capsule(0.12, 0.35, t.suit, { at: [0.05, 0.36, 0], rot: [0, 0, Math.PI / 2] }, 1, 6)
    .sphere(0.13, 6, 5, t.suit, { at: [-0.32, 0.38, 0] })
    .sphere(0.09, 6, 4, t.visor, { at: [-0.34, 0.42, 0.06], scale: [1, 0.7, 0.8] })
    .sphere(0.06, 6, 4, t.accent, { at: [0.48, 0.22, 0.3] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  const lid = new Group();
  lid.name = "lid";
  lid.position.set(0, 0.22, -0.32);
  const glass = mesh(new GeoBuilder().capsule(0.3, 0.55, t.glass, { at: [0, 0.02, 0.32], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.85] }, 2, 8).build(), mats.glass, "glass");
  lid.add(glass);
  m.root.add(lid);
  Object.assign(m.parts, { lid, glass });
  anchor(m.root, "interact", 0, 0, 0.7);
  return m;
}

/** Rockslide rubble in a 1 x 1 m footprint; the renderer stretches it to the zone rect. */
export function buildRubble(ctx: BuildCtx, seed = 3): Model {
  const { t, mats } = ctx;
  const m = model("scatter");
  const b = new GeoBuilder();
  for (let i = 0; i < 12; i++) {
    const x = (hash01(seed + i * 3) - 0.5) * 0.9, z = (hash01(seed + i * 5 + 1) - 0.5) * 0.9;
    const r = 0.1 + hash01(seed + i) * 0.12;
    const c = i % 3 === 0 ? t.groundDark : i % 3 === 1 ? mix(t.groundAlt, t.structureDark, 0.3) : t.groundAlt;
    b.rock(r, c, { at: [x, r * 0.6, z], rot: [i, i * 2, 0], scale: [1, 0.7, 1] }, (i % 3) as 0 | 1 | 2);
  }
  // hazard stripes on a warning post
  b.box(0.04, 0.3, 0.04, t.metal, { at: [0.42, 0.15, 0.42] }).box(0.16, 0.08, 0.02, t.danger, { at: [0.42, 0.28, 0.43] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  anchor(m.root, "interact", 0, 0, 0.5);
  return m;
}

/** Wall panel 1 m long along x (stretched per section). `cracked` is the low-hp morph. */
export function buildWallPanel(ctx: BuildCtx, cracked = false, reinforced = false): Model {
  const { t, mats } = ctx;
  const m = model("scatter");
  const h = reinforced ? 1.05 : 0.85;
  const panel = reinforced ? mix(t.structure, t.metal, 0.3) : t.structure;
  const b = new GeoBuilder();
  if (!cracked) b.box(1.0, h, 0.28, panel, { at: [0, h / 2, 0] });
  else {
    // jagged top and a missing chunk
    b.box(1.0, h * 0.55, 0.28, panel, { at: [0, h * 0.275, 0] })
      .box(0.38, h * 0.4, 0.28, panel, { at: [-0.31, h * 0.75, 0] })
      .box(0.22, h * 0.25, 0.28, panel, { at: [0.39, h * 0.67, 0] })
      .box(0.05, h * 0.5, 0.3, t.ink, { at: [0.05, h * 0.5, 0], rot: [0, 0, 0.5] })
      .rock(0.09, panel, { at: [0.15, 0.06, 0.25] }, 1);
  }
  b.box(1.02, 0.09, 0.32, t.trim, { at: [0, cracked ? h * 0.55 : h - 0.02, 0] })
    .box(0.12, h + 0.12, 0.34, reinforced ? t.metal : t.structureDark, { at: [-0.5, (h + 0.12) / 2, 0] });
  if (reinforced) b.box(0.9, 0.2, 0.04, t.metalDark, { at: [0, h * 0.4, 0.16] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  anchor(m.root, "interact", 0, 0, 0.4);
  return m;
}

// ------------------------------------------------------------------ decals

/** Pad plate (1.6 m). The renderer lays a canvas decal on top for the fill ring and icon. */
export function buildPadPlate(ctx: BuildCtx, big = false): Model {
  const { t, mats } = ctx;
  const m = model("decal");
  const s = big ? 1.4 : 1;
  const b = new GeoBuilder()
    .rbox(1.6 * s, 0.06, 1.6 * s, 0.25, mix(t.structureDark, t.ink, 0.25), { at: [0, 0.03, 0] }, 1)
    .rbox(1.42 * s, 0.07, 1.42 * s, 0.2, mix(t.structure, t.interactive, 0.15), { at: [0, 0.04, 0] }, 1);
  m.root.add(mesh(b.build(), mats.std, "plate"));
  anchor(m.root, "pad", 0, 0.08, 0);
  anchor(m.root, "interact", 0, 0, 0);
  return m;
}

/** Waiting-area marker in a 1 x 1 m footprint: corner brackets and footprints. */
export function buildWaitingMarker(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("decal");
  const c = t.interactive, w = 0.05, l = 0.25, y = 0.01;
  const b = new GeoBuilder();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(l, 0.01, w, c, { at: [sx * (0.5 - l / 2), y, sz * 0.5] }).box(w, 0.01, l, c, { at: [sx * 0.5, y, sz * (0.5 - l / 2)] });
  }
  for (let i = 0; i < 3; i++) b.cyl(0.04, 0.04, 0.01, 6, mix(c, t.ground, 0.4), { at: [-0.15 + i * 0.15, y, (i % 2) * 0.08] });
  m.root.add(mesh(b.build(), mats.decal, "marker"));
  return m;
}

/** Dashed outline of a 1 x 1 m rect (prey zone): subtle, ground-coloured. */
export function buildDashedRect(ctx: BuildCtx, color?: string): Model {
  const { t, mats } = ctx;
  const m = model("decal");
  const c = color ?? mix(t.groundAlt, t.structure, 0.25);
  const b = new GeoBuilder();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const p = -0.5 + (i + 0.5) / n;
    b.box(0.6 / n, 0.01, 0.02, c, { at: [p, 0.01, -0.5] }).box(0.6 / n, 0.01, 0.02, c, { at: [p, 0.01, 0.5] })
      .box(0.02, 0.01, 0.6 / n, c, { at: [-0.5, 0.01, p] }).box(0.02, 0.01, 0.6 / n, c, { at: [0.5, 0.01, p] });
  }
  m.root.add(mesh(b.build(), mats.decal, "outline"));
  return m;
}

/** One dash of an unbuilt barrier marker (instanced along the section). */
export function buildBarrierDash(ctx: BuildCtx): Model {
  const m = model("decal");
  m.root.add(mesh(new GeoBuilder().rbox(0.32, 0.05, 0.16, 0.04, ctx.t.interactive, { at: [0, 0.025, 0] }, 1).build(), ctx.mats.std, "dash"));
  return m;
}

/** Hazard preset preview: a puff of storm streaks (the live storm is particles + fog). */
export function buildStormPreset(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("env");
  const b = new GeoBuilder();
  for (let i = 0; i < 30; i++) {
    b.box(0.3 + hash01(i) * 0.4, 0.03, 0.03, mix(t.storm, t.structure, hash01(i + 9) * 0.5), { at: [(hash01(i * 2) - 0.5) * 2, 0.2 + hash01(i * 3) * 1.4, (hash01(i * 5) - 0.5) * 2] });
  }
  m.root.add(mesh(b.build(), mats.glow, "storm"));
  return m;
}

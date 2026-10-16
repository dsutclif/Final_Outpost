import { Color, Group, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { mix } from "@fo/skins";
import { GeoBuilder } from "../geom.js";
import { resToken } from "../tokens.js";
import { anchor, mesh, model, type BuildCtx, type Model } from "./common.js";
import { stationPlate } from "./props.js";

// Hero buildings, built in code from chunky rounded primitives. Each returns its merged
// body (one draw call) plus the few separately animated parts the renderer drives from
// sim data: core orb and spin ring, converter fan and status light, turret head and
// muzzle flash, gate doors. Pivots at the ground centre, art metres, +z faces the camera.

const TAU = Math.PI * 2;

/** The core column is thinner glass so the plasma reads through it. */
const coreGlass = (base: MeshStandardMaterial): MeshStandardMaterial => { const m = base.clone(); m.opacity = 0.28; return m; };
const WHITE = new Color(1, 1, 1);

/** A per-model glow material whose colour the renderer sets from state (status lights). */
const statusMat = (base: MeshBasicMaterial, c: string): MeshBasicMaterial => { const m = base.clone(); m.color.set(c); return m; };

// ------------------------------------------------------------------ reactor core

export function buildCore(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const b = new GeoBuilder()
    .cyl(1.05, 1.18, 0.24, 8, t.structureDark, { at: [0, 0.12, 0] })
    .cyl(0.98, 1.02, 0.12, 8, t.structure, { at: [0, 0.3, 0] })
    .torus(0.9, 0.05, 4, 16, t.trim, { at: [0, 0.37, 0], rot: [Math.PI / 2, 0, 0] })
    .cyl(0.56, 0.62, 0.16, 12, t.metal, { at: [0, 0.44, 0] })
    .cyl(0.52, 0.42, 0.22, 12, t.structure, { at: [0, 1.53, 0] })
    .cyl(0.3, 0.52, 0.14, 12, t.structureDark, { at: [0, 1.71, 0] })
    .torus(0.47, 0.035, 4, 14, t.trim, { at: [0, 1.44, 0], rot: [Math.PI / 2, 0, 0] })
    .cyl(0.03, 0.03, 0.4, 5, t.metal, { at: [0, 1.95, 0] });
  for (let i = 0; i < 4; i++) {
    const a = i * (TAU / 4) + Math.PI / 4;
    const x = Math.sin(a) * 0.72, z = Math.cos(a) * 0.72;
    b.rbox(0.22, 1.05, 0.5, 0.08, t.structure, { at: [x, 0.85, z], rot: [0, a, 0] }, 1)
      .box(0.24, 0.12, 0.52, t.trim, { at: [x, 1.1, z], rot: [0, a, 0] })
      .box(0.16, 0.5, 0.06, t.metalDark, { at: [Math.sin(a) * 0.84, 0.75, Math.cos(a) * 0.84], rot: [0, a, 0] });
  }
  // fuel hatch at the front: where carried items arc in
  b.rbox(0.5, 0.2, 0.34, 0.05, t.metal, { at: [0, 0.42, 0.95] }, 1).box(0.36, 0.04, 0.2, t.accent, { at: [0, 0.53, 0.95] });
  if (ctx.level >= 3) b.torus(0.8, 0.05, 4, 18, t.accent, { at: [0, 1.3, 0], rot: [Math.PI / 2, 0, 0] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  const glass = mesh(new GeoBuilder().cyl(0.43, 0.43, 1.0, 14, mix(t.glass, t.plasma, 0.6), { at: [0, 0.98, 0] }, true).build(), coreGlass(mats.glass), "glass");
  m.root.add(glass);
  const orb = mesh(new GeoBuilder().sphere(0.36, 12, 8, t.plasma).build(), mats.glow, "orb");
  orb.position.set(0, 0.98, 0);
  m.root.add(orb);
  const flame = mesh(new GeoBuilder().sphere(0.4, 12, 8, t.plasma, { scale: [1, 1.35, 1] }).build(), mats.additive, "flame");
  flame.position.set(0, 0.98, 0);
  m.root.add(flame);
  const spin = new Group();
  spin.name = "spin";
  spin.position.set(0, 1.05, 0);
  const ring = new GeoBuilder().torus(0.64, 0.045, 4, 18, t.accent, { rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 3; i++) ring.box(0.16, 0.1, 0.1, t.structure, { at: [Math.sin((i * TAU) / 3) * 0.64, 0, Math.cos((i * TAU) / 3) * 0.64], rot: [0, (i * TAU) / 3, 0] });
  spin.add(mesh(ring.build(), mats.std, "spinRing"));
  spin.visible = ctx.level >= 2;
  m.root.add(spin);
  Object.assign(m.parts, { orb, flame, glass, spin });
  anchor(m.root, "deposit", 0, 0.55, 0.95);
  anchor(m.root, "safe", 0, 0, 0);
  anchor(m.root, "interact", 0, 0, 1.45);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

// ------------------------------------------------------------------ kiosk

/**
 * The kiosk: a sealed, pressurised trade pod. A rounded hull on a plinth, a glass display
 * front facing the camera with a counter ledge where the renderer sets one shelf crate per
 * sellable good, and an airlock hatch on the customer (queue) side. Queue offset in metres
 * comes from content (sales queueOffset / ART_M); the hatch faces whichever side it is on.
 */
export function buildKiosk(ctx: BuildCtx, queue: readonly [number, number] = [2.7, 0]): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const side = queue[0] < 0 ? -1 : 1;
  const hx = side * 1.3;
  const b = new GeoBuilder()
    // plinth and skirt
    .rbox(2.9, 0.16, 2.0, 0.06, t.structureDark, { at: [0, 0.08, -0.05] }, 1)
    .box(2.6, 0.06, 1.7, t.metal, { at: [0, 0.19, -0.1] })
    // pressure hull: one chunky rounded capsule-box, trimmed at the waist and the roof line
    .rbox(2.5, 1.5, 1.35, 0.42, t.structure, { at: [0, 0.98, -0.2] }, 3)
    .box(2.54, 0.09, 1.2, t.trim, { at: [0, 0.42, -0.2] })
    .rbox(2.2, 0.16, 1.05, 0.08, t.structureDark, { at: [0, 1.78, -0.2] }, 1)
    // display window frame (the glass itself is a separate transparent mesh)
    .rbox(1.98, 0.12, 0.14, 0.05, t.metal, { at: [0, 1.5, 0.46] }, 1)
    .rbox(1.98, 0.12, 0.14, 0.05, t.metal, { at: [0, 0.58, 0.46] }, 1)
    .box(0.1, 0.94, 0.14, t.metal, { at: [-0.95, 1.04, 0.46] })
    .box(0.1, 0.94, 0.14, t.metal, { at: [0.95, 1.04, 0.46] })
    .box(0.06, 0.86, 0.1, t.metal, { at: [0, 1.04, 0.47] })
    // lit back wall and shelves behind the glass
    .box(1.8, 0.8, 0.04, mix(t.structure, t.accent, 0.18), { at: [0, 1.04, 0.0] })
    .box(1.8, 0.05, 0.3, t.structureDark, { at: [0, 1.18, 0.15] })
    // counter ledge in front of the glass: the shelf crates sit here, unobstructed
    .rbox(2.3, 0.12, 0.62, 0.05, t.trim, { at: [0, 0.56, 0.78] }, 1)
    .box(2.1, 0.36, 0.08, t.structureDark, { at: [0, 0.32, 1.02] })
    .box(0.12, 0.42, 0.5, t.structureDark, { at: [-1.05, 0.3, 0.78] })
    .box(0.12, 0.42, 0.5, t.structureDark, { at: [1.05, 0.3, 0.78] })
    // sign: an accent board on the roof with a credit disc
    .rbox(1.25, 0.36, 0.14, 0.07, t.accent, { at: [0, 2.08, -0.05] }, 1)
    .cyl(0.12, 0.12, 0.04, 12, resToken(t, "res.currency"), { at: [-0.4, 2.08, 0.04], rot: [Math.PI / 2, 0, 0] })
    .box(0.62, 0.12, 0.03, t.structure, { at: [0.15, 2.08, 0.03] })
    .box(0.06, 0.2, 0.06, t.metal, { at: [-0.45, 1.88, -0.05] })
    .box(0.06, 0.2, 0.06, t.metal, { at: [0.45, 1.88, -0.05] })
    // pressure tanks and an antenna on the back
    .capsule(0.16, 0.7, t.metal, { at: [-0.55, 0.6, -0.98], rot: [0, 0, Math.PI / 2] }, 2, 8)
    .capsule(0.16, 0.7, t.metal, { at: [0.55, 0.6, -0.98], rot: [0, 0, Math.PI / 2] }, 2, 8)
    .cyl(0.025, 0.025, 0.55, 5, t.metalDark, { at: [-side * 0.9, 2.0, -0.55] })
    .sphere(0.06, 6, 4, t.accent, { at: [-side * 0.9, 2.3, -0.55] })
    // pressure dome on the roof
    .dome(0.62, 12, 4, mix(t.structure, t.glass, 0.25), { at: [0, 1.86, -0.35], scale: [1.35, 0.55, 0.9] })
    // airlock vestibule on the customer side: a short tube out of the hull, ribbed, ending in a
    // round door with a porthole and a hazard stripe, on a step plate
    .cyl(0.5, 0.5, 0.5, 16, t.structure, { at: [hx + side * 0.1, 0.95, -0.2], rot: [0, 0, Math.PI / 2] })
    .torus(0.5, 0.06, 6, 18, t.trim, { at: [hx - side * 0.08, 0.95, -0.2], rot: [0, Math.PI / 2, 0] })
    .torus(0.5, 0.06, 6, 18, t.trim, { at: [hx + side * 0.34, 0.95, -0.2], rot: [0, Math.PI / 2, 0] })
    .cyl(0.42, 0.42, 0.08, 16, t.metal, { at: [hx + side * 0.38, 0.95, -0.2], rot: [0, 0, Math.PI / 2] })
    .cyl(0.15, 0.15, 0.09, 12, t.glass, { at: [hx + side * 0.41, 1.08, -0.2], rot: [0, 0, Math.PI / 2] })
    .box(0.05, 0.08, 0.5, t.accent, { at: [hx + side * 0.43, 0.82, -0.2] })
    .rbox(0.7, 0.1, 0.9, 0.03, t.metalDark, { at: [hx + side * 0.55, 0.2, -0.2] }, 1);
  m.root.add(mesh(b.build(), mats.std, "body"));
  const glass = mesh(new GeoBuilder().box(1.8, 0.82, 0.04, t.glass, { at: [0, 1.04, 0.47] }).build(), mats.glass, "glass");
  m.root.add(glass);
  const lamp = mesh(new GeoBuilder().sphere(0.08, 8, 6, WHITE).build(), statusMat(mats.glow, t.ok), "lamp");
  lamp.position.set(hx + side * 0.1, 1.5, -0.2);
  m.root.add(lamp);
  Object.assign(m.parts, { glass, lamp });
  anchor(m.root, "deposit", 0, 0.62, 0.78);
  anchor(m.root, "queue", queue[0], 0, queue[1]);
  anchor(m.root, "interact", 0, 0, 1.25);
  anchor(m.root, "pad", 0, 0, 0);
  anchor(m.root, "pickup", 0, 0.62, 0.78);
  return m;
}

// ------------------------------------------------------------------ converters

export function buildConverter(id: string, ctx: BuildCtx, pickup: readonly [number, number] = [1.93, 0], operator: readonly [number, number] = [0, 1.7]): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const food = id === "conv.food_processor";
  const body = food ? t.structure : mix(t.structure, t.metal, 0.35);
  const out = resToken(t, food ? "res.food_prepared" : "res.material_refined");
  const b = new GeoBuilder()
    .rbox(2.0, 0.14, 1.5, 0.05, t.structureDark, { at: [0, 0.07, 0] }, 1)
    .rbox(1.7, 1.05, 1.2, 0.14, body, { at: [0, 0.66, -0.05] }, 2)
    .box(1.74, 0.12, 1.24, t.trim, { at: [0, 0.98, -0.05] })
    // input hopper (top left)
    .cyl(0.42, 0.2, 0.45, 8, t.metal, { at: [-0.45, 1.42, -0.1] })
    .torus(0.42, 0.04, 4, 10, t.trim, { at: [-0.45, 1.65, -0.1], rot: [Math.PI / 2, 0, 0] })
    // chimney (back right)
    .cyl(0.14, 0.17, 0.75, 8, t.metalDark, { at: [0.55, 1.5, -0.4] })
    .cyl(0.19, 0.19, 0.1, 8, t.metal, { at: [0.55, 1.9, -0.4] })
    // output chute toward the pickup side
    .rbox(0.5, 0.12, 0.6, 0.04, t.metal, { at: [1.05, 0.55, 0], rot: [0, 0, -0.35] }, 1)
    .rbox(0.7, 0.14, 0.7, 0.05, t.structureDark, { at: [pickup[0], 0.08, pickup[1]] }, 1)
    .box(0.3, 0.22, 0.08, t.metalDark, { at: [0.35, 0.72, 0.58] });
  // the operator spot reads like the clerk pad: someone stands here to run it
  stationPlate(b, t, operator[0], operator[1]);
  if (food) b.dome(0.45, 10, 4, t.structure, { at: [0.15, 1.12, 0.05] }).box(0.6, 0.18, 0.04, out, { at: [-0.25, 0.7, 0.57] });
  else b.cyl(0.38, 0.32, 0.3, 10, t.metalDark, { at: [0.1, 1.27, 0.05] }).box(0.7, 0.12, 0.04, t.accent, { at: [-0.25, 0.7, 0.57] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  if (!food) {
    const melt = mesh(new GeoBuilder().cyl(0.3, 0.3, 0.04, 10, t.plasma, { at: [0.1, 1.43, 0.05] }).build(), mats.glow, "melt");
    m.root.add(melt);
    m.parts["melt"] = melt;
  }
  const fan = new GeoBuilder().torus(0.24, 0.05, 4, 12, t.metalDark).cyl(0.07, 0.07, 0.08, 8, t.accent, { rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) fan.box(0.42, 0.05, 0.03, t.structureDark, { rot: [0, 0, (i * Math.PI) / 4] });
  const spin = mesh(fan.build(), mats.std, "spin");
  spin.position.set(-0.4, 0.62, 0.59);
  m.root.add(spin);
  const status = mesh(new GeoBuilder().sphere(0.09, 8, 6, WHITE).build(), statusMat(mats.glow, t.ok), "status");
  status.position.set(0.55, 1.2, 0.5);
  m.root.add(status);
  Object.assign(m.parts, { spin, status });
  anchor(m.root, "deposit", -0.45, 1.65, -0.1);
  anchor(m.root, "pickup", pickup[0], 0.16, pickup[1]);
  anchor(m.root, "interact", operator[0], 0, operator[1]);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

// ------------------------------------------------------------------ structures

export function buildHabPod(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const b = new GeoBuilder()
    .rbox(2.0, 0.12, 1.4, 0.05, t.structureDark, { at: [0, 0.06, 0] }, 1)
    .capsule(0.62, 0.9, t.structure, { at: [0, 0.82, 0], rot: [0, 0, Math.PI / 2] }, 4, 12)
    .torus(0.63, 0.05, 4, 14, t.trim, { at: [-0.35, 0.82, 0], rot: [0, Math.PI / 2, 0] })
    .torus(0.63, 0.05, 4, 14, t.trim, { at: [0.35, 0.82, 0], rot: [0, Math.PI / 2, 0] })
    .rbox(0.46, 0.7, 0.2, 0.08, t.metal, { at: [0, 0.6, 0.55] }, 1);
  for (const x of [-0.6, 0.6]) for (const z of [-0.35, 0.35]) b.cyl(0.06, 0.08, 0.3, 6, t.metalDark, { at: [x, 0.25, z] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  const win = new GeoBuilder();
  for (const x of [-0.55, 0.55]) win.sphere(0.13, 8, 6, t.plasmaHot, { at: [x, 0.95, 0.56], scale: [1, 1, 0.4] });
  win.box(0.3, 0.1, 0.02, t.plasmaHot, { at: [0, 0.98, 0.66] });
  const lights = mesh(win.build(), mats.glow, "lights");
  m.root.add(lights);
  m.parts["lights"] = lights;
  anchor(m.root, "interact", 0, 0, 1.0);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

export function buildMedBay(ctx: BuildCtx, heal: readonly [number, number] = [0.93, 0]): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const b = new GeoBuilder()
    .rbox(1.9, 0.12, 1.5, 0.05, t.structureDark, { at: [0, 0.06, 0] }, 1)
    .rbox(1.4, 0.95, 1.2, 0.14, t.structure, { at: [-0.15, 0.6, 0] }, 2)
    .dome(0.55, 12, 5, t.structure, { at: [-0.15, 1.05, 0] })
    .box(1.44, 0.1, 1.24, t.trim, { at: [-0.15, 0.95, 0] })
    // the cross reads as "medical" in every skin; ok colour = healthy
    .box(0.5, 0.16, 0.06, t.ok, { at: [-0.15, 0.62, 0.62] })
    .box(0.16, 0.5, 0.06, t.ok, { at: [-0.15, 0.62, 0.62] })
    // recovery cot at the heal offset
    .rbox(0.45, 0.14, 0.8, 0.05, t.structure, { at: [heal[0], 0.3, heal[1]] }, 1)
    .box(0.4, 0.06, 0.25, t.trim, { at: [heal[0], 0.4, heal[1] - 0.25] });
  for (const dz of [-0.3, 0.3]) b.cyl(0.03, 0.03, 0.24, 5, t.metal, { at: [heal[0], 0.12, heal[1] + dz] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  const beacon = mesh(new GeoBuilder().sphere(0.09, 8, 6, t.ok, { at: [-0.15, 1.65, 0] }).build(), mats.glow, "beacon");
  m.root.add(beacon);
  m.parts["beacon"] = beacon;
  anchor(m.root, "interact", heal[0], 0, heal[1]);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

export function buildGuardPost(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const b = new GeoBuilder()
    .rbox(1.6, 0.12, 1.6, 0.05, t.structureDark, { at: [0, 0.06, 0] }, 1)
    .cyl(0.5, 0.62, 1.2, 6, t.structure, { at: [0, 0.72, 0] })
    .cyl(0.78, 0.72, 0.14, 6, t.structureDark, { at: [0, 1.38, 0] })
    .box(0.06, 0.9, 0.06, t.metal, { at: [0.55, 1.85, -0.4] })
    .box(0.4, 0.26, 0.03, t.danger, { at: [0.75, 2.15, -0.4] })
    .rbox(0.36, 0.5, 0.12, 0.05, t.metalDark, { at: [0, 0.5, 0.55] }, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6;
    b.rbox(0.36, 0.2, 0.1, 0.03, t.trim, { at: [Math.sin(a) * 0.72, 1.53, Math.cos(a) * 0.72], rot: [0, a, 0] }, 1);
  }
  // spear rack
  for (let i = 0; i < 3; i++) b.cyl(0.02, 0.02, 0.8, 4, t.metal, { at: [-0.75 + i * 0.1, 0.5, 0.45], rot: [0, 0, 0.12] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  anchor(m.root, "interact", 0, 0, 1.0);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

export function buildTurret(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const t2 = ctx.level >= 2;
  const b = new GeoBuilder()
    .rbox(1.3, 0.12, 1.3, 0.05, t.structureDark, { at: [0, 0.06, 0] }, 1)
    .cyl(0.45, 0.58, 0.55, 8, t.structure, { at: [0, 0.4, 0] })
    .torus(0.5, 0.05, 4, 12, t2 ? t.accent : t.trim, { at: [0, 0.66, 0], rot: [Math.PI / 2, 0, 0] });
  if (t2) b.cyl(0.62, 0.66, 0.14, 8, t.metal, { at: [0, 0.2, 0] });
  m.root.add(mesh(b.build(), mats.std, "body"));
  const head = new Group();
  head.name = "head";
  head.position.set(0, 0.72, 0);
  const h = new GeoBuilder()
    .rbox(0.62, 0.38, 0.62, 0.12, t.structure, { at: [0, 0.18, 0] }, 2)
    .box(0.64, 0.08, 0.64, t2 ? t.accent : t.trim, { at: [0, 0.2, 0] })
    .sphere(0.08, 8, 6, t.danger, { at: [0, 0.3, 0.3] });
  const barrels = t2 ? [-0.12, 0.12] : [0];
  for (const x of barrels) h.cyl(0.07, 0.08, 0.7, 8, t.metalDark, { at: [x, 0.18, 0.55], rot: [Math.PI / 2, 0, 0] });
  head.add(mesh(h.build(), mats.std, "headBody"));
  const muzzle = mesh(new GeoBuilder().cone(0.14, 0.32, 6, t.plasmaHot, { at: [0, 0.18, 1.05], rot: [Math.PI / 2, 0, 0] }).build(), mats.additive, "muzzle");
  muzzle.visible = false;
  head.add(muzzle);
  m.root.add(head);
  Object.assign(m.parts, { head, muzzle });
  anchor(m.root, "interact", 0, 0, 0.9);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

export function buildWarehouse(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  // Cut away (R3): no roof skin and a low front wall, so the stock stacked on the floor
  // (drawn by the renderer from the sim) reads from the game camera.
  const b = new GeoBuilder()
    .rbox(2.8, 0.12, 2.0, 0.05, t.structureDark, { at: [0, 0.06, 0] }, 1)
    .box(2.4, 0.04, 1.6, mix(t.structureDark, t.metal, 0.4), { at: [0, 0.14, -0.05] })
    .rbox(2.5, 1.1, 0.12, 0.04, t.structure, { at: [0, 0.65, -0.84] }, 1)
    .rbox(0.12, 1.1, 1.7, 0.04, t.structure, { at: [-1.19, 0.65, -0.05] }, 1)
    .rbox(0.12, 1.1, 1.7, 0.04, t.structure, { at: [1.19, 0.65, -0.05] }, 1)
    .rbox(0.7, 0.42, 0.1, 0.03, t.structure, { at: [-0.86, 0.33, 0.76] }, 1)
    .rbox(0.7, 0.42, 0.1, 0.03, t.structure, { at: [0.86, 0.33, 0.76] }, 1)
    .box(2.54, 0.1, 0.16, t.trim, { at: [0, 1.2, -0.84] })
    .box(0.16, 0.1, 1.74, t.trim, { at: [-1.19, 1.2, -0.05] })
    .box(0.16, 0.1, 1.74, t.trim, { at: [1.19, 1.2, -0.05] })
    // door posts and the rolled-up door as a lintel over the opening
    .box(0.1, 1.1, 0.12, t.metal, { at: [-0.5, 0.65, 0.78] })
    .box(0.1, 1.1, 0.12, t.metal, { at: [0.5, 0.65, 0.78] })
    .cyl(0.12, 0.12, 1.1, 8, t.metal, { at: [0, 1.22, 0.78], rot: [0, 0, Math.PI / 2] });
  // bare roof ribs: the half-cylinder roof, skeleton only
  for (let i = 0; i < 4; i++) b.torus(0.84, 0.045, 4, 10, t.trim, { at: [-1.1 + i * (2.2 / 3), 1.2, -0.05], rot: [0, Math.PI / 2, 0] }, Math.PI);
  m.root.add(mesh(b.build(), mats.std, "body"));
  anchor(m.root, "deposit", 0, 0.5, 0.95);
  anchor(m.root, "pickup", 0, 0.5, 0.95);
  anchor(m.root, "interact", 0, 0, 1.3);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

export function buildLandmark(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const b = new GeoBuilder()
    .cyl(2.1, 2.25, 0.25, 16, t.structureDark, { at: [0, 0.12, 0] })
    .cyl(1.9, 1.95, 0.5, 16, t.structure, { at: [0, 0.5, 0] })
    .torus(1.92, 0.07, 4, 24, t.trim, { at: [0, 0.76, 0], rot: [Math.PI / 2, 0, 0] })
    .torus(1.5, 0.06, 4, 24, t.structure, { at: [0, 1.2, 0], rot: [Math.PI / 2, 0, 0] })
    // spire
    .cyl(0.12, 0.2, 1.4, 8, t.structure, { at: [0, 2.6, 0] })
    .sphere(0.2, 10, 6, t.accent, { at: [0, 3.35, 0] })
    .torus(0.4, 0.04, 4, 14, t.trim, { at: [0, 2.4, 0], rot: [Math.PI / 2, 0, 0] });
  // ribs over the dome
  for (let i = 0; i < 8; i++) b.torus(1.62, 0.05, 4, 12, t.structure, { at: [0, 0.75, 0], rot: [0, (i * Math.PI) / 8, 0] }, Math.PI);
  // four entry tubes
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 + Math.PI / 4;
    b.capsule(0.32, 0.6, t.structure, { at: [Math.sin(a) * 2.0, 0.55, Math.cos(a) * 2.0], rot: [Math.PI / 2, a, 0] }, 2, 8)
      .rbox(0.5, 0.6, 0.1, 0.05, t.metal, { at: [Math.sin(a) * 2.45, 0.5, Math.cos(a) * 2.45], rot: [0, a, 0] }, 1);
  }
  // planters around the base
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6;
    b.cyl(0.16, 0.13, 0.18, 6, t.structureDark, { at: [Math.sin(a) * 2.35, 0.09, Math.cos(a) * 2.35] })
      .sphere(0.17, 6, 4, resToken(t, "res.food_raw_1"), { at: [Math.sin(a) * 2.35, 0.28, Math.cos(a) * 2.35] });
  }
  m.root.add(mesh(b.build(), mats.std, "body"));
  const dome = mesh(new GeoBuilder().dome(1.6, 18, 7, t.glass, { at: [0, 0.75, 0] }).build(), mats.glass, "glass");
  m.root.add(dome);
  const inside = mesh(new GeoBuilder()
    .cyl(1.2, 1.2, 0.05, 14, t.plasmaHot, { at: [0, 0.78, 0] })
    .cone(0.3, 0.7, 6, resToken(t, "res.food_raw_1"), { at: [0.5, 1.15, 0.2] })
    .cone(0.25, 0.6, 6, resToken(t, "res.food_raw_1"), { at: [-0.5, 1.1, -0.3] })
    .cone(0.22, 0.55, 6, resToken(t, "res.food_raw_1"), { at: [0.1, 1.08, -0.6] })
    .build(), mats.glow, "inside");
  m.root.add(inside);
  const beacon = mesh(new GeoBuilder().sphere(0.12, 8, 6, t.plasmaHot, { at: [0, 3.35, 0] }).build(), mats.glow, "beacon");
  m.root.add(beacon);
  Object.assign(m.parts, { glass: dome, inside, beacon });
  anchor(m.root, "interact", 0, 0, 2.6);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

/** Airlock gate frame, authored for a 2 m opening along x; the renderer stretches it to the section. */
export function buildGate(ctx: BuildCtx): Model {
  const { t, mats } = ctx;
  const m = model("hero");
  const b = new GeoBuilder();
  for (const x of [-1.15, 1.15]) {
    b.rbox(0.42, 1.7, 0.6, 0.1, t.structure, { at: [x, 0.85, 0] }, 2)
      .box(0.44, 0.14, 0.62, t.trim, { at: [x, 1.3, 0] })
      .box(0.1, 0.9, 0.04, t.accent, { at: [x, 0.7, 0.31] });
  }
  b.rbox(2.72, 0.32, 0.64, 0.1, t.structure, { at: [0, 1.82, 0] }, 1)
    .box(1.6, 0.1, 0.04, t.accent, { at: [0, 1.82, 0.33] })
    .rbox(2.4, 0.08, 0.7, 0.03, t.metalDark, { at: [0, 0.04, 0] }, 1);
  m.root.add(mesh(b.build(), mats.std, "frame"));
  const doors = new Group();
  doors.name = "doors";
  for (const s of [-1, 1]) {
    const d = mesh(new GeoBuilder().rbox(0.96, 1.5, 0.14, 0.05, t.metal, { at: [0, 0.82, 0] }, 1).box(0.5, 0.36, 0.02, t.glass, { at: [0, 1.15, 0.08] }).build(), mats.std, s < 0 ? "doorL" : "doorR");
    d.position.x = s * 0.5;
    doors.add(d);
  }
  m.root.add(doors);
  const lamp = mesh(new GeoBuilder().sphere(0.1, 8, 6, WHITE).build(), statusMat(mats.glow, t.ok), "lamp");
  lamp.position.set(0, 2.1, 0.2);
  m.root.add(lamp);
  Object.assign(m.parts, { doors, lamp });
  anchor(m.root, "interact", 0, 0, 0.8);
  anchor(m.root, "pad", 0, 0, 0);
  return m;
}

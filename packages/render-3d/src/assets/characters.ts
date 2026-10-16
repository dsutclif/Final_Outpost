import { mix } from "@fo/skins";
import { BufferGeometry, Color, Euler, Group, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from "three";
import { GeoBuilder, tinted } from "../geom.js";
import type { MaterialSet } from "../materials.js";
import { roleToken, type Tokens } from "../tokens.js";

// The shared character rig. Every humanoid (hero, workers, customers, raiders) is the same
// set of parts posed by one function; creatures and hoppers have their own small rigs.
// Parts are white-vertex-coloured so the crowd can instance each part once for the whole
// scene and colour it per instance; the standalone model (asset lab, tests) bakes colours.
// Units are art metres: the hero stands 1.0 tall.

export type CharKind = "humanoid" | "creature" | "hopper" | "spiker";

export interface Look {
  kind: CharKind;
  suit: string;
  suitDark: string;
  visor: string;
  /** Helmet stripe colour (role colour); null for none. */
  stripe: string | null;
  hat: string;
  hatColor: string;
  tool: string;
  scale: number;
  /** Big back pack (the hero). */
  bigPack: boolean;
  /** Back pack colour (the hero wears the accent). */
  pack: string;
}

export interface Anim {
  /** Seconds since init. */
  t: number;
  /** Walk phase, radians. */
  phase: number;
  /** 0..1 how fast the character moves. */
  speed: number;
  carry: boolean;
  /** 0..1 hit flash. */
  hit: number;
  /** Knockback lean, radians. */
  knock: number;
  /** 0..1 cheering. */
  cheer: number;
  /** 0..1 lifeline distress (shiver, hug). */
  distress: number;
  /** Lying down (injured). */
  down: number;
  /** 0..1 a dangerous animal is charging: crouched, faster stomp, red-hot. */
  alert?: number;
  /** 0..1 frozen solid (a colonist lost to the cold): ice-blue all over, no shiver. */
  ice?: number;
}

export const restAnim = (): Anim => ({ t: 0, phase: 0, speed: 0, carry: false, hit: 0, knock: 0, cheer: 0, distress: 0, down: 0 });

/** Role gear: headgear plus held tool, so roles differ in silhouette, not colour alone. */
export const ROLE_GEAR: Readonly<Record<string, { hat: string; tool: string }>> = {
  "role.idle": { hat: "hat.none", tool: "tool.none" },
  "role.supplier": { hat: "hat.hardhat", tool: "tool.pick" },
  "role.server": { hat: "hat.cap", tool: "tool.tray" },
  "role.cashier": { hat: "hat.visor", tool: "tool.tablet" },
  "role.operator": { hat: "hat.goggles", tool: "tool.wrench" },
  "role.hunter": { hat: "hat.antenna", tool: "tool.spear" },
  "role.defender": { hat: "hat.crest", tool: "tool.shield" },
  "role.hauler": { hat: "hat.frame", tool: "tool.none" },
  "role.medic": { hat: "hat.cross", tool: "tool.kit" },
};

const gearFor = (role: string, models: Readonly<Record<string, string>>): { hat: string; tool: string } => {
  const g = ROLE_GEAR[role] ?? { hat: "hat.cap", tool: "tool.none" };
  const hat = models[role];
  return hat && hat.startsWith("hat.") ? { hat, tool: g.tool } : g;
};

/** Look for a character id (unit.*, role.*, hostile.*, node.prey). */
export function lookFor(id: string, t: Tokens, models: Readonly<Record<string, string>> = {}): Look {
  const base: Look = { kind: "humanoid", suit: t.suit, suitDark: t.suitDark, visor: t.visor, stripe: null, hat: "hat.none", hatColor: t.suit, tool: "tool.none", scale: 0.9, bigPack: false, pack: t.suitDark };
  if (id === "unit.player") return { ...base, stripe: t.accent, hat: "hat.antenna", hatColor: t.accent, scale: 1.2, bigPack: true, pack: t.accent };
  if (id.startsWith("role.") || id === "unit.resident") {
    const role = id === "unit.resident" ? "role.idle" : id;
    const col = roleToken(t, role);
    const g = gearFor(role, models);
    // unhired colonists get a neutral stripe: they read as people waiting for a job, not mannequins
    return { ...base, stripe: role === "role.idle" ? mix(col, t.ink, 0.3) : col, hat: g.hat, hatColor: col, tool: g.tool };
  }
  if (id.startsWith("unit.customer")) {
    const premium = id.endsWith("premium"), impatient = id.endsWith("impatient"), bulk = id.endsWith("bulk");
    if (bulk) return { ...base, suit: t.customer, suitDark: t.customerDark, pack: t.accent, stripe: t.accent, hat: "hat.frame", hatColor: t.accent, bigPack: true, scale: 1 };
    const gold = t.res["res.currency"] ?? t.accent;
    return {
      ...base, suit: t.customer, suitDark: t.customerDark, pack: t.customerDark,
      stripe: premium ? gold : impatient ? t.danger : null,
      hat: premium ? "hat.crown" : impatient ? "hat.cap" : "hat.none",
      hatColor: premium ? gold : impatient ? t.danger : t.customer,
    };
  }
  if (id === "hostile.raider_humanoid") {
    return { ...base, suit: t.raider, suitDark: t.raiderDark, pack: t.raiderDark, visor: t.raiderVisor, hat: "hat.hood", hatColor: t.raiderDark, tool: "tool.club", scale: 0.95 };
  }
  if (id === "hostile.creature") return { ...base, kind: "creature", suit: t.creature, suitDark: t.creatureDark, visor: t.danger, scale: 1 };
  if (id === "hostile.swarmling") return { ...base, kind: "creature", suit: mix(t.creature, t.danger, 0.25), suitDark: t.creatureDark, visor: t.danger, scale: 0.62 };
  if (id === "hostile.boss") {
    return { ...base, suit: t.raiderDark, suitDark: t.raider, pack: t.raiderDark, visor: t.danger, hat: "hat.crest", hatColor: t.danger, tool: "tool.club", scale: 1.75, bigPack: true };
  }
  if (id === "unit.prey_dangerous" || id === "node.prey_dangerous") {
    return { ...base, kind: "spiker", suit: mix(t.prey, t.danger, 0.3), suitDark: t.groundDark, visor: t.danger, scale: 1.3 };
  }
  if (id === "unit.prey" || id === "node.prey") return { ...base, kind: "hopper", suit: t.prey, suitDark: t.groundDark, visor: t.ink, scale: 1 };
  return base;
}

// ------------------------------------------------------------------ part geometry

export type PartGeos = Map<string, BufferGeometry>;

const LEG_LEN = 0.17, LEG_R = 0.078;
const ARM_LEN = 0.15, ARM_R = 0.062;
const HIP_Y = 0.34, HIP_X = 0.088;
const SHOULDER_Y = 0.6, SHOULDER_X = 0.235;
const HEAD_Y = 0.83, HEAD_R = 0.2;
const HAND_DROP = ARM_LEN + ARM_R * 2;

/** White humanoid parts plus baked-colour tools; built once per skin. */
export function buildPartGeos(t: Tokens): PartGeos {
  const W = new Color(1, 1, 1);
  const m = new Map<string, BufferGeometry>();
  const g = (): GeoBuilder => new GeoBuilder();
  m.set("h.torso", g().rbox(0.38, 0.32, 0.27, 0.09, W, { at: [0, 0, 0] }, 2).build());
  m.set("h.head", g().sphere(HEAD_R, 10, 8, W).build());
  m.set("h.visor", g().sphere(0.15, 10, 6, W, { at: [0, -0.01, 0.1], scale: [1.05, 0.72, 0.62] }).build());
  m.set("h.pack", g().rbox(0.27, 0.27, 0.13, 0.05, W, {}, 1).build());
  m.set("h.packBig", g().rbox(0.32, 0.34, 0.16, 0.06, W, {}, 1).cyl(0.045, 0.045, 0.3, 8, W, { at: [0.13, 0.02, -0.04] }).build());
  m.set("h.arm", g().capsule(ARM_R, ARM_LEN, W, { at: [0, -ARM_LEN / 2 - ARM_R * 0.5, 0] }, 2, 7).build());
  m.set("h.leg", g().capsule(LEG_R, LEG_LEN, W, { at: [0, -LEG_LEN / 2 - LEG_R * 0.6, 0] }, 2, 7).box(0.12, 0.06, 0.17, W, { at: [0, -LEG_LEN - LEG_R * 1.1, 0.03] }).build());
  m.set("h.stripe", g().torus(HEAD_R * 1.01, 0.032, 4, 10, W, { rot: [0, Math.PI / 2, 0] }, Math.PI).build());
  // headgear, authored around the head centre; coloured per instance
  m.set("hat.none", new BufferGeometry());
  m.set("hat.hardhat", g().dome(0.22, 10, 4, W, { at: [0, 0.03, 0] }).cyl(0.27, 0.27, 0.03, 12, W, { at: [0, 0.04, 0.02] }).build());
  m.set("hat.cap", g().dome(0.21, 10, 4, W, { at: [0, 0.05, 0] }).box(0.2, 0.025, 0.14, W, { at: [0, 0.07, 0.22] }).build());
  m.set("hat.visor", g().torus(0.205, 0.035, 4, 12, W, { at: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0] }).box(0.24, 0.03, 0.1, W, { at: [0, 0.06, 0.2] }).build());
  m.set("hat.goggles", g().torus(0.205, 0.025, 4, 12, W, { at: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0] }).cyl(0.06, 0.06, 0.05, 8, W, { at: [-0.07, 0.07, 0.2], rot: [Math.PI / 2, 0, 0] }).cyl(0.06, 0.06, 0.05, 8, W, { at: [0.07, 0.07, 0.2], rot: [Math.PI / 2, 0, 0] }).build());
  m.set("hat.antenna", g().cyl(0.012, 0.012, 0.26, 5, W, { at: [0.1, 0.27, -0.04] }).sphere(0.04, 6, 4, W, { at: [0.1, 0.41, -0.04] }).build());
  m.set("hat.crest", g().rbox(0.06, 0.16, 0.36, 0.03, W, { at: [0, 0.2, -0.01] }, 1).build());
  m.set("hat.frame", g().box(0.3, 0.03, 0.03, W, { at: [0, 0.22, 0] }).box(0.03, 0.18, 0.03, W, { at: [-0.15, 0.13, 0] }).box(0.03, 0.18, 0.03, W, { at: [0.15, 0.13, 0] }).sphere(0.045, 6, 4, W, { at: [0, 0.05, 0.2] }).build());
  m.set("hat.cross", g().dome(0.21, 10, 4, W, { at: [0, 0.04, 0] }).box(0.04, 0.12, 0.12, t.danger, { at: [0, 0.22, 0] }).box(0.04, 0.04, 0.2, t.danger, { at: [0, 0.22, 0] }).build());
  m.set("hat.hood", g().cone(0.25, 0.42, 8, W, { at: [0, 0.12, -0.04], rot: [-0.25, 0, 0] }).build());
  m.set("hat.crown", g().cyl(0.15, 0.13, 0.09, 8, W, { at: [0, 0.22, 0] }).cone(0.03, 0.06, 4, W, { at: [0.1, 0.29, 0] }).cone(0.03, 0.06, 4, W, { at: [-0.1, 0.29, 0] }).cone(0.03, 0.06, 4, W, { at: [0, 0.29, 0.1] }).build());
  // tools, authored at the hand; baked colours
  const metal = t.metal, dark = t.metalDark;
  m.set("tool.none", new BufferGeometry());
  m.set("tool.pick", g().cyl(0.02, 0.02, 0.36, 5, t.structureDark, { at: [0, 0.02, 0.06], rot: [Math.PI / 2, 0, 0] }).box(0.05, 0.05, 0.26, metal, { at: [0, 0.02, 0.22], rot: [Math.PI / 2, 0, 0] }).build());
  m.set("tool.tray", g().cyl(0.15, 0.15, 0.025, 10, metal, { at: [0, 0.06, 0.1] }).build());
  m.set("tool.tablet", g().rbox(0.16, 0.22, 0.03, 0.015, dark, { at: [0, 0.02, 0.08], rot: [-0.6, 0, 0] }).box(0.13, 0.17, 0.01, t.interactive, { at: [0, 0.03, 0.095], rot: [-0.6, 0, 0] }).build());
  m.set("tool.wrench", g().box(0.04, 0.26, 0.04, metal, { at: [0, -0.06, 0.05] }).torus(0.05, 0.02, 4, 8, metal, { at: [0, -0.2, 0.05] }, Math.PI * 1.6).build());
  m.set("tool.spear", g().cyl(0.018, 0.018, 0.75, 5, t.structureDark, { at: [0, 0.12, 0.05] }).cone(0.04, 0.12, 5, t.interactive, { at: [0, 0.55, 0.05] }).build());
  m.set("tool.shield", g().cyl(0.17, 0.17, 0.04, 10, t.structure, { at: [0.06, 0, 0.06], rot: [0, 0, Math.PI / 2] }).cyl(0.11, 0.11, 0.05, 10, t.trim, { at: [0.075, 0, 0.06], rot: [0, 0, Math.PI / 2] }).build());
  m.set("tool.kit", g().rbox(0.2, 0.15, 0.1, 0.03, t.structure, { at: [0, -0.06, 0.06] }, 1).box(0.04, 0.1, 0.11, t.danger, { at: [0, -0.06, 0.06] }).box(0.1, 0.04, 0.11, t.danger, { at: [0, -0.06, 0.06] }).build());
  m.set("tool.club", g().cyl(0.035, 0.022, 0.42, 6, dark, { at: [0, 0.08, 0.08], rot: [0.5, 0, 0] }).build());
  // dust crawler: body + head baked, six legs instanced
  m.set("c.body", g()
    .sphere(0.3, 10, 6, t.creature, { at: [0, 0.3, 0], scale: [1.1, 0.55, 1.35] })
    .sphere(0.24, 10, 5, t.creatureDark, { at: [0, 0.36, -0.06], scale: [1.05, 0.45, 1.25] }, Math.PI * 2, Math.PI / 2)
    .sphere(0.15, 8, 6, t.creature, { at: [0, 0.3, 0.38] })
    .sphere(0.04, 6, 4, t.danger, { at: [-0.06, 0.35, 0.5] })
    .sphere(0.04, 6, 4, t.danger, { at: [0.06, 0.35, 0.5] })
    .cone(0.03, 0.14, 4, t.creatureDark, { at: [-0.08, 0.26, 0.52], rot: [1.3, 0, 0.3] })
    .cone(0.03, 0.14, 4, t.creatureDark, { at: [0.08, 0.26, 0.52], rot: [1.3, 0, -0.3] })
    .build());
  m.set("c.leg", g().capsule(0.032, 0.26, t.creatureDark, { at: [0, -0.15, 0] }, 1, 5).build());
  // rock hopper: body baked, two feet instanced
  m.set("p.body", g()
    .rock(0.22, t.prey, { at: [0, 0.3, 0], scale: [1, 0.85, 1.1] })
    .sphere(0.05, 6, 4, t.structure, { at: [-0.08, 0.38, 0.17] })
    .sphere(0.05, 6, 4, t.structure, { at: [0.08, 0.38, 0.17] })
    .sphere(0.025, 5, 3, t.ink, { at: [-0.08, 0.38, 0.21] })
    .sphere(0.025, 5, 3, t.ink, { at: [0.08, 0.38, 0.21] })
    .cone(0.05, 0.18, 5, t.prey, { at: [-0.1, 0.52, -0.02], rot: [-0.3, 0, 0.3] })
    .cone(0.05, 0.18, 5, t.prey, { at: [0.1, 0.52, -0.02], rot: [-0.3, 0, -0.3] })
    .build());
  // spiked hopper: heavier, darker body with a spine ridge, tusks and red eyes; same feet as the hopper
  m.set("s.body", g()
    .rock(0.25, mix(t.prey, t.danger, 0.3), { at: [0, 0.31, 0], scale: [1.05, 0.85, 1.15] })
    .sphere(0.06, 6, 4, t.danger, { at: [-0.09, 0.4, 0.19] })
    .sphere(0.06, 6, 4, t.danger, { at: [0.09, 0.4, 0.19] })
    .sphere(0.025, 5, 3, t.ink, { at: [-0.09, 0.4, 0.24] })
    .sphere(0.025, 5, 3, t.ink, { at: [0.09, 0.4, 0.24] })
    .cone(0.035, 0.14, 4, t.metal, { at: [-0.07, 0.22, 0.27], rot: [1.5, 0, 0.25] })
    .cone(0.035, 0.14, 4, t.metal, { at: [0.07, 0.22, 0.27], rot: [1.5, 0, -0.25] })
    .cone(0.06, 0.26, 5, t.ink, { at: [0, 0.58, -0.12], rot: [-0.4, 0, 0] })
    .cone(0.06, 0.3, 5, t.ink, { at: [-0.12, 0.55, 0.0], rot: [0, 0, 0.45] })
    .cone(0.06, 0.3, 5, t.ink, { at: [0.12, 0.55, 0.0], rot: [0, 0, -0.45] })
    .cone(0.05, 0.24, 5, t.ink, { at: [0, 0.52, 0.12], rot: [0.5, 0, 0] })
    .cone(0.05, 0.22, 5, t.ink, { at: [-0.2, 0.4, -0.05], rot: [0, 0, 1.0] })
    .cone(0.05, 0.22, 5, t.ink, { at: [0.2, 0.4, -0.05], rot: [0, 0, -1.0] })
    .build());
  m.set("p.leg", g().capsule(0.05, 0.12, t.groundDark, { at: [0, -0.08, 0] }, 1, 5).box(0.1, 0.05, 0.16, t.groundDark, { at: [0, -0.18, 0.04] }).build());
  return m;
}

// ------------------------------------------------------------------ posing

/** Receives every posed part: geometry key, world matrix, instance colour. */
export type Emit = (part: string, m: Matrix4, color: Color) => void;
export type EmitAnchor = (name: string, m: Matrix4) => void;

const mBody = new Matrix4(), mPart = new Matrix4(), mTmp = new Matrix4(), mArmR = new Matrix4(), mArmL = new Matrix4(), mHead = new Matrix4(), mHand = new Matrix4();
const q = new Quaternion(), e = new Euler(), v = new Vector3(), one = new Vector3(1, 1, 1);
const cPack = new Color(), cSuit = new Color(), cDark = new Color(), cVisor = new Color(), cStripe = new Color(), cHat = new Color(), cWhite = new Color(), cFlash = new Color(1, 1, 1), cFrost = new Color();

function local(parent: Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, out = mPart): Matrix4 {
  q.setFromEuler(e.set(rx, ry, rz));
  mTmp.compose(v.set(x, y, z), q, one);
  return out.multiplyMatrices(parent, mTmp);
}

function shade(out: Color, base: string | null, a: Anim, frost: string | null): Color {
  if (base === null) out.setRGB(1, 1, 1);
  else out.set(base);
  if (frost && a.ice) out.lerp(cFrost.set(frost), 0.88);
  else if (frost && a.distress > 0) out.lerp(cFrost.set(frost), Math.min(0.55, a.distress * 0.45));
  if (a.hit > 0) out.lerp(cFlash, a.hit);
  return out;
}

/**
 * Pose a character. `root` places it in the world (position, facing yaw, scale to world
 * units); parts and anchors are emitted with world matrices.
 */
export function poseCharacter(look: Look, a: Anim, root: Matrix4, emit: Emit, frost: string | null = null, anchor?: EmitAnchor): void {
  if (look.kind === "creature") return poseCreature(look, a, root, emit, anchor);
  if (look.kind === "hopper") return poseHopper(look, a, root, emit, anchor);
  if (look.kind === "spiker") return poseSpiker(a, root, emit, anchor);
  shade(cSuit, look.suit, a, frost);
  shade(cDark, look.suitDark, a, frost);
  shade(cVisor, look.visor, a, a.ice ? frost : null);
  shade(cWhite, null, a, frost);
  const sw = Math.sin(a.phase) * a.speed;
  const bob = Math.abs(Math.sin(a.phase)) * 0.035 * a.speed + a.cheer * Math.abs(Math.sin(a.t * 9)) * 0.14;
  const shiver = a.distress > 0 && !a.ice ? Math.sin(a.t * 47) * 0.012 * a.distress : 0;
  const lean = -a.knock + a.speed * 0.08 - a.down * 1.45;
  local(root, shiver, bob + a.down * 0.12, 0, lean, 0, 0, mBody);

  emit("h.torso", local(mBody, 0, 0.5, 0), cSuit);
  emit(look.bigPack ? "h.packBig" : "h.pack", local(mBody, 0, 0.52, -0.19), shade(cPack, look.pack, a, frost));
  const headTurn = Math.sin(a.t * 0.7 + root.elements[12]!) * 0.15 * (1 - a.speed);
  const headM = local(mBody, 0, HEAD_Y, 0, a.distress * 0.25, headTurn, 0, mHead);
  emit("h.head", headM, cSuit);
  emit("h.visor", headM, cVisor);
  if (look.stripe) emit("h.stripe", headM, shade(cStripe, look.stripe, a, null));
  if (look.hat !== "hat.none") emit(look.hat, headM, shade(cHat, look.hatColor, a, null));
  anchor?.("head", local(headM, 0, HEAD_R, 0));

  // legs: walk swing, or folded when down
  emit("h.leg", local(mBody, -HIP_X, HIP_Y, 0, sw * 0.75), cDark);
  emit("h.leg", local(mBody, HIP_X, HIP_Y, 0, -sw * 0.75), cDark);

  // arms: swing, carry hold, cheer up, distress hug
  let ax = -sw * 0.6, az = 0.12;
  if (a.carry) { ax = -0.5 - sw * 0.15; az = 0.18; }
  if (a.distress > 0) { ax = ax * (1 - a.distress) - 1.1 * a.distress; az = az * (1 - a.distress) - 0.75 * a.distress; }
  if (a.cheer > 0) { ax = ax * (1 - a.cheer) - 2.9 * a.cheer; az = az * (1 - a.cheer) + 0.35 * a.cheer; }
  const axL = a.cheer > 0 || a.distress > 0 || a.carry ? ax : sw * 0.6;
  const armL = local(mBody, -SHOULDER_X, SHOULDER_Y, 0, axL, 0, -az, mArmL);
  local(mBody, SHOULDER_X, SHOULDER_Y, 0, ax, 0, az, mArmR);
  emit("h.arm", armL, cSuit);
  emit("h.arm", mArmR, cSuit);
  const handR = local(mArmR, 0, -HAND_DROP, 0, 0, 0, 0, mHand);
  if (look.tool !== "tool.none") emit(look.tool, handR, cWhite);
  anchor?.("hand_R", handR);
  anchor?.("hand_L", local(armL, 0, -HAND_DROP, 0));
  anchor?.("stack", local(mBody, 0, 0.7, -0.25));
}

function poseCreature(look: Look, a: Anim, root: Matrix4, emit: Emit, anchor?: EmitAnchor): void {
  shade(cWhite, null, a, null);
  const bob = Math.abs(Math.sin(a.phase * 2)) * 0.03 * a.speed;
  local(root, 0, bob, 0, -a.knock * 0.6, 0, 0, mBody);
  emit("c.body", mBody, cWhite);
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const row = (i % 3) - 1;
    // tripod gait: legs 0, 2, 4 move together
    const ph = a.phase * 2 + ((i + (i < 3 ? 0 : 1)) % 2) * Math.PI;
    const swing = Math.sin(ph) * 0.5 * a.speed;
    emit("c.leg", local(mBody, side * 0.27, 0.3, row * 0.24, swing, row * 0.35 * side, side * 1.05), cWhite);
  }
  anchor?.("head", local(mBody, 0, 0.42, 0.38));
  anchor?.("stack", local(mBody, 0, 0.5, -0.1));
  anchor?.("hand_L", local(mBody, -0.1, 0.25, 0.5));
  anchor?.("hand_R", local(mBody, 0.1, 0.25, 0.5));
}

/** The dangerous hopper: stomps instead of hopping, and when charging crouches forward and glows red. */
function poseSpiker(a: Anim, root: Matrix4, emit: Emit, anchor?: EmitAnchor): void {
  const alert = a.alert ?? 0;
  shade(cWhite, null, a, null);
  if (alert > 0) cWhite.setRGB(1, 1 - 0.5 * alert, 1 - 0.55 * alert);
  const stomp = Math.abs(Math.sin(a.phase * (1 + alert))) * (0.1 + 0.08 * alert) * Math.max(0.2, a.speed);
  const quiver = alert * Math.sin(a.t * 40) * 0.02;
  local(root, quiver, stomp, 0, 0.25 * alert - a.knock * 0.8, 0, 0, mBody);
  emit("s.body", mBody, cWhite);
  const tuck = stomp * 3;
  emit("p.leg", local(mBody, -0.15, 0.2, 0.02, -tuck), cWhite);
  emit("p.leg", local(mBody, 0.15, 0.2, 0.02, tuck), cWhite);
  anchor?.("head", local(mBody, 0, 0.55, 0.05));
  anchor?.("stack", local(mBody, 0, 0.6, -0.1));
  anchor?.("hand_L", local(mBody, -0.13, 0.05, 0.1));
  anchor?.("hand_R", local(mBody, 0.13, 0.05, 0.1));
}

function poseHopper(look: Look, a: Anim, root: Matrix4, emit: Emit, anchor?: EmitAnchor): void {
  shade(cWhite, null, a, null);
  const hopK = Math.max(0, Math.sin(a.phase));
  const hop = hopK * 0.28 * Math.max(0.15, a.speed) + Math.abs(Math.sin(a.t * 2.5)) * 0.02;
  local(root, 0, hop, 0, -a.knock * 0.8 - hopK * 0.2 * a.speed, 0, 0, mBody);
  emit("p.body", mBody, cWhite);
  const tuck = hopK * 0.7 * a.speed;
  emit("p.leg", local(mBody, -0.13, 0.2, 0.02, -tuck), cWhite);
  emit("p.leg", local(mBody, 0.13, 0.2, 0.02, -tuck), cWhite);
  anchor?.("head", local(mBody, 0, 0.5, 0.05));
  anchor?.("stack", local(mBody, 0, 0.5, -0.1));
  anchor?.("hand_L", local(mBody, -0.13, 0.05, 0.1));
  anchor?.("hand_R", local(mBody, 0.13, 0.05, 0.1));
}

/** A standalone posed character (asset lab, tests): one baked mesh per part plus anchor nodes. */
export function buildCharacterModel(look: Look, parts: PartGeos, mats: MaterialSet, a: Anim = restAnim(), frost: string | null = null): Group {
  const g = new Group();
  const root = new Matrix4().makeScale(look.scale, look.scale, look.scale);
  poseCharacter(look, a, root, (part, m, color) => {
    const geo = parts.get(part);
    if (!geo || !geo.getAttribute("position")) return;
    const mesh = new Mesh(tinted(geo, color), mats.std);
    mesh.name = part;
    m.decompose(mesh.position, mesh.quaternion, mesh.scale);
    g.add(mesh);
  }, frost, (name, m) => {
    const o = new Object3D();
    o.name = name;
    o.userData["anchor"] = true;
    m.decompose(o.position, o.quaternion, o.scale);
    g.add(o);
  });
  return g;
}

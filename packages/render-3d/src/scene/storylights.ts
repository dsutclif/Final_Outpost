import {
  AdditiveBlending, BufferAttribute, CanvasTexture, CircleGeometry, Color, CylinderGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  NoColorSpace, Object3D, PlaneGeometry, PointLight, type Scene,
} from "three";
import { mix, type Skin } from "@fo/skins";
import type { Tokens } from "../tokens.js";

// World light for the story levels: ground dots, pod glow and beams, the ridge pulse, point lights,
// the tally over the hero's head, and the night-to-sunrise lighting. Pure visuals, never pickable.
// Rank (docs/STORY-LEVELS-V2-PLAN.md C): goal light > pods > headlights/windows > dots > cloud; ridge always.

export interface StoryLightColors {
  dot: string; podOld: string; podCrew: string; lamp: string; ridge: string; ok: string; danger: string; ink: string;
}
export const storyLightColors = (t: Tokens): StoryLightColors => ({
  dot: t.guideLight, podOld: t.podOld, podCrew: t.podCrew, lamp: t.lampWarm, ridge: t.ridgeRed, ok: t.ok, danger: t.danger, ink: t.ink,
});

const glowMat = (color: string, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false, toneMapped: false, blending: AdditiveBlending, side: 2 });

/** Soft round falloff, white on black, as an alpha map. Null without a canvas (tests, workers). */
function softDisc(make: ((w: number, h: number) => HTMLCanvasElement | null) | null): CanvasTexture | null {
  const c = make?.(64, 64);
  const x = c?.getContext("2d");
  const g0 = x as { createRadialGradient?: unknown } | null | undefined;
  if (!c || !x || typeof g0?.createRadialGradient !== "function") return null;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (typeof g?.addColorStop !== "function") return null;
  g.addColorStop(0, "#fff");
  g.addColorStop(1, "#000");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  return t;
}

export type RidgeSide = "left" | "right" | "top" | "bottom";
export type TallySlot = "empty" | "done" | "missed";
export type PodKind = "old" | "crew";

const MAX_DOTS = 24, MAX_LIGHTS = 4;

/** Screen-right and screen-up on the ground for the 45 degree game camera, as unit world vectors. */
export function screenAxes(yaw = Math.PI / 4): { right: { x: number; z: number }; up: { x: number; z: number } } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { right: { x: c, z: -s }, up: { x: -s, z: -c } };
}

export class StoryLights {
  private readonly root = new Group();
  private readonly soft: CanvasTexture | null;
  private readonly dots: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly tint = new Color();
  private readonly dotColor: Color;
  private readonly pods = new Map<string, { group: Group; glow: Mesh; beam: Mesh }>();
  private readonly ridgeMesh: Mesh;
  private readonly lights = new Map<string, { light: PointLight; base: number; k: number; flashAt: number; flashLen: number }>();
  private readonly tallyGroup = new Group();
  private readonly tallySlots: Mesh[] = [];
  private readonly tallyMats: Record<TallySlot, MeshBasicMaterial>;
  private progress = 0;

  constructor(private readonly scene: Scene, private readonly c: StoryLightColors, make: ((w: number, h: number) => HTMLCanvasElement | null) | null = null) {
    this.soft = softDisc(make);
    this.dotColor = new Color(c.dot);
    const dm = glowMat(c.dot, 0.9);
    if (this.soft) dm.alphaMap = this.soft;
    this.dots = new InstancedMesh(new CircleGeometry(7, 20).rotateX(-Math.PI / 2), dm, MAX_DOTS);
    this.dots.setColorAt(0, this.dotColor);
    this.dots.count = 0;
    // ridge wash: a quad fading from full at one edge to nothing, via vertex alpha
    const g = new PlaneGeometry(1, 1);
    const a = new Float32Array(4 * 4);
    for (let i = 0; i < 4; i++) { a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = 1; a[i * 4 + 3] = g.attributes["position"]!.getX(i) < 0 ? 1 : 0; }
    g.setAttribute("color", new BufferAttribute(a, 4));
    const rm = glowMat(c.ridge, 0);
    rm.vertexColors = true;
    rm.depthTest = false;
    this.ridgeMesh = new Mesh(g, rm);
    this.tallyMats = {
      empty: new MeshBasicMaterial({ color: new Color(c.ink), transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, toneMapped: false }),
      done: new MeshBasicMaterial({ color: new Color(c.ok), depthTest: false, depthWrite: false, toneMapped: false }),
      missed: new MeshBasicMaterial({ color: new Color(c.danger), depthTest: false, depthWrite: false, toneMapped: false }),
    };
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(new CircleGeometry(3.4, 16), this.tallyMats.empty);
      m.position.x = (i - 1) * 9;
      m.renderOrder = 12;
      this.tallySlots.push(m);
      this.tallyGroup.add(m);
    }
    for (const o of [this.dots, this.ridgeMesh, this.tallyGroup]) { o.visible = false; o.frustumCulled = false; o.renderOrder = 10; }
    this.root.add(this.dots, this.ridgeMesh, this.tallyGroup);
    scene.add(this.root);
  }

  /**
   * Ground dots at the given spots. They pulse in sequence (a light running along them), one beat
   * per `period` seconds; `lit` false shows them dim and still. Colour is the skin's guide light.
   */
  groundDots(pts: readonly { x: number; z: number }[], t: number, opts: { period?: number; lit?: boolean } = {}): void {
    const n = Math.min(pts.length, MAX_DOTS), period = opts.period ?? 1.6, lit = opts.lit ?? true;
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const ph = (t / period - i / Math.max(1, n)) % 1;
      const k = lit ? Math.pow(Math.max(0, Math.cos(ph * Math.PI * 2)), 3) : 0;
      this.dummy.position.set(p.x, 1.1, p.z);
      this.dummy.scale.setScalar(0.8 + 0.4 * k);
      this.dummy.updateMatrix();
      this.dots.setMatrixAt(i, this.dummy.matrix);
      this.dots.setColorAt(i, this.tint.setScalar(0.3 + 0.7 * k).multiply(this.dotColor));
    }
    this.dots.count = n;
    this.dots.visible = n > 0;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }

  /** A pod's glow and beam. `dim` 1 = full, 0 = out (its freeze timer running down). Pass `dim` < 0 to remove it. */
  pod(id: string, x: number, z: number, kind: PodKind, dim: number): void {
    let e = this.pods.get(id);
    if (dim < 0) {
      if (e) {
        this.root.remove(e.group);
        for (const m of [e.glow, e.beam]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); }
        this.pods.delete(id);
      }
      return;
    }
    if (!e) {
      const col = kind === "old" ? this.c.podOld : this.c.podCrew;
      const glow = new Mesh(new CircleGeometry(26, 28).rotateX(-Math.PI / 2), glowMat(col, 0));
      const beam = new Mesh(new CylinderGeometry(7, 11, 110, 14, 1, true).translate(0, 55, 0), glowMat(col, 0));
      if (this.soft) (glow.material as MeshBasicMaterial).alphaMap = this.soft;
      glow.position.y = 1.2;
      glow.renderOrder = beam.renderOrder = 10;
      glow.frustumCulled = beam.frustumCulled = false;
      const group = new Group();
      group.add(glow, beam);
      this.root.add(group);
      e = { group, glow, beam };
      this.pods.set(id, e);
    }
    const d = Math.max(0, Math.min(1, dim));
    e.group.position.set(x, 0, z);
    e.group.visible = d > 0.01;
    (e.glow.material as MeshBasicMaterial).opacity = 0.75 * d;
    (e.beam.material as MeshBasicMaterial).opacity = 0.3 * d;
    e.beam.scale.y = 0.35 + 0.65 * d;
  }

  /**
   * Red wash from one fixed screen side. `k` 0-1 is the pulse strength; call each frame with the
   * camera's ground centre and the half extent of the view so the wash sits on that screen edge.
   */
  ridgePulse(side: RidgeSide, k: number, cx: number, cz: number, halfW: number, halfH: number, yaw = Math.PI / 4): void {
    const m = this.ridgeMesh;
    const a = screenAxes(yaw);
    const sx = side === "right" ? 1 : side === "left" ? -1 : 0, sy = side === "top" ? 1 : side === "bottom" ? -1 : 0;
    const horizontal = sx !== 0;
    m.position.set(cx + a.right.x * sx * halfW + a.up.x * sy * halfH, 40, cz + a.right.z * sx * halfW + a.up.z * sy * halfH);
    const ax = horizontal ? a.right : a.up;
    m.rotation.set(0, Math.atan2(-ax.z, ax.x), 0);
    // the quad's bright edge (local -x) faces outward; flip it for the positive sides
    m.scale.set((horizontal ? halfH : halfW) * (sx + sy > 0 ? -1 : 1), 160, 1);
    const kk = Math.max(0, Math.min(1, k));
    (m.material as MeshBasicMaterial).opacity = 0.8 * kk;
    m.visible = kk > 0.01;
  }

  /** A world point light (lamp, window, one-shot goal light). Capped; extra ids are ignored. */
  light(id: string, x: number, y: number, z: number, kind: "lamp" | "goal", intensity: number, goalColor?: string): void {
    let e = this.lights.get(id);
    if (!e) {
      if (this.lights.size >= MAX_LIGHTS) return;
      const light = new PointLight(new Color(kind === "lamp" ? this.c.lamp : goalColor ?? this.c.lamp), 0, 220, 2);
      this.root.add(light);
      e = { light, base: intensity, k: 1, flashAt: -1, flashLen: 0 };
      this.lights.set(id, e);
    }
    e.light.position.set(x, y, z);
    e.base = intensity;
    e.light.intensity = intensity * e.k;
  }
  /** Dim or raise a light, 0-1. */
  lightLevel(id: string, k: number): void {
    const e = this.lights.get(id);
    if (e) { e.k = Math.max(0, Math.min(1, k)); e.light.intensity = e.base * e.k; }
  }
  /** One-shot: rises and falls over `len` seconds from `t`; `update(t)` runs it. */
  flashLight(id: string, t: number, len = 1.2): void {
    const e = this.lights.get(id);
    if (e) { e.flashAt = t; e.flashLen = len; }
  }
  removeLight(id: string): void {
    const e = this.lights.get(id);
    if (e) { this.root.remove(e.light); this.lights.delete(id); }
  }

  /** Three star slots in a row above (x,y,z), facing the camera; null hides them. */
  tally(x: number, y: number, z: number, slots: readonly [TallySlot, TallySlot, TallySlot] | null, yaw = Math.PI / 4): void {
    this.tallyGroup.visible = !!slots;
    if (!slots) return;
    this.tallyGroup.position.set(x, y, z);
    this.tallyGroup.rotation.set(-Math.PI / 6, yaw, 0);
    slots.forEach((s, i) => { this.tallySlots[i]!.material = this.tallyMats[s]; });
  }

  /** Per-frame upkeep: runs one-shot flashes. */
  update(t: number): void {
    for (const e of this.lights.values()) {
      if (e.flashAt < 0) continue;
      const u = (t - e.flashAt) / e.flashLen;
      if (u >= 1) { e.flashAt = -1; e.light.intensity = e.base * e.k; continue; }
      e.light.intensity = e.base * Math.sin(Math.max(0, u) * Math.PI);
    }
  }

  /** Level progress, 0 = full night, 1 = sunrise. Feed it to `storyLighting`. */
  setProgress(p: number): void { this.progress = Math.max(0, Math.min(1, p)); }
  get lightingProgress(): number { return this.progress; }

  dispose(): void {
    this.soft?.dispose();
    this.root.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mt = m.material as MeshBasicMaterial | undefined;
      if (mt && !Object.values(this.tallyMats).includes(mt)) mt.dispose();
    });
    for (const m of Object.values(this.tallyMats)) m.dispose();
    this.scene.remove(this.root);
  }
}

export interface StoryLighting {
  /** Hemisphere/ambient level, 0-1 of day; never below the night floor. */
  ambient: number;
  /** Key light strength, 0-1 of day (0 = moonlight only). */
  sun: number;
  /** Ridge brightness floor, 0-1. */
  ridgeFloor: number;
  sky: string;
  skyTop: string;
  fog: string;
  sunColor: string;
}

/** Fallbacks when a skin sets no `look3d.nightFloor`. */
const FLOOR_DEFAULT = { ambient: 0.3, ridge: 0.25 };

/** The raised night floor on its own: ambient and ridge minimums, from the skin's look tokens. */
export function nightFloor(skin: Skin): { ambient: number; ridge: number } {
  return skin.look3d?.nightFloor ?? FLOOR_DEFAULT;
}

/** Night-to-sunrise values for progress 0-1: sky, fog, key and ambient, floored at the skin's night floor. */
export function storyLighting(skin: Skin, t: Tokens, progress: number): StoryLighting {
  const p = Math.max(0, Math.min(1, progress)), e = p * p * (3 - 2 * p);
  const floor = nightFloor(skin);
  const night = (c: string, k: number): string => mix(c, t.ink, k);
  return {
    ambient: floor.ambient + (1 - floor.ambient) * e,
    sun: e,
    ridgeFloor: floor.ridge + (1 - floor.ridge) * e,
    sky: mix(night(t.sky, 0.82), t.sky, e),
    skyTop: mix(night(t.skyTop, 0.9), t.skyTop, e),
    fog: mix(night(t.fog, 0.82), t.fog, e),
    sunColor: mix(night(t.sun, 0.5), t.sun, e),
  };
}

import {
  AdditiveBlending, Color, Group, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2,
  type Object3D,
} from "three";
import type { GLLike } from "../renderer.js";
import type { Tokens } from "../tokens.js";

// Reactor-spirit cloud: layered moving noise on an additive billboard, plus a blue patch on the
// ground. No model, no video, no textures; everything is the fragment shader. Four
// octaves keep it cheap on phones (highp costs little on one quad). The look (deep blue to near-white) was agreed with Doug on
// 2026-10-30 (docs/STORY-LEVELS-V2.md, "How KILN appears").

export type SpiritState = "idle" | "speaking" | "pulse" | "fading" | "off";

export type SpiritColors = Pick<Tokens, "spiritDeep" | "spirit" | "spiritCore" | "spiritGlitch">;

const VERT = /* glsl */ `
precision mediump float;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
}`;

const FRAG = /* glsl */ `
// highp: iPhones run mediump as 16-bit floats, too coarse for the hash and the warped noise
precision highp float;
uniform float uTime, uStrength, uBright, uGlitch, uAlpha, uSeed, uZoom, uDrift, uCoreK, uSoft;
uniform vec3 uDeep, uMid, uCore, uRed;
varying vec2 vUv;
// the lattice index stays an exact whole number, so neighbouring cells agree on every shared corner;
// the old float hash (big multipliers) disagreed after compiler regrouping and left square blocks
float h(vec2 p) { p = mod(p, 256.0); return fract(sin(p.x + p.y * 57.0 + floor(uSeed * 100.0)) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = mix(f * f * (3.0 - 2.0 * f), f * f * f * (f * (f * 6.0 - 15.0) + 10.0), uSoft);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vn(p); p = p * 2.02 + 7.1; a *= 0.5; }
  return v;
}
void main() {
  float S = clamp(uStrength, 0.0, 1.0) * 0.3 + 0.8;
  float t = uTime * 0.16 * uDrift;
  vec2 q = (vUv - 0.5) * 2.0 * uZoom;
  q.x += uGlitch * (h(vec2(floor(uTime * 18.0), floor(q.y * 14.0))) - 0.5) * 0.18;
  float r = length(q);
  // zoomed in, the noise stays finer than the zoom so billows still read
  vec2 n = q / sqrt(uZoom);
  vec2 o = vec2(fbm(n * 2.6 + vec2(0.0, -t * 1.7)), fbm(n * 2.6 + vec2(5.2, t)));
  float d = fbm(n * 2.4 + 1.6 * o + vec2(t * 0.5, -t));
  // the small portrait (uSoft) bends its edge less and fades it wider, so no noise cell shows as a hard corner
  float bend = 1.0 - 0.6 * uSoft;
  float mask = smoothstep(0.36 * S + 0.1 * uSoft, 0.03 - 0.12 * uSoft, r + (0.5 - d) * 0.26 * (2.0 - uZoom) * bend);
  float core = uCoreK * smoothstep(0.17 * S + 0.06 * uSoft, 0.0, r + (0.5 - d) * 0.13 * bend);
  vec3 col = mix(uDeep, uMid, d);
  col = mix(col, uCore, core);
  col *= 1.0 + 0.9 * uBright;
  col *= 0.94 + 0.06 * sin(vUv.y * 180.0 * uZoom + uTime * 2.0);
  col = mix(col, uRed * (0.6 + 0.8 * mask), uGlitch * 0.75);
  mask *= smoothstep(1.0, 0.72, length(vUv - 0.5) * 2.0);
  gl_FragColor = vec4(col * mask, mask * uAlpha);
}`;

const GROUND_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GROUND_FRAG = /* glsl */ `
precision mediump float;
uniform float uTime, uAlpha;
uniform vec3 uMid;
varying vec2 vUv;
void main() {
  float r = length((vUv - 0.5) * 2.0);
  float a = smoothstep(1.0, 0.1, r) * (0.8 + 0.2 * sin(uTime * 1.3));
  gl_FragColor = vec4(uMid * a, a * uAlpha);
}`;

function spiritMaterial(c: SpiritColors, size: [number, number], seed: number, look: { zoom: number; drift: number; core: number; soft?: number } = { zoom: 1, drift: 1, core: 1 }): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uSize: { value: new Vector2(size[0], size[1]) },
      uTime: { value: 0 }, uStrength: { value: 1 }, uBright: { value: 0 }, uGlitch: { value: 0 },
      uAlpha: { value: 1 }, uSeed: { value: seed }, uZoom: { value: look.zoom }, uDrift: { value: look.drift }, uCoreK: { value: look.core }, uSoft: { value: look.soft ?? 0 },
      uDeep: { value: new Color(c.spiritDeep) }, uMid: { value: new Color(c.spirit) },
      uCore: { value: new Color(c.spiritCore) }, uRed: { value: new Color(c.spiritGlitch) },
    },
  });
}

/** Shared state machine: drives the uniforms of one cloud material from state, strength and time. */
class Driver {
  state: SpiritState = "off";
  strength = 0;
  shown = 0; // smoothed strength (grows steadily)
  fade = 0; // 0..1 overall alpha
  glow = 0; // base brightness on top of speech and bloom (story follow option)
  private bloomAt = -1;
  private lastT = 0;
  private pulseAt = 0;

  constructor(readonly m: ShaderMaterial) {}

  setState(s: SpiritState): void {
    if (s === this.state) return;
    if (s === "pulse") this.pulseAt = this.lastT;
    this.state = s;
  }
  bloom(): void {
    this.bloomAt = this.lastT;
    if (this.state === "off" || this.state === "fading") this.state = "idle";
  }

  /** Advances to time t; returns the bloom scale (0..1). */
  step(t: number): number {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const u = this.m.uniforms;
    if (this.state === "fading") this.fade = Math.max(0, this.fade - dt / 1.2);
    else if (this.state === "off") this.fade = 0;
    else this.fade = Math.min(1, this.fade + dt / 0.5);
    if (this.state === "off") this.shown = 0;
    else this.shown += (this.strength - this.shown) * Math.min(1, dt * 0.8);
    const bk = this.bloomAt < 0 ? 1 : Math.min(1, (t - this.bloomAt) / 1.4);
    const scale = this.state === "off" ? 0 : 1 - (1 - bk) * (1 - bk);
    // Low fuel: small, dim, unsteady (flicker grows as strength drops).
    const weak = 1 - this.shown;
    const flick = 1 - weak * 0.3 * (0.5 + 0.5 * Math.sin(t * 17 + Math.sin(t * 5.3) * 3));
    u.uTime!.value = t;
    u.uStrength!.value = this.shown;
    const flash = bk < 1 ? (1 - bk) * 1.5 : 0;
    const syll = this.state === "speaking" ? 0.35 + 0.65 * Math.abs(Math.sin(t * 9.5 + Math.sin(t * 3.1) * 2)) : 0;
    u.uBright!.value = Math.min(1.5, this.glow + syll * 0.7 + flash);
    const beat = (t - this.pulseAt) * 2.5; // two beats, about 0.8 s
    u.uGlitch!.value = this.state === "pulse" && beat < 2 ? (Math.floor(beat) % 2 === 0 ? 1 : 0.5) : 0;
    u.uAlpha!.value = this.fade * flick * (0.8 + 0.2 * this.shown);
    if (this.state === "fading" && this.fade <= 0) this.state = "off";
    return scale;
  }
}

export interface CoreSpirit {
  readonly group: Group;
  setState(s: SpiritState): void;
  /** 0..1: reactor strength. Small and unsteady near 0, large and steady at 1. */
  setStrength(k: number): void;
  /** Blooms out of the ignition flare. */
  bloom(): void;
  /**
   * Moves the cloud and its ground patch (world x, z); `height` lifts the cloud above the ground, `size` scales both (1 = as made),
   * `glow` is a base brightness, 0 (as made) to 1.
   */
  moveTo(x: number, z: number, height?: number, size?: number, glow?: number): void;
  /** Seconds, any monotonic clock. */
  update(t: number): void;
  dispose(): void;
}

export interface CoreSpiritOptions {
  /** World position of the reactor centre; the cloud floats `height` above it. */
  at: { x: number; y: number; z: number };
  height?: number;
  /** World size of the billboard. */
  size?: number;
  /** Ground patch radius (world units). */
  patch?: number;
}

/** Cloud above `at` plus a blue patch on the ground, added to `parent`. Starts off (nothing shows). */
export function createCoreSpirit(parent: Object3D, colors: SpiritColors, opts: CoreSpiritOptions): CoreSpirit {
  const size = opts.size ?? 3;
  const group = new Group();
  group.position.set(opts.at.x, opts.at.y, opts.at.z);
  const quad = new PlaneGeometry(1, 1);
  const cloudMat = spiritMaterial(colors, [size, size], 0);
  const cloud = new Mesh(quad, cloudMat);
  cloud.position.y = opts.height ?? 3.2;
  cloud.renderOrder = 20;
  cloud.frustumCulled = false;
  const patchMat = new ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uMid: { value: new Color(colors.spirit) } },
  });
  const patch = new Mesh(quad, patchMat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.04;
  const pr = (opts.patch ?? 2.4) * 2;
  patch.scale.set(pr, pr, 1);
  patch.renderOrder = 19;
  group.add(patch, cloud);
  let userK = 1;
  group.visible = false;
  parent.add(group);
  const drv = new Driver(cloudMat);
  return {
    group,
    setState: (s) => drv.setState(s),
    setStrength: (k) => { drv.strength = Math.max(0, Math.min(1, k)); },
    bloom: () => drv.bloom(),
    moveTo(x, z, height, size, glow) { group.position.x = x; group.position.z = z; if (height !== undefined) cloud.position.y = height; if (size !== undefined) userK = size; if (glow !== undefined) drv.glow = glow; },
    update(t) {
      const scale = drv.step(t);
      group.visible = drv.state !== "off" || drv.fade > 0.001;
      cloud.scale.set(scale, scale, 1);
      // the billboard shader sizes itself from uSize (object scale does not reach it)
      cloudMat.uniforms.uSize!.value.set(size * userK, size * userK);
      patch.scale.set(pr * userK, pr * userK, 1);
      patchMat.uniforms.uTime!.value = t;
      patchMat.uniforms.uAlpha!.value = drv.fade * scale * (0.25 + 0.5 * drv.strength);
    },
    dispose() {
      parent.remove(group);
      quad.dispose(); cloudMat.dispose(); patchMat.dispose();
    },
  };
}

export interface SpiritPortrait extends Omit<CoreSpirit, "group"> {
  readonly canvas: HTMLCanvasElement;
}

/**
 * A tiny separate WebGL canvas showing the same cloud, for the client portrait beside KILN's
 * name (no canvas 2D). `createGL` builds the renderer on `canvas` (tests inject a fake); the
 * caller places `.canvas` in the DOM, calls update(t) each frame while a line is on screen,
 * and dispose() when it goes. Starts speaking at full strength.
 */
export function createSpiritPortrait(
  colors: SpiritColors,
  createGL: (canvas: HTMLCanvasElement) => GLLike,
  canvas: HTMLCanvasElement,
  px = 64,
): SpiritPortrait {
  const gl = createGL(canvas);
  gl.setPixelRatio(1);
  gl.setSize(px, px, false);
  const scene = new Scene();
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  cam.position.z = 2;
  const quad = new PlaneGeometry(1, 1);
  // zoomed in so the billows and their drift are what you see at this size; a full white core would read as a ball
  const mat = spiritMaterial(colors, [2, 2], 3.7, { zoom: 0.4, drift: 2.6, core: 0.3, soft: 1 });
  const mesh = new Mesh(quad, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const drv = new Driver(mat);
  // at full size from its first frame: it only runs while a line is up, too briefly to grow into place
  drv.strength = drv.shown = 1;
  drv.state = "speaking";
  return {
    canvas: gl.domElement,
    setState: (s) => drv.setState(s),
    setStrength: (k) => { drv.strength = Math.max(0, Math.min(1, k)); },
    bloom: () => drv.bloom(),
    moveTo() {},
    update(t) {
      cam.updateMatrixWorld();
      drv.step(t);
      gl.render(scene, cam);
    },
    dispose() { quad.dispose(); mat.dispose(); gl.dispose(); },
  };
}

// Look test (opt-in, ?look=1): what the 3D renderer gains from image-based lighting, bloom and
// full-retina resolution with dynamic scaling. Not a shipped tier; built to compare on an iPhone.

import {
  AdditiveBlending, BackSide, Box3, BufferAttribute, PlaneGeometry, Vector3, type HemisphereLight, type Object3D, ShaderMaterial, Color, HalfFloatType, Mesh, MeshBasicMaterial, MeshStandardMaterial, PMREMGenerator,
  Scene, SphereGeometry, Vector2, WebGLRenderTarget, type Camera, type Texture, type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** Reflection strength for standard materials (the hemisphere and sun still do most of the lighting). */
/**
 * Live knobs (also on globalThis.__look for console tuning): env = reflection strength for standard
 * materials; hemi = hemisphere fill multiplier while the environment map supplies sky light;
 * glow = HDR lift for unlit glow materials so only they cross the bloom threshold; bloom*; post
 * false = draw straight to the canvas (still at the dynamic resolution).
 */
// tuned on generated level 8 (daytime): stronger env or a wide bloom radius washes the sand beige
export const LOOK_TUNE = {
  // reactor gas (KILN's cloud shader in plasma colours): width in reactor widths, how far its top rises above the rim in reactor heights
  gasW: 1.0, gasRise: 0.2, gasSquash: 1, gasBright: 4, gasFront: 0, env: 0.15, envOn: true, hemi: 0.9, glow: 2.2, bloom: 0.45, bloomRadius: 0.05, threshold: 2, post: true };
/** Reactor gas colours: deep ember, amber, near-white core (red is unused: no glitch). */
const GAS = { deep: "#5a1a03", mid: "#ff7a1a", core: "#fff0c8" };

// Reactor gas: KILN's domain-warped noise (scene/corespirit.ts) as a soft additive smoky glow
// (Doug: a reactor, not a furnace), drifting gently upward.
const GAS_VERT = /* glsl */ `
precision mediump float;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
}`;
const GAS_FRAG = /* glsl */ `
// highp: the hash loses bits at mediump and the noise shows as square blocks
precision highp float;
uniform float uTime, uFuel, uBright, uSeed;
uniform vec3 uDeep, uMid, uCore;
varying vec2 vUv;
// the lattice index stays an exact whole number (the compiler may regroup the corner sums), so neighbouring cells
// agree on every shared corner; a float hash with big multipliers disagreed and left square blocks
float h(vec2 p) { p = mod(p, 256.0); return fract(sin(p.x + p.y * 57.0 + floor(uSeed * 100.0)) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vn(p); p = p * 2.02 + 7.1; a *= 0.5; } return v; }
void main() {
  vec2 q = (vUv - 0.5) * 2.0;
  // a smoky glow, not a flame: big slow swirls, a soft bright core, a gentle upward drift
  float t = uTime * 0.12;
  vec2 n = q * 1.2 + vec2(0.0, -t);
  vec2 o = vec2(fbm(n * 1.3 + vec2(0.0, -t * 0.5)), fbm(n * 1.3 + vec2(5.2, t * 0.4)));
  float d = fbm(n * 1.6 + 1.2 * o);
  float r = length(vec2(q.x, q.y * 1.1));
  float glow = smoothstep(1.0, 0.0, r + (0.5 - d) * 0.35);
  float core = smoothstep(0.55, 0.0, r + (0.5 - d) * 0.2);
  float dens = glow * (0.55 + 0.7 * d) * (0.5 + 0.5 * uFuel);
  vec3 col = mix(uDeep, uMid, glow);
  col = mix(col, uCore, core);
  col *= 1.0 + uBright * core;
  gl_FragColor = vec4(col * dens, dens);
}`;

function gasMaterial(seed: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: GAS_VERT, fragmentShader: GAS_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: {
      uSize: { value: new Vector2(1, 1) }, uTime: { value: 0 }, uFuel: { value: 1 }, uBright: { value: 1 }, uSeed: { value: seed },
      uDeep: { value: new Color(GAS.deep) }, uMid: { value: new Color(GAS.mid) }, uCore: { value: new Color(GAS.core) },
    },
  });
}
/** Reactor glow parts the gas replaces while the look test draws. */
const GLOW_PARTS = new Set(["flame", "orb"]);

interface Gas { flame: Object3D; parts: Object3D[]; mesh: Mesh; mat: ShaderMaterial; top: number; h: number; w: number }

/** Materials this rough are dust or concrete (deck slabs 0.95); Meshy models (0.9) and code structures keep the sky. */
const DUST_ROUGH = 0.93;
/** Dynamic resolution: pixel ratio steps between these, driven by measured frame rate. */
const DPR_MIN = 1.5, DPR_STEP = 0.25, FPS_LOW = 50, FPS_OK = 57;

/** A Mars sky to reflect: butterscotch haze overhead, a pale sun patch, rust ground below. */
function marsSky(night: boolean): Scene {
  const s = new Scene();
  const g = new SphereGeometry(100, 48, 24);
  const pos = g.getAttribute("position") as BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  // night: a cold blue-grey dome and a dim moon patch, so a night level is not lit by a day sky
  const zenith = new Color(night ? "#1c2638" : "#c9a27a"), horizon = new Color(night ? "#2c3548" : "#e8b98a");
  const ground = new Color(night ? "#0c0e13" : "#4a2a1c"), sun = new Color(night ? "#8a9bb8" : "#fff3df");
  const sunDir = { x: -0.62, y: 0.71, z: 0.22 };
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 100, y = pos.getY(i) / 100, z = pos.getZ(i) / 100;
    if (y >= 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.6));
    else c.copy(horizon).lerp(ground, Math.min(1, -y * 3));
    const d = x * sunDir.x + y * sunDir.y + z * sunDir.z;
    if (d > 0.9) c.lerp(sun, Math.pow((d - 0.9) / 0.1, 2)).multiplyScalar(1 + 5 * Math.pow((d - 0.9) / 0.1, 4));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new BufferAttribute(col, 3));
  s.add(new Mesh(g, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  return s;
}

export class LookTest {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly envMap: Texture;
  private readonly badge: HTMLDivElement | null;
  private dpr: number;
  private readonly dprMax: number;
  private w = 1;
  private h = 1;
  private acc = 0;
  private frames = 0;
  private goodFor = 0;
  private fps = 60;
  private gases: Gas[] = [];
  private gasQuad = new PlaneGeometry(1, 1);
  private t = 0;

  constructor(private readonly gl: WebGLRenderer, private readonly scene: Scene, private readonly camera: Camera, deviceDpr: number, night = false) {
    const pm = new PMREMGenerator(gl);
    const sky = marsSky(night);
    this.envMap = pm.fromScene(sky, 0.02).texture;
    pm.dispose();
    sky.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); } });
    scene.environment = this.envMap;

    this.dprMax = Math.min(3, Math.max(1, deviceDpr));
    this.dpr = this.dprMax;
    gl.setPixelRatio(this.dpr);
    // HDR target with MSAA, so bloom reads real highlights and edges stay clean at any scale
    const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(gl, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), LOOK_TUNE.bloom, LOOK_TUNE.bloomRadius, LOOK_TUNE.threshold);
    (globalThis as { __look?: typeof LOOK_TUNE }).__look = LOOK_TUNE;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const doc = gl.domElement.ownerDocument;
    const host = gl.domElement.parentElement;
    this.badge = host ? doc.createElement("div") : null;
    if (this.badge && host) {
      this.badge.style.cssText = "position:absolute;left:8px;bottom:8px;z-index:50;padding:3px 7px;border-radius:6px;background:rgba(0,0,0,.55);color:#ffd9a8;font:600 11px system-ui;pointer-events:none";
      host.appendChild(this.badge);
    }
  }

  /** Reflections on every standard material in the scene (Meshy models arrive late, so this runs each frame cheaply). */
  private touchMaterials(): void {
    this.scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) {
        const st = x as MeshStandardMaterial;
        // dust (deck slabs, rough ground): its own envMap at zero strength overrides the scene sky, so it never sheens like glass
        if (st.isMeshStandardMaterial && st.roughness >= DUST_ROUGH && st.envMap !== this.envMap) { st.envMap = this.envMap; st.envMapIntensity = 0; st.needsUpdate = true; }
        else if ((x as MeshBasicMaterial).isMeshBasicMaterial && x.toneMapped === false) {
          const k = LOOK_TUNE.post ? LOOK_TUNE.glow : 1, was = (x.userData["lookGlow"] as number | undefined) ?? 1;
          if (k !== was) { (x as MeshBasicMaterial).color.multiplyScalar(k / was); x.userData["lookGlow"] = k; }
        }
      }
    });
  }

  resize(w: number, h: number): void {
    this.w = w; this.h = h;
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    // bloom at half resolution: it is a blur, extra pixels buy nothing
    this.bloom.resolution.set(Math.round(w * this.dpr / 2), Math.round(h * this.dpr / 2));
  }

  /** One gas cloud per reactor: found by its flame part, sized from the reactor body's bounds (local to the model root). */
  private findGases(): void {
    this.scene.traverse((o) => {
      if (o.name !== "flame" || this.gases.some((g) => g.flame === o) || !o.parent) return;
      const root = o.parent;
      const parts = root.children.filter((c) => GLOW_PARTS.has(c.name));
      const box = new Box3(), b = new Box3();
      root.updateMatrixWorld(true);
      const inv = root.matrixWorld.clone().invert();
      root.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh || GLOW_PARTS.has(m.name) || m.name === "spin" || !m.geometry) return;
        m.geometry.computeBoundingBox();
        b.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        box.union(b);
      });
      if (box.isEmpty()) return;
      const mat = gasMaterial(this.gases.length * 0.37 + 0.13);
      const mesh = new Mesh(this.gasQuad, mat);
      mesh.renderOrder = 18;
      mesh.frustumCulled = false;
      mesh.name = "lookGas";
      root.add(mesh);
      this.gases.push({ flame: o, parts, mesh, mat, top: box.max.y, h: box.max.y - box.min.y, w: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) });
    });
    this.gases = this.gases.filter((g) => { if (g.flame.parent) return true; g.mesh.removeFromParent(); g.mat.dispose(); return false; });
  }

  /** Hides the sphere glows for this draw and drives the gas from them (fuel scales the flame, so it scales the gas). */
  private driveGases(): Array<[Object3D, boolean]> {
    const hidden: Array<[Object3D, boolean]> = [];
    const ws = new Vector3();
    for (const g of this.gases) {
      const on = g.flame.visible && g.flame.scale.y > 0.01;
      g.mesh.visible = on;
      // the renderer scales the flame 0.5 (empty) to 1.3 (full) in y, with pulse and flicker
      const fuel = Math.max(0, Math.min(1, (g.flame.scale.y - 0.5) / 0.8));
      g.mesh.getWorldScale(ws);
      // the billboard sizes in view units: local sizes times the root's world scale
      const w = g.w * LOOK_TUNE.gasW * ws.x * (0.6 + 0.4 * fuel);
      const vh = w * LOOK_TUNE.gasSquash;
      // visible cloud reaches about 0.3 of the quad height above its centre; put that top gasRise reactor heights over the rim
      g.mesh.position.set(g.flame.position.x, g.top + g.h * LOOK_TUNE.gasRise - (vh * 0.3) / ws.y, g.flame.position.z);
      // pull the flat billboard toward the camera to the front rim, so the bowl's inner ribs sit behind it
      // (at the centre they cut it into blocks); only the front rim and anything nearer still hide it
      const root = g.mesh.parent!;
      const wp = root.localToWorld(g.mesh.position.clone());
      wp.addScaledVector(this.camera.position.clone().sub(wp).normalize(), (g.w * ws.x) * LOOK_TUNE.gasFront);
      g.mesh.position.copy(root.worldToLocal(wp));
      const u = g.mat.uniforms;
      u["uSize"]!.value.set(w, vh);
      u["uTime"]!.value = this.t;
      u["uFuel"]!.value = fuel;
      u["uBright"]!.value = LOOK_TUNE.gasBright;
      for (const p of g.parts) { hidden.push([p, p.visible]); p.visible = false; }
    }
    return hidden;
  }

  render(dt: number): void {
    this.t += dt;
    this.touchMaterials();
    this.findGases();
    const hidden = this.driveGases();
    // the environment sets its hemisphere intensity every frame, so dim it only for this draw
    const hemis: [HemisphereLight, number][] = [];
    this.scene.traverse((o) => { const h = o as HemisphereLight; if (h.isHemisphereLight) { hemis.push([h, h.intensity]); h.intensity *= LOOK_TUNE.hemi; } });
    this.scene.environment = LOOK_TUNE.envOn ? this.envMap : null;
    // a scene-wide environment is scaled here; material.envMapIntensity only scales a material's own envMap
    this.scene.environmentIntensity = LOOK_TUNE.env;
    this.bloom.strength = LOOK_TUNE.bloom; this.bloom.radius = LOOK_TUNE.bloomRadius; this.bloom.threshold = LOOK_TUNE.threshold;
    if (LOOK_TUNE.post) this.composer.render(dt);
    else this.gl.render(this.scene, this.camera);
    for (const [h, i] of hemis) h.intensity = i;
    for (const [o, v] of hidden) o.visible = v;
    this.acc += dt; this.frames++;
    if (this.acc < 1) return;
    this.fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;
    if (this.fps < FPS_LOW && this.dpr > DPR_MIN) { this.dpr = Math.max(DPR_MIN, this.dpr - DPR_STEP); this.goodFor = 0; this.resize(this.w, this.h); }
    else if (this.fps >= FPS_OK && this.dpr < this.dprMax) { if (++this.goodFor >= 4) { this.dpr = Math.min(this.dprMax, this.dpr + DPR_STEP); this.goodFor = 0; this.resize(this.w, this.h); } }
    else this.goodFor = 0;
    if (this.badge) this.badge.textContent = `LOOK TEST · ${this.dpr.toFixed(2)}x of ${this.dprMax}x · ${Math.round(this.fps)} fps`;
  }

  dispose(): void {
    if (this.scene.environment === this.envMap) this.scene.environment = null;
    this.envMap.dispose();
    for (const g of this.gases) { g.mesh.removeFromParent(); g.mat.dispose(); }
    this.gasQuad.dispose();
    this.composer.dispose();
    this.badge?.remove();
  }
}

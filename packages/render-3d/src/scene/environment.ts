import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Scene,
} from "three";
import { mix } from "@fo/skins";
import { hash01 } from "../assets/scatter.js";
import { GeoBuilder } from "../geom.js";
import type { MaterialSet } from "../materials.js";
import type { Tokens } from "../tokens.js";
import { ART_M, type TierSettings } from "../units.js";
import { Batch } from "./instancing.js";

// Ground, plates, dust scatter, sky, fog, lights and the dust storm. Built once per level
// from the map size and the skin tokens.

const EDGE = 900;

/** Value noise in [0,1] over the plane, seeded by the level. */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a: number, b: number): number => hash01(a * 57.1 + b * 113.3 + seed * 7.7);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class Environment {
  readonly group = new Group();
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  readonly coreLight: PointLight;
  readonly fog: Fog;
  readonly pool: Mesh;
  readonly safeRing: Mesh;
  private readonly sky: Mesh;
  private readonly storm: Batch;
  private readonly stormGeo = new BoxGeometry(1, 1, 1);
  private readonly stormSeeds: Vector3[] = [];
  private readonly cFog: Color;
  private readonly cStorm: Color;
  private readonly cSky: Color;
  private readonly tmp = new Color();
  private readonly m = new Matrix4();
  /** 0..1 storm blend (eased toward the hazard phase). */
  storminess = 0;

  constructor(private readonly scene: Scene, readonly W: number, readonly H: number, private readonly t: Tokens, private readonly mats: MaterialSet, seed: number) {
    this.cFog = new Color(t.fog);
    this.cStorm = new Color(t.storm);
    this.cSky = new Color(t.sky);
    scene.add(this.group);
    this.group.add(this.buildGround(seed));
    this.group.add(this.buildPlates(seed));
    this.buildScatter(seed);

    // sky dome: a vertex-coloured gradient; mostly hidden at 50 degrees but frames the asset lab
    const skyGeo = new SphereGeometry(5000, 16, 8);
    const pos = skyGeo.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const top = new Color(t.skyTop), hor = new Color(t.sky);
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, pos.getY(i) / 5000);
      this.tmp.copy(hor).lerp(top, Math.pow(k, 0.6));
      col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    }
    skyGeo.setAttribute("color", new BufferAttribute(col, 3));
    this.sky = new Mesh(skyGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
    this.sky.name = "sky";
    this.sky.position.set(W / 2, 0, H / 2);
    this.sky.visible = false;
    this.group.add(this.sky);

    this.fog = new Fog(this.cFog.getHex(), 1200, 3200);
    scene.fog = this.fog;
    scene.background = this.cFog.clone();

    this.hemi = new HemisphereLight(new Color(t.sky), new Color(t.groundDark), 2.0);
    scene.add(this.hemi);
    this.sun = new DirectionalLight(new Color(t.sun), 2.6);
    this.sun.position.set(-260, 620, 320);
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.sun, this.sun.target);
    this.coreLight = new PointLight(new Color(t.plasma), 0, 100, 1.1);
    scene.add(this.coreLight);

    // the warm pool of light whose radius is the safe radius, and the safe ring at its edge
    const poolGeo = new PlaneGeometry(2, 2);
    poolGeo.rotateX(-Math.PI / 2);
    this.pool = new Mesh(poolGeo, mats.halo.clone());
    this.pool.name = "corePool";
    this.pool.renderOrder = -2;
    scene.add(this.pool);
    const ringGeo = new RingGeometry(0.97, 1.0, 64, 1);
    ringGeo.rotateX(-Math.PI / 2);
    const rcol = new Float32Array(ringGeo.getAttribute("position").count * 3);
    const ac = new Color(t.accent);
    for (let i = 0; i < rcol.length; i += 3) rcol.set([ac.r, ac.g, ac.b], i);
    ringGeo.setAttribute("color", new BufferAttribute(rcol, 3));
    this.safeRing = new Mesh(ringGeo, mats.additive);
    this.safeRing.name = "safeRing";
    scene.add(this.safeRing);

    this.storm = new Batch(this.stormGeo, mats.particle, this.group, 160, "storm");
    for (let i = 0; i < 160; i++) this.stormSeeds.push(new Vector3(hash01(i * 3.1), hash01(i * 7.3), hash01(i * 11.7)));
  }

  private buildGround(seed: number): Mesh {
    const { W, H, t } = this;
    const gw = W + EDGE * 2, gh = H + EDGE * 2;
    const sx = Math.round(gw / 30), sy = Math.round(gh / 30);
    const geo = new PlaneGeometry(gw, gh, sx, sy);
    geo.rotateX(-Math.PI / 2);
    geo.translate(W / 2, 0, H / 2);
    const pos = geo.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const g0 = new Color(t.ground), g1 = new Color(t.groundAlt), g2 = new Color(t.groundDark), c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = noise(x / 90, z / 90, seed) * 0.65 + noise(x / 28, z / 28, seed + 3) * 0.35;
      c.copy(g0).lerp(g1, Math.max(0, n - 0.35) * 1.6);
      if (n < 0.3) c.lerp(g2, (0.3 - n) * 1.6);
      // outside the map the ground darkens and falls away a little, framing the play area
      const ox = Math.max(0, -x, x - W), oz = Math.max(0, -z, z - H);
      const out = Math.min(1, Math.hypot(ox, oz) / 260);
      c.lerp(g2, out * 0.55);
      pos.setY(i, -out * 6 + (n - 0.5) * 3 * out);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new Mesh(geo, this.mats.ground);
    m.name = "ground";
    m.receiveShadow = true;
    return m;
  }

  /** Cracked composite plates and seams inside the map (one merged mesh). */
  private buildPlates(seed: number): Mesh {
    const { W, H, t } = this;
    const b = new GeoBuilder();
    const plate = mix(t.groundAlt, t.structureDark, 0.1), seam = mix(t.groundDark, t.groundAlt, 0.3);
    for (let i = 0; i < 30; i++) {
      const x = hash01(seed * 13 + i * 3) * W, z = hash01(seed * 17 + i * 5) * H;
      const w = 26 + hash01(i * 7 + seed) * 40, d = 20 + hash01(i * 11 + seed) * 30;
      const r = hash01(i * 13) * 0.5 - 0.25;
      b.box(w, 0.6, d, plate, { at: [x, 0.3, z], rot: [0, r, 0] });
      // a crack across the plate
      b.box(w * 0.6, 0.7, 1.1, seam, { at: [x, 0.35, z], rot: [0, r + 0.6 + hash01(i) * 0.6, 0] });
    }
    const m = new Mesh(b.build(), this.mats.std);
    m.name = "plates";
    m.receiveShadow = true;
    return m;
  }

  /** Dust scatter: pebbles and dust tufts, instanced. */
  private buildScatter(seed: number): void {
    const { W, H, t } = this;
    const pebble = new GeoBuilder().rock(1, mix(t.groundDark, t.ground, 0.4), {}, 0).build();
    const batch = new Batch(pebble, this.mats.std, this.group, 400, "pebbles");
    const m = new Matrix4(), c = new Color();
    const tones = [mix(t.groundDark, t.groundAlt, 0.5), t.groundAlt, mix(t.groundAlt, t.structureDark, 0.35)];
    for (let i = 0; i < 260; i++) {
      const x = -120 + hash01(seed + i * 1.7) * (W + 240), z = -160 + hash01(seed * 3 + i * 2.3) * (H + 320);
      const s = 1 + hash01(i * 5.1) * hash01(i * 2.9) * 4;
      m.makeRotationY(i).scale(new Vector3(s * 1.3, s * 0.7, s)).setPosition(x, s * 0.2, z);
      batch.push(m, c.set(tones[i % 3]!));
    }
    batch.end();
    batch.mesh.receiveShadow = true;
  }

  applyTier(tier: TierSettings): void {
    this.sun.visible = tier.extraLights > 0;
    this.sun.castShadow = tier.shadows;
    if (tier.shadows) {
      this.sun.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
      this.sun.shadow.camera.left = -420; this.sun.shadow.camera.right = 420;
      this.sun.shadow.camera.top = 520; this.sun.shadow.camera.bottom = -520;
      this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 2000;
      this.sun.shadow.bias = -0.0015;
      this.sun.shadow.normalBias = 1.5;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    // low tier: no key light, so the ambient carries more
    this.hemi.intensity = tier.extraLights > 0 ? 2.0 : 3.0;
  }

  /**
   * Per frame: follow the camera target with the sun and its shadow frustum, size the core
   * pool and light to the safe radius and fuel, and blend toward the storm.
   */
  update(dt: number, t: number, look: Vector3, core: Vector3, safeR: number, fuelK: number, hazard: string): void {
    this.sun.position.set(look.x - 260, 620, look.z + 320);
    this.sun.target.position.copy(look);
    this.sun.target.updateMatrixWorld();

    const flicker = fuelK < 0.25 ? 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3) : 1;
    const glow = (0.25 + 0.75 * fuelK) * flicker;
    this.coreLight.position.set(core.x, 2.2 * ART_M, core.z);
    this.coreLight.distance = Math.max(10, safeR * 1.25);
    this.coreLight.intensity = (fuelK > 0 ? 70 : 8) * glow * (1 + this.storminess * 0.6);
    this.pool.position.set(core.x, 0.8, core.z);
    this.pool.scale.setScalar(Math.max(1, safeR * 1.08));
    (this.pool.material as MeshBasicMaterial).opacity = 0.18 + 0.32 * glow;
    this.safeRing.position.set(core.x, 1, core.z);
    this.safeRing.scale.setScalar(Math.max(1, safeR));
    this.safeRing.visible = safeR > 0;

    const target = hazard === "active" ? 1 : hazard === "warning" ? 0.25 : 0;
    this.storminess += (target - this.storminess) * Math.min(1, dt * 1.5);
    const s = this.storminess;
    this.tmp.copy(this.cFog).lerp(this.cStorm, s);
    this.fog.color.copy(this.tmp);
    (this.scene.background as Color).copy(this.tmp);
    this.fog.near = 1200 - s * 700;
    this.fog.far = 3200 - s * 1700;
    const dim = 1 - s * 0.4;
    this.sun.intensity = 2.6 * dim;
    this.hemi.color.copy(this.cSky).lerp(this.cStorm, s);

    this.storm.begin();
    if (s > 0.05) {
      const n = Math.round(160 * s);
      const c = new Color(this.t.storm).lerp(new Color(this.t.structure), 0.4);
      for (let i = 0; i < n; i++) {
        const sd = this.stormSeeds[i]!;
        const span = 900;
        const x = look.x - span / 2 + ((sd.x * span + t * (260 + sd.y * 160)) % span);
        const z = look.z - 700 + sd.z * 1100;
        const y = 6 + sd.y * 90 + Math.sin(t * 2 + i) * 6;
        this.m.makeScale(14 + sd.z * 20, 1.4, 1.4).setPosition(x, y, z);
        this.storm.push(this.m, c);
      }
    }
    this.storm.end();
  }

  setSkyVisible(on: boolean): void {
    this.sky.visible = on;
  }

  dispose(): void {
    this.scene.remove(this.group, this.hemi, this.sun, this.sun.target, this.coreLight, this.pool, this.safeRing);
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    (this.sky.material as MeshBasicMaterial).dispose();
    this.storm.dispose();
    this.stormGeo.dispose();
    this.pool.geometry.dispose();
    (this.pool.material as MeshBasicMaterial).dispose();
    this.safeRing.geometry.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.fog = null;
  }
}

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
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Scene,
} from "three";
import { mix } from "@fo/skins";
import { meshyBrightness } from "../assets/meshy.js";
import { hash01 } from "../assets/scatter.js";
import { GeoBuilder, ROCKS } from "../geom.js";
import { StormDust } from "./softfx.js";
import { addWear, type MaterialSet } from "../materials.js";
import type { LiveLook } from "../contract.js";
import type { Tokens } from "../tokens.js";
import type { StoryLighting } from "./storylights.js";
import { ART_M, type TierSettings } from "../units.js";
import { Batch } from "./instancing.js";

// Ground, plates, dust scatter, sky, fog, lights and the dust storm. Built once per level
// from the map size and the skin tokens.

const EDGE = 900;
/** Poured slab size in world units (about 1.4 m); aprons and paths snap to this grid. */
const SLAB = 40;
/** Highest slab top (world units): slabs rise 0.9 to 1.4 off the sand, and buildings stand on this. */
export const SLAB_TOP = 1.4;

/** Something built (or to be built) on the map: gets a concrete apron of radius r. */
export interface Site { x: number; z: number; r: number; core?: boolean }
/** The generator's lots and streets: streets cross at the core (x, z) and repeat every block + street. */
export interface Lots { x: number; z: number; block: number; street: number }

/** An attack road (Batch 3): packed dirt from a gate (a) out past the map edge (b), w wide. */
export interface Road { ax: number; az: number; bx: number; bz: number; w: number }
/** Key light: low and from the left so structures throw long shadows; ambient stays low for contrast. */
export const SUN = 3.3, SUN_OFS = [-400, 460, 140] as const, HEMI = 1.15;
const HEMI_LOW = 2.2;

/** Value noise in [0,1] over the plane, seeded by the level. */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a: number, b: number): number => hash01(a * 57.1 + b * 113.3 + seed * 7.7);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The sand's three colours; the sand tracks the models: half of any change to model brightness (their sand patches read ~1.5x the bare ground at 2). */
function sandColors(t: Tokens): [Color, Color, Color] {
  const k = 1 + 0.5 * (meshyBrightness() - 1);
  return [new Color(t.ground).multiplyScalar(k), new Color(t.groundAlt).multiplyScalar(k), new Color(t.groundDark).multiplyScalar(k)];
}

/** The sand's colour at world (x, z) into `c`; returns the noise there. */
function sandAt(x: number, z: number, seed: number, g0: Color, g1: Color, g2: Color, c: Color): number {
  const n = noise(x / 90, z / 90, seed) * 0.65 + noise(x / 28, z / 28, seed + 3) * 0.35;
  c.copy(g0).lerp(g1, Math.max(0, n - 0.35) * 1.6);
  if (n < 0.3) c.lerp(g2, (0.3 - n) * 1.6);
  return n;
}

/** Pebble instance tones; smooth (look test) stones take their tone from these alone, close to the sand. */
function pebbleTones(t: Tokens, smooth: boolean): [string, string, string] {
  return smooth
    ? [mix(t.groundAlt, t.ground, 0.35), mix(t.groundDark, t.groundAlt, 0.55), mix(t.groundAlt, t.structureDark, 0.2)]
    : [mix(t.groundDark, t.groundAlt, 0.5), t.groundAlt, mix(t.groundAlt, t.structureDark, 0.35)];
}
const pebbleBase = (t: Tokens, smooth: boolean): string => (smooth ? "#ffffff" : mix(t.groundDark, t.ground, 0.4));
/** Pebbles per square world unit (the level's 260 over its map and margin, for a mid-size map). */
const PEBBLE_DENSITY = 260 / (1500 * 1600);

/**
 * The game's sand and pebbles for a live scene (livescene.ts): a square of `half` world units each way round the
 * origin, flat, in world units (scale it by 1/ART_M for metres), drawn with the game's ground material and noise.
 */
export function lookGround(look: LiveLook, half: number): Group {
  const out = new Group();
  out.name = "lookGround";
  const seg = Math.round((half * 2) / 30);
  const geo = new PlaneGeometry(half * 2, half * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const [g0, g1, g2] = look.sand.map((h) => new Color(h)) as [Color, Color, Color], c = new Color();
  for (let i = 0; i < pos.count; i++) {
    sandAt(pos.getX(i), pos.getZ(i), look.seed, g0, g1, g2, c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const groundMat = new MeshLambertMaterial({ vertexColors: true });
  addWear(groundMat, { wear: 0.9, seams: false, unit: ART_M, contact: false });
  const ground = new Mesh(geo, groundMat);
  ground.receiveShadow = true;
  out.add(ground);
  const stoneMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.06 });
  addWear(stoneMat, { wear: 1, seams: false, unit: 1 });
  const n = Math.round(PEBBLE_DENSITY * half * half * 4);
  const batch = new Batch(new GeoBuilder().rock(1, look.pebbleBase, {}, 0).build(), stoneMat, out, n, "pebbles");
  const m = new Matrix4(), tone = new Color();
  for (let i = 0; i < n; i++) {
    const x = (hash01(look.seed + i * 1.7) * 2 - 1) * half, z = (hash01(look.seed * 3 + i * 2.3) * 2 - 1) * half;
    const sz = 1 + hash01(i * 5.1) * hash01(i * 2.9) * 4;
    m.makeRotationY(i).scale(new Vector3(sz * 1.3, sz * 0.7, sz)).setPosition(x, look.smooth ? -sz * 0.1 : sz * 0.2, z);
    batch.push(m, tone.set(look.pebbles[i % 3]!));
  }
  batch.end();
  return out;
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
  /** Look test: the storm draws as drifting dust sheets and wind streaks instead of sliding bars. */
  private stormDust: StormDust | null = null;
  enableSoftStorm(): void {
    if (this.stormDust) return;
    const glow = new Color(this.t.stormGlow), ember = new Color(this.t.stormEmber);
    this.stormDust = new StormDust(this.group, new Color(this.t.storm).lerp(new Color(this.t.groundAlt), 0.3), glow, ember);
    // the storm's fog and ambient lean toward the glow, so the whole scene goes warm and dark rather than beige
    this.cStorm.lerp(glow, 0.6).multiplyScalar(0.6);
    this.stormDim = 0.6;
  }
  /** How far the key light drops at full storm (the new look goes darker). */
  private stormDim = 0.4;
  /** Dev handle (`__lookEnv.stormHold = 1`): hold the storm at this strength whatever the hazard phase. */
  stormHold: number | null = null;
  /** Screen aspect for the storm sheets (the renderer sets it on resize). */
  aspect = 0.5;
  /** 0..1 storm blend (eased toward the hazard phase). */
  storminess = 0;
  /** Manifest lighting "night": a dark blue sky and fog, a dim cool moon for the key light, the core glow carrying the scene. */
  night = false;
  /** Measured night minimum (skin look3d.nightFloor, 0-1 of day): lifts a manifest night so sand and ridge still read. Null: the old night. */
  nightLift: { ambient: number; ridge: number } | null = null;
  /** Story lighting (night to sunrise, from `storyLighting`); replaces the night/day look while set. Null: off. */
  story: StoryLighting | null = null;
  private hemiBase = HEMI;
  private readonly cNight = new Color(0x1b2231);
  private readonly cMoon = new Color(0x9fb4d8);

  constructor(private readonly scene: Scene, readonly W: number, readonly H: number, private readonly t: Tokens, private readonly mats: MaterialSet, private readonly seed: number, sites: readonly Site[] = [], private readonly lots: Lots | null = null, roads: readonly Road[] = []) {
    this.cFog = new Color(t.fog);
    this.cStorm = new Color(t.storm);
    this.cSky = new Color(t.sky);
    scene.add(this.group);
    this.group.add(this.buildGround(seed));
    this.group.add(this.buildSlabs(seed, sites));
    if (roads.length > 0) this.group.add(this.buildRoads(seed, roads));
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

    this.hemi = new HemisphereLight(new Color(t.sky), new Color(t.groundDark), HEMI);
    scene.add(this.hemi);
    this.sun = new DirectionalLight(new Color(t.sun), SUN);
    this.sun.position.set(...SUN_OFS);
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

  /** Packed dirt roads, a hair above the ground, with ragged darker edges. */
  private buildRoads(seed: number, roads: readonly Road[]): Group {
    const t = this.t, out = new Group();
    out.name = "roads";
    // trodden lighter than the sand around it, with dark ruts at the edges
    const k = 1 + 0.5 * (meshyBrightness() - 1);
    const mid = new Color(t.groundAlt).lerp(new Color(t.sun), 0.22).multiplyScalar(k), edge = new Color(t.groundDark).lerp(new Color(t.ground), 0.3).multiplyScalar(k);
    for (const r of roads) {
      const dx = r.bx - r.ax, dz = r.bz - r.az, L = Math.hypot(dx, dz);
      if (L === 0) continue;
      const geo = new PlaneGeometry(r.w, L, 4, Math.max(1, Math.round(L / 20)));
      geo.rotateX(-Math.PI / 2);
      geo.rotateY(Math.atan2(dx, dz));
      geo.translate((r.ax + r.bx) / 2, 0.35, (r.az + r.bz) / 2);
      const pos = geo.getAttribute("position"), col = new Float32Array(pos.count * 3), c = new Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        // across: 0 on the centre line, 1 at the edge
        const across = Math.abs((x - r.ax) * dz - (z - r.az) * dx) / L / (r.w / 2);
        const n = noise(x / 40, z / 40, seed + 11);
        c.copy(mid).lerp(edge, Math.min(1, Math.max(0, across - 0.7 + (n - 0.5) * 0.3) * 3.5));
        col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("color", new BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new Mesh(geo, this.mats.ground);
      m.receiveShadow = true;
      out.add(m);
    }
    return out;
  }

  /** The ground and light right now, for a live scene to match (contract LiveLook). */
  liveLook(exposure: number): LiveLook {
    const [g0, g1, g2] = sandColors(this.t);
    return {
      sand: [g0.getHexString(), g1.getHexString(), g2.getHexString()].map((h) => "#" + h) as unknown as LiveLook["sand"],
      seed: this.seed,
      pebbles: pebbleTones(this.t, ROCKS.smooth),
      pebbleBase: pebbleBase(this.t, ROCKS.smooth),
      smooth: ROCKS.smooth,
      hemi: { sky: "#" + this.hemi.color.getHexString(), ground: "#" + this.hemi.groundColor.getHexString(), intensity: this.hemi.intensity },
      sun: { color: "#" + this.sun.color.getHexString(), intensity: this.sun.visible ? this.sun.intensity : 0 },
      fog: "#" + this.fog.color.getHexString(),
      exposure,
    };
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
    const [g0, g1, g2] = sandColors(t), c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = sandAt(x, z, seed, g0, g1, g2, c);
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

  /**
   * Poured concrete: square slabs on a fixed grid under every site, plus a two-slab path from
   * each site back to the core (one merged mesh). Joints between slabs show the sand.
   */
  private buildSlabs(seed: number, sites: readonly Site[]): Mesh {
    const { W, H, t } = this;
    const nx = Math.ceil(W / SLAB), nz = Math.ceil(H / SLAB);
    const on = new Uint8Array(nx * nz);
    const mark = (i: number, j: number): void => { if (i >= 0 && j >= 0 && i < nx && j < nz) on[j * nx + i] = 1; };
    const cell = (v: number): number => Math.floor(v / SLAB);
    for (const s of sites) {
      const r = Math.ceil(s.r / SLAB);
      for (let j = cell(s.z) - r; j <= cell(s.z) + r; j++) for (let i = cell(s.x) - r; i <= cell(s.x) + r; i++) {
        const dx = (i + 0.5) * SLAB - s.x, dz = (j + 0.5) * SLAB - s.z;
        if (Math.max(Math.abs(dx), Math.abs(dz)) <= s.r + SLAB * 0.5) mark(i, j);
      }
    }
    // lots and streets: every lot with a site on it is paved with the streets round it (no edge
    // pipes: Doug, backlog R6 item 7)
    const L = this.lots;
    if (L) {
      const P = L.block + L.street, k = (v: number, c: number) => Math.floor((v - c - L.street / 2) / P);
      const used = new Set<string>();
      for (const s of sites) used.add(`${k(s.x, L.x)},${k(s.z, L.z)}`);
      for (const key of used) {
        const [a, b] = key.split(",").map(Number) as [number, number];
        const x0 = L.x + L.street / 2 + a * P, z0 = L.z + L.street / 2 + b * P;
        for (let j = cell(z0 - L.street); j <= cell(z0 + L.block + L.street - 1); j++) for (let i = cell(x0 - L.street); i <= cell(x0 + L.block + L.street - 1); i++) mark(i, j);
      }
    }
    const core = sites.find((s) => s.core);
    if (core) {
      for (const s of sites) {
        if (s === core) continue;
        // L-shaped path: along x at the site's row, then along z at the core's column
        const ci = cell(core.x), cj = cell(core.z), si = cell(s.x), sj = cell(s.z);
        for (let i = Math.min(si, ci); i <= Math.max(si, ci); i++) { mark(i, sj); mark(i, sj + 1); }
        for (let j = Math.min(sj, cj); j <= Math.max(sj, cj); j++) { mark(ci, j); mark(ci - 1, j); }
      }
    }
    const b = new GeoBuilder();
    const base = mix(t.structureDark, t.ink, 0.3), alt = mix(base, t.structure, 0.12), worn = mix(base, t.groundDark, 0.3);
    const gap = 0.9;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!on[j * nx + i]) continue;
      const h = hash01(seed * 31 + i * 7.3 + j * 13.1);
      const c = h < 0.15 ? worn : h > 0.82 ? alt : base;
      const lift = 0.9 + hash01(i * 3.7 + j * 5.9) * (SLAB_TOP - 0.9);
      b.box(SLAB - gap, lift, SLAB - gap, c, { at: [(i + 0.5) * SLAB, lift / 2, (j + 0.5) * SLAB] });
    }
    const m = new Mesh(b.build(), this.mats.slab);
    m.name = "slabs";
    m.receiveShadow = true;
    return m;
  }

  /** Dust scatter: pebbles and dust tufts, instanced. */
  private buildScatter(seed: number): void {
    const { W, H, t } = this;
    // look test: stones take their tone from the instance colour alone, close to the sand, and sit partly sunk
    const smooth = ROCKS.smooth;
    const pebble = new GeoBuilder().rock(1, pebbleBase(t, smooth), {}, 0).build();
    const batch = new Batch(pebble, this.mats.std, this.group, 400, "pebbles");
    const m = new Matrix4(), c = new Color();
    const tones = pebbleTones(t, smooth);
    for (let i = 0; i < 260; i++) {
      const x = -120 + hash01(seed + i * 1.7) * (W + 240), z = -160 + hash01(seed * 3 + i * 2.3) * (H + 320);
      const s = 1 + hash01(i * 5.1) * hash01(i * 2.9) * 4;
      m.makeRotationY(i).scale(new Vector3(s * 1.3, s * 0.7, s)).setPosition(x, smooth ? -s * 0.1 : s * 0.2, z);
      batch.push(m, c.set(tones[i % 3]!));
    }
    batch.end();
    batch.mesh.receiveShadow = true;
  }

  /**
   * Decor (a Meshy scrap heap or ore outcrop, `size` world units across): a few copies in the band
   * just outside the map edge, where nothing is ever built or walked, so the border reads as terrain.
   */
  addDecor(geo: BufferGeometry, mat: Material, salt: number, size: number, kinds = 1): void {
    // the decor kinds share one border's worth of copies; bigger pieces (the wreck) get fewer
    const n = Math.max(2, Math.min(14, Math.round((this.W + this.H) / 150 / kinds / Math.max(1, size / (1.8 * ART_M)))));
    const batch = new Batch(geo, mat, this.group, n, `decor${salt}`);
    const box = geo.boundingBox ?? (geo.computeBoundingBox(), geo.boundingBox!);
    const k0 = size / Math.max(0.01, box.max.x - box.min.x, box.max.z - box.min.z);
    const m = new Matrix4();
    for (let i = 0; i < n; i++) {
      const h = (j: number): number => hash01(this.seed * 13 + salt * 101 + i * 7.3 + j * 1.9);
      const along = h(1), out = size * 0.6 + h(2) * size * 2.2, side = (i + salt) % 4;
      const x = side === 0 ? -out : side === 1 ? this.W + out : along * this.W;
      const z = side === 2 ? -out : side === 3 ? this.H + out : along * this.H;
      const k = k0 * (0.75 + h(3) * 0.6);
      m.makeRotationY(h(4) * Math.PI * 2).scale(new Vector3(k, k, k)).setPosition(x, 0, z);
      batch.push(m);
    }
    batch.end();
    batch.mesh.receiveShadow = true;
  }

  applyTier(tier: TierSettings): void {
    this.sun.visible = tier.extraLights > 0;
    this.sun.castShadow = tier.shadows;
    if (tier.shadows) {
      this.sun.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
      // the low camera sees far up the screen: cover a tall diamond of ground around the look point
      this.sun.shadow.camera.left = -520; this.sun.shadow.camera.right = 520;
      this.sun.shadow.camera.top = 640; this.sun.shadow.camera.bottom = -640;
      this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 2000;
      this.sun.shadow.bias = -0.0015;
      this.sun.shadow.normalBias = 1.5;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    // low tier: no key light, so the ambient carries more
    this.hemiBase = tier.extraLights > 0 ? HEMI : HEMI_LOW;
    this.hemi.intensity = this.hemiBase;
  }

  /**
   * Per frame: follow the camera target with the sun and its shadow frustum, size the core
   * pool and light to the safe radius and fuel, and blend toward the storm.
   */
  update(dt: number, t: number, look: Vector3, core: Vector3, safeR: number, fuelK: number, hazard: string, camDist = 630): void {
    this.sun.position.set(look.x + SUN_OFS[0], SUN_OFS[1], look.z + SUN_OFS[2]);
    this.sun.target.position.copy(look);
    this.sun.target.updateMatrixWorld();

    const flicker = fuelK < 0.25 ? 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3) : 1;
    const glow = (0.25 + 0.75 * fuelK) * flicker;
    this.coreLight.position.set(core.x, 2.2 * ART_M, core.z);
    this.coreLight.distance = Math.max(10, safeR * 1.25);
    this.coreLight.intensity = (fuelK > 0 ? 70 : 8) * glow * (1 + this.storminess * 0.6) * (this.story ? 1 + 0.6 * (1 - this.story.sun) : this.night ? 1.6 : 1);
    this.pool.position.set(core.x, 0.8, core.z);
    this.pool.scale.setScalar(Math.max(1, safeR * 1.08));
    (this.pool.material as MeshBasicMaterial).opacity = 0.18 + 0.32 * glow;
    // above the tallest deck tile (tiles lift up to SLAB_TOP), so the ring never dips under one
    this.safeRing.position.set(core.x, SLAB_TOP + 0.2, core.z);
    this.safeRing.scale.setScalar(Math.max(1, safeR));
    this.safeRing.visible = safeR > 0;

    const target = this.stormHold ?? (hazard === "active" ? 1 : hazard === "warning" ? 0.25 : 0);
    this.storminess += (target - this.storminess) * Math.min(1, dt * 1.5);
    const s = this.storminess;
    const sl = this.story, dark = this.night || !!sl;
    (sl ? this.tmp.set(sl.fog) : this.tmp.copy(this.night ? this.cNight : this.cFog)).lerp(this.cStorm, s * (dark ? 0.3 : 1));
    this.fog.color.copy(this.tmp);
    (this.scene.background as Color).copy(this.tmp);
    // fog is measured from the camera, which sits far back for the near-flat view
    this.fog.near = camDist + 570 - s * 700;
    this.fog.far = camDist + 2570 - s * 1700;
    const dim = 1 - s * this.stormDim;
    if (sl) {
      // a story level: the key light follows the sunrise, the ambient never drops below the night floor
      this.sun.intensity = SUN * dim * Math.max(sl.moon, sl.sun);
      this.sun.color.set(sl.sunColor);
      this.hemi.intensity = this.hemiBase * Math.max(sl.ambient, 0.01);
      this.hemi.color.set(sl.sky).lerp(this.cSky, sl.ambient * 0.5).lerp(this.cStorm, s);
    } else {
      this.sun.intensity = SUN * dim * (this.night ? Math.max(0.3, this.nightLift?.ambient ?? 0) : 1);
      if (this.night) this.sun.color.copy(this.cMoon);
      // a lifted night: the ambient colour moves toward the day sky by the floor, so sand and ridge still read
      this.hemi.color.copy(this.night ? this.tmp.copy(this.cNight).lerp(this.cSky, (this.nightLift?.ambient ?? 0) * 0.6) : this.cSky).lerp(this.cStorm, s);
      this.hemi.intensity = this.hemiBase;
    }

    this.storm.begin();
    this.stormDust?.update(t, s, this.aspect);
    if (s > 0.05 && !this.stormDust) {
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
    this.stormDust?.dispose();
    this.stormGeo.dispose();
    this.pool.geometry.dispose();
    (this.pool.material as MeshBasicMaterial).dispose();
    this.safeRing.geometry.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.fog = null;
  }
}

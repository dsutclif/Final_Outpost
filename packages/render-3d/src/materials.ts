import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  RGBAFormat,
  type Material,
} from "three";
import type { Tokens } from "./tokens.js";
import { ART_M } from "./units.js";

// One shared material set per skin. Models carry their colours as vertex colours, so the
// whole scene runs on a handful of materials and draw calls batch by geometry, not by colour.

/** Soft radial falloff (white, alpha 1 at the centre to 0 at the rim): blob shadows, glows. */
export function radialTexture(size = 64, power = 1.6): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c);
      const a = Math.pow(1 - d, power);
      const i = (y * size + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

// Surface wear, computed in the fragment shader from object-space position (art metres for
// models, so moving units never swim through their own grime): concrete grain, broad
// blotches, rain streaks down vertical faces and contact darkening near the ground. `panel`
// adds poured-panel seams for the hero structures. No textures to load; one shader variant.
const NOISE_GLSL = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vObjN;
float foHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float foNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(foHash(i), foHash(i + vec3(1, 0, 0)), f.x), mix(foHash(i + vec3(0, 1, 0)), foHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(foHash(i + vec3(0, 0, 1)), foHash(i + vec3(1, 0, 1)), f.x), mix(foHash(i + vec3(0, 1, 1)), foHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float foSeam(float v, float period) {
  float d = abs(fract(v / period) - 0.5) * period;
  float w = fwidth(v) * 1.2 + 0.004;
  return 1.0 - smoothstep(period * 0.5 - w - 0.012, period * 0.5 - 0.004, d);
}
`;

export interface WearOpts { /** Grain, blotch and streak strength (0 = off). */ wear: number; /** Panel seams (hero structures). */ seams: boolean; /** Object units per art metre (1 for models; ART_M for world-space meshes). */ unit: number; /** Darken surfaces near y = 0 (off for the ground itself). */ contact?: boolean }

export function addWear(mat: MeshStandardMaterial | MeshLambertMaterial, o: WearOpts): void {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvObjPos = position / ${o.unit.toFixed(3)};\nvObjN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${NOISE_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec3 p = vObjPos;
    float vert = 1.0 - abs(normalize(vObjN).y);
    float grain = foNoise(p * 22.0) - 0.5;
    float blot = foNoise(p * 2.6 + 7.0) * 0.6 + foNoise(p * 6.0) * 0.4 - 0.5;
    float streak = smoothstep(0.5, 0.95, foNoise(vec3(p.x * 11.0, p.y * 0.9, p.z * 11.0)));
    float k = 1.0 + ${o.wear.toFixed(3)} * (grain * 0.16 + blot * 0.22 - vert * streak * 0.2);
    ${o.contact === false ? "" : "k *= mix(0.68, 1.0, smoothstep(0.0, 0.32, p.y));"}
    ${o.seams ? `float seam = max(foSeam(p.y, 0.62) * step(0.3, vert), vert * max(foSeam(p.x, 0.9), foSeam(p.z, 0.9)));
    k *= 1.0 - seam * 0.28;` : ""}
    diffuseColor.rgb *= k;
  }`,
      );
  };
  mat.customProgramCacheKey = () => `wear-${o.wear}-${o.seams}-${o.unit}-${o.contact !== false}`;
}

export class MaterialSet {
  /** Opaque vertex-coloured models: flat-shaded, with surface wear. */
  readonly std: MeshStandardMaterial;
  /** Hero structure bodies: std plus poured-panel seams. */
  readonly panel: MeshStandardMaterial;
  /** Glass domes, pods, the core column. */
  readonly glass: MeshStandardMaterial;
  /** Unlit emissive surfaces: lit windows, plasma, status lights. */
  readonly glow: MeshBasicMaterial;
  /** Additive glows and rings. */
  readonly additive: MeshBasicMaterial;
  /** Poured concrete slabs (world units). */
  readonly slab: MeshStandardMaterial;
  /** Ground plane. */
  readonly ground: MeshLambertMaterial;
  /** Flat ground decals (markers, outlines, zone paint). */
  readonly decal: MeshBasicMaterial;
  /** Blob shadow under every unit. */
  readonly blob: MeshBasicMaterial;
  /** Radial additive halo (core pool of light, glows). */
  readonly halo: MeshBasicMaterial;
  /** Particles (instance-coloured). */
  readonly particle: MeshBasicMaterial;
  readonly radial: DataTexture;

  constructor(readonly tokens: Tokens) {
    this.radial = radialTexture();
    this.std = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0.06 });
    addWear(this.std, { wear: 1, seams: false, unit: 1 });
    this.panel = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.04 });
    addWear(this.panel, { wear: 1.2, seams: true, unit: 1 });
    this.glass = new MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.5, roughness: 0.12, metalness: 0.1, depthWrite: false });
    this.glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.additive = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
    this.slab = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    addWear(this.slab, { wear: 1.3, seams: false, unit: ART_M, contact: false });
    this.ground = new MeshLambertMaterial({ vertexColors: true });
    addWear(this.ground, { wear: 0.9, seams: false, unit: ART_M, contact: false });
    this.decal = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.blob = new MeshBasicMaterial({ map: this.radial, color: new Color(tokens.ink), transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.halo = new MeshBasicMaterial({ map: this.radial, color: new Color(tokens.plasma), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.particle = new MeshBasicMaterial({ toneMapped: false });
  }

  all(): Material[] {
    return [this.std, this.panel, this.slab, this.glass, this.glow, this.additive, this.ground, this.decal, this.blob, this.halo, this.particle];
  }

  dispose(): void {
    for (const m of this.all()) m.dispose();
    this.radial.dispose();
  }
}

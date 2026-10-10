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

export class MaterialSet {
  /** Opaque vertex-coloured models (flat-shaded toy look). */
  readonly std: MeshStandardMaterial;
  /** Glass domes, pods, the core column. */
  readonly glass: MeshStandardMaterial;
  /** Unlit emissive surfaces: lit windows, plasma, status lights. */
  readonly glow: MeshBasicMaterial;
  /** Additive glows and rings. */
  readonly additive: MeshBasicMaterial;
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
    this.std = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.04 });
    this.glass = new MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.5, roughness: 0.12, metalness: 0.1, depthWrite: false });
    this.glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.additive = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
    this.ground = new MeshLambertMaterial({ vertexColors: true });
    this.decal = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.blob = new MeshBasicMaterial({ map: this.radial, color: new Color(tokens.ink), transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.halo = new MeshBasicMaterial({ map: this.radial, color: new Color(tokens.plasma), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.particle = new MeshBasicMaterial({ toneMapped: false });
  }

  all(): Material[] {
    return [this.std, this.glass, this.glow, this.additive, this.ground, this.decal, this.blob, this.halo, this.particle];
  }

  dispose(): void {
    for (const m of this.all()) m.dispose();
    this.radial.dispose();
  }
}

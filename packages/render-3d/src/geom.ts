import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Procedural low-poly toolkit. A GeoBuilder collects primitives with a colour and a transform
// and merges them into one non-indexed BufferGeometry with vertex colours: one draw call per
// model part, one shared material per skin. Units are art metres (the hero is 1.0 tall).

export type Vec3 = readonly [number, number, number];
export type ColorIn = string | Color;

export interface Xf {
  at?: Vec3;
  rot?: Vec3;
  scale?: Vec3 | number;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpS = new Vector3();
const tmpP = new Vector3();

export function toColor(c: ColorIn): Color {
  return typeof c === "string" ? new Color(c) : c;
}

export function xfMatrix(x: Xf = {}, out = new Matrix4()): Matrix4 {
  const [px, py, pz] = x.at ?? [0, 0, 0];
  const [rx, ry, rz] = x.rot ?? [0, 0, 0];
  const s = x.scale ?? 1;
  tmpS.set(...(typeof s === "number" ? ([s, s, s] as const) : s));
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
  return out.compose(tmpP.set(px, py, pz), tmpQ, tmpS);
}

interface Chunk { pos: Float32Array; nor: Float32Array; col: Float32Array }

export class GeoBuilder {
  private chunks: Chunk[] = [];

  /** Add any geometry with a flat colour (or keep its own colours with `keepColors`). */
  add(g: BufferGeometry, color: ColorIn | null, x: Xf = {}): this {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.applyMatrix4(xfMatrix(x, tmpM));
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const pos = geo.getAttribute("position").array as Float32Array;
    const nor = geo.getAttribute("normal").array as Float32Array;
    let col: Float32Array;
    if (color === null && geo.getAttribute("color")) col = Float32Array.from(geo.getAttribute("color").array as Float32Array);
    else {
      const c = color === null ? new Color(1, 1, 1) : toColor(color);
      col = new Float32Array(pos.length);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    }
    this.chunks.push({ pos: Float32Array.from(pos), nor: Float32Array.from(nor), col });
    geo.dispose();
    if (g !== geo) g.dispose();
    return this;
  }

  box(w: number, h: number, d: number, c: ColorIn, x: Xf = {}): this {
    return this.add(new BoxGeometry(w, h, d), c, x);
  }

  /** Rounded box: the chunky toy silhouette. seg 1 is cheap (bevel only), 2 is rounder. */
  rbox(w: number, h: number, d: number, r: number, c: ColorIn, x: Xf = {}, seg = 1): this {
    return this.add(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999), c, x);
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, c: ColorIn, x: Xf = {}, open = false): this {
    return this.add(new CylinderGeometry(rTop, rBot, h, seg, 1, open), c, x);
  }

  cone(r: number, h: number, seg: number, c: ColorIn, x: Xf = {}): this {
    return this.add(new ConeGeometry(r, h, seg, 1), c, x);
  }

  sphere(r: number, ws: number, hs: number, c: ColorIn, x: Xf = {}, phiLen = Math.PI * 2, thetaLen = Math.PI): this {
    return this.add(new SphereGeometry(r, ws, hs, 0, phiLen, 0, thetaLen), c, x);
  }

  /** Upper half sphere (domes, helmets). */
  dome(r: number, ws: number, hs: number, c: ColorIn, x: Xf = {}): this {
    return this.add(new SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2), c, x);
  }

  capsule(r: number, len: number, c: ColorIn, x: Xf = {}, capSeg = 2, radSeg = 6): this {
    return this.add(new CapsuleGeometry(r, len, capSeg, radSeg), c, x);
  }

  torus(r: number, tube: number, rs: number, ts: number, c: ColorIn, x: Xf = {}, arc = Math.PI * 2): this {
    return this.add(new TorusGeometry(r, tube, rs, ts, arc), c, x);
  }

  rock(r: number, c: ColorIn, x: Xf = {}, kind: 0 | 1 | 2 = 0): this {
    const g = kind === 0 ? new DodecahedronGeometry(r, 0) : kind === 1 ? new IcosahedronGeometry(r, 0) : new OctahedronGeometry(r, 0);
    return this.add(g, c, x);
  }

  get triangles(): number {
    let n = 0;
    for (const c of this.chunks) n += c.pos.length / 9;
    return n;
  }

  build(): BufferGeometry {
    let n = 0;
    for (const c of this.chunks) n += c.pos.length;
    const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n);
    let o = 0;
    for (const c of this.chunks) {
      pos.set(c.pos, o); nor.set(c.nor, o); col.set(c.col, o);
      o += c.pos.length;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("normal", new BufferAttribute(nor, 3));
    g.setAttribute("color", new BufferAttribute(col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Clone a white-vertex-coloured geometry and multiply its colours (instanced parts baked for standalone use). */
export function tinted(g: BufferGeometry, c: ColorIn): BufferGeometry {
  const out = g.clone();
  const col = out.getAttribute("color");
  const k = toColor(c);
  if (col) {
    const a = col.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) { a[i] = a[i]! * k.r; a[i + 1] = a[i + 1]! * k.g; a[i + 2] = a[i + 2]! * k.b; }
    col.needsUpdate = true;
  }
  return out;
}

export function triCount(g: BufferGeometry): number {
  if (g.index) return g.index.count / 3;
  const p = g.getAttribute("position");
  return p ? p.count / 3 : 0;
}

/** Triangles of an object tree as a model (each mesh counted once, instanced meshes × count). */
export function objectTriangles(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as Object3D & { isMesh?: boolean; isInstancedMesh?: boolean; geometry?: BufferGeometry; count?: number };
    if (!m.isMesh || !m.geometry) return;
    n += triCount(m.geometry) * (m.isInstancedMesh ? (m.count ?? 1) : 1);
  });
  return n;
}

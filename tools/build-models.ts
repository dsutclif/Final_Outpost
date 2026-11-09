// Meshy GLB → phone GLB (docs/MESHY-ASSETS.md "Bringing models into the game").
//
//   pnpm models:build                 every entry in packages/render-3d/src/assets/meshy.json
//   pnpm models:build -- sink.core.l1 only these files
//   pnpm models:build -- --src <dir>  raw downloads elsewhere (default: ../Asset workflow/3D Models)
//
// Meshy's auto-UV atlas is cut into hundreds of islands, so simplifying the textured mesh to a
// phone budget either stalls at the seams or smears the texture across them. Instead this bakes,
// like Blender's "selected to active": simplify the shape alone, unwrap it into a fresh atlas,
// then fill each texel from the nearest point on the original mesh's texture. Per model:
// fit (yaw, scale to art metres, pivot at the ground centre), bake, WebP, quantize, and write
// packages/client/public/models/<file>.glb plus its bounds and hash in meshy.built.json.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO, type mat4 } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, flatten, join as joinMeshes, prune, quantize, resample, transformMesh, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { BufferAttribute, BufferGeometry, Triangle, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import * as watlas from "watlas";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const CONFIG = join(ROOT, "packages/render-3d/src/assets/meshy.json");
const BUILT = join(ROOT, "packages/render-3d/src/assets/meshy.built.json");
const OUT = join(ROOT, "packages/client/public/models");

export interface MeshyEntry {
  file: string; src: string; id: string; level?: number;
  yaw?: number; width?: number; height?: number; offset?: [number, number];
  /** Characters: art metres along the body instead of height (the hoppers). */
  length?: number;
  tris?: number; texture?: number; outlineTris?: number;
  /**
   * Simplify to a shape tolerance instead of a triangle count: the low mesh strays at most this far
   * (fitted art metres) from the original, keeping whatever triangles that takes; `tris` is then
   * only a ceiling (default 30000). Also turns on smooth normals (see smooth()).
   */
  error?: number;
  /** Recolour the base colour before baking ("gold": brushed warm gold, darks kept). */
  tint?: "gold" | "scorch" | "navy";
  /** Lettering on the broad faces: text and [x0, y0, x1, y1] (fitted art metres), see lettering(). */
  decal?: { text: string; box: number[] };
  /** Material factors (default rough 0.9, metal 0). */
  rough?: number; metal?: number;
  /** "prop": held item; props and wall sections (batch) get no blueprint outline. */
  batch?: string;
  /** "prop": held item; "character": rigged (skeleton and clips kept, see buildCharacter). */
  kind?: "prop" | "character" | "item" | "decor" | "belt";
  /** Also write <file>.lod.glb at this many triangles (props drawn on the code-built crowd). */
  lod?: number;
  /** Also bake a tangent-space normal map (same size as `texture`) from the original's surface (buggy body). */
  normalMap?: boolean;
  /** Mirror across z (negate z, flip winding): the opposite-side wheel, hub still facing out. */
  mirror?: boolean;
  /** Keep only triangles above this fraction of the source's height (0 bottom, 1 top): a head cut from a bust. */
  crop?: number;
  /** Characters: boxes [x0,y0,z0,x1,y1,z1] in the bind pose (source metres); a triangle with all three corners inside one is removed (a pick baked into the back, which is carried as its own prop instead). */
  drop?: number[][];
  /**
   * Characters: round off the parts skinned to the joints whose names match `bones` (angular fingers in a close-up): the mesh is
   * subdivided `subdiv` times (midpoints, skin weights blended) and the matching vertices are smoothed `iterations` times
   * (Taubin: shrink then inflate, so the shape keeps its size) with their normals recomputed. Seams stay closed (smoothing is by position).
   */
  round?: { bones: string; subdiv?: number; iterations?: number };
}
export interface BuiltEntry { hash: string; tris: number; bytes: number; outline?: { hash: string; tris: number; bytes: number }; lod?: { hash: string; tris: number; bytes: number }; bounds: [number, number, number, number, number, number] }

const args = process.argv.slice(2);
const srcAt = args.indexOf("--src");
const SRC = srcAt >= 0 ? resolve(args[srcAt + 1]!) : resolve(ROOT, "../Asset workflow/3D Models");
const only = args.filter((a, i) => !a.startsWith("--") && (srcAt < 0 || i !== srcAt + 1));

const config = JSON.parse(readFileSync(CONFIG, "utf8")) as { models: MeshyEntry[] };
const built: Record<string, BuiltEntry> = existsSync(BUILT) ? JSON.parse(readFileSync(BUILT, "utf8")) : {};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
await watlas.Initialize();
mkdirSync(OUT, { recursive: true });

interface Src { pos: Float32Array; uv: Float32Array; idx: Uint32Array; tex: { data: Buffer; w: number; h: number } }

/** The high mesh in model space (one primitive after join) and its base colour as raw RGBA. */
async function loadSource(path: string, tint?: MeshyEntry["tint"]): Promise<Src> {
  const doc = await io.read(path);
  await doc.transform(dedup(), flatten(), joinMeshes(), weld());
  const prims = doc.getRoot().listNodes().flatMap((n) => {
    const mesh = n.getMesh();
    if (!mesh) return [];
    transformMesh(mesh, n.getWorldMatrix());
    return mesh.listPrimitives();
  });
  const prim = prims.find((p) => p.getMaterial()?.getBaseColorTexture() && p.getAttribute("TEXCOORD_0"));
  if (!prim || prims.length !== 1) throw new Error(`expected one textured primitive, got ${prims.length}`);
  const floats = (name: string): Float32Array => {
    const a = prim.getAttribute(name)!;
    const arr = a.getArray()!;
    if (arr instanceof Float32Array && !a.getNormalized()) return arr;
    const out = new Float32Array(a.getCount() * a.getElementSize()), v: number[] = [];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); out.set(v, i * a.getElementSize()); }
    return out;
  };
  const img = prim.getMaterial()!.getBaseColorTexture()!.getImage()!;
  const raw = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (tint === "gold") gold(raw.data, raw.info.width);
  if (tint === "scorch") scorch(raw.data, raw.info.width);
  if (tint === "navy") navy(raw.data);
  return { pos: floats("POSITION"), uv: floats("TEXCOORD_0"), idx: Uint32Array.from(prim.getIndices()!.getArray()!), tex: { data: raw.data, w: raw.info.width, h: raw.info.height } };
}

/**
 * Brushed warm gold (about #c9a24a) from any base colour: brightness picks the shade between a
 * deep bronze and a pale highlight, with faint horizontal brushing. Near-black texels (handle,
 * clasps, seams) stay dark so the hardware still reads.
 */
function gold(px: Buffer, w: number): void {
  const lo = [92, 64, 22], mid = [201, 162, 74], hi = [246, 224, 150];
  for (let o = 0, i = 0; o < px.length; o += 4, i++) {
    const l = (0.2126 * px[o]! + 0.7152 * px[o + 1]! + 0.0722 * px[o + 2]!) / 255;
    if (l < 0.12) continue;
    const y = Math.floor(i / w), x = i % w;
    const brush = 0.05 * Math.sin(y * 1.7 + Math.sin(y * 0.13) * 6) + 0.03 * Math.sin(y * 7.3 + x * 0.002);
    const k = Math.min(1, Math.max(0, (l - 0.12) / 0.7 + brush));
    // dark-to-gold blend near the cut-off so edges do not ring
    const keep = Math.min(1, (l - 0.12) / 0.06);
    for (let c = 0; c < 3; c++) {
      const g = k < 0.5 ? lo[c]! + (mid[c]! - lo[c]!) * (k / 0.5) : mid[c]! + (hi[c]! - mid[c]!) * ((k - 0.5) / 0.5);
      px[o + c] = Math.round(px[o + c]! * (1 - keep) + g * keep);
    }
  }
}

/**
 * Dark navy cloth (Sela's suit, Doug 2026-11-04): pale, near-neutral texels (the suit's off-white and grey fabric)
 * take a navy ramp by their brightness, so folds and wear still read. Warm or saturated texels (skin, lamps, trim)
 * and near-black hardware keep their colour; the blend fades in with how neutral a texel is, so edges do not ring.
 */
function navy(px: Buffer): void {
  const lo = [12, 18, 34], mid = [30, 46, 86], hi = [74, 96, 140];
  for (let o = 0; o < px.length; o += 4) {
    const r = px[o]! / 255, g = px[o + 1]! / 255, b = px[o + 2]! / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    if (l < 0.16) continue;
    const neutral = Math.min(1, Math.max(0, (0.3 - sat) / 0.12)) * Math.min(1, (l - 0.16) / 0.08);
    if (neutral <= 0) continue;
    const k = Math.min(1, Math.max(0, (l - 0.16) / 0.74));
    for (let c = 0; c < 3; c++) {
      const t = k < 0.5 ? lo[c]! + (mid[c]! - lo[c]!) * (k / 0.5) : mid[c]! + (hi[c]! - mid[c]!) * ((k - 0.5) / 0.5);
      px[o + c] = Math.round(px[o + c]! * (1 - neutral) + t * neutral);
    }
  }
}

/**
 * Scorched orange (hot landing): brightness picks between soot brown and a dull burnt orange/rust,
 * with deterministic blotchy soot patches and vertical streaks darkening further. Near-black
 * texels (seams, hardware) stay dark. Not a bright paint: the brightest shade is about #be642f.
 */
function scorch(px: Buffer, w: number): void {
  const lo = [38, 22, 14], mid = [140, 64, 28], hi = [190, 100, 48];
  const h = (x: number, y: number): number => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const noise = (x: number, y: number): number => {
    const gx = Math.floor(x), gy = Math.floor(y), fx = x - gx, fy = y - gy;
    const a = h(gx, gy), b = h(gx + 1, gy), c = h(gx, gy + 1), d = h(gx + 1, gy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  for (let o = 0, i = 0; o < px.length; o += 4, i++) {
    const l = (0.2126 * px[o]! + 0.7152 * px[o + 1]! + 0.0722 * px[o + 2]!) / 255;
    const y = Math.floor(i / w), x = i % w;
    const soot = 0.6 * noise(x / 48, y / 48) + 0.3 * noise(x / 11, y / 11) + 0.25 * noise(x / 3, y / 90);
    const k = Math.min(1, Math.max(0, l * 0.9 + 0.1 - Math.max(0, soot - 0.45) * 0.9));
    const keep = Math.min(1, l / 0.1);
    for (let c = 0; c < 3; c++) {
      const g = k < 0.5 ? lo[c]! + (mid[c]! - lo[c]!) * (k / 0.5) : mid[c]! + (hi[c]! - mid[c]!) * ((k - 0.5) / 0.5);
      px[o + c] = Math.round(px[o + c]! * (1 - keep) + g * keep);
    }
  }
}

/** Fit in place: turn by yaw, scale to art metres, ground centre at the origin. Returns the bounds. */
function fit(pos: Float32Array, e: MeshyEntry): BuiltEntry["bounds"] {
  const b = (): number[] => {
    const r = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { r[k] = Math.min(r[k]!, pos[i + k]!); r[k + 3] = Math.max(r[k + 3]!, pos[i + k]!); }
    return r;
  };
  const yaw = ((e.yaw ?? 0) * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!, z = pos[i + 2]!;
    pos[i] = c * x + s * z;
    pos[i + 2] = -s * x + c * z;
  }
  const [x0, y0, z0, x1, y1, z1] = b() as [number, number, number, number, number, number];
  const k = e.width ? e.width / Math.max(x1 - x0, z1 - z0) : e.height ? e.height / (y1 - y0) : 1;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, [ox, oz] = e.offset ?? [0, 0];
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i]! - cx) * k + ox;
    pos[i + 1] = (pos[i + 1]! - y0) * k;
    pos[i + 2] = (pos[i + 2]! - cz) * k + oz;
  }
  return b().map((v) => Math.round(v * 1000) / 1000) as BuiltEntry["bounds"];
}

/** The triangles wholly above `f` of the source's height, with unused vertices dropped so the fit sees only them. */
function cropAbove(src: Src, f: number): Src {
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < src.pos.length; i += 3) { y0 = Math.min(y0, src.pos[i]!); y1 = Math.max(y1, src.pos[i]!); }
  const cut = y0 + f * (y1 - y0), map = new Int32Array(src.pos.length / 3).fill(-1), kept: number[] = [];
  let n = 0;
  for (let t = 0; t < src.idx.length; t += 3) {
    const a = src.idx[t]!, b = src.idx[t + 1]!, c = src.idx[t + 2]!;
    if (src.pos[a * 3 + 1]! < cut || src.pos[b * 3 + 1]! < cut || src.pos[c * 3 + 1]! < cut) continue;
    for (const v of [a, b, c]) { if (map[v] === -1) map[v] = n++; kept.push(map[v]!); }
  }
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  map.forEach((m, v) => { if (m < 0) return; pos.set(src.pos.subarray(v * 3, v * 3 + 3), m * 3); uv.set(src.uv.subarray(v * 2, v * 2 + 2), m * 2); });
  return { pos, uv, idx: Uint32Array.from(kept), tex: src.tex };
}

/** Shape-only simplification: weld by position (UV seams gone), then meshopt to the target. */
function lowPoly(src: Src, target: number, error?: number): { pos: Float32Array; idx: Uint32Array; orig: Uint32Array } {
  const remap = MeshoptSimplifier.generatePositionRemap(src.pos, 3);
  const idx = src.idx.map((i) => remap[i]!);
  let out: Uint32Array;
  if (error !== undefined) {
    // as far as the tolerance allows (Prune drops loose specks smaller than it; Permissive lets the
    // non-manifold joins go, which otherwise stall it near 70k); target is a ceiling
    [out] = MeshoptSimplifier.simplify(idx, src.pos, 3, 0, error, ["ErrorAbsolute", "Prune", "Permissive"]);
    if (out.length > target * 3) [out] = MeshoptSimplifier.simplify(out, src.pos, 3, target * 3, 1, ["ErrorAbsolute", "Permissive"]);
  } else {
    [out] = MeshoptSimplifier.simplify(idx, src.pos, 3, target * 3, 1);
    // non-manifold joins (common in Meshy output) lock vertices; a permissive pass lets those go too
    if (out.length > target * 3.3) [out] = MeshoptSimplifier.simplify(out, src.pos, 3, target * 3, 1, ["Permissive"]);
  }
  const used = new Map<number, number>();
  const outIdx = out.map((i) => { let j = used.get(i); if (j === undefined) used.set(i, j = used.size); return j; });
  const pos = new Float32Array(used.size * 3), orig = new Uint32Array(used.size);
  for (const [i, j] of used) { pos.set(src.pos.subarray(i * 3, i * 3 + 3), j * 3); orig[j] = i; }
  return { pos, idx: outIdx, orig };
}

/** Fresh UV atlas for the low mesh (padded charts, `size` px). Vertices split at the new seams. */
function unwrap(low: { pos: Float32Array; idx: Uint32Array }, size: number): { pos: Float32Array; uv: Float32Array; idx: Uint32Array; xref: Uint32Array } {
  const atlas = new watlas.Atlas();
  atlas.addMesh({ vertexPositionData: low.pos, vertexCount: low.pos.length / 3, vertexPositionStride: 12, indexData: low.idx, indexCount: low.idx.length });
  atlas.generate({}, { resolution: size, padding: 4, bilinear: true });
  const m = atlas.getMesh(0);
  const pos = new Float32Array(m.vertexCount * 3), uv = new Float32Array(m.vertexCount * 2), xref = new Uint32Array(m.vertexCount);
  for (let i = 0; i < m.vertexCount; i++) {
    const v = m.getVertex(i);
    xref[i] = v.xref;
    pos.set(low.pos.subarray(v.xref * 3, v.xref * 3 + 3), i * 3);
    uv[i * 2] = v.uv[0] / atlas.width;
    uv[i * 2 + 1] = v.uv[1] / atlas.height;
  }
  const idx = new Uint32Array(m.indexCount);
  m.getIndexArray(idx);
  atlas.delete();
  return { pos, uv, idx, xref };
}

/**
 * Smooth normals with a crease: each corner averages the faces round its position (across UV seams)
 * that turn less than `crease` degrees from its own, so curves shade round and hard edges stay hard.
 * Vertices split where one position needs two normals; `from` is each output vertex's input vertex.
 */
function smooth(low: { pos: Float32Array; uv: Float32Array; idx: Uint32Array }, crease = 40): { pos: Float32Array; uv: Float32Array; nrm: Float32Array; idx: Uint32Array; from: Uint32Array } {
  const nTri = low.idx.length / 3, area = new Float32Array(nTri * 3), unit = new Float32Array(nTri * 3);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let t = 0; t < nTri; t++) {
    a.fromArray(low.pos, low.idx[t * 3]! * 3); b.fromArray(low.pos, low.idx[t * 3 + 1]! * 3); c.fromArray(low.pos, low.idx[t * 3 + 2]! * 3);
    c.sub(b); b.sub(a); b.cross(c);
    b.toArray(area, t * 3);
    b.normalize().toArray(unit, t * 3);
  }
  const key = (v: number): string => `${low.pos[v * 3]!.toFixed(5)},${low.pos[v * 3 + 1]!.toFixed(5)},${low.pos[v * 3 + 2]!.toFixed(5)}`;
  const around = new Map<string, number[]>();
  for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) {
    const id = key(low.idx[t * 3 + k]!);
    let l = around.get(id);
    if (!l) around.set(id, l = []);
    l.push(t);
  }
  const cos = Math.cos((crease * Math.PI) / 180), split = new Map<string, number>();
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], from: number[] = [], idx = new Uint32Array(low.idx.length);
  for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) {
    const v = low.idx[t * 3 + k]!;
    a.set(0, 0, 0);
    for (const f of around.get(key(v))!) {
      if (unit[f * 3]! * unit[t * 3]! + unit[f * 3 + 1]! * unit[t * 3 + 1]! + unit[f * 3 + 2]! * unit[t * 3 + 2]! < cos) continue;
      a.x += area[f * 3]!; a.y += area[f * 3 + 1]!; a.z += area[f * 3 + 2]!;
    }
    a.normalize();
    const id = `${v}|${a.x.toFixed(3)},${a.y.toFixed(3)},${a.z.toFixed(3)}`;
    let j = split.get(id);
    if (j === undefined) {
      split.set(id, j = pos.length / 3);
      pos.push(low.pos[v * 3]!, low.pos[v * 3 + 1]!, low.pos[v * 3 + 2]!);
      uv.push(low.uv[v * 2]!, low.uv[v * 2 + 1]!);
      nrm.push(a.x, a.y, a.z);
      from.push(v);
    }
    idx[t * 3 + k] = j;
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), nrm: new Float32Array(nrm), idx, from: Uint32Array.from(from) };
}

interface Fat { pos: Float32Array; uv: Float32Array; nrm: Float32Array | undefined; idx: Uint32Array; joints: Uint16Array; weights: Float32Array }

/** See MeshyEntry.round. */
function roundOff(m: Fat, names: string[], cfg: NonNullable<MeshyEntry["round"]>): Fat {
  const re = new RegExp(cfg.bones), isHand = names.map((n) => re.test(n));
  let { pos, uv, nrm, idx, joints, weights } = m;
  const hasN = !!nrm;
  for (let pass = 0; pass < (cfg.subdiv ?? 1); pass++) {
    const nV = pos.length / 3, mid = new Map<number, number>();
    const P = Array.from(pos), U = Array.from(uv), N = nrm ? Array.from(nrm) : [], J = Array.from(joints), W = Array.from(weights), I: number[] = [];
    const split = (a: number, b: number): number => {
      const k = a < b ? a * nV + b : b * nV + a;
      let v = mid.get(k);
      if (v !== undefined) return v;
      v = P.length / 3;
      mid.set(k, v);
      for (let c = 0; c < 3; c++) P.push((pos[a * 3 + c]! + pos[b * 3 + c]!) / 2);
      U.push((uv[a * 2]! + uv[b * 2]!) / 2, (uv[a * 2 + 1]! + uv[b * 2 + 1]!) / 2);
      if (nrm) { const x = nrm[a * 3]! + nrm[b * 3]!, y = nrm[a * 3 + 1]! + nrm[b * 3 + 1]!, z = nrm[a * 3 + 2]! + nrm[b * 3 + 2]!, l = Math.hypot(x, y, z) || 1; N.push(x / l, y / l, z / l); }
      const acc = new Map<number, number>();
      for (const q of [a, b]) for (let k2 = 0; k2 < 4; k2++) acc.set(joints[q * 4 + k2]!, (acc.get(joints[q * 4 + k2]!) ?? 0) + weights[q * 4 + k2]! / 2);
      const top = [...acc].filter(([, w]) => w > 0).sort((x, y) => y[1] - x[1]).slice(0, 4), sum = top.reduce((t, [, w]) => t + w, 0) || 1;
      for (let k2 = 0; k2 < 4; k2++) { J.push(top[k2]?.[0] ?? 0); W.push(top[k2] ? top[k2]![1] / sum : 0); }
      return v;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!, ab = split(a, b), bc = split(b, c), ca = split(c, a);
      I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    pos = Float32Array.from(P); uv = Float32Array.from(U); if (hasN) nrm = Float32Array.from(N); idx = Uint32Array.from(I); joints = Uint16Array.from(J); weights = Float32Array.from(W);
  }
  const n = pos.length / 3, mask = new Float32Array(n);
  for (let v = 0; v < n; v++) for (let k = 0; k < 4; k++) if (isHand[joints[v * 4 + k]!]) mask[v] = mask[v]! + weights[v * 4 + k]!;
  // vertices sharing a position (UV seams) move together
  const keyOf = (v: number): string => `${pos[v * 3]!.toFixed(5)},${pos[v * 3 + 1]!.toFixed(5)},${pos[v * 3 + 2]!.toFixed(5)}`;
  const gid = new Map<string, number>(), group = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = keyOf(v); let g = gid.get(k); if (g === undefined) gid.set(k, g = gid.size); group[v] = g; }
  const G = gid.size, gmask = new Float32Array(G), gpos = new Float64Array(G * 3);
  for (let v = 0; v < n; v++) { const g = group[v]!; gmask[g] = Math.max(gmask[g]!, mask[v]!); for (let c = 0; c < 3; c++) gpos[g * 3 + c] = pos[v * 3 + c]!; }
  const nb: Set<number>[] = Array.from({ length: G }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = group[idx[t + k]!]!, b = group[idx[t + (k + 1) % 3]!]!; nb[a]!.add(b); nb[b]!.add(a); }
  for (let it = 0; it < (cfg.iterations ?? 8); it++) for (const f of [0.5, -0.53]) {
    const next = Float64Array.from(gpos);
    for (let g = 0; g < G; g++) {
      const w = gmask[g]!;
      if (w < 0.05 || !nb[g]!.size) continue;
      for (let c = 0; c < 3; c++) { let avg = 0; for (const o of nb[g]!) avg += gpos[o * 3 + c]!; avg /= nb[g]!.size; next[g * 3 + c] = gpos[g * 3 + c]! + f * w * (avg - gpos[g * 3 + c]!); }
    }
    gpos.set(next);
  }
  for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) pos[v * 3 + c] = gpos[group[v]! * 3 + c]!;
  if (nrm) {
    const acc = new Float64Array(G * 3), a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromArray(pos, idx[t]! * 3); b.fromArray(pos, idx[t + 1]! * 3); c.fromArray(pos, idx[t + 2]! * 3);
      c.sub(b); b.sub(a); b.cross(c);
      for (let k = 0; k < 3; k++) { const g = group[idx[t + k]!]!; acc[g * 3] = acc[g * 3]! + b.x; acc[g * 3 + 1] = acc[g * 3 + 1]! + b.y; acc[g * 3 + 2] = acc[g * 3 + 2]! + b.z; }
    }
    for (let v = 0; v < n; v++) {
      const w = Math.min(1, mask[v]! * 1.5), g = group[v]!;
      if (w < 0.05) continue;
      const l = Math.hypot(acc[g * 3]!, acc[g * 3 + 1]!, acc[g * 3 + 2]!) || 1;
      const x = nrm[v * 3]! * (1 - w) + (acc[g * 3]! / l) * w, y = nrm[v * 3 + 1]! * (1 - w) + (acc[g * 3 + 1]! / l) * w, z = nrm[v * 3 + 2]! * (1 - w) + (acc[g * 3 + 2]! / l) * w, m2 = Math.hypot(x, y, z) || 1;
      nrm[v * 3] = x / m2; nrm[v * 3 + 1] = y / m2; nrm[v * 3 + 2] = z / m2;
    }
  }
  return { pos, uv, nrm, idx, joints, weights };
}

type Paint =(p: Vector3, n: Vector3, rgba: Buffer, o: number) => void;

/**
 * Lettering projected onto a model's broad faces (both sides of a flat object, like a case):
 * `decal` = [x0, y0, x1, y1] in fitted art metres on the faces facing ±z. Letters are drawn as
 * SVG paths (no font needed) and blended in dark, so they read as stamped into the surface.
 */
async function lettering(text: string, box: number[]): Promise<Paint> {
  const glyph: Record<string, string> = {
    V: "M0,0 h30 l25,75 l25,-75 h30 l-40,100 h-30 z",
    I: "M0,0 h30 v100 h-30 z",
    P: "M0,0 h55 a35,35 0 0 1 0,70 h-25 v30 h-30 z M30,25 v20 h22 a10,10 0 0 0 0,-20 z",
  };
  const adv: Record<string, number> = { V: 125, I: 45, P: 100 };
  let x = 10, paths = "";
  for (const ch of text) { paths += `<path transform="translate(${x},10)" fill-rule="evenodd" d="${glyph[ch] ?? ""}"/>`; x += adv[ch] ?? 60; }
  const W = x, H = 120;
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="black"/><g fill="white">${paths}</g></svg>`)).greyscale().raw().toBuffer();
  const [x0, y0, x1, y1] = box as [number, number, number, number];
  const ink = [46, 34, 16];
  return (p, n, rgba, o) => {
    if (Math.abs(n.z) < 0.8) return;
    // the far side is seen from behind: mirror so it reads left to right there too
    const u = n.z > 0 ? (p.x - x0) / (x1 - x0) : (x1 - p.x) / (x1 - x0), v = (y1 - p.y) / (y1 - y0);
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return;
    const k = 0.9 * mask[Math.floor(v * H) * W + Math.floor(u * W)]! / 255;
    for (let ch = 0; ch < 3; ch++) rgba[o + ch] = Math.round(rgba[o + ch]! * (1 - k) + ink[ch]! * k);
  };
}

/** Fill each texel of the low atlas from the closest point on the high mesh's texture. */
function bake(src: Src, low: { pos: Float32Array; uv: Float32Array; nrm?: Float32Array | undefined; idx: Uint32Array }, size: number, paint?: Paint, nm?: Buffer): Buffer {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(src.pos, 3));
  geo.setIndex(new BufferAttribute(src.idx, 1));
  const bvh = new MeshBVH(geo);
  const out = Buffer.alloc(size * size * 4);
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const p = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3(), bc = new Vector3(), nrm = new Vector3(), tri = new Triangle();
  const { data, w, h } = src.tex;
  const sample = (u: number, v: number, o: number): void => {
    // bilinear, wrapping like the GPU sampler (Meshy UVs stay in 0..1)
    const x = u * w - 0.5, y = v * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for (let ch = 0; ch < 3; ch++) {
      const at = (xx: number, yy: number): number => data[((((yy % h) + h) % h) * w + (((xx % w) + w) % w)) * 4 + ch]!;
      out[o + ch] = Math.round((at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy);
    }
    out[o + 3] = 255;
  };
  for (let t = 0; t < low.idx.length; t += 3) {
    const [i0, i1, i2] = [low.idx[t]!, low.idx[t + 1]!, low.idx[t + 2]!];
    const u = [low.uv[i0 * 2]! * size, low.uv[i1 * 2]! * size, low.uv[i2 * 2]! * size];
    const v = [low.uv[i0 * 2 + 1]! * size, low.uv[i1 * 2 + 1]! * size, low.uv[i2 * 2 + 1]! * size];
    a.fromArray(low.pos, i0 * 3); b.fromArray(low.pos, i1 * 3); c.fromArray(low.pos, i2 * 3);
    if (paint) tri.set(a, b, c).getNormal(nrm);
    // tangent frame from the UV derivatives (glTF: green points up the image), as three derives it
    let tT: Vector3 | undefined, tB: Vector3 | undefined;
    if (nm && low.nrm) {
      const e1 = b.clone().sub(a), e2 = c.clone().sub(a);
      const du1 = (u[1]! - u[0]!) / size, du2 = (u[2]! - u[0]!) / size, dv1 = (v[1]! - v[0]!) / size, dv2 = (v[2]! - v[0]!) / size;
      const d = du1 * dv2 - du2 * dv1;
      if (Math.abs(d) > 1e-12) {
        tT = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(d);
        tB = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(d).negate();
      }
    }
    const det = (v[1]! - v[2]!) * (u[0]! - u[2]!) + (u[2]! - u[1]!) * (v[0]! - v[2]!);
    if (Math.abs(det) < 1e-9) continue;
    const xmin = Math.max(0, Math.floor(Math.min(...u) - 1)), xmax = Math.min(size - 1, Math.ceil(Math.max(...u) + 1));
    const ymin = Math.max(0, Math.floor(Math.min(...v) - 1)), ymax = Math.min(size - 1, Math.ceil(Math.max(...v) + 1));
    for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) {
      const px = x + 0.5, py = y + 0.5;
      let l0 = ((v[1]! - v[2]!) * (px - u[2]!) + (u[2]! - u[1]!) * (py - v[2]!)) / det;
      let l1 = ((v[2]! - v[0]!) * (px - u[2]!) + (u[0]! - u[2]!) * (py - v[2]!)) / det;
      let l2 = 1 - l0 - l1;
      // texels whose centre falls just outside still get a value (conservative edges)
      const eps = 1.2 / Math.sqrt(Math.abs(det));
      if (l0 < -eps || l1 < -eps || l2 < -eps) continue;
      const o = (y * size + x) * 4;
      if (out[o + 3] && (l0 < 0 || l1 < 0 || l2 < 0)) continue;
      l0 = Math.max(0, l0); l1 = Math.max(0, l1); l2 = Math.max(0, l2);
      const sum = l0 + l1 + l2;
      p.set(0, 0, 0).addScaledVector(a, l0 / sum).addScaledVector(b, l1 / sum).addScaledVector(c, l2 / sum);
      if (!bvh.closestPointToPoint(p, hit)) continue;
      const f = hit.faceIndex * 3, j0 = src.idx[f]!, j1 = src.idx[f + 1]!, j2 = src.idx[f + 2]!;
      tri.a.fromArray(src.pos, j0 * 3); tri.b.fromArray(src.pos, j1 * 3); tri.c.fromArray(src.pos, j2 * 3);
      tri.getBarycoord(hit.point, bc);
      sample(src.uv[j0 * 2]! * bc.x + src.uv[j1 * 2]! * bc.y + src.uv[j2 * 2]! * bc.z, src.uv[j0 * 2 + 1]! * bc.x + src.uv[j1 * 2 + 1]! * bc.y + src.uv[j2 * 2 + 1]! * bc.z, o);
      paint?.(p, nrm, out, o);
      if (nm && low.nrm && tT && tB) {
        // the original's face normal here, in the low mesh's tangent space
        const hn = tri.getNormal(new Vector3());
        const q = [i0, i1, i2], ws = [l0 / sum, l1 / sum, l2 / sum], vn = new Vector3();
        for (let k = 0; k < 3; k++) { vn.x += low.nrm[q[k]! * 3]! * ws[k]!; vn.y += low.nrm[q[k]! * 3 + 1]! * ws[k]!; vn.z += low.nrm[q[k]! * 3 + 2]! * ws[k]!; }
        vn.normalize();
        const T = tT.clone().addScaledVector(vn, -vn.dot(tT)).normalize();
        const B = new Vector3().crossVectors(vn, T);
        if (B.dot(tB) < 0) B.negate();
        nm[o] = Math.round((hn.dot(T) * 0.5 + 0.5) * 255); nm[o + 1] = Math.round((hn.dot(B) * 0.5 + 0.5) * 255); nm[o + 2] = Math.round((hn.dot(vn) * 0.5 + 0.5) * 255); nm[o + 3] = 255;
      }
    }
  }
  dilate(out, size, 8);
  if (nm) dilate(nm, size, 8);
  return out;
}

/** Grow filled texels into the empty ones around them, so mip levels never pull in black. */
function dilate(img: Buffer, size: number, passes: number): void {
  for (let n = 0; n < passes; n++) {
    const src = Buffer.from(img);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      if (src[o + 3]) continue;
      let r = 0, g = 0, b = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const q = (yy * size + xx) * 4;
        if (!src[q + 3]) continue;
        r += src[q]!; g += src[q + 1]!; b += src[q + 2]!; k++;
      }
      if (k) { img[o] = r / k; img[o + 1] = g / k; img[o + 2] = b / k; img[o + 3] = 255; }
    }
  }
  // what is still empty sits between charts: give it the mean so it never shows as a hole
  let r = 0, g = 0, b = 0, k = 0;
  for (let o = 0; o < img.length; o += 4) if (img[o + 3]) { r += img[o]!; g += img[o + 1]!; b += img[o + 2]!; k++; }
  for (let o = 0; o < img.length; o += 4) if (!img[o + 3]) { img[o] = r / k; img[o + 1] = g / k; img[o + 2] = b / k; img[o + 3] = 255; }
}

/** A one-mesh GLB: positions, UVs and smooth normals if given (without them three flat-shades it). */
async function writeGlb(low: { pos: Float32Array; uv: Float32Array; nrm?: Float32Array; idx: Uint32Array }, rgba: Buffer, size: number, e: MeshyEntry, nmap?: Buffer): Promise<Uint8Array> {
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buf = doc.createBuffer();
  const webp = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).removeAlpha().webp({ quality: 82 }).toBuffer();
  const tex = doc.createTexture("albedo").setImage(new Uint8Array(webp)).setMimeType("image/webp");
  const mat = doc.createMaterial("meshy").setBaseColorTexture(tex).setRoughnessFactor(e.rough ?? 0.9).setMetallicFactor(e.metal ?? 0);
  if (nmap) {
    const nw = await sharp(nmap, { raw: { width: size, height: size, channels: 4 } }).removeAlpha().webp({ quality: 88 }).toBuffer();
    mat.setNormalTexture(doc.createTexture("normal").setImage(new Uint8Array(nw)).setMimeType("image/webp"));
  }
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(low.pos)).setBuffer(buf))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(low.uv)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(low.idx.length / 3 < 65536 && low.pos.length / 3 < 65536 ? Uint16Array.from(low.idx) : new Uint32Array(low.idx)).setBuffer(buf))
    .setMaterial(mat);
  if (low.nrm) prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(low.nrm)).setBuffer(buf));
  doc.createScene().addChild(doc.createNode("body").setMesh(doc.createMesh("body").addPrimitive(prim)));
  await doc.transform(quantize());
  return io.writeBinary(doc);
}

/** The blueprint outline: the same shape cut to a few hundred triangles, positions only. */
async function writeOutline(low: { pos: Float32Array; idx: Uint32Array }): Promise<Uint8Array> {
  const doc = new Document();
  const buf = doc.createBuffer();
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(low.pos)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint16Array.from(low.idx)).setBuffer(buf));
  doc.createScene().addChild(doc.createNode("outline").setMesh(doc.createMesh("outline").addPrimitive(prim)));
  return io.writeBinary(doc);
}

/**
 * A rigged character (Meshy Remesh + Animate): the same shape-only bake, but in bind-pose space
 * and with each kept vertex's skin weights carried over from the original (simplification only
 * keeps original vertices; smooth() splits map back through `from`), cut to the four strongest joints. The skeleton, bind matrices and
 * clips stay as they are; keyframes are resampled. No fit: the renderer scales it to `height`.
 */
async function buildCharacter(e: MeshyEntry, path: string): Promise<{ glb: Uint8Array; tris: number; srcTris: number; bounds: BuiltEntry["bounds"] }> {
  const doc = await io.read(path);
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  const prim = prims.find((p) => p.getAttribute("JOINTS_0"));
  if (!prim || prims.length !== 1) throw new Error(`expected one skinned primitive, got ${prims.length}`);
  const read = (name: string): number[][] => {
    const a = prim.getAttribute(name)!, out: number[][] = [];
    for (let i = 0; i < a.getCount(); i++) out.push(a.getElement(i, []));
    return out;
  };
  const sets = prim.listSemantics().filter((n) => n.startsWith("JOINTS_")).map((n) => [read(n), read(n.replace("JOINTS", "WEIGHTS"))] as const);
  const img = prim.getMaterial()!.getBaseColorTexture()!.getImage()!;
  const raw = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (e.tint === "navy") navy(raw.data);
  const src: Src = {
    pos: new Float32Array(prim.getAttribute("POSITION")!.getArray()!), uv: new Float32Array(prim.getAttribute("TEXCOORD_0")!.getArray()!),
    idx: Uint32Array.from(prim.getIndices()!.getArray()!), tex: { data: raw.data, w: raw.info.width, h: raw.info.height },
  };
  // FBX-style exports (the hoppers) keep the mesh in centimetres under a 0.01 armature, about 3 mm
  // across: simplify, unwrap and bake at a metre scale, then hand the positions back at the source's
  let lo = Infinity, hi = -Infinity;
  for (const v of src.pos) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const up = hi - lo < 0.1 ? 1.7 / (hi - lo) : 1;
  if (up !== 1) for (let i = 0; i < src.pos.length; i++) src.pos[i]! *= up;
  if (e.drop?.length) {
    const inside = (v: number): boolean => e.drop!.some((b) => src.pos[v * 3]! >= b[0]! && src.pos[v * 3]! <= b[3]! && src.pos[v * 3 + 1]! >= b[1]! && src.pos[v * 3 + 1]! <= b[4]! && src.pos[v * 3 + 2]! >= b[2]! && src.pos[v * 3 + 2]! <= b[5]!);
    const keep: number[] = [];
    for (let t = 0; t < src.idx.length; t += 3) if (!(inside(src.idx[t]!) && inside(src.idx[t + 1]!) && inside(src.idx[t + 2]!))) keep.push(src.idx[t]!, src.idx[t + 1]!, src.idx[t + 2]!);
    console.log(`${e.file}: dropped ${(src.idx.length - keep.length) / 3} triangles`);
    src.idx = Uint32Array.from(keep);
  }
  const size = e.texture ?? 512;
  // `error` is in art metres; the renderer scales the bind pose to `height` (or `length`, the longest side)
  let err = e.error;
  if (err !== undefined) {
    const r = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < src.pos.length; i += 3) for (let k = 0; k < 3; k++) { r[k] = Math.min(r[k]!, src.pos[i + k]!); r[k + 3] = Math.max(r[k + 3]!, src.pos[i + k]!); }
    const span = e.length ? Math.max(r[3]! - r[0]!, r[4]! - r[1]!, r[5]! - r[2]!) : r[4]! - r[1]!;
    err *= span / (e.length ?? e.height ?? 1.1);
  }
  const low = lowPoly(src, e.tris ?? (err !== undefined ? 30000 : 3000), err);
  const flat = unwrap(low, size);
  const out = err !== undefined ? smooth(flat) : { ...flat, nrm: undefined, from: undefined };
  const n0 = out.pos.length / 3;
  let joints: Uint16Array = new Uint16Array(n0 * 4), weights: Float32Array = new Float32Array(n0 * 4);
  for (let v = 0; v < n0; v++) {
    const o = low.orig[flat.xref[out.from ? out.from[v]! : v]!]!;
    const all = sets.flatMap(([j, w]) => j[o]!.map((jj, k) => [jj, w[o]![k]!] as const)).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = all.reduce((t, [, w]) => t + w, 0) || 1;
    all.forEach(([jj, w], k) => { joints[v * 4 + k] = jj; weights[v * 4 + k] = w / sum; });
  }
  const rgba = bake(src, out, size);
  let fin: Fat = { pos: out.pos, uv: out.uv, nrm: out.nrm, idx: out.idx, joints, weights };
  if (e.round) {
    fin = roundOff(fin, doc.getRoot().listSkins()[0]!.listJoints().map((j) => j.getName()), e.round);
    console.log(`${e.file}: rounded, ${out.idx.length / 3} -> ${fin.idx.length / 3} tris`);
  }
  const n = fin.pos.length / 3;
  joints = fin.joints; weights = fin.weights;
  Object.assign(out, { pos: fin.pos, uv: fin.uv, idx: fin.idx, ...(fin.nrm ? { nrm: fin.nrm } : {}) });
  if (up !== 1) for (let i = 0; i < out.pos.length; i++) out.pos[i]! /= up;
  const webp = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).removeAlpha().webp({ quality: 82 }).toBuffer();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buf = doc.getRoot().listBuffers()[0]!;
  for (const name of prim.listSemantics()) prim.setAttribute(name, null);
  prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(out.pos)).setBuffer(buf))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(out.uv)).setBuffer(buf))
    .setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(new Uint16Array(joints)).setBuffer(buf))
    .setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(new Float32Array(weights)).setBuffer(buf))
    .setAttribute("NORMAL", out.nrm ? doc.createAccessor().setType("VEC3").setArray(new Float32Array(out.nrm)).setBuffer(buf) : null)
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(n < 65536 ? Uint16Array.from(out.idx) : new Uint32Array(out.idx)).setBuffer(buf));
  const tex = doc.createTexture("albedo").setImage(new Uint8Array(webp)).setMimeType("image/webp");
  prim.getMaterial()!.setBaseColorTexture(tex).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null)
    .setRoughnessFactor(e.rough ?? 0.9).setMetallicFactor(e.metal ?? 0)
    // FBX-style exports set emissive to white (a glowing white figure) and add specular/ior
    .setEmissiveFactor([0, 0, 0]);
  for (const x of doc.getRoot().listExtensionsUsed()) if (x.extensionName.startsWith("KHR_materials_")) x.dispose();
  await doc.transform(resample(), prune(), dedup());
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < out.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k]!, out.pos[i + k]!); b[k + 3] = Math.max(b[k + 3]!, out.pos[i + k]!); }
  return { glb: await io.writeBinary(doc), tris: out.idx.length / 3, srcTris: src.idx.length / 3, bounds: b.map((v) => Math.round(v * 1000) / 1000) as BuiltEntry["bounds"] };
}

async function build(e: MeshyEntry): Promise<void> {
  const path = join(SRC, e.src);
  if (!existsSync(path)) { console.warn(`skip ${e.file}: ${path} not found`); return; }
  if (e.kind === "character") {
    const t0 = Date.now();
    const c = await buildCharacter(e, path);
    writeFileSync(join(OUT, `${e.file}.glb`), c.glb);
    built[e.file] = { hash: createHash("sha1").update(c.glb).digest("hex").slice(0, 10), tris: c.tris, bytes: c.glb.byteLength, bounds: c.bounds };
    console.log(`${e.file}: rigged, ${c.srcTris} → ${c.tris} tris, ${(c.glb.byteLength / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return;
  }
  const t0 = Date.now();
  let src = await loadSource(path, e.tint);
  if (e.crop !== undefined) src = cropAbove(src, e.crop);
  if (e.mirror) {
    for (let i = 2; i < src.pos.length; i += 3) src.pos[i] = -src.pos[i]!;
    for (let i = 0; i < src.idx.length; i += 3) { const t = src.idx[i + 1]!; src.idx[i + 1] = src.idx[i + 2]!; src.idx[i + 2] = t; }
  }
  const bounds = fit(src.pos, e);
  const paint = e.decal ? await lettering(e.decal.text, e.decal.box) : undefined;
  const size = e.texture ?? 1024;
  const unwrapped = unwrap(lowPoly(src, e.tris ?? (e.error !== undefined ? 30000 : 3000), e.error), size);
  const low = e.error !== undefined ? smooth(unwrapped) : unwrapped;
  const nmap = e.normalMap ? Buffer.alloc(size * size * 4) : undefined;
  const glb = await writeGlb(low, bake(src, low, size, paint, nmap), size, e, nmap);
  writeFileSync(join(OUT, `${e.file}.glb`), glb);
  const hash = (b: Uint8Array): string => createHash("sha1").update(b).digest("hex").slice(0, 10);
  built[e.file] = { hash: hash(glb), tris: low.idx.length / 3, bytes: glb.byteLength, bounds };
  if (e.lod) {
    const small = unwrap(lowPoly(src, e.lod), size);
    const lod = await writeGlb(small, bake(src, small, size, paint), size, e);
    writeFileSync(join(OUT, `${e.file}.lod.glb`), lod);
    built[e.file]!.lod = { hash: hash(lod), tris: small.idx.length / 3, bytes: lod.byteLength };
  }
  if (outlined.has(e.file)) {
    const ghost = lowPoly(src, e.outlineTris ?? 250);
    const outline = await writeOutline(ghost);
    writeFileSync(join(OUT, `${e.file}.outline.glb`), outline);
    built[e.file]!.outline = { hash: hash(outline), tris: ghost.idx.length / 3, bytes: outline.byteLength };
  }
  console.log(`${e.file}: ${src.idx.length / 3} → ${low.idx.length / 3} tris (outline ${built[e.file]!.outline?.tris ?? 0}, lod ${built[e.file]!.lod?.tris ?? 0}), ${(glb.byteLength / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// Entries may share a file (decor reused as a per-level node): same source and fit, so it is built
// once, with an outline if any of them is a building (props and wall sections get none).
const FIT = ["src", "yaw", "width", "height", "length", "offset", "error", "tris", "texture", "tint", "decal", "rough", "metal", "lod", "normalMap", "mirror", "crop"] as const;
const first = new Map<string, MeshyEntry>(), outlined = new Set<string>();
for (const e of config.models) {
  const f = first.get(e.file);
  if (!f) first.set(e.file, e);
  else for (const k of FIT) if (JSON.stringify(f[k]) !== JSON.stringify(e[k])) throw new Error(`${e.file}: entries sharing the file differ in ${k}; give one its own file`);
  if (!e.kind && !e.batch) outlined.add(e.file);
}
for (const e of first.values()) if (!only.length || only.includes(e.file)) await build(e);
writeFileSync(BUILT, JSON.stringify(built, null, 2) + "\n");

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
import { dedup, flatten, join as joinMeshes, quantize, transformMesh, weld } from "@gltf-transform/functions";
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
  tris?: number; texture?: number; outlineTris?: number;
  /** Recolour the base colour before baking ("gold": brushed warm gold, darks kept). */
  tint?: "gold";
  /** Material factors (default rough 0.9, metal 0). */
  rough?: number; metal?: number;
  /** "prop": held item; props and wall sections (batch) get no blueprint outline. */
  batch?: string;
  kind?: "prop";
  /** Also write <file>.lod.glb at this many triangles (props drawn on the code-built crowd). */
  lod?: number;
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

/** Shape-only simplification: weld by position (UV seams gone), then meshopt to the target. */
function lowPoly(src: Src, target: number): { pos: Float32Array; idx: Uint32Array } {
  const remap = MeshoptSimplifier.generatePositionRemap(src.pos, 3);
  const idx = src.idx.map((i) => remap[i]!);
  let [out] = MeshoptSimplifier.simplify(idx, src.pos, 3, target * 3, 1);
  // non-manifold joins (common in Meshy output) lock vertices; a permissive pass lets those go too
  if (out.length > target * 3.3) [out] = MeshoptSimplifier.simplify(out, src.pos, 3, target * 3, 1, ["Permissive"]);
  const used = new Map<number, number>();
  const outIdx = out.map((i) => { let j = used.get(i); if (j === undefined) used.set(i, j = used.size); return j; });
  const pos = new Float32Array(used.size * 3);
  for (const [i, j] of used) pos.set(src.pos.subarray(i * 3, i * 3 + 3), j * 3);
  return { pos, idx: outIdx };
}

/** Fresh UV atlas for the low mesh (padded charts, `size` px). Vertices split at the new seams. */
function unwrap(low: { pos: Float32Array; idx: Uint32Array }, size: number): { pos: Float32Array; uv: Float32Array; idx: Uint32Array } {
  const atlas = new watlas.Atlas();
  atlas.addMesh({ vertexPositionData: low.pos, vertexCount: low.pos.length / 3, vertexPositionStride: 12, indexData: low.idx, indexCount: low.idx.length });
  atlas.generate({}, { resolution: size, padding: 4, bilinear: true });
  const m = atlas.getMesh(0);
  const pos = new Float32Array(m.vertexCount * 3), uv = new Float32Array(m.vertexCount * 2);
  for (let i = 0; i < m.vertexCount; i++) {
    const v = m.getVertex(i);
    pos.set(low.pos.subarray(v.xref * 3, v.xref * 3 + 3), i * 3);
    uv[i * 2] = v.uv[0] / atlas.width;
    uv[i * 2 + 1] = v.uv[1] / atlas.height;
  }
  const idx = new Uint32Array(m.indexCount);
  m.getIndexArray(idx);
  atlas.delete();
  return { pos, uv, idx };
}

/** Fill each texel of the low atlas from the closest point on the high mesh's texture. */
function bake(src: Src, low: { pos: Float32Array; uv: Float32Array; idx: Uint32Array }, size: number): Buffer {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(src.pos, 3));
  geo.setIndex(new BufferAttribute(src.idx, 1));
  const bvh = new MeshBVH(geo);
  const out = Buffer.alloc(size * size * 4);
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const p = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3(), bc = new Vector3(), tri = new Triangle();
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
    }
  }
  dilate(out, size, 8);
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

/** A one-mesh GLB: positions and UVs only (no normals: three flat-shades it, like the code models). */
async function writeGlb(low: { pos: Float32Array; uv: Float32Array; idx: Uint32Array }, rgba: Buffer, size: number, e: MeshyEntry): Promise<Uint8Array> {
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buf = doc.createBuffer();
  const webp = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).removeAlpha().webp({ quality: 82 }).toBuffer();
  const tex = doc.createTexture("albedo").setImage(new Uint8Array(webp)).setMimeType("image/webp");
  const mat = doc.createMaterial("meshy").setBaseColorTexture(tex).setRoughnessFactor(e.rough ?? 0.9).setMetallicFactor(e.metal ?? 0);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(low.pos)).setBuffer(buf))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(low.uv)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(low.idx.length / 3 < 65536 && low.pos.length / 3 < 65536 ? Uint16Array.from(low.idx) : new Uint32Array(low.idx)).setBuffer(buf))
    .setMaterial(mat);
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

async function build(e: MeshyEntry): Promise<void> {
  const path = join(SRC, e.src);
  if (!existsSync(path)) { console.warn(`skip ${e.file}: ${path} not found`); return; }
  const t0 = Date.now();
  const src = await loadSource(path, e.tint);
  const bounds = fit(src.pos, e);
  const size = e.texture ?? 1024;
  const low = unwrap(lowPoly(src, e.tris ?? 3000), size);
  const glb = await writeGlb(low, bake(src, low, size), size, e);
  writeFileSync(join(OUT, `${e.file}.glb`), glb);
  const hash = (b: Uint8Array): string => createHash("sha1").update(b).digest("hex").slice(0, 10);
  built[e.file] = { hash: hash(glb), tris: low.idx.length / 3, bytes: glb.byteLength, bounds };
  if (e.lod) {
    const small = unwrap(lowPoly(src, e.lod), size);
    const lod = await writeGlb(small, bake(src, small, size), size, e);
    writeFileSync(join(OUT, `${e.file}.lod.glb`), lod);
    built[e.file]!.lod = { hash: hash(lod), tris: small.idx.length / 3, bytes: lod.byteLength };
  }
  if (e.kind !== "prop" && !e.batch) {
    const ghost = lowPoly(src, e.outlineTris ?? 250);
    const outline = await writeOutline(ghost);
    writeFileSync(join(OUT, `${e.file}.outline.glb`), outline);
    built[e.file]!.outline = { hash: hash(outline), tris: ghost.idx.length / 3, bytes: outline.byteLength };
  }
  console.log(`${e.file}: ${src.idx.length / 3} → ${low.idx.length / 3} tris (outline ${built[e.file]!.outline?.tris ?? 0}, lod ${built[e.file]!.lod?.tris ?? 0}), ${(glb.byteLength / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

for (const e of config.models) if (!only.length || only.includes(e.file)) await build(e);
writeFileSync(BUILT, JSON.stringify(built, null, 2) + "\n");

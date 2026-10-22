import { BufferAttribute, BufferGeometry, Euler, Group, Matrix4, Quaternion, Vector3, type AnimationClip, type Material, type Mesh, type Object3D } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AnchorName } from "../ids.js";
import { disposeGeo, getAnchor, type Model } from "./common.js";
import built from "./meshy.built.json";
import config from "./meshy.json";

// Meshy models (docs/MESHY-ASSETS.md): textured GLBs that stand in for the code-built bodies.
// The code model is always built first and stays the fallback: until a GLB has loaded (or if it
// fails), nothing changes. Once loaded, the meshes an entry names in `replace` give way to the
// GLB, and the animated parts and anchors the renderer drives stay, moved where the entry says.
// Entries with `slot` swap named meshes in place instead (gate doors, turret head) so the
// renderer keeps animating them; `batch` entries are instanced by the renderer (wall sections,
// meshyGeometry) and `kind: "prop"` entries are held items (meshyScene).

export interface MeshyEntry {
  file: string; src: string; id: string; level?: number;
  replace?: string[]; parts?: Record<string, number[]>; anchors?: Record<string, number[]>;
  /** Meshes this GLB swaps one for one, keeping their place; `mirror` ones flip on x. */
  slot?: string[]; mirror?: string[];
  /** Instanced by the renderer: a wall section (`depth` scales its thickness) or rockslide rubble. */
  batch?: "wall" | "reinforced" | "rubble"; depth?: number;
  /** prop: held; character: rigged; item: a resource unit (replaces the code item); decor: map-border dressing; belt: a conveyor kit piece. */
  kind?: "prop" | "character" | "item" | "decor" | "belt";
  /** Belt kit piece: tiled straight section, drive end (motor to +x), or 90° corner. */
  belt?: "segment" | "drive" | "corner";
  /** Belt segment: height of the belt bed (art metres) where goods ride. */
  top?: number;
  /** item: drawn for a loose drop on the ground instead of the stacking unit. */
  ground?: boolean;
  /** Fitted width in art metres (decor copies are spread at this size). */
  width?: number;
  /** Character clips by role (walk, run, idle, wait, cheer) → clip name in the file. */
  clips?: Record<string, string>;
  /** Character props by variant id ("*": every variant), see MeshyHeld. */
  held?: Record<string, MeshyHeld[]>;
  /** `clips` keys whose clip walks the body about: played on the spot (hips keep only their height). */
  inPlace?: string[];
  /** Left arm braced in a shield pose over every clip (the guard). */
  shieldArm?: boolean;
  /** Character height in art metres (the file keeps its own units and skeleton). */
  height?: number;
  /**
   * Character tool slots this prop fills (characters.ts part ids), each with its hand-attach
   * transform [x, y, z, rx, ry, rz, scale] (art metres, degrees) from the hand frame
   * (`push` slots: the body frame). Kept for the rigged Meshy characters' hand bones too.
   */
  tools?: Record<string, number[]>;
  /** Built but not used in the game yet (loaded only on request). */
  unwired?: boolean;
}

/** A prop on a rigged character (rigged.ts). */
export interface MeshyHeld {
  prop: string;
  /** On a bone at a fixed [x, y, z, rx, ry, rz, scale] (bone frame, model metres, degrees). */
  bone?: string; at?: number[];
  /** Pushed ahead: both hands reach for [x, y, z, half-width] (the cart). */
  grip?: number[];
  /**
   * Placed from a two-handed clip (`clip` at `t` of its length) and carried in the right hand:
   * "gun" barrel from the right hand through the left, "tool" handle from the left through the
   * right. `axis` is the prop's grip-to-muzzle (or head) direction, `side` its up (gun) or forward
   * (tool), `hold` the point that sits in the hand (fitted art metres). No axis: read off the mesh.
   */
  align?: "gun" | "tool"; clip?: string; t?: number; axis?: number[]; side?: number[]; hold?: number[];
  /** Strapped to the braced shield arm (entry `shieldArm`). */
  shield?: boolean;
  /** Size against the fitted art-metre size. */
  k?: number;
  /** Shown only during these actions (rig state `act`). */
  when?: string[];
}

const ENTRIES = (config as { models: MeshyEntry[] }).models;
const BUILT = built as Record<string, { hash: string; tris: number; bounds: number[]; outline?: { hash: string }; lod?: { hash: string } } | undefined>;

/** Loaded GLB scenes by file (shared geometry and materials; clones go into models). */
const cache = new Map<string, Group>();
/** Blueprint outlines by file: the same shape at a few hundred triangles (build pads draw these). */
const outlines = new Map<string, Group>();
/** Animation clips of rigged characters by file. */
const clips = new Map<string, AnimationClip[]>();
const pending = new Map<string, Promise<void>>();
let loader: Promise<GLTFLoader> | null = null;
let enabled = true;

/** Dev switch: false keeps every code model (budget comparisons). */
export function setMeshyEnabled(on: boolean): void { enabled = on; }

export function meshyEntries(): readonly MeshyEntry[] { return ENTRIES; }

/** The entry for an id at a level: an exact level match wins over a level-free entry. */
export function meshyFor(id: string, level = 1): MeshyEntry | undefined {
  return pick(ENTRIES.filter((e) => !e.slot && !e.batch && !e.kind), id, level);
}

/** Slot entries for an id at a level, one per slot set (the doors, the turret head). */
export function meshySlots(id: string, level = 1): MeshyEntry[] {
  const slots = ENTRIES.filter((e) => e.slot && !e.unwired);
  return [...new Set(slots.map((e) => e.slot!.join()))]
    .map((k) => pick(slots.filter((e) => e.slot!.join() === k), id, level))
    .filter((e): e is MeshyEntry => !!e);
}

function pick(list: readonly MeshyEntry[], id: string, level: number): MeshyEntry | undefined {
  // upgrade tiers registered as their own id (struct.ranged_defense.t2) share the base entry
  const base = id.replace(/\.t\d+$/, "");
  return list.find((e) => e.id === base && e.level === level) ?? list.find((e) => e.id === base && e.level === undefined);
}

export function meshyBounds(file: string): readonly number[] | undefined { return BUILT[file]?.bounds; }

export function meshyLoaded(file: string): boolean { return cache.has(file); }

/** The loaded scene (shared, not a copy) and clips of a rigged character file. */
export function meshyRig(file: string): { scene: Group; clips: AnimationClip[] } | undefined {
  const scene = cache.get(file);
  return scene && { scene, clips: clips.get(file) ?? [] };
}

/** Entries of rigged characters (`kind: "character"`). */
export function meshyCharacters(): readonly MeshyEntry[] { return ENTRIES.filter((e) => e.kind === "character"); }

/** A placed copy of a loaded GLB (held props, the dev fit page); undefined until it lands. */
export function meshyScene(file: string): Group | undefined {
  return cache.get(file)?.clone(true);
}

/** A loaded prop placed in each tool slot it fills (geometry per slot; the material is shared). */
export function meshyTools(e: MeshyEntry): { part: string; geo: BufferGeometry; mat: Material }[] {
  const d = Math.PI / 180;
  return Object.entries(e.tools ?? {}).flatMap(([part, h]) => {
    const g = meshyGeometry(e.file);
    if (!g) return [];
    const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, k = 1] = h;
    g.geo.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx * d, ry * d, rz * d)), new Vector3(k, k, k)));
    return [{ part, ...g }];
  });
}

/**
 * A loaded GLB as one plain geometry (node transform and quantization baked in) plus its
 * material, for instancing. Undefined until it lands.
 */
export function meshyGeometry(file: string): { geo: BufferGeometry; mat: Material } | undefined {
  const scene = cache.get(file);
  let src: Mesh | undefined;
  scene?.traverse((o) => { if (!src && (o as Mesh).isMesh) src = o as Mesh; });
  if (!scene || !src) return undefined;
  const m: Mesh = src;
  scene.updateMatrixWorld(true);
  const p = m.geometry.getAttribute("position"), uv = m.geometry.getAttribute("uv");
  const pos = new Float32Array(p.count * 3), v = new Vector3();
  for (let i = 0; i < p.count; i++) v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray(pos, i * 3);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  if (uv) {
    const t = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) { t[i * 2] = uv.getX(i); t[i * 2 + 1] = uv.getY(i); }
    geo.setAttribute("uv", new BufferAttribute(t, 2));
  }
  if (m.geometry.index) geo.setIndex(new BufferAttribute(Uint32Array.from(m.geometry.index.array), 1));
  geo.computeBoundingBox();
  return { geo, mat: m.material as Material };
}

/**
 * A straight conveyor run of `len` art metres along x from the belt kit: a drive end at each end
 * (motors outward, matched to the segment's width) and whole segments stretched to fill the
 * rest. Undefined until both pieces have loaded (the code belt stays).
 */
export function meshyBelt(len: number): Group | undefined {
  const seg = ENTRIES.find((e) => e.belt === "segment"), drv = ENTRIES.find((e) => e.belt === "drive");
  const s = seg && cache.get(seg.file), d = drv && cache.get(drv.file);
  const sb = seg && BUILT[seg.file]?.bounds, db = drv && BUILT[drv.file]?.bounds;
  if (!s || !d || !sb || !db) return undefined;
  const g = new Group();
  const segL = sb[3]! - sb[0]!, drvL = db[3]! - db[0]!, kz = (sb[5]! - sb[2]!) / (db[5]! - db[2]!);
  // a run shorter than two drive ends squeezes them rather than overlapping
  const dl = Math.min(drvL, len / 2);
  for (const side of [1, -1]) {
    const c = d.clone(true);
    c.position.x = (side * (len - dl)) / 2;
    c.scale.set(side * (dl / drvL), 1, kz);
    g.add(c);
  }
  const mid = len - 2 * dl, n = Math.round(mid / segL);
  for (let i = 0; i < n; i++) {
    const c = s.clone(true);
    c.position.x = -mid / 2 + ((i + 0.5) * mid) / n;
    c.scale.x = mid / (n * segL);
    g.add(c);
  }
  g.traverse((o) => { if ((o as Mesh).isMesh) o.name = "belt"; });
  return g;
}

/** Bed height of the loaded belt kit (art metres), or undefined while the code belt shows. */
export function meshyBeltTop(): number | undefined {
  const seg = ENTRIES.find((e) => e.belt === "segment");
  return seg && cache.has(seg.file) ? seg.top : undefined;
}

/**
 * The entries a level can show: every building, prop, item and decor, plus only the rigged
 * characters it names (each is 200-700 KB; a phone loading all of them for every level could
 * stall or drop the ones it needs). The hero and colonists are always there; traders come with a kiosk.
 */
export function meshyIdsFor(manifest: unknown): Set<string> {
  const text = JSON.stringify(manifest);
  return new Set(ENTRIES.filter((e) => e.kind !== "character" || e.id === "unit.player" || e.id === "role.idle"
    || text.includes(`"${e.id}`) || (e.id === "unit.customer" && text.includes('"sink.sales_point"'))).map((e) => e.id));
}

/**
 * Fetch GLBs (all, or those for `ids`) in the background; `onLoad` runs per file as it lands
 * so the renderer can rebuild what it has placed. Failures are logged and leave the code model.
 * `base` is where packages/client/public is served (the page's base URL by default).
 */
export function loadMeshy(onLoad?: (e: MeshyEntry) => void, ids?: ReadonlySet<string>, base?: string, unwired = false): Promise<void> {
  if (!enabled || typeof document === "undefined" || typeof fetch === "undefined") return Promise.resolve();
  const root = base ?? document.baseURI;
  loader ??= import("three/examples/jsm/loaders/GLTFLoader.js").then((m) => new m.GLTFLoader());
  const jobs = ENTRIES.filter((e) => (!ids || ids.has(e.id)) && BUILT[e.file] && (unwired || !e.unwired)).map((e) => {
    // already loaded (an earlier level or a replay): the new scene still needs its walls, decor,
    // items and props swapped in, so report it after init returns, as a fresh download would
    if (cache.has(e.file)) return Promise.resolve().then(() => onLoad?.(e));
    let p = pending.get(e.file);
    if (!p) {
      const b = BUILT[e.file]!;
      // props on the code-built crowd take their small LOD; the game-size file waits for rigged characters
      const url = new URL(b.lod ? `models/${e.file}.lod.glb?v=${b.lod.hash}` : `models/${e.file}.glb?v=${b.hash}`, root).href;
      const outlineUrl = b.outline && new URL(`models/${e.file}.outline.glb?v=${b.outline.hash}`, root).href;
      // one retry: a dropped request on a phone would otherwise leave the code model all level
      const glb = (l: GLTFLoader) => l.loadAsync(url).catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => l.loadAsync(url)));
      p = loader!.then((l) => Promise.all([
        glb(l),
        // a missing outline only means the blueprint stays code-built
        outlineUrl ? l.loadAsync(outlineUrl).catch(() => null) : null,
      ])).then(([gltf, outline]) => {
        prepare(gltf.scene);
        if (gltf.animations.length) clips.set(e.file, gltf.animations);
        if (outline) { prepare(outline.scene, true); outlines.set(e.file, outline.scene); }
        cache.set(e.file, gltf.scene);
      }).catch((err: unknown) => { console.warn(`meshy: ${e.file} failed, keeping the code model`, err); });
      pending.set(e.file, p);
    }
    return p.then(() => { if (cache.has(e.file)) onLoad?.(e); });
  });
  return Promise.all(jobs).then(() => undefined);
}

/**
 * Mark the loaded meshes shared, so disposing a placed copy never frees the cached geometry.
 * Outlines carry positions only and are drawn lit, so they get flat normals here.
 */
function prepare(scene: Group, flat = false): void {
  scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.userData["shared"] = true;
    if (flat) { m.geometry = m.geometry.toNonIndexed(); m.geometry.computeVertexNormals(); }
  });
}

/**
 * Swap a freshly built code model's body for its GLB, if one is loaded for this id and level;
 * `outline` takes the blueprint outline instead (build-pad ghosts).
 */
export function applyMeshy(m: Model, id: string, level = 1, outline = false): void {
  applyBody(m, id, level, outline);
  for (const e of meshySlots(id, level)) {
    const scene = (outline ? outlines : cache).get(e.file);
    if (!scene) continue;
    const flip = new Set(e.mirror ?? []);
    const olds: Mesh[] = [], gone: Mesh[] = [];
    m.root.traverse((o) => {
      if (!(o as Mesh).isMesh) return;
      if (e.slot!.includes(o.name)) olds.push(o as Mesh);
      // `replace` on a slot entry: meshes the part makes redundant (one gate door for two)
      else if (e.replace?.includes(o.name)) gone.push(o as Mesh);
    });
    for (const o of gone) { o.removeFromParent(); disposeGeo(o); }
    for (const old of olds) {
      // same place in the same parent (the gate animates its doors by child order)
      const glb = scene.clone(true);
      glb.name = old.name;
      glb.position.copy(old.position);
      glb.quaternion.copy(old.quaternion);
      glb.scale.copy(old.scale);
      if (flip.has(old.name)) glb.scale.x *= -1;
      // `parts` keyed by the slot name moves the swapped part itself
      const at = e.parts?.[old.name];
      if (at && at.length >= 3) glb.position.set(at[0]!, at[1]!, at[2]!);
      const parent = old.parent!;
      parent.children.splice(parent.children.indexOf(old), 1, glb);
      glb.parent = parent;
      old.parent = null;
      disposeGeo(old);
      for (const [k, v] of Object.entries(m.parts)) if (v === old) m.parts[k] = glb;
      for (const [name, p] of Object.entries(e.parts ?? {})) {
        const part = name === old.name ? undefined : m.parts[name];
        if (part && p.length >= 3) part.position.set(p[0]!, p[1]!, p[2]!);
      }
    }
    m.root.userData["meshy"] ??= e.file;
  }
}

function applyBody(m: Model, id: string, level: number, outline: boolean): void {
  const e = meshyFor(id, level);
  const scene = e && (outline ? outlines : cache).get(e.file);
  if (!e || !scene) return;
  const drop = new Set(e.replace ?? []);
  let at: Object3D | undefined;
  const gone: Object3D[] = [];
  m.root.traverse((o) => { if (drop.has(o.name) && (o as Mesh).isMesh) { at ??= o; gone.push(o); } });
  for (const o of gone) {
    o.removeFromParent();
    disposeGeo(o as Mesh);
    for (const [k, v] of Object.entries(m.parts)) if (v === o) delete m.parts[k];
  }
  const glb = scene.clone(true);
  glb.name = "body";
  // the replaced body's offset carries over (the turret's wall plinth lifts it)
  if (at) glb.position.y = at.position.y;
  glb.traverse((o) => { if ((o as Mesh).isMesh) o.name = "body"; });
  m.root.add(glb);
  for (const [name, p] of Object.entries(e.parts ?? {})) {
    const part = m.parts[name];
    if (!part) continue;
    if (p.length >= 3) part.position.set(p[0]!, p[1]! + glb.position.y, p[2]!);
    if (p.length >= 4) part.scale.setScalar(p[3]!);
  }
  for (const [name, p] of Object.entries(e.anchors ?? {})) {
    const a = getAnchor(m.root, name as AnchorName);
    if (a) a.position.set(p[0]!, p[1]! + glb.position.y, p[2]!);
  }
  m.root.userData["meshy"] = e.file;
}

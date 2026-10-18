import type { Group, Mesh, Object3D } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AnchorName } from "../ids.js";
import { disposeGeo, getAnchor, type Model } from "./common.js";
import built from "./meshy.built.json";
import config from "./meshy.json";

// Meshy models (docs/MESHY-ASSETS.md): textured GLBs that stand in for the code-built bodies.
// The code model is always built first and stays the fallback: until a GLB has loaded (or if it
// fails), nothing changes. Once loaded, the meshes an entry names in `replace` give way to the
// GLB, and the animated parts and anchors the renderer drives stay, moved where the entry says.

export interface MeshyEntry {
  file: string; src: string; id: string; level?: number;
  replace: string[]; parts: Record<string, number[]>; anchors: Record<string, number[]>;
}

const ENTRIES = (config as { models: MeshyEntry[] }).models;
const BUILT = built as Record<string, { hash: string; tris: number; bounds: number[] } | undefined>;

/** Loaded GLB scenes by file (shared geometry and materials; clones go into models). */
const cache = new Map<string, Group>();
const pending = new Map<string, Promise<void>>();
let loader: Promise<GLTFLoader> | null = null;
let enabled = true;

/** Dev switch: false keeps every code model (budget comparisons). */
export function setMeshyEnabled(on: boolean): void { enabled = on; }

export function meshyEntries(): readonly MeshyEntry[] { return ENTRIES; }

/** The entry for an id at a level: an exact level match wins over a level-free entry. */
export function meshyFor(id: string, level = 1): MeshyEntry | undefined {
  // upgrade tiers registered as their own id (struct.ranged_defense.t2) share the base entry
  const base = id.replace(/\.t\d+$/, "");
  return ENTRIES.find((e) => e.id === base && e.level === level) ?? ENTRIES.find((e) => e.id === base && e.level === undefined);
}

export function meshyBounds(file: string): readonly number[] | undefined { return BUILT[file]?.bounds; }

export function meshyLoaded(file: string): boolean { return cache.has(file); }

/**
 * Fetch GLBs (all, or those for `ids`) in the background; `onLoad` runs per file as it lands
 * so the renderer can rebuild what it has placed. Failures are logged and leave the code model.
 * `base` is where packages/client/public is served (the page's base URL by default).
 */
export function loadMeshy(onLoad?: (e: MeshyEntry) => void, ids?: ReadonlySet<string>, base?: string): Promise<void> {
  if (!enabled || typeof document === "undefined" || typeof fetch === "undefined") return Promise.resolve();
  const root = base ?? document.baseURI;
  loader ??= import("three/examples/jsm/loaders/GLTFLoader.js").then((m) => new m.GLTFLoader());
  const jobs = ENTRIES.filter((e) => (!ids || ids.has(e.id)) && BUILT[e.file]).map((e) => {
    if (cache.has(e.file)) return Promise.resolve();
    let p = pending.get(e.file);
    if (!p) {
      const url = new URL(`models/${e.file}.glb?v=${BUILT[e.file]!.hash}`, root).href;
      p = loader!.then((l) => l.loadAsync(url)).then((gltf) => {
        prepare(gltf.scene);
        cache.set(e.file, gltf.scene);
      }).catch((err: unknown) => { console.warn(`meshy: ${e.file} failed, keeping the code model`, err); });
      pending.set(e.file, p);
    }
    return p.then(() => { if (cache.has(e.file)) onLoad?.(e); });
  });
  return Promise.all(jobs).then(() => undefined);
}

/** Mark the loaded meshes shared, so disposing a placed copy never frees the cached geometry. */
function prepare(scene: Group): void {
  scene.traverse((o) => { if ((o as Mesh).isMesh) o.userData["shared"] = true; });
}

/** Swap a freshly built code model's body for its GLB, if one is loaded for this id and level. */
export function applyMeshy(m: Model, id: string, level = 1): void {
  const e = meshyFor(id, level);
  const scene = e && cache.get(e.file);
  if (!e || !scene) return;
  const drop = new Set(e.replace);
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
  for (const [name, p] of Object.entries(e.parts)) {
    const part = m.parts[name];
    if (!part) continue;
    if (p.length >= 3) part.position.set(p[0]!, p[1]! + glb.position.y, p[2]!);
    if (p.length >= 4) part.scale.setScalar(p[3]!);
  }
  for (const [name, p] of Object.entries(e.anchors)) {
    const a = getAnchor(m.root, name as AnchorName);
    if (a) a.position.set(p[0]!, p[1]! + glb.position.y, p[2]!);
  }
  m.root.userData["meshy"] = e.file;
}

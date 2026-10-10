import { Group, Mesh, Object3D, type BufferGeometry, type Material } from "three";
import type { AnchorName, AssetClass } from "../ids.js";
import type { MaterialSet } from "../materials.js";
import type { Tokens } from "../tokens.js";
import type { PartGeos } from "./characters.js";

/** Everything a model builder may read. */
export interface BuildCtx {
  t: Tokens;
  mats: MaterialSet;
  parts: PartGeos;
  /** skin.models: optional model keys per canonical id (variants). */
  models: Readonly<Record<string, string>>;
  /** Upgrade tier / core level (1-based). */
  level: number;
}

/**
 * A built model. `root` is in art metres with its pivot at the ground centre of the
 * footprint; anchors are named Object3D children. `parts` names the pieces the renderer
 * animates (orb, spin, head, lid, glass...).
 */
export interface Model {
  root: Group;
  cls: AssetClass;
  parts: Record<string, Object3D>;
}

export function anchor(root: Object3D, name: AnchorName, x: number, y: number, z: number): Object3D {
  const o = new Object3D();
  o.name = name;
  o.userData["anchor"] = true;
  o.position.set(x, y, z);
  root.add(o);
  return o;
}

export function getAnchor(root: Object3D, name: AnchorName): Object3D | undefined {
  let hit: Object3D | undefined;
  root.traverse((o) => { if (!hit && o.userData["anchor"] && o.name === name) hit = o; });
  return hit;
}

export function mesh(geo: BufferGeometry, mat: Material, name = ""): Mesh {
  const m = new Mesh(geo, mat);
  m.name = name;
  return m;
}

export function model(cls: AssetClass, root = new Group()): Model {
  return { root, cls, parts: {} };
}

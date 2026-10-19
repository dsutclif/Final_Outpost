import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D } from "three";
import { buildItemGeo, itemHeight } from "../assets/props.js";
import type { Tokens } from "../tokens.js";
import { ART_M, ITEM_K } from "../units.js";
import { Batch } from "./instancing.js";

// Every resource item in the scene (back stacks, shelves, converter queues, drops, the coin
// pile and items in flight) goes through one instanced batch per resource type.

const q = new Quaternion(), e = new Euler(), s = new Vector3(), p = new Vector3();

export class Items {
  private batches = new Map<string, Batch>();
  private geos = new Map<string, BufferGeometry>();
  /** Meshy items that have landed: their geometry and textured material replace the code item. */
  private meshy = new Map<string, { geo: BufferGeometry; mat: Material }>();
  private m = new Matrix4();
  /** World scale of an item (art metres to world units; ITEM_K oversizes them: "big chunky icons"). */
  readonly scale = ART_M * ITEM_K;

  constructor(private readonly t: Tokens, private readonly mat: Material, private readonly parent: Object3D) {}

  begin(): void {
    for (const b of this.batches.values()) b.begin();
  }

  /** World height of one stacked item (a Meshy item stacks at its own height). */
  height(res: string): number {
    const box = this.meshy.get(res)?.geo.boundingBox;
    return (box ? box.max.y - box.min.y : itemHeight(res)) * this.scale;
  }

  add(res: string, x: number, y: number, z: number, yaw = 0, k = 1, tilt = 0): void {
    q.setFromEuler(e.set(tilt, yaw, tilt * 0.5));
    this.m.compose(p.set(x, y, z), q, s.setScalar(this.scale * k));
    this.batch(res).push(this.m);
  }

  /** Draw `res` with a Meshy model from now on (fitted in art metres, pivot at the bottom). */
  setModel(res: string, geo: BufferGeometry, mat: Material): void {
    geo.computeBoundingBox();
    this.meshy.set(res, { geo, mat });
    this.batches.get(res)?.swap(geo, mat);
  }

  /** A loose drop on the ground: its own ground model when one has landed (the protein cut). */
  addDrop(res: string, x: number, y: number, z: number, yaw = 0): void {
    this.add(this.meshy.has(`${res}@ground`) ? `${res}@ground` : res, x, y, z, yaw);
  }

  private batch(res: string): Batch {
    let b = this.batches.get(res);
    const mm = this.meshy.get(res);
    if (!b && mm) { b = new Batch(mm.geo, mm.mat, this.parent, 32, `item:${res}`); this.batches.set(res, b); }
    if (!b) {
      let g = this.geos.get(res);
      if (!g) { g = buildItemGeo(res, this.t); this.geos.set(res, g); }
      b = new Batch(g, this.mat, this.parent, 32, `item:${res}`);
      this.batches.set(res, b);
    }
    return b;
  }

  end(): void {
    for (const b of this.batches.values()) b.end();
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.meshy.values()) m.geo.dispose();
    this.meshy.clear();
    this.batches.clear();
    this.geos.clear();
  }
}

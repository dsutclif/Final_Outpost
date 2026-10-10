import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D } from "three";
import { buildItemGeo, itemHeight } from "../assets/props.js";
import type { Tokens } from "../tokens.js";
import { ART_M } from "../units.js";
import { Batch } from "./instancing.js";

// Every resource item in the scene (back stacks, shelves, converter queues, drops, the coin
// pile and items in flight) goes through one instanced batch per resource type.

const q = new Quaternion(), e = new Euler(), s = new Vector3(), p = new Vector3();

export class Items {
  private batches = new Map<string, Batch>();
  private geos = new Map<string, BufferGeometry>();
  private m = new Matrix4();
  /** World scale of an item (art metres to world units, a touch oversized: "big chunky icons"). */
  readonly scale = ART_M * 1.05;

  constructor(private readonly t: Tokens, private readonly mat: Material, private readonly parent: Object3D) {}

  begin(): void {
    for (const b of this.batches.values()) b.begin();
  }

  /** World height of one stacked item. */
  height(res: string): number {
    return itemHeight(res) * this.scale;
  }

  add(res: string, x: number, y: number, z: number, yaw = 0, k = 1, tilt = 0): void {
    q.setFromEuler(e.set(tilt, yaw, tilt * 0.5));
    this.m.compose(p.set(x, y, z), q, s.setScalar(this.scale * k));
    this.batch(res).push(this.m);
  }

  private batch(res: string): Batch {
    let b = this.batches.get(res);
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
    this.batches.clear();
    this.geos.clear();
  }
}

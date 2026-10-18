import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, PlaneGeometry, type BufferGeometry, type Material, type Object3D } from "three";
import { poseCharacter, type Anim, type Look, type PartGeos } from "../assets/characters.js";

// Instanced batches. Every character part, every item type and every blob shadow is one
// InstancedMesh for the whole scene, refilled each frame: the crowd costs a fixed number of
// draw calls however many colonists, traders and raiders are on screen.

/** One growable InstancedMesh refilled per frame. */
export class Batch {
  mesh: InstancedMesh;
  private n = 0;

  constructor(private geo: BufferGeometry, private mat: Material, private readonly parent: Object3D, cap = 16, readonly name = "") {
    this.mesh = this.make(cap);
  }

  /** Draw with another geometry and material from now on (a Meshy model that has landed). */
  swap(geo: BufferGeometry, mat: Material): void {
    this.geo = geo;
    this.mat = mat;
    this.mesh.geometry = geo;
    this.mesh.material = mat;
  }

  private make(cap: number): InstancedMesh {
    const m = new InstancedMesh(this.geo, this.mat, cap);
    m.name = this.name;
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.setColorAt(0, new Color(1, 1, 1));
    m.frustumCulled = false;
    m.count = 0;
    m.visible = false;
    this.parent.add(m);
    return m;
  }

  begin(): void {
    this.n = 0;
  }

  push(m: Matrix4, c?: Color): void {
    if (this.n >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.make(old.instanceMatrix.count * 2);
      this.mesh.castShadow = old.castShadow;
      for (let i = 0; i < this.n; i++) {
        old.getMatrixAt(i, tmpM);
        this.mesh.setMatrixAt(i, tmpM);
        if (old.instanceColor) { old.getColorAt(i, tmpC); this.mesh.setColorAt(i, tmpC); }
      }
      this.parent.remove(old);
      old.dispose();
    }
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, c ?? WHITE);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}

const tmpM = new Matrix4();
const tmpC = new Color();
const WHITE = new Color(1, 1, 1);

/** Every character on screen, posed through the shared rig into per-part batches. */
export class Crowd {
  private batches = new Map<string, Batch>();
  /** Parts drawn with their own geometry and material (Meshy props in the tool slots). */
  private swaps = new Map<string, { geo: BufferGeometry; mat: Material }>();

  constructor(private readonly parts: PartGeos, private readonly mat: Material, private readonly parent: Object3D) {}

  begin(): void {
    for (const b of this.batches.values()) b.begin();
  }

  add(look: Look, anim: Anim, root: Matrix4, frost: string | null): void {
    poseCharacter(look, anim, root, (part, m, color) => this.batch(part)?.push(m, color), frost);
  }

  /** Draw `part` with this geometry and material from now on (the caller owns both). */
  setPart(part: string, geo: BufferGeometry, mat: Material): void {
    this.swaps.set(part, { geo, mat });
    this.batches.get(part)?.swap(geo, mat);
  }

  private batch(part: string): Batch | null {
    let b = this.batches.get(part);
    if (!b) {
      const sw = this.swaps.get(part);
      const geo = sw?.geo ?? this.parts.get(part);
      if (!geo || !geo.getAttribute("position")) return null;
      b = new Batch(geo, sw?.mat ?? this.mat, this.parent, part.startsWith("c.leg") ? 48 : 24, part);
      this.batches.set(part, b);
    }
    return b;
  }

  end(): void {
    for (const b of this.batches.values()) b.end();
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    for (const sw of this.swaps.values()) sw.geo.dispose();
    this.swaps.clear();
  }
}

/** Blob shadows: a soft dark disc under every unit (the only shadow on the low tier). */
export class Blobs {
  private batch: Batch;
  private m = new Matrix4();
  private readonly geo: PlaneGeometry;

  constructor(mat: Material, parent: Object3D) {
    this.geo = new PlaneGeometry(1, 1);
    this.geo.rotateX(-Math.PI / 2);
    this.batch = new Batch(this.geo, mat, parent, 64, "blobs");
    this.batch.mesh.renderOrder = -1;
  }

  begin(): void { this.batch.begin(); }

  add(x: number, z: number, r: number): void {
    this.m.makeScale(r * 2, 1, r * 2).setPosition(x, 0.6, z);
    this.batch.push(this.m);
  }

  end(): void { this.batch.end(); }

  dispose(): void { this.batch.dispose(); this.geo.dispose(); }
}

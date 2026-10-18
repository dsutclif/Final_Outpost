import { AnimationMixer, Euler, Quaternion, Vector3, type AnimationAction, type Bone, type Mesh, type Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { meshyCharacters, meshyRig, meshyScene, type MeshyEntry } from "../assets/meshy.js";

// Rigged Meshy characters (docs/MESHY-ASSETS.md "Characters"). Skinned meshes cannot share the
// crowd's instanced batches, so each visible one is its own clone (SkeletonUtils: geometry and
// material shared, skeleton per copy) with one AnimationMixer: one draw call per character plus
// its props. Copies are pooled by entity key and hidden when unused, so a queue of traders costs
// a fixed handful of objects. Characters without a loaded rig stay in the code-built crowd.

/** What the renderer knows about a character this frame; the clip is picked from it. */
export interface RigState {
  moving: boolean;
  /** Hurried variant: runs, checks the watch while waiting. */
  hurried: boolean;
  cheer: boolean;
}

interface Inst {
  root: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, AnimationAction>;
  current: string;
  seen: boolean;
  /** Pushed prop's grip points (cart handle) in the character's local frame, both hands. */
  grip: Vector3[] | null;
  arms: [Bone, Bone, Bone][];
}

const FADE = 0.25;
const d2r = Math.PI / 180;
const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3(), tmpQ = new Quaternion(), tmpQ2 = new Quaternion();

export class Rigged {
  private pool = new Map<string, Inst>();

  constructor(private readonly parent: Object3D) {}

  /** The rig for a character id (unit.customer covers its variants), once loaded. */
  entryFor(id: string): MeshyEntry | undefined {
    return meshyCharacters().find((e) => (id === e.id || id.startsWith(e.id + "_")) && meshyRig(e.file));
  }

  begin(): void {
    for (const i of this.pool.values()) i.seen = false;
  }

  /** Place character `key` (one per entity) of kind `id` at world x/z, facing yaw, `scale` world units per art metre. */
  add(key: string, id: string, e: MeshyEntry, s: RigState, x: number, z: number, yaw: number, scale: number): void {
    let inst = this.pool.get(key);
    if (!inst) {
      inst = this.make(id, e);
      this.pool.set(key, inst);
    }
    inst.seen = true;
    inst.root.visible = true;
    const b = meshyRig(e.file)!;
    const h = (e.height ?? 1.1) / Math.max(0.01, b.scene.userData["height"] as number ?? 1.7);
    inst.root.position.set(x, 0, z);
    inst.root.rotation.y = yaw;
    inst.root.scale.setScalar(scale * h);
    const c = e.clips ?? {};
    const want = s.cheer && !s.moving ? c["cheer"] : s.moving ? (s.hurried ? c["run"] : c["walk"]) : s.hurried ? c["wait"] : c["idle"];
    this.play(inst, want ?? c["idle"] ?? "");
  }

  /** Advance every visible character's clips; hide the ones not placed this frame. */
  end(dt: number): void {
    for (const [k, i] of this.pool) {
      if (!i.seen) {
        // gone for good after a while; a hidden copy costs nothing to draw
        i.root.visible = false;
        if (i.root.userData["idle"] === undefined) i.root.userData["idle"] = 0;
        i.root.userData["idle"] += dt;
        if (i.root.userData["idle"] > 5) { this.parent.remove(i.root); i.mixer.stopAllAction(); this.pool.delete(k); }
        continue;
      }
      i.root.userData["idle"] = 0;
      i.mixer.update(dt);
      if (i.grip) this.reach(i);
    }
  }

  dispose(): void {
    for (const i of this.pool.values()) { this.parent.remove(i.root); i.mixer.stopAllAction(); }
    this.pool.clear();
  }

  get count(): number {
    let n = 0;
    for (const i of this.pool.values()) if (i.root.visible) n++;
    return n;
  }

  private make(id: string, e: MeshyEntry): Inst {
    const rig = meshyRig(e.file)!;
    if (rig.scene.userData["height"] === undefined) {
      let top = 0;
      rig.scene.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); top = Math.max(top, m.geometry.boundingBox!.max.y); } });
      rig.scene.userData["height"] = top || 1.7;
    }
    const root = cloneSkinned(rig.scene);
    root.traverse((o) => { if ((o as Mesh).isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    const mixer = new AnimationMixer(root);
    const actions = new Map<string, AnimationAction>();
    for (const clip of rig.clips) actions.set(clip.name, mixer.clipAction(clip));
    const inst: Inst = { root, mixer, actions, current: "", seen: true, grip: null, arms: [] };
    const bone = (name: string): Bone | undefined => root.getObjectByName(name.replace(/:/g, "")) as Bone | undefined ?? root.getObjectByName(name) as Bone | undefined;
    for (const h of e.held?.[id] ?? []) {
      const prop = meshyScene(h.prop);
      if (!prop) continue;
      const [px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, k = 1] = h.at;
      prop.position.set(px, py, pz);
      prop.quaternion.setFromEuler(new Euler(rx * d2r, ry * d2r, rz * d2r));
      prop.scale.setScalar(k);
      (h.bone ? bone(h.bone) : undefined)?.add(prop) ?? root.add(prop);
      if (h.grip) {
        // a pushed prop: both hands reach for its grip, a half-width either side
        const [gx = 0, gy = 0, gz = 0, half = 0.2] = h.grip;
        inst.grip = [new Vector3(gx - half, gy, gz), new Vector3(gx + half, gy, gz)];
        for (const side of ["Left", "Right"]) {
          const a = bone(`mixamorig:${side}Arm`), f = bone(`mixamorig:${side}ForeArm`), w = bone(`mixamorig:${side}Hand`);
          if (a && f && w) inst.arms.push([a, f, w]);
        }
      }
    }
    this.parent.add(root);
    return inst;
  }

  private play(i: Inst, name: string): void {
    if (i.current === name) return;
    const next = i.actions.get(name);
    if (!next) return;
    const prev = i.actions.get(i.current);
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, FADE, false);
    i.current = name;
  }

  /**
   * Arms out to the pushed prop's handle after the clip has posed them: upper arm, then forearm,
   * each turned so it points at the grip (the walk keeps the legs and body).
   */
  private reach(i: Inst): void {
    i.root.updateMatrixWorld(true);
    // grips are in the character's local frame; the mirror image (Mixamo left = character's +x)
    i.arms.forEach(([arm, fore, hand], k) => {
      const target = tmpC.copy(i.grip![k === 0 ? 1 : 0]!).applyMatrix4(i.root.matrixWorld);
      for (const [b, child] of [[arm, fore], [fore, hand]] as const) {
        b.updateMatrixWorld(true);
        const from = b.getWorldPosition(tmpA);
        const dir = child.getWorldPosition(tmpB).sub(from).normalize();
        const want = target.clone().sub(from).normalize();
        tmpQ.setFromUnitVectors(dir, want);
        const world = b.getWorldQuaternion(tmpQ2);
        const parentInv = b.parent!.getWorldQuaternion(new Quaternion()).invert();
        b.quaternion.copy(parentInv.multiply(tmpQ.multiply(world)));
        b.updateMatrixWorld(true);
      }
    });
  }
}

import { AnimationClip, AnimationMixer, Euler, Matrix4, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type AnimationAction, type Bone, type BufferGeometry, type Mesh, type Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { meshyCharacters, meshyGeometry, meshyLoaded, meshyRig, meshyScene, type MeshyEntry, type MeshyHeld } from "../assets/meshy.js";

// Rigged Meshy characters (docs/MESHY-ASSETS.md "Characters"). Skinned meshes cannot share the
// crowd's instanced batches, so each visible one is its own clone (SkeletonUtils: geometry and
// material shared, skeleton per copy) with one AnimationMixer: one draw call per character plus
// its props. Copies are pooled by entity key and hidden when unused, so a queue of traders costs
// a fixed handful of objects. Characters without a loaded rig stay in the code-built crowd.
//
// Clips come from the entry's `clips` by state (walk, run, idle, wait, cheer, carry, and actions
// such as mine, dig, shoot). A file without an idle gets one made from its walk (every bone at
// its average over the cycle, plus a slow breath). Held props are placed once per file from a
// two-handed clip of that character (gun: barrel from the right hand through the left; tool:
// handle from the left hand through the right), then ride the right hand in every clip. Files
// with no clips at all (the many-legged creatures) walk by code: each leg swings and lifts in an
// alternating gait.

/** What the renderer knows about a character this frame; the clip is picked from it. */
export interface RigState {
  moving: boolean;
  /** Hurried variant: runs, checks the watch while waiting. */
  hurried: boolean;
  cheer: boolean;
  /** 0..1 how fast it moves (creature gait). */
  speed?: number;
  /** Runs rather than walks while moving (the hero). */
  run?: boolean;
  /** What it is doing: a `clips` key (mine, reap, pick, dig, shoot, work); its props show only then. */
  act?: string | undefined;
  /** Carrying goods (a `carry` clip, if the file has one, replaces the walk). */
  carry?: boolean;
}

interface Prop { obj: Object3D; when?: string[] }

interface Inst {
  /** Character id it was built for (props and clips depend on it). */
  id: string;
  root: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, AnimationAction>;
  current: string;
  seen: boolean;
  /** Pushed prop's grip points (cart handle) in the character's local frame, both hands. */
  grip: Vector3[] | null;
  arms: [Bone, Bone, Bone][];
  props: Prop[];
  /** Left arm held in a shield pose: bones and their elbow/hand targets in the chest's frame. */
  shield: { bones: [Bone, Bone, Bone]; chest: Bone; at: Vector3[] } | null;
  legs: Leg[] | null;
  phase: number;
  /** Time into the current clip of an alternating action pair, last frame (a drop means it wrapped). */
  altLast: number;
  /** Props still loading when this copy was made: it is rebuilt once they land. */
  missing: string[];
}

interface Leg { bone: Bone; rest: Quaternion; parent: Quaternion; out: Vector3; offset: number }

const FADE = 0.25;
const d2r = Math.PI / 180;
const UP = new Vector3(0, 1, 0), FWD = new Vector3(0, 0, 1);
const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3(), tmpQ = new Quaternion(), tmpQ2 = new Quaternion(), tmpQ3 = new Quaternion();

/** Per file: synthesized idle clips and prop placements (bone-local matrices). */
const idles = new Map<string, AnimationClip>();
const pinned = new WeakSet<AnimationClip>();

/** Keeps a clip that walks the body about (Meshy's door pull) on the spot: the hips keep their height, not their travel. */
function pinRoot(clip: AnimationClip): void {
  if (pinned.has(clip)) return;
  pinned.add(clip);
  const hips = clip.tracks.find((t) => t instanceof VectorKeyframeTrack && /Hips\.position$/.test(t.name));
  if (!hips) return;
  const v = hips.values;
  for (let i = 3; i < v.length; i += 3) { v[i] = v[0]!; v[i + 2] = v[2]!; }
}
const placed = new Map<string, Matrix4>();

const boneOf = (root: Object3D, name: string): Bone | undefined =>
  (root.getObjectByName(name.replace(/:/g, "")) ?? root.getObjectByName(name)) as Bone | undefined;

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
    // rebuilt once its props land, or when the entity became someone else (a colonist hired into a job)
    if (inst && ((inst.missing.length && inst.missing.every(meshyLoaded)) || inst.id !== id)) { this.parent.remove(inst.root); inst.mixer.stopAllAction(); inst = undefined; }
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
    if (inst.legs) {
      inst.root.userData["speed"] = s.moving ? Math.max(0.35, s.speed ?? 1) : 0;
      return;
    }
    const c = e.clips ?? {};
    const act = s.act && c[s.act] ? s.act : undefined;
    const moveAct = act && c[act + "Move"] ? act + "Move" : undefined;
    let want = s.cheer && !s.moving && c["cheer"] ? "cheer"
      : s.moving ? moveAct ?? (s.carry && c["carry"] ? "carry" : (s.hurried || s.run) && c["run"] ? "run" : "walk")
      : act ?? (s.hurried && c["wait"] ? "wait" : "idle");
    // an action with a second clip (`work` / `work2`) takes turns: each plays once through, then the other
    if (want === act && c[act + "2"]) {
      const pair = [act, act + "2"], on = pair.findIndex((k) => c[k] === inst.current);
      const t = on >= 0 ? inst.actions.get(inst.current)!.time : 0;
      // a looping clip's time drops back when it wraps: that ends its turn
      const wrapped = on >= 0 && t < inst.altLast;
      want = pair[on < 0 ? 0 : wrapped ? 1 - on : on]!;
      inst.altLast = wrapped ? 0 : t;
    }
    this.play(inst, c[want] ?? (want === "idle" ? "__idle" : c["walk"] ?? ""));
    for (const p of inst.props) p.obj.visible = !p.when || p.when.includes(want) || (want !== s.act + "2" && !!s.act && p.when.includes(s.act));
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
      if (i.legs) { this.gait(i, dt); continue; }
      i.mixer.update(dt);
      if (i.grip) this.reach(i);
      if (i.shield) this.brace(i);
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
    const height = rig.scene.userData["height"] as number;
    const root = cloneSkinned(rig.scene);
    root.traverse((o) => { if ((o as Mesh).isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    const mixer = new AnimationMixer(root);
    const actions = new Map<string, AnimationAction>();
    for (const k of e.inPlace ?? []) { const clip = rig.clips.find((c) => c.name === e.clips?.[k]); if (clip) pinRoot(clip); }
    for (const clip of rig.clips) actions.set(clip.name, mixer.clipAction(clip));
    const walk = rig.clips.find((c) => c.name === e.clips?.["walk"]);
    if (walk && !e.clips?.["idle"]) {
      if (!idles.has(e.file)) idles.set(e.file, idleFrom(walk));
      actions.set("__idle", mixer.clipAction(idles.get(e.file)!));
    }
    const inst: Inst = { id, root, mixer, actions, current: "", seen: true, grip: null, arms: [], props: [], shield: null, legs: null, phase: 0, altLast: 0, missing: [] };
    root.updateMatrixWorld(true);
    if (!rig.clips.length) inst.legs = legsOf(root, height);
    if (e.shieldArm) inst.shield = this.shieldPose(root);
    // model metres per art metre: props keep the size they were fitted to beside the character
    const ms = height / (e.height ?? 1.1);
    const held = [...(e.held?.["*"] ?? []), ...(e.held?.[id] ?? [])];
    // the bind pose, put back after each calibration clip has posed the skeleton
    const rest: [Object3D, Vector3, Quaternion][] = [];
    root.traverse((o) => { if ((o as Bone).isBone) rest.push([o, o.position.clone(), o.quaternion.clone()]); });
    const unpose = (): void => { for (const [o, p, q] of rest) { o.position.copy(p); o.quaternion.copy(q); } root.updateMatrixWorld(true); };
    let shieldObj: { obj: Object3D; k: number } | null = null;
    held.forEach((h, k) => {
      const prop = meshyScene(h.prop);
      if (!prop) { inst.missing.push(h.prop); return; }
      if (h.shield) { shieldObj = { obj: prop, k: h.k ?? 1 }; inst.props.push({ obj: prop }); return; }
      if (h.align) {
        const key = `${e.file}|${k}|${id}`;
        if (!placed.has(key)) { placed.set(key, this.calibrate(inst, h, ms, rig.clips)); unpose(); }
        const hand = boneOf(root, "mixamorig:RightHand");
        if (!hand) return;
        placed.get(key)!.decompose(prop.position, prop.quaternion, prop.scale);
        hand.add(prop);
      } else {
        const [px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, k2 = 1] = h.at ?? [];
        prop.position.set(px, py, pz);
        prop.quaternion.setFromEuler(new Euler(rx * d2r, ry * d2r, rz * d2r));
        prop.scale.setScalar(k2);
        (h.bone ? boneOf(root, h.bone) : undefined)?.add(prop) ?? root.add(prop);
      }
      inst.props.push({ obj: prop, ...(h.when ? { when: h.when } : {}) });
      if (h.grip) {
        // a pushed prop: both hands reach for its grip, a half-width either side
        const [gx = 0, gy = 0, gz = 0, half = 0.2] = h.grip;
        inst.grip = [new Vector3(gx - half, gy, gz), new Vector3(gx + half, gy, gz)];
        for (const side of ["Left", "Right"]) {
          const a = boneOf(root, `mixamorig:${side}Arm`), f = boneOf(root, `mixamorig:${side}ForeArm`), w = boneOf(root, `mixamorig:${side}Hand`);
          if (a && f && w) inst.arms.push([a, f, w]);
        }
      }
    });
    if (inst.shield) {
      // the shield rides the chest in front of the braced forearm, face forward
      const sh = shieldObj as { obj: Object3D; k: number } | null;
      if (sh) {
        const obj = sh.obj, k2 = sh.k * ms;
        const chest = inst.shield.chest;
        const hand = inst.shield.at[1]!.clone().applyMatrix4(chest.matrixWorld);
        obj.position.copy(hand).add(tmpA.set(0, 0, 0.06));
        obj.quaternion.identity();
        obj.scale.setScalar(k2);
        // pivot is the shield's bottom centre: centre it on the forearm, in the chest's frame
        obj.position.y -= 0.25 * k2;
        obj.applyMatrix4(new Matrix4().copy(chest.matrixWorld).invert());
        chest.add(obj);
      }
    }
    root.updateMatrixWorld(true);
    this.parent.add(root);
    return inst;
  }

  /**
   * A held prop's place in the right hand's frame, read off a two-handed clip of this character:
   * a gun's barrel runs from the right hand through the left, a tool's handle from the left hand
   * through the right (head beyond it). `axis`/`side` are the prop's own grip-to-head and
   * forward directions; without `axis`, the long axis and the head end come from the mesh.
   */
  private calibrate(i: Inst, h: MeshyHeld, ms: number, clips: AnimationClip[]): Matrix4 {
    const clip = clips.find((c) => c.name === h.clip);
    const act = clip ? i.mixer.clipAction(clip) : null;
    if (act && clip) { act.play(); i.mixer.setTime((h.t ?? 0.3) * clip.duration); }
    i.root.updateMatrixWorld(true);
    const rh = boneOf(i.root, "mixamorig:RightHand"), lh = boneOf(i.root, "mixamorig:LeftHand");
    const out = new Matrix4();
    if (rh && lh) {
      const R = rh.getWorldPosition(new Vector3()), L = lh.getWorldPosition(new Vector3());
      const gun = h.align === "gun";
      const dir = (gun ? L.clone().sub(R) : R.clone().sub(L)).normalize();
      const shape = h.axis ? { axis: new Vector3(...h.axis as [number, number, number]).normalize(), side: new Vector3(...(h.side ?? [0, 1, 0]) as [number, number, number]).normalize(), grip: new Vector3(...(h.hold ?? [0, 0, 0]) as [number, number, number]) } : shapeOf(h.prop);
      const want = (gun ? UP : FWD).clone();
      want.sub(tmpA.copy(dir).multiplyScalar(want.dot(dir))).normalize();
      const basis = (a: Vector3, b: Vector3): Matrix4 => new Matrix4().makeBasis(a, b, a.clone().cross(b));
      const nb = basis(shape.axis, shape.side.clone().sub(tmpA.copy(shape.axis).multiplyScalar(shape.side.dot(shape.axis))).normalize());
      const rot = new Quaternion().setFromRotationMatrix(basis(dir, want).multiply(nb.transpose()));
      const k = (h.k ?? 1) * ms;
      const at = (gun ? R : L).clone().sub(shape.grip.clone().multiplyScalar(k).applyQuaternion(rot));
      out.compose(at, rot, new Vector3(k, k, k));
      out.premultiply(new Matrix4().copy(rh.matrixWorld).invert());
    }
    if (act) act.stop();
    return out;
  }

  /** Left arm braced across the chest (shield arm): elbow down and out, forearm level in front. */
  private shieldPose(root: Object3D): Inst["shield"] {
    const a = boneOf(root, "mixamorig:LeftArm"), f = boneOf(root, "mixamorig:LeftForeArm"), w = boneOf(root, "mixamorig:LeftHand");
    const chest = boneOf(root, "mixamorig:Spine2");
    if (!a || !f || !w || !chest) return null;
    const s = a.getWorldPosition(new Vector3());
    const upper = f.getWorldPosition(new Vector3()).distanceTo(s), fore = w.getWorldPosition(new Vector3()).distanceTo(f.getWorldPosition(new Vector3()));
    const elbow = s.clone().add(new Vector3(0.25, -0.85, 0.45).normalize().multiplyScalar(upper));
    const hand = elbow.clone().add(new Vector3(-0.45, 0.2, 0.87).normalize().multiplyScalar(fore));
    const inv = new Matrix4().copy(chest.matrixWorld).invert();
    return { bones: [a, f, w], chest, at: [elbow.applyMatrix4(inv), hand.applyMatrix4(inv)] };
  }

  private brace(i: Inst): void {
    const sh = i.shield!;
    i.root.updateMatrixWorld(true);
    const [arm, fore, hand] = sh.bones;
    aim(arm, fore, tmpC.copy(sh.at[0]!).applyMatrix4(sh.chest.matrixWorld));
    aim(fore, hand, tmpC.copy(sh.at[1]!).applyMatrix4(sh.chest.matrixWorld));
  }

  private gait(i: Inst, dt: number): void {
    const sp = (i.root.userData["speed"] as number | undefined) ?? 0;
    i.phase += dt * sp * 13;
    const still = sp === 0;
    for (const l of i.legs!) {
      const ph = i.phase + l.offset;
      const swing = still ? 0 : 0.32 * Math.sin(ph);
      const lift = still ? 0.02 * Math.sin(i.phase * 0.3 + l.offset) : 0.35 * Math.max(0, Math.cos(ph));
      // world-frame (model) rotation: swing about up, lift about the leg's horizontal hinge
      tmpQ.setFromAxisAngle(UP, swing).multiply(tmpQ2.setFromAxisAngle(tmpA.copy(l.out).cross(UP).normalize(), -lift));
      // local = parent⁻¹ · D · parent · rest
      tmpQ3.copy(l.parent).invert().multiply(tmpQ).multiply(l.parent).multiply(l.rest);
      l.bone.quaternion.copy(tmpQ3);
    }
    if (!still) i.root.position.y += Math.abs(Math.sin(i.phase)) * 0.6;
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
      const target = tmpC.copy(i.grip![k === 0 ? 1 : 0]!).applyMatrix4(i.root.matrixWorld).clone();
      aim(arm, fore, target);
      aim(fore, hand, target);
    });
  }
}

/** Turn bone `b` so its child points at `target` (world). */
function aim(b: Bone, child: Object3D, target: Vector3): void {
  b.updateMatrixWorld(true);
  const from = b.getWorldPosition(tmpA);
  const dir = child.getWorldPosition(tmpB).sub(from).normalize();
  const want = target.clone().sub(from).normalize();
  const q = new Quaternion().setFromUnitVectors(dir, want);
  const world = b.getWorldQuaternion(new Quaternion());
  const parentInv = b.parent!.getWorldQuaternion(new Quaternion()).invert();
  b.quaternion.copy(parentInv.multiply(q.multiply(world)));
  b.updateMatrixWorld(true);
}

/** A standing idle from a walk cycle: each bone at its average over the cycle, the chest breathing. */
function idleFrom(walk: AnimationClip): AnimationClip {
  const tracks = walk.tracks.map((t) => {
    const n = t.getValueSize(), k = t.times.length, avg = new Array<number>(n).fill(0);
    for (let i = 0; i < k; i++) {
      // keep quaternions in one hemisphere before summing
      const sign = n === 4 && i > 0 && [0, 1, 2, 3].reduce((s, j) => s + t.values[j]! * t.values[i * 4 + j]!, 0) < 0 ? -1 : 1;
      for (let j = 0; j < n; j++) avg[j]! += sign * t.values[i * n + j]!;
    }
    if (n === 4) {
      const q = new Quaternion(avg[0], avg[1], avg[2], avg[3]).normalize();
      if (/Spine1$/.test(t.name)) {
        const b = q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.03));
        return new QuaternionKeyframeTrack(t.name, [0, 1.6, 3.2], [...q.toArray(), ...b.toArray(), ...q.toArray()]);
      }
      return new QuaternionKeyframeTrack(t.name, [0], q.toArray());
    }
    return new VectorKeyframeTrack(t.name, [0], avg.map((v) => v / k));
  });
  return new AnimationClip("__idle", 3.2, tracks);
}

/**
 * Legs of a code-walked creature: chains reaching the ground, each from the joint just below a
 * branching joint (the body). Ordered around the body and alternated, so neighbours step apart
 * (two tripods on six legs).
 */
function legsOf(root: Object3D, height: number): Leg[] {
  const bones: Bone[] = [];
  root.traverse((o) => { if ((o as Bone).isBone) bones.push(o as Bone); });
  const isBone = (o: Object3D | null): o is Bone => !!o && (o as Bone).isBone;
  const roots = new Set<Bone>();
  for (const b of bones) {
    if (b.getWorldPosition(tmpA).y > height * 0.12) continue;
    let r: Bone = b;
    while (isBone(r.parent) && r.parent.children.filter(isBone).length < 2) r = r.parent;
    if (isBone(r.parent) && r !== b) roots.add(r);
  }
  const centre = new Vector3();
  const list = [...roots].map((bone) => {
    let tip: Object3D = bone;
    while (tip.children.some(isBone)) tip = tip.children.find(isBone)!;
    const p = tip.getWorldPosition(new Vector3());
    centre.add(p);
    return { bone, p };
  });
  centre.divideScalar(Math.max(1, list.length));
  list.sort((a, b) => Math.atan2(a.p.x - centre.x, a.p.z - centre.z) - Math.atan2(b.p.x - centre.x, b.p.z - centre.z));
  return list.map(({ bone, p }, k) => ({
    bone, rest: bone.quaternion.clone(), parent: bone.parent!.getWorldQuaternion(new Quaternion()),
    out: new Vector3(p.x - centre.x, 0, p.z - centre.z).normalize(), offset: (k % 2) * Math.PI,
  }));
}

/** A tool's long axis (towards the wider head end), a side across it, and the grip at the handle end. */
const shapes = new Map<string, { axis: Vector3; side: Vector3; grip: Vector3 }>();
function shapeOf(file: string): { axis: Vector3; side: Vector3; grip: Vector3 } {
  let s = shapes.get(file);
  if (s) return s;
  const g = meshyGeometry(file);
  const pts: Vector3[] = [];
  const pos = (g?.geo as BufferGeometry | undefined)?.getAttribute("position");
  for (let i = 0; pos && i < pos.count; i++) pts.push(new Vector3().fromBufferAttribute(pos, i));
  const mean = pts.reduce((m, p) => m.add(p), new Vector3()).divideScalar(Math.max(1, pts.length));
  const principal = (skip?: Vector3): Vector3 => {
    let v = new Vector3(1, 0.7, 0.3).normalize();
    for (let it = 0; it < 30; it++) {
      const n = new Vector3();
      for (const p of pts) {
        const d = p.clone().sub(mean);
        if (skip) d.sub(skip.clone().multiplyScalar(d.dot(skip)));
        n.add(d.multiplyScalar(d.dot(v)));
      }
      v = n.normalize();
    }
    return v;
  };
  const axis = principal(), side = principal(axis);
  const t = pts.map((p) => p.clone().sub(mean).dot(axis));
  const lo = Math.min(...t), hi = Math.max(...t);
  const spread = (a: number, b: number): number => {
    let m = 0;
    pts.forEach((p, i) => { if (t[i]! >= a && t[i]! <= b) m = Math.max(m, Math.abs(p.clone().sub(mean).dot(side))); });
    return m;
  };
  // the head (blade) is the wider end
  const q = (hi - lo) * 0.25;
  if (spread(lo, lo + q) > spread(hi - q, hi)) axis.negate();
  const end = Math.min(...pts.map((p) => p.clone().sub(mean).dot(axis)));
  s = { axis, side: axis.clone().cross(side).normalize(), grip: mean.clone().add(axis.clone().multiplyScalar(end * 0.92)) };
  shapes.set(file, s);
  return s;
}

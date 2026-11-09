import { AnimationMixer, Box3, PointLight, Quaternion, Vector3, type Mesh, type Object3D, type SkinnedMesh } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { meshyCharacters, meshyRig } from "../assets/meshy.js";
import { SIZES } from "../sizes.js";
import { ART_M } from "../units.js";

// A story rider in play (Sela in her buggy, docs/BACKLOG.md "gets out of the buggy"): the same seated pose and
// climb-out the sela_arrival film composes (livescene.ts selaArrival), but in the game world, in world units. She
// sits at the wheel while the buggy drives and parks, then every bone eases from seated to standing while the hips
// arc up over the side and down to the spot where her customer figure takes over. No rigged clip exists for getting
// out of a vehicle, so this is built from her walk clip's first frame (standing) plus a bone-aiming sit pose.
// Pure presentation: nothing here reaches the sim.

const ease = (k: number): number => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
/** The film's buggy scale (metres), the seat sits on it: hips 0.3 forward of the body origin, 1.4 up. */
const KF = SIZES.buggy.length / SIZES.buggy.buildLength;
const PERSON = SIZES.person;
const UP = new Vector3(0, 1, 0);

/** Turn bone `b` so its child `c` points along `dir` (world), keeping the rest of the chain (as the film does). */
function aimBone(b: Object3D | undefined, c: Object3D | undefined, dir: Vector3): void {
  if (!b || !c || !b.parent) return;
  b.updateMatrixWorld(true);
  const from = b.getWorldPosition(new Vector3()), cur = c.getWorldPosition(new Vector3()).sub(from).normalize();
  const q = new Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  const parentInv = b.parent.getWorldQuaternion(new Quaternion()).invert();
  b.quaternion.copy(parentInv.multiply(q.multiply(b.getWorldQuaternion(new Quaternion()))));
  b.updateMatrixWorld(true);
}

/** Where the rider climbs out to, and what she then faces (world units); the customer figure continues from there. */
export interface RideExit { x: number; z: number; faceX: number; faceZ: number }

export class SelaRide {
  readonly root: Object3D;
  /** Her warm lamp (the film has one): without it a dark suit vanishes into the night. */
  readonly lamp = new PointLight("#ffc27a", 0, 7 * ART_M, 1.6);
  private readonly mixer: AnimationMixer;
  private readonly s: number;
  private readonly hip = new Vector3();
  private readonly standHip = new Vector3();
  private readonly seated = new Map<Object3D, Quaternion>();
  private readonly standing = new Map<Object3D, Quaternion>();

  private constructor(root: Object3D, mixer: AnimationMixer, worldHeight: number, clip: string | undefined) {
    this.root = root;
    this.mixer = mixer;
    root.traverse((o) => { if ((o as Mesh).isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    mixer.setTime(0);
    root.updateMatrixWorld(true);
    // her height as drawn (skinned), so the scale matches the customer figure that takes over
    const box = new Box3();
    root.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!m.isMesh) return;
      if (m.isSkinnedMesh) { m.skeleton.update(); m.computeBoundingBox(); box.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld)); }
    });
    const h = box.isEmpty() ? 1.7 : box.max.y - Math.min(0, box.min.y) || 1.7;
    void clip;
    this.s = worldHeight / h;
    root.scale.setScalar(this.s);
    root.updateMatrixWorld(true);
    const bone = (n: string): Object3D | undefined => root.getObjectByName(`mixamorig${n}`) ?? root.getObjectByName(`mixamorig:${n}`);
    const hipOf = (): Vector3 => {
      const l = bone("LeftUpLeg"), r = bone("RightUpLeg");
      return l && r ? l.getWorldPosition(new Vector3()).add(r.getWorldPosition(new Vector3())).multiplyScalar(0.5).divide(root.scale) : new Vector3(0, 0.9, 0);
    };
    root.traverse((b) => { if ((b as { isBone?: boolean }).isBone) this.standing.set(b, b.quaternion.clone()); });
    this.standHip.copy(hipOf());
    // seated: thighs forward, shins down, hands out to the wheel (the film's pose; the model faces +z)
    for (const sd of ["Left", "Right"]) {
      aimBone(bone(`${sd}UpLeg`), bone(`${sd}Leg`), new Vector3(0, -0.03, 1));
      aimBone(bone(`${sd}Leg`), bone(`${sd}Foot`), new Vector3(0, -1, 0.2));
      aimBone(bone(`${sd}Arm`), bone(`${sd}ForeArm`), new Vector3(0, -1, 0.35));
      aimBone(bone(`${sd}ForeArm`), bone(`${sd}Hand`), new Vector3(0, -0.35, 1));
    }
    root.traverse((b) => { if ((b as { isBone?: boolean }).isBone) this.seated.set(b, b.quaternion.clone()); });
    this.hip.copy(hipOf());
  }

  /** The rider's figure once her model has loaded (`model` is the character id, `worldHeight` her height in world units). */
  static make(model: string, worldHeight: number): SelaRide | null {
    const e = meshyCharacters().find((x) => x.id === model), rig = e && meshyRig(e.file);
    if (!e || !rig) return null;
    const root = cloneSkinned(rig.scene);
    const mixer = new AnimationMixer(root);
    const clip = rig.clips.find((c) => c.name === e.clips?.["walk"]);
    if (clip) mixer.clipAction(clip).play();
    return new SelaRide(root, mixer, worldHeight, clip?.name);
  }

  /**
   * Pose her for the buggy at (bx, bz) turned `yaw` (its group's rotation.y): `k` 0 is seated at the wheel, 1 is standing
   * at `out`. The door is on the buggy's +z side, so with no `out` yet she steps down 1.3 m beside it.
   */
  pose(bx: number, bz: number, yaw: number, k: number, out: RideExit | null): void {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    // buggy-local (x forward -x, z to the door side) to world
    const toWorld = (lx: number, lz: number): { x: number; z: number } => ({ x: bx + lx * c + lz * sn, z: bz - lx * sn + lz * c });
    const seat = toWorld(0.3 * KF * ART_M, 0);
    const door = out ?? toWorld(0.15 * ART_M, 1.3 * ART_M);
    const seatHip = new Vector3(seat.x, (1.4 * KF + 0.073 * PERSON) * ART_M, seat.z);
    const doorHip = new Vector3(door.x, this.standHip.y * this.s, door.z);
    for (const [b, q] of this.seated) b.quaternion.slerpQuaternions(q, this.standing.get(b) ?? q, k);
    const hipW = new Vector3().lerpVectors(seatHip, doorHip, k);
    hipW.y += 0.35 * ART_M * Math.sin(Math.PI * Math.min(1, k * 1.15));
    // she faces the way the buggy points, then turns to face where she is going
    const y0 = yaw - Math.PI / 2;
    const y1 = out ? Math.atan2(out.faceX - out.x, out.faceZ - out.z) : y0 + Math.PI / 2;
    const dy = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0));
    const ry = y0 + dy * k;
    const hipM = new Vector3().lerpVectors(this.hip, this.standHip, k).multiplyScalar(this.s).applyAxisAngle(UP, ry);
    this.root.position.copy(hipW.sub(hipM));
    this.root.rotation.set(0, ry, 0);
    this.root.updateMatrixWorld(true);
    // lit while she sits and climbs out, fading as the walking figure takes over
    this.lamp.intensity = 3 * ART_M ** 1.6 * (1 - ease((k - 0.7) / 0.3));
    this.lamp.position.set(this.root.position.x + Math.sin(yaw) * 0.4 * ART_M, ART_M, this.root.position.z + Math.cos(yaw) * 0.4 * ART_M);
  }

  dispose(): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}

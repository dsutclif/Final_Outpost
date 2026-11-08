import { Box3, Quaternion, Vector3, type Object3D } from "three";

// A hostile's fall filmed in the level (story `fall`, renderer.ts fallTick): the shapes and timings that are not the
// renderer's business. The helmet sits on the head prop as the live scene wore it (livescene.ts warlordFall: Doug's
// 2026-11-08 sizes), comes off when the head meets the ground, and tumbles to where play draws the dropped helmet.

/** Seconds: the camera eases in before the fall starts, and back out over the clip's last CAM_OUT. */
export const FALL_LEAD = 0.7, FALL_CAM_IN = 0.8, FALL_CAM_OUT = 1.2;
/** Default closer, lower camera: zoom (x the play zoom) and pitch (degrees; play is 30). */
export const FALL_ZOOM = 1.8, FALL_PITCH = 18;
/** The worn helmet's width against the head's (1.2x the grey helmet's) and how high on the head its neck opening sits. */
const HELMET_W = 1.5, HELMET_AT = 0.1;
/** The quarter turn that stands the helmet item (built lying on its side, neck opening +z) upright on the head. */
const HELMET_TIP = Math.PI / 2;
/** Seconds the helmet takes from the head to rest. */
export const ROLL_S = 0.7;

const X = new Vector3(1, 0, 0);
const box = new Box3(), v = new Vector3();

/**
 * Put `helmet` (an unattached copy of the helmet item) on `head` (the held head prop) as a child: sized to the head's
 * width, its neck opening on the head a little above the head prop's origin, upright. `headSrc` and `helmSrc` are the
 * same models at rest, for their own-frame sizes.
 */
export function wearHelmet(head: Object3D, helmet: Object3D, headSrc: Object3D, helmSrc: Object3D): void {
  box.setFromObject(headSrc);
  const headW = box.max.x - box.min.x, headH = box.max.y - box.min.y;
  box.setFromObject(helmSrc);
  const helmW = Math.max(1e-6, box.max.x - box.min.x);
  const k = (headW * HELMET_W) / helmW;
  const neck = new Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z).multiplyScalar(k);
  helmet.scale.setScalar(k);
  helmet.quaternion.setFromAxisAngle(X, HELMET_TIP);
  helmet.position.set(0, headH * HELMET_AT, 0).sub(neck.applyQuaternion(helmet.quaternion));
  head.add(helmet);
}

/** The helmet's middle in its own (unscaled) frame, the point it turns about as it tumbles. */
export function helmetMiddle(helmSrc: Object3D): Vector3 {
  return box.setFromObject(helmSrc).getCenter(new Vector3());
}

/** Where a tumble starts and ends (world): position of the middle, turn, scale. */
export interface Pose { at: Vector3; q: Quaternion; s: number }

/** The tumble at d seconds after it leaves the head: bounces up to `hop` high (world units), turns over once, eases into the resting pose. */
export function rollPose(from: Pose, to: Pose, d: number, hop: number, mid: Vector3, out: Object3D): void {
  const k = Math.min(1, d / ROLL_S), ek = 1 - (1 - k) ** 3;
  out.scale.setScalar(from.s + (to.s - from.s) * ek);
  out.quaternion.slerpQuaternions(from.q, to.q, ek).premultiply(new Quaternion().setFromAxisAngle(X, ek * Math.PI * 2));
  const c = new Vector3().lerpVectors(from.at, to.at, ek);
  c.y += hop * Math.abs(Math.sin(Math.min(d, ROLL_S) * 9)) * Math.exp(-d * 4);
  out.position.copy(c).sub(v.copy(mid).multiplyScalar(out.scale.x).applyQuaternion(out.quaternion));
}

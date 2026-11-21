import { Frustum, Matrix4, Sphere, Vector3 } from "three";

/** Model units a character may reach from its root (long creatures, raised arms, a carried prop), times root scale. */
export const CULL_RADIUS_MODEL = 4;
/** Extra reach so a copy starts moving just before it enters the frame, not as it does. */
export const CULL_MARGIN = 1.5;

const view = new Matrix4();
const ball = new Sphere();
const at = new Vector3();

/** The camera's view volume, refreshed in place (call after the camera's matrices are current). */
export function viewFrustum(out: Frustum, projection: Matrix4, worldInverse: Matrix4): Frustum {
  return out.setFromProjectionMatrix(view.multiplyMatrices(projection, worldInverse));
}

/** True when a character at `pos` with root scale `scale` can be seen (with margin) and so needs its animation advanced. */
export function needsAnimation(frustum: Frustum, pos: Vector3, scale: number): boolean {
  ball.set(at.copy(pos), CULL_RADIUS_MODEL * scale * CULL_MARGIN);
  return frustum.intersectsSphere(ball);
}

/**
 * Time owed to a skipped copy. Off screen it only banks `dt`; the next on-screen update advances by everything banked,
 * so the clip lands where it would have been (mixers loop, so a long bank is safe).
 */
export function stepFor(visible: boolean, dt: number, owed: number): { advance: number; owed: number } {
  return visible ? { advance: dt + owed, owed: 0 } : { advance: 0, owed: owed + dt };
}

// Facing for a story conversation (Doug 2026-11-25: "all conversations should have the two speakers facing each other").
// While a line is up the director names the talker and who the line is said to; the renderer turns each toward the other in place,
// by this rule. Pure math shared with the story trace (client/src/story/trace.ts), which checks the two end up facing each other.

/** A turn closes about 95% of the angle in 3 x this many seconds (about 0.27 s). */
export const TURN_TAU = 0.09;
/** Two characters count as facing each other when each is within this many radians of pointing at the other (30 degrees). */
export const FACE_TOLERANCE = Math.PI / 6;

/** Yaw (the renderer's convention: atan2(x, z) on the ground) of a character at `from` looking at `to`. */
export function yawTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.x - from.x, to.y - from.y);
}

/** The shortest signed angle from `a` to `b`. */
export function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** One frame's smooth turn from yaw `cur` toward `want`, `dt` seconds. */
export function turnToward(cur: number, want: number, dt: number): number {
  const d = angleDiff(cur, want);
  if (Math.abs(d) < 0.002) return want;
  return cur + d * (1 - Math.exp(-Math.max(0, dt) / TURN_TAU));
}

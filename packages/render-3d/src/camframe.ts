import { FOLLOW_RATE, FOV_DEG, PITCH_DEG, YAW_DEG } from "./units.js";
import { LEAD_WEIGHT, type Camera } from "./contract.js";
export { createCamera } from "./contract.js";

// The play camera's framing as plain math (no three.js), shared by the renderer (followCamera) and the
// headless story trace (tools/story-trace.ts), so "is the speaker on screen" is answered the same way in both.

export interface FrameOpts {
  /** Ground width across the screen at zoom 1 (viewWFor(family), or a sandbox override). */
  viewW: number;
  /** Mount size, CSS px. */
  cssW: number;
  cssH: number;
  /** Radians. */
  yaw: number;
  pitch: number;
  /** Vertical field of view, degrees. */
  fov: number;
}

export const DEFAULT_YAW = (YAW_DEG * Math.PI) / 180;
export const DEFAULT_PITCH = (PITCH_DEG * Math.PI) / 180;
export const DEFAULT_FOV = FOV_DEG;

/** Visible ground at the look point for a zoom: width and height (screen-plane units). */
export function viewSize(o: FrameOpts, zoom: number): { vw: number; vh: number } {
  const z = zoom || 1;
  return { vw: o.viewW / z, vh: (o.viewW * o.cssH) / o.cssW / z };
}

/**
 * One frame of the follow camera: ease cam.x/cam.y toward the hero (leaning toward cam.lead), then keep the
 * look point on the map. `first`: snap instead of ease (the renderer's first frame). Writes cam; returns the
 * visible ground size.
 */
export function followStep(cam: Camera, target: { x: number; y: number }, dt: number, o: FrameOpts, zoom: number, map: { w: number; h: number }, first: boolean): { vw: number; vh: number } {
  const { vw, vh } = viewSize(o, zoom);
  if (cam.follow) {
    const lead = cam.lead;
    const lx = lead ? (lead.x - target.x) * LEAD_WEIGHT : 0, ly = lead ? (lead.y - target.y) * LEAD_WEIGHT : 0;
    // the hero sits a little below centre: shift the look point up the screen (screen up on the ground is away from the camera)
    const up = (vh * 0.05) / Math.sin(o.pitch);
    const tx = target.x + lx - Math.sin(o.yaw) * up, ty = target.y + ly - Math.cos(o.yaw) * up;
    if (first) { cam.x = tx; cam.y = ty; }
    const e = 1 - Math.exp(-dt * FOLLOW_RATE);
    cam.x += (tx - cam.x) * e;
    cam.y += (ty - cam.y) * e;
  }
  // the turned view never lines up with the map's edges, so keep the look point on the map
  cam.x = Math.max(0, Math.min(map.w, cam.x));
  cam.y = Math.max(0, Math.min(map.h, cam.y));
  return { vw, vh };
}

/** Camera distance from the look point and its position (three.js axes: x, y up, z = world y). */
export function cameraPose(look: { x: number; z: number }, o: FrameOpts, zoom: number): { d: number; x: number; y: number; z: number } {
  const { vw } = viewSize(o, zoom);
  const vfov = (o.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (o.cssW / o.cssH));
  const d = vw / 2 / Math.tan(hfov / 2);
  return { d, x: look.x + Math.sin(o.yaw) * Math.cos(o.pitch) * d, y: Math.sin(o.pitch) * d, z: look.z + Math.cos(o.yaw) * Math.cos(o.pitch) * d };
}

/**
 * A world point (ground x, y; `h` height) to mount CSS px for a camera looking at `look` (ground x, y):
 * the same perspective projection as the renderer's three.js camera (renderer.toScreen; checked in camframe.test.ts).
 */
export function projectPoint(p: { x: number; y: number }, h: number, look: { x: number; y: number }, o: FrameOpts, zoom: number): { x: number; y: number } {
  const c = cameraPose({ x: look.x, z: look.y }, o, zoom);
  // forward f (camera to look), right r = f x up, true up u = r x f
  let fx = look.x - c.x, fy = -c.y, fz = look.y - c.z;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl; // f x (0,1,0) = (-fz, 0, fx)
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // r x f with r.y = 0
  const vx = p.x - c.x, vy = h - c.y, vz = p.y - c.z;
  const xc = vx * rx + vz * rz, yc = vx * ux + vy * uy + vz * uz, zc = vx * fx + vy * fy + vz * fz;
  const t = Math.tan((o.fov * Math.PI) / 360), aspect = o.cssW / o.cssH;
  const nx = xc / (zc * t * aspect), ny = yc / (zc * t);
  const behind = zc <= 0;
  return { x: (nx * 0.5 + 0.5) * o.cssW * (behind ? -1 : 1), y: (-ny * 0.5 + 0.5) * o.cssH };
}

/** Inside the mount grown by `margin` of its size (app.ts inFrame). */
export function onScreen(q: { x: number; y: number }, o: { cssW: number; cssH: number }, margin: number): boolean {
  const mx = o.cssW * margin, my = o.cssH * margin;
  return q.x >= -mx && q.x <= o.cssW + mx && q.y >= -my && q.y <= o.cssH + my;
}

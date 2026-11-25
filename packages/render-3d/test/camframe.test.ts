import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { cameraPose, DEFAULT_FOV, DEFAULT_PITCH, DEFAULT_YAW, followStep, onScreen, projectPoint, type FrameOpts } from "../src/camframe.js";
import { createCamera } from "../src/contract.js";

// r4-scene: the headless story trace frames the play camera with these functions; they must match the
// renderer's three.js camera exactly, or "the speaker is on screen" in the trace means nothing on the phone.

const phone: FrameOpts = { viewW: 220, cssW: 390, cssH: 845, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, fov: DEFAULT_FOV };

function threeScreen(p: { x: number; y: number }, h: number, look: { x: number; y: number }, o: FrameOpts, zoom: number): { x: number; y: number } {
  const cam = new PerspectiveCamera(o.fov, o.cssW / o.cssH, 1, 100000);
  const pose = cameraPose({ x: look.x, z: look.y }, o, zoom);
  cam.position.set(pose.x, pose.y, pose.z);
  cam.near = Math.max(10, pose.d * 0.2);
  cam.far = pose.d * 6;
  cam.updateProjectionMatrix();
  cam.lookAt(new Vector3(look.x, 0, look.y));
  cam.updateMatrixWorld();
  const v = new Vector3(p.x, h, p.y).project(cam);
  return { x: (v.x * 0.5 + 0.5) * o.cssW, y: (-v.y * 0.5 + 0.5) * o.cssH };
}

describe("camera frame math", () => {
  it("projects like the renderer's three.js camera", () => {
    const look = { x: 400, y: 600 };
    for (const zoom of [1, 1.4, 0.7]) {
      for (const [dx, dy, h] of [[0, 0, 0], [60, -40, 0], [-120, 90, 10], [200, 200, 0], [-30, 150, 20]] as const) {
        const p = { x: look.x + dx, y: look.y + dy };
        const a = projectPoint(p, h, look, phone, zoom), b = threeScreen(p, h, look, phone, zoom);
        expect(a.x).toBeCloseTo(b.x, 3);
        expect(a.y).toBeCloseTo(b.y, 3);
      }
    }
  });

  it("puts the look point mid-screen and a far point off it", () => {
    const look = { x: 300, y: 300 };
    const c = projectPoint(look, 0, look, phone, 1);
    expect(c.x).toBeCloseTo(phone.cssW / 2, 3);
    expect(c.y).toBeCloseTo(phone.cssH / 2, 3);
    expect(onScreen(projectPoint({ x: 900, y: 300 }, 0, look, phone, 1), phone, 0.04)).toBe(false);
  });

  it("follows the hero, a little below centre, and stays on the map", () => {
    const cam = createCamera();
    followStep(cam, { x: 100, y: 100 }, 1 / 60, phone, 1, { w: 1000, h: 1000 }, true);
    const hero = projectPoint({ x: 100, y: 100 }, 0, cam, phone, 1);
    expect(hero.y).toBeGreaterThan(phone.cssH / 2);
    expect(onScreen(hero, phone, 0)).toBe(true);
    followStep(cam, { x: -50, y: 2000 }, 10, phone, 1, { w: 1000, h: 1000 }, false);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(1000);
  });
});

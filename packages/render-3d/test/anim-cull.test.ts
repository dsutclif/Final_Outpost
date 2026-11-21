import { describe, expect, it } from "vitest";
import { Frustum, PerspectiveCamera, Vector3 } from "three";
import { needsAnimation, stepFor, viewFrustum } from "../src/scene/animCull.js";

function cam(): Frustum {
  const c = new PerspectiveCamera(8, 0.5, 10, 4000);
  c.position.set(0, 400, 400);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return viewFrustum(new Frustum(), c.projectionMatrix, c.matrixWorldInverse);
}

describe("off-screen animation skip", () => {
  it("skips a character far outside the view and keeps one inside", () => {
    const f = cam();
    expect(needsAnimation(f, new Vector3(0, 0, 0), 1)).toBe(true);
    expect(needsAnimation(f, new Vector3(5000, 0, 0), 1)).toBe(false);
  });
  it("keeps a character just outside the edge (margin)", () => {
    const f = cam();
    // find the edge along x, then step a little past it
    let x = 0;
    while (needsAnimation(f, new Vector3(x, 0, 0), 0.01)) x += 1;
    expect(needsAnimation(f, new Vector3(x, 0, 0), 5)).toBe(true);
  });
  it("banks skipped time and applies it when visible again", () => {
    let s = { advance: 0, owed: 0 };
    for (let k = 0; k < 3; k++) s = stepFor(false, 0.1, s.owed);
    expect(s.advance).toBe(0);
    expect(s.owed).toBeCloseTo(0.3);
    s = stepFor(true, 0.1, s.owed);
    expect(s.advance).toBeCloseTo(0.4);
    expect(s.owed).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { TOW_LOOP_R, towLoopPath } from "../src/guide.js";

describe("towLoopPath", () => {
  const pod = { x: 100, y: 100 };

  it("draws a lap around the pod, starting on the hero's side", () => {
    const hero = { x: 300, y: 100 };
    const p = towLoopPath([{ x: 200, y: 100 }, pod], hero, pod);
    expect(p[0]).toEqual({ x: 200, y: 100 });
    expect(p[1]!.x).toBeCloseTo(pod.x + TOW_LOOP_R);
    expect(p[1]!.y).toBeCloseTo(pod.y);
    const ring = p.slice(1);
    expect(ring).toHaveLength(12);
    for (const q of ring) expect(Math.hypot(q.x - pod.x, q.y - pod.y)).toBeCloseTo(TOW_LOOP_R);
  });

  it("never walks across the circle on the way in", () => {
    const hero = { x: 110, y: 100 };
    const p = towLoopPath([{ x: 120, y: 100 }, pod], hero, pod);
    expect(p).toHaveLength(12);
  });
});

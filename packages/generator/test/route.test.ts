import { describe, expect, it } from "vitest";
import { traderRoute, type RouteWorld } from "../src/route.js";
import type { Pt } from "../src/layout.js";

// Traders walk from the map edge to the back of the line around buildings and through a gate.

const ring = (x0: number, y0: number, x1: number, y1: number, gate: number) => {
  const pts: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return pts.map((a, i) => ({ a, b: pts[(i + 1) % 4]!, gate: i === gate }));
};
const cross = (p: Pt, q: Pt, a: Pt, b: Pt): boolean => {
  const s = (u: Pt, v: Pt, w: Pt) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
  return s(p, q, a) !== s(p, q, b) && s(a, b, p) !== s(a, b, q);
};

describe("trader route", () => {
  const world = (gate: number, solid: RouteWorld["solid"] = []): RouteWorld => ({ w: 480, h: 900, solid, walls: ring(100, 300, 380, 700, gate), clear: 10, door: 16, cell: 6 });

  it("starts off the map, ends on the tail and crosses the ring only through the gate's door", () => {
    for (const gate of [0, 1, 2, 3]) {
      const W = world(gate, [[200, 450, 280, 560]]);
      const r = traderRoute(W, [240, 600])!;
      expect(r).not.toBeNull();
      const [x, y] = r[0]!;
      expect(x < 0 || y < 0 || x > 480 || y > 900).toBe(true);
      expect(r[r.length - 1]).toEqual([240, 600]);
      for (let i = 0; i + 1 < r.length; i++) for (const s of W.walls) {
        if (!cross(r[i]!, r[i + 1]!, s.a, s.b)) continue;
        expect(s.gate).toBe(true);
      }
    }
  });

  it("walks around a building between the edge and the line", () => {
    const box = [150, 760, 330, 840] as const;
    const r = traderRoute({ w: 480, h: 900, solid: [box], walls: [], clear: 10, door: 16, cell: 6 }, [240, 750])!;
    for (let i = 0; i + 1 < r.length; i++) {
      const [a, b] = [r[i]!, r[i + 1]!];
      for (let k = 0; k <= 20; k++) {
        const p = [a[0] + ((b[0] - a[0]) * k) / 20, a[1] + ((b[1] - a[1]) * k) / 20];
        expect(p[0]! > box[0] && p[0]! < box[2] && p[1]! > box[1] && p[1]! < box[3]).toBe(false);
      }
    }
  });

  it("finds no route out of a closed ring", () => {
    expect(traderRoute({ ...world(0), walls: world(0).walls.map((s) => ({ ...s, gate: false })) }, [240, 500])).toBeNull();
  });
});

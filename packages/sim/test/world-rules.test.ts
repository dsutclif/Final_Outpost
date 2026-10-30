import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createSim, fp } from "../src/index.js";
import { clearLine, nearestDangerousPrey, nearestPrey } from "../src/systems/combat.js";
import { LEVEL_3, LEVEL_4, newSim } from "./helpers.js";

type Loose = Record<string, any>;

// R5 #27: prey shots need a clear line (hostiles do not). #15a: the walkable area is the settlement box plus a
// fixed margin (player.walkMargin), not the whole map.

const WALL = { type: "barrier.line", id: "wall", res: "res.salvage", costPerSection: 1, points: [[100, 300], [380, 300], [380, 400]], gates: [1], prebuilt: [0, 1] };

describe("no shooting prey through walls", () => {
  const sim = () => createSim({ ...(LEVEL_3 as Loose), modules: [...(LEVEL_3 as Loose).modules, "barrier_lines"], entities: [...(LEVEL_3 as Loose).entities, WALL] });

  it("a wall between shooter and animal blocks the shot; with the wall gone the line is clear", () => {
    fc.assert(fc.property(fc.integer({ min: 120, max: 360 }), fc.integer({ min: 1, max: 30 }), (x, gap) => {
      const s = sim();
      const p = s.state.player.pos;
      s.state.prey.forEach((d) => { d.alive = false; });
      const d = s.state.prey[0]!;
      d.alive = true;
      p.x = fp(x); p.y = fp(300 - gap);
      d.pos = { x: fp(x), y: fp(300 + gap) };
      expect(clearLine(s.state, p, d.pos)).toBe(false);
      expect(nearestPrey(s.state, p, fp(80))).toBeNull();
      expect(nearestDangerousPrey(s.state, s.compiled, p, fp(80))).toBeNull();
      d.pos = { x: fp(x), y: fp(300 - gap - 5) };
      expect(nearestPrey(s.state, p, fp(80))).toBe(d);
    }), { numRuns: 40 });
  });

  it("hostiles are still hit over a wall", () => {
    const s = createSim({ ...(LEVEL_4 as Loose), entities: [...(LEVEL_4 as Loose).entities, WALL] });
    expect(clearLine(s.state, { x: fp(240), y: fp(280) }, { x: fp(240), y: fp(320) })).toBe(false);
  });
});

describe("walkable area", () => {
  it("the box is fixed by content and the player cannot leave it", () => {
    const s = newSim();
    const wb = s.compiled.player.walkBox, r = s.compiled.player.radius;
    expect(wb.x0).toBeGreaterThanOrEqual(0);
    expect(wb.x1).toBeLessThanOrEqual(s.compiled.map.w);
    fc.assert(fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (dx, dy) => {
      const t = newSim();
      for (let i = 0; i < 1500; i++) t.step({ dx, dy });
      const p = t.state.player.pos;
      expect(p.x).toBeGreaterThanOrEqual(wb.x0 + r - 1); expect(p.x).toBeLessThanOrEqual(wb.x1 - r + 1);
      expect(p.y).toBeGreaterThanOrEqual(wb.y0 + r - 1); expect(p.y).toBeLessThanOrEqual(wb.y1 - r + 1);
    }), { numRuns: 12 });
  });

  it("reaches one margin past every settlement entity when the map allows", () => {
    const m = LEVEL_3 as Loose;
    const s = createSim({ ...m, map: { ...m.map, w: 2000, h: 3000 } });
    const wb = s.compiled.player.walkBox;
    const pts = (m.entities as Loose[]).filter((e) => e.type !== "zone.prey" && Array.isArray(e.at)).map((e) => e.at as number[]);
    const left = fp(Math.min(...pts.map((q) => q[0]!)));
    expect(wb.x0).toBe(Math.max(0, left - fp(170)));
    expect(wb.x1).toBeGreaterThanOrEqual(fp(Math.max(...pts.map((q) => q[0]!))) + fp(170) - 1);
  });
});

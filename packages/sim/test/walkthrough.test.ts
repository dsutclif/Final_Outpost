import { describe, expect, it } from "vitest";
import { fp, dist } from "../src/index.js";
import { LEVEL_1, newSim } from "./helpers.js";

// Batch 3: the player walks through buildings (the core is the one with a solid ring); `player.walkThrough` 0
// restores the ring. Walls, gates and turrets stay solid (barrier tests). Workers and traders are not given the
// shortcut: they never read this param (moveAgent / the generator's trader route still go around footprints).

const params = (p: Record<string, number>) => ({ params: { ...(LEVEL_1 as { params?: Record<string, number> }).params, ...p } });

/** Walk the player straight across the core from one side to the other; returns the closest approach in units. */
function crossCore(walk: number, angle: number): { closest: number; far: number } {
  const sim = newSim(params({ "player.walkThrough": walk }));
  const c = sim.state.core.pos, r = sim.compiled.core.exclusion + fp(30);
  const dx = Math.round(Math.cos(angle) * r), dy = Math.round(Math.sin(angle) * r);
  const from = { x: c.x - dx, y: c.y - dy }, to = { x: c.x + dx, y: c.y + dy };
  sim.state.player.pos = { ...from };
  let closest = Infinity;
  for (let i = 0; i < 900; i++) {
    const p = sim.state.player.pos;
    sim.step({ dx: to.x - p.x, dy: to.y - p.y });
    closest = Math.min(closest, dist(sim.state.player.pos, c));
    if (dist(sim.state.player.pos, to) < fp(4)) break;
  }
  return { closest: closest / fp(1), far: dist(sim.state.player.pos, to) / fp(1) };
}

describe("player walks through buildings", () => {
  it("crosses the core footprint from any side by default", () => {
    for (let k = 0; k < 8; k++) {
      const { closest, far } = crossCore(1, (k * Math.PI) / 4 + 0.3);
      expect(far, `angle ${k}`).toBeLessThan(5);
      expect(closest).toBeLessThan(28);
    }
  });

  it("is kept out of the ring when the param is 0 (a worker-style solid footprint)", () => {
    for (let k = 0; k < 8; k++) {
      const { closest } = crossCore(0, (k * Math.PI) / 4 + 0.3);
      expect(closest).toBeGreaterThanOrEqual(27.9);
    }
  });
});

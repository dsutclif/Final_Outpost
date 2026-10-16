import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, fp, type Input, type Sim } from "../src/index.js";
import { newSim } from "./helpers.js";
import level4 from "../../../levels/golden/proto-L004.json";

// Terrain (R3 item 17): impassable ground that never clears. Nothing that walks may stand in it.

type Rect4 = readonly [number, number, number, number];
const PIECES: { id: string; kind: string; rect: Rect4 }[] = [
  // across the hostiles' lane from the north edge to the wall, wider than a hostile can sidestep in a tick
  { id: "terrain0", kind: "ridge", rect: [90, 90, 300, 20] },
  { id: "terrain1", kind: "outcrop", rect: [200, 150, 60, 50] },
  // just above the start and the core ring, and beside the goods the workers fetch
  { id: "terrain2", kind: "chasm", rect: [200, 575, 120, 16] },
  { id: "terrain3", kind: "ridge", rect: [120, 420, 18, 100] },
];

const withTerrain = () => ({
  ...(level4 as Record<string, unknown>),
  entities: [...(level4.entities as unknown[]), ...PIECES.map((p) => ({ type: "zone.terrain", ...p }))],
});

const inside = (pos: { x: number; y: number }, r: Rect4): boolean =>
  pos.x > fp(r[0]) && pos.x < fp(r[0] + r[2]) && pos.y > fp(r[1]) && pos.y < fp(r[1] + r[3]);

function nothingInTerrain(sim: Sim): void {
  const st = sim.state;
  for (const p of PIECES) {
    expect(inside(st.player.pos, p.rect), `player in ${p.id}`).toBe(false);
    for (const r of st.residents) expect(inside(r.pos, p.rect), `resident ${r.id} in ${p.id}`).toBe(false);
    for (const h of st.hostiles) expect(inside(h.pos, p.rect), `hostile ${h.id} in ${p.id}`).toBe(false);
  }
}

const segment = fc.record({
  dx: fc.integer({ min: -2 * FP, max: 2 * FP }),
  dy: fc.integer({ min: -2 * FP, max: 2 * FP }),
  hold: fc.integer({ min: 1, max: 90 }),
});

describe("terrain", () => {
  it("loads as zones that never clear", () => {
    const sim = newSim({}, withTerrain());
    const zones = sim.state.zones.filter((z) => z.type === "zone.terrain");
    expect(zones.map((z) => z.kind)).toEqual(["ridge", "outcrop", "chasm", "ridge"]);
    expect(zones.every((z) => !z.cleared)).toBe(true);
  });

  it("nothing ever stands inside terrain, under any input stream", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.array(segment, { minLength: 1, maxLength: 40 }), (seed, segs) => {
        const sim = newSim({ seed }, withTerrain());
        for (const s of segs) {
          const inp: Input = { dx: s.dx, dy: s.dy };
          for (let i = 0; i < s.hold; i++) {
            sim.step(inp);
            nothingInTerrain(sim);
            if (sim.state.over) return;
          }
        }
      }),
      { numRuns: 12 },
    );
  });

  it("hostiles round the rock and still reach the base", () => {
    const sim = newSim({}, withTerrain());
    let reached = false;
    for (let t = 0; t < 30 * 120 && !sim.state.over; t++) {
      sim.step({ dx: 0, dy: 0 });
      nothingInTerrain(sim);
      if (sim.state.meters.baseHealth < sim.state.meters.baseHealthMax) { reached = true; break; }
    }
    expect(reached).toBe(true);
  });

  it("is deterministic", () => {
    const run = () => {
      const sim = newSim({}, withTerrain());
      for (let t = 0; t < 900; t++) sim.step({ dx: 0, dy: 0 });
      return JSON.stringify(sim.state.hostiles.map((h) => h.pos));
    };
    expect(run()).toBe(run());
  });
});

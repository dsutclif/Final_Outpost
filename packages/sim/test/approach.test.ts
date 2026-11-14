import { describe, expect, it } from "vitest";
import { FP, createSim, type SimEvent } from "../src/index.js";
import { LEVEL_4 } from "./helpers.js";

// #83 (Doug): attackers appear out of the camera's view (defense.spawnDistance by family, metres) and walk in early
// enough to reach the old spawn line on their old spawn tick, so the fight itself is unchanged.

type Loose = Record<string, any>;
const NO_APPROACH = { "defense.spawnDistance": 0, "defense.spawnDistance.defend": 0 };
const level = (waves: Loose[], params: Loose = {}): Loose => {
  const base = LEVEL_4 as Loose;
  return { ...base, id: "test-approach", waves, params: { ...base.params, ...params } };
};
// an early wave (shorter than any walk-in), a mixed one held back by the quiet spell, and one on every side
const WAVES = [
  { t: 1, counts: { "hostile.swarmling": 4 }, side: "n", gap: 0.3 },
  { t: 20, counts: { "hostile.creature": 3, "hostile.raider_humanoid": 2, "hostile.boss": 1 }, gap: 0.5 },
  { t: 60, counts: { "hostile.creature": 4 }, sides: ["n", "e", "s", "w"], gap: 0.2 },
];
const fight = (s: { state: Loose }) => JSON.stringify({ h: s.state.hostiles, w: s.state.waves, b: s.state.meters, n: s.state.nextHostileId });

describe("attackers walk in from out of view (#83)", () => {
  it("spawns, positions, ids and every event match the old spawn exactly; the walkers are drawn-only", () => {
    const on = createSim(level(WAVES)), off = createSim(level(WAVES, NO_APPROACH));
    expect(on.compiled.defense.approach).toBeGreaterThan(0);
    expect(off.compiled.defense.approach).toBe(0);
    let seen = 0;
    for (let t = 0; t < 150 * 30; t++) {
      const a: SimEvent[] = on.step({ dx: 0, dy: 0 }), b: SimEvent[] = off.step({ dx: 0, dy: 0 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(fight(on)).toBe(fight(off));
      seen += on.state.approaching?.length ?? 0;
      if (t % 90 === 0) { on.state.hostiles.length = 0; off.state.hostiles.length = 0; } // a stand-in defence, so later waves come
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("every walker starts at least spawnDist beyond the map edge, ahead of its spawn tick, and reaches the spawn line by it", () => {
    const sim = createSim(level(WAVES));
    const D = sim.compiled.defense, W = sim.compiled.map.w, H = sim.compiled.map.h;
    expect(D.spawnDist).toBe(32 * 28 * FP); // defend: 32 m
    const known = new Set<number>();
    for (let t = 0; t < 150 * 30; t++) {
      const before = new Map((sim.state.approaching ?? []).map((a) => [a.id, a]));
      sim.step({ dx: 0, dy: 0 });
      if (t % 90 === 0) sim.state.hostiles.length = 0;
      for (const a of sim.state.approaching ?? []) {
        if (known.has(a.id)) continue;
        known.add(a.id);
        const out = Math.max(-a.pos.y, a.pos.y - H, -a.pos.x, a.pos.x - W);
        expect(out).toBeGreaterThanOrEqual(D.spawnDist);
        expect(a.due).toBeGreaterThanOrEqual(sim.state.tick);
      }
      // a walker leaves the list only on its spawn tick, from the spawn line
      for (const [id, a] of before) if (!sim.state.approaching?.some((x) => x.id === id)) {
        expect(a.due).toBe(sim.state.tick); // the tick just stepped
        expect(a.pos).toEqual(a.to);
      }
    }
    expect(known.size).toBe(4 + 6 + 4);
  });
});

import { describe, expect, it } from "vitest";
import { TPS, createSim, hashOf, type SimEvent } from "../src/index.js";
import { LEVEL_4 } from "./helpers.js";

// Defend redesign S1 (outpost-ops#264, spec 1.2): defense.maxLive lets a second wave start while the first is on the field.
// Default 1 = today's rule and today's state (no `live`, no `w` tags), so no level a player has seen moves.

type Loose = Record<string, any>;
const waves = [10, 14, 18, 22, 26, 30].map((t) => ({ t, counts: { "hostile.swarmling": 14 }, side: "n", gap: 1.5 }));
const level = (params: Loose = {}): Loose => {
  const base = LEVEL_4 as Loose;
  return { ...base, id: "test-live", params: { ...base.params, "meters.baseHealth": 100000, ...params }, waves };
};

/** Runs 120 s without input; returns the wave start ticks and the most waves live at once. */
function run(params: Loose) {
  const sim = createSim(level(params));
  const starts: number[] = [], clears: number[] = [];
  let peak = 0;
  for (let i = 0; i < 120 * TPS; i++) {
    const ev: SimEvent[] = sim.step({ dx: 0, dy: 0 });
    for (const e of ev) { if (e.t === "wave_started") starts.push(sim.state.tick); if (e.t === "wave_cleared") clears.push(sim.state.tick); }
    // stand-in for a defence: the field is swept every 9 s, so waves do clear and the next may start
    if (i % (9 * TPS) === 0) sim.state.hostiles.length = 0;
    const live = new Set<number>();
    for (const p of sim.state.waves.pending) if (p.w !== undefined) live.add(p.w);
    for (const h of sim.state.hostiles) if (h.w !== undefined) live.add(h.w);
    peak = Math.max(peak, live.size);
  }
  return { sim, starts, clears, peak };
}

describe("defense.maxLive", () => {
  it("never has more waves live than maxLive, and starts them no sooner than overlapMin apart", () => {
    for (const maxLive of [2, 3]) {
      const overlapMin = 6;
      const { starts, peak, sim } = run({ "defense.maxLive": maxLive, "defense.overlapMin": overlapMin });
      expect(starts.length).toBeGreaterThan(2);
      expect(peak).toBeLessThanOrEqual(maxLive);
      expect(peak).toBeGreaterThanOrEqual(2); // the point of the knob: waves do stack
      for (let i = 1; i < starts.length; i++) {
        // within overlapMin only if the earlier wave was already cleared and the quiet spell passed
        const gap = starts[i]! - starts[i - 1]!;
        if (gap < overlapMin * TPS) expect(gap).toBeGreaterThanOrEqual(sim.compiled.defense.waveQuietTicks);
      }
    }
  });

  it("with maxLive 1 the state carries no live list or wave tags, and the default equals an explicit 1", () => {
    const a = run({}), b = run({ "defense.maxLive": 1 });
    expect(a.peak).toBe(0);
    expect(a.sim.state.waves.live).toBeUndefined();
    expect(a.sim.state.hostiles.every((h) => h.w === undefined)).toBe(true);
    expect(hashOf(a.sim.state)).toBe(hashOf(b.sim.state));
    expect(a.starts).toEqual(b.starts);
  });
});

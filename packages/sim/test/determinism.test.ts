import { describe, expect, it } from "vitest";
import { FP, between, seedRng, type Input } from "../src/index.js";
import { LEVELS, newSim } from "./helpers.js";

/** A scripted input stream: a fresh random heading every 20 ticks, from its own RNG. */
function inputs(seed: number, n: number): Input[] {
  const r = seedRng(seed);
  const out: Input[] = [];
  let cur: Input = { dx: 0, dy: 0 };
  for (let i = 0; i < n; i++) {
    if (i % 20 === 0) cur = { dx: between(r, -FP, FP + 1), dy: between(r, -FP, FP + 1) };
    out.push(cur);
  }
  return out;
}

function run(level: unknown, seed: number, script: Input[]): string[] {
  const sim = newSim({ seed }, level);
  return script.map((inp) => { sim.step(inp); return sim.hash(); });
}

describe("determinism", () => {
  const script = inputs(7, 3600);

  for (const L of LEVELS) {
    it(`${L.id}: same manifest + same inputs give identical state hashes on every tick`, () => {
      const a = run(L, 1, script);
      const b = run(L, 1, script);
      expect(a).toEqual(b);
      // The hashes must actually change over time, or the test proves nothing.
      expect(new Set(a).size).toBeGreaterThan(100);
    });
  }

  it("a different level seed changes the trajectory", () => {
    const a = run(LEVELS[0], 1, script);
    const b = run(LEVELS[0], 2, script);
    expect(a[a.length - 1]).not.toEqual(b[b.length - 1]);
  });

  it("a different input stream changes the trajectory", () => {
    const a = run(LEVELS[0], 1, script);
    const b = run(LEVELS[0], 1, inputs(8, 3600));
    expect(a[a.length - 1]).not.toEqual(b[b.length - 1]);
  });

  it("snapshot is a deep copy that does not alias live state", () => {
    const sim = newSim();
    const snap = sim.snapshot();
    sim.step({ dx: FP, dy: 0 });
    expect(snap.player.pos.x).not.toEqual(sim.state.player.pos.x);
  });

  it("replaying a snapshot's input log from a fresh sim reproduces its hash on every level", () => {
    for (const L of LEVELS) {
      const sim = newSim({}, L);
      const log = inputs(11, 1200);
      for (const inp of log) sim.step(inp);
      const again = newSim({}, L);
      for (const inp of log) again.step(inp);
      expect(again.hash()).toBe(sim.hash());
    }
  });
});

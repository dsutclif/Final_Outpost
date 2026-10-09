import { describe, expect, it } from "vitest";
import { FP, between, seedRng, type Input } from "../src/index.js";
import { newSim } from "./helpers.js";

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

function run(seed: number, script: Input[]): string[] {
  const sim = newSim({ seed });
  return script.map((inp) => { sim.step(inp); return sim.hash(); });
}

describe("determinism", () => {
  const script = inputs(7, 3600);

  it("same manifest + same inputs give identical state hashes on every tick", () => {
    const a = run(1, script);
    const b = run(1, script);
    expect(a).toEqual(b);
    // The hashes must actually change over time, or the test proves nothing.
    expect(new Set(a).size).toBeGreaterThan(100);
  });

  it("a different level seed changes the trajectory", () => {
    const a = run(1, script);
    const b = run(2, script);
    expect(a[a.length - 1]).not.toEqual(b[b.length - 1]);
  });

  it("a different input stream changes the trajectory", () => {
    const a = run(1, script);
    const b = run(1, inputs(8, 3600));
    expect(a[a.length - 1]).not.toEqual(b[b.length - 1]);
  });

  it("snapshot is a deep copy that does not alias live state", () => {
    const sim = newSim();
    const snap = sim.snapshot();
    sim.step({ dx: FP, dy: 0 });
    expect(snap.player.pos.x).not.toEqual(sim.state.player.pos.x);
  });
});

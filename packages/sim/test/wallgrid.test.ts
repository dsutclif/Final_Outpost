import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, type State } from "../src/index.js";
import { gridBlockedAt, gridFirstCrossing, plainBlockedAt, plainFirstCrossing, wallsChanged } from "../src/systems/wallgrid.js";
import { buildSection } from "../src/systems/barriers.js";

// outpost-ops#232: the wall grid and blocked-spot grid must answer exactly like the plain scans.

const pack = (id: string): unknown => JSON.parse(readFileSync(new URL(`../../../levels/fixtures/s1-old/${id}.json`, import.meta.url), "utf8"));

/** Small deterministic generator (the test's own; the sim's rng is not touched). */
const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

function compare(st: State, cp: ReturnType<typeof createSim>["compiled"], rnd: () => number, n: number): number {
  const W = cp.map.w, H = cp.map.h, th = cp.barrier.thickness, mg = cp.zones.blockMargin;
  const pt = () => ({ x: Math.floor((rnd() * 1.4 - 0.2) * W), y: Math.floor((rnd() * 1.4 - 0.2) * H) });
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const a = pt();
    // short segments (the movement checks) and long ones (line of sight)
    const len = rnd() < 0.8 ? 0.05 : 1;
    const b = { x: a.x + Math.floor((rnd() - 0.5) * len * W), y: a.y + Math.floor((rnd() - 0.5) * len * H) };
    const g = gridFirstCrossing(st, a, b), p = plainFirstCrossing(st, a, b);
    expect(g && { l: g.line.id, i: g.idx, t: g.t }).toEqual(p && { l: p.line.id, i: p.idx, t: p.t });
    if (p) hits++;
    expect(gridBlockedAt(st, th, mg, a.x, a.y)).toBe(plainBlockedAt(st, th, mg, a.x, a.y));
  }
  return hits;
}

describe("wall grids equal the plain scans", () => {
  for (const id of ["s1-L010", "s1-L021", "s1-L026", "s1-L048"]) {
    it(id, () => {
      const sim = createSim({ ...(pack(id) as object), seed: 1 });
      const st = sim.state, cp = sim.compiled;
      const rnd = lcg(232);
      compare(st, cp, rnd, 300); // nothing built (or only prebuilt)
      let hits = 0;
      // build sections one by one, clear zones, break a gate; the change hooks keep the grids exact
      const secs = st.barriers.flatMap((line) => line.sections.map((s) => ({ line, s })));
      for (const { line, s } of secs) {
        if (rnd() < 0.7) buildSection(st, cp, line, s);
        hits += compare(st, cp, rnd, 120);
      }
      for (const z of st.zones) if (rnd() < 0.5) { z.cleared = true; wallsChanged(st); hits += compare(st, cp, rnd, 60); }
      for (const { s } of secs) if (s.gate && s.built) { s.built = false; wallsChanged(st); hits += compare(st, cp, rnd, 60); }
      // a change made from outside the sim is picked up on the next tick
      for (const { s } of secs) s.built = !s.built;
      sim.step({ dx: 0, dy: 0 });
      hits += compare(st, cp, rnd, 200);
      if (secs.length > 0) expect(hits).toBeGreaterThan(0);
    });
  }
});

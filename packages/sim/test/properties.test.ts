import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, METER_MAX, housingSlots, population, type Input, type Sim } from "../src/index.js";
import { LEVELS, assertIntegerState, newSim } from "./helpers.js";

// Invariants that must hold on every tick of every golden level under any input stream.

interface Watch { mode: string; n: number }

function checkInvariants(sim: Sim, watch: Map<number, Watch>): void {
  const st = sim.state, cp = sim.compiled;
  // Backpack caps per type; nothing uncarriable in the stack.
  const counts: Record<string, number> = {};
  for (const r of st.player.stack) counts[r] = (counts[r] ?? 0) + 1;
  for (const [r, n] of Object.entries(counts)) {
    const cap = cp.resources[r]!.cap;
    expect(cap, `${r} is not carriable`).not.toBeNull();
    expect(n, `${r} over cap`).toBeLessThanOrEqual(cap!);
  }
  // Sinks never negative, caps hold.
  expect(st.core.fuel).toBeGreaterThanOrEqual(0);
  expect(st.core.fuel).toBeLessThanOrEqual(cp.core.levels[st.core.level - 1]!.fuelCap);
  expect(st.core.lifeline).toBeGreaterThanOrEqual(0);
  expect(st.core.lifeline).toBeLessThanOrEqual(METER_MAX);
  expect(st.meters.lifeline).toBe(st.core.lifeline);
  expect(st.meters.baseHealth).toBeGreaterThanOrEqual(0);
  expect(st.meters.baseHealth).toBeLessThanOrEqual(st.meters.baseHealthMax);
  expect(st.currency).toBeGreaterThanOrEqual(0);
  for (const n of st.nodes) if (n.stock !== null) {
    expect(n.stock).toBeGreaterThanOrEqual(0);
    expect(n.stock).toBeLessThanOrEqual(cp.nodes[n.type]!.stock!);
  }
  if (st.sales) {
    for (const [r, n] of Object.entries(st.sales.shelf)) {
      expect(n, `${r} shelf`).toBeGreaterThanOrEqual(0);
      expect(n, `${r} shelf`).toBeLessThanOrEqual(cp.sales.shelfCap);
    }
    expect(st.sales.queue.length).toBeLessThanOrEqual(cp.sales.queueMax);
    expect(st.sales.pileN).toBeGreaterThanOrEqual(0);
  }
  for (const cv of st.converters) {
    const def = cp.converters[cv.type]!;
    expect(cv.inQ.length).toBeLessThanOrEqual(def.inCap);
    expect(cv.out).toBeGreaterThanOrEqual(0);
    expect(cv.out).toBeLessThanOrEqual(def.outCap);
    for (const r of cv.inQ) expect(def.inputs).toContain(r);
  }
  if (st.depot) for (const n of Object.values(st.depot.stock)) expect(n).toBeGreaterThanOrEqual(0);
  // Player stays on the map.
  const p = st.player.pos;
  expect(p.x).toBeGreaterThanOrEqual(cp.player.radius);
  expect(p.x).toBeLessThanOrEqual(cp.map.w - cp.player.radius);
  expect(p.y).toBeGreaterThanOrEqual(cp.player.radius);
  expect(p.y).toBeLessThanOrEqual(cp.map.h - cp.player.radius);
  expect(st.player.tow.length).toBeLessThanOrEqual(cp.lasso.maxTowed);
  expect(st.lasso.towing).toEqual(st.player.tow);
  // Population never exceeds housing.
  expect(population(st)).toBeLessThanOrEqual(housingSlots(st, cp));
  // Barriers: hp within bounds, unbuilt sections hold no hp.
  for (const line of st.barriers) for (const s of line.sections) {
    expect(s.hp).toBeGreaterThanOrEqual(0);
    expect(s.hp).toBeLessThanOrEqual(s.hpMax);
    if (!s.built) expect(s.hp).toBe(0);
    expect(s.paid).toBeLessThanOrEqual(line.costPerSection);
  }
  for (const h of st.hostiles) expect(h.hp).toBeGreaterThan(0);
  for (const d of st.prey) if (d.alive) expect(d.hp).toBeGreaterThan(0);
  for (const c of st.captures) if (c.state === "towed") expect(st.player.tow).toContain(c.id);
  // Workers: loads within carry, and a worker only turns to deliver with a full load or an exhausted source.
  for (const r of st.residents) {
    const role = cp.roles[r.role];
    if (!role) continue;
    expect(r.n).toBeGreaterThanOrEqual(0);
    expect(r.n).toBeLessThanOrEqual(role.carry);
    if (r.mode === "deliver") expect(r.n, `resident ${r.id} delivering nothing`).toBeGreaterThan(0);
    const prev = watch.get(r.id);
    if (prev && prev.mode === "gather" && r.mode === "deliver" && r.n < role.carry) {
      // A partial load is allowed only when the source ran dry.
      const exhausted = r.assign.from === "store.depot"
        ? (st.depot?.stock[r.carry ?? ""] ?? 0) === 0
        : r.assign.from?.startsWith("conv.")
          ? (st.converters.find((c) => c.type === r.assign.from)?.out ?? 0) === 0
          : cp.animals[r.assign.from ?? ""]
            ? !st.prey.some((d) => d.alive)
            : !st.nodes.some((n) => n.enabled && n.stock !== 0 && (r.assign.node !== null ? n.id === r.assign.node : n.type === r.assign.from));
      expect(exhausted, `resident ${r.id} (${r.role}) left with ${r.n}/${role.carry}`).toBe(true);
    }
    watch.set(r.id, { mode: r.mode, n: r.n });
  }
}

const segment = fc.record({
  dx: fc.integer({ min: -2 * FP, max: 2 * FP }),
  dy: fc.integer({ min: -2 * FP, max: 2 * FP }),
  hold: fc.integer({ min: 1, max: 90 }),
});

describe("sim invariants", () => {
  for (const L of LEVELS) {
    it(`hold on ${L.id} for any input stream`, () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.array(segment, { minLength: 1, maxLength: 40 }), (seed, segs) => {
          const sim = newSim({ seed }, L);
          const watch = new Map<number, Watch>();
          let t = 0;
          for (const s of segs) {
            const inp: Input = { dx: s.dx, dy: s.dy };
            for (let i = 0; i < s.hold; i++) {
              sim.step(inp);
              checkInvariants(sim, watch);
              if (++t % 25 === 0) assertIntegerState(sim.state);
              if (sim.state.over) return;
            }
          }
          assertIntegerState(sim.state);
        }),
        { numRuns: 15 },
      );
    });
  }

  it("events never reference a negative or missing node", () => {
    const sim = newSim();
    for (let i = 0; i < 600; i++) {
      for (const e of sim.step({ dx: i < 300 ? -FP : FP, dy: -FP })) {
        if (e.t === "gathered") expect(sim.state.nodes[e.node]).toBeDefined();
      }
    }
  });

  it("the whole state is plain integer data on every level after a long run", () => {
    for (const L of LEVELS) {
      const sim = newSim({}, L);
      for (let i = 0; i < 3000 && !sim.state.over; i++) sim.step({ dx: (i % 60) - 30, dy: (i % 37) - 18 });
      assertIntegerState(sim.state);
      assertIntegerState(sim.snapshot());
    }
  });
});

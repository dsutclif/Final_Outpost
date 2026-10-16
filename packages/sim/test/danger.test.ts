import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { within, type Input, type Sim, type SimEvent } from "../src/index.js";
import { LEVEL_3, assertIntegerState, grant, idle, newSim } from "./helpers.js";

// Dangerous prey (node.prey_dangerous): charges inside aggroRange, bites at attackRange, knocks one item off the pack.

const [sx, sy] = LEVEL_3.start as [number, number];

/** Level 3 plus a dangerous zone laid over the player's start, so the first charge is a few ticks away. */
const withBeasts = (n: number, around: [number, number] = [sx, sy]) => ({
  ...LEVEL_3,
  entities: [
    ...LEVEL_3.entities,
    { type: "zone.prey", id: "beasts", rect: [Math.max(10, around[0] - 90), Math.max(10, around[1] - 70), 180, 140], animal: "node.prey_dangerous", n },
  ],
});

const beasts = (sim: Sim) => sim.state.prey.filter((d) => sim.compiled.animals[sim.state.preyZones[d.zone]!.animal]!.aggroRange > 0);

describe("dangerous prey", () => {
  it("charges the player, bites once per interval, and the bite knocks the top item onto the ground", () => {
    const sim = newSim({ seed: 7 }, withBeasts(2));
    grant(sim, { items: ["res.food_raw_1", "res.food_raw_2", "res.food_raw_2"] });
    const A = sim.compiled.animals["node.prey_dangerous"]!;
    expect(beasts(sim).length).toBe(2);
    const ev: SimEvent[] = [];
    let bites = 0, before = 0;
    for (let i = 0; i < 400 && bites === 0; i++) {
      before = sim.state.player.stack.length;
      const e = sim.step({ dx: 0, dy: 0 });
      ev.push(...e);
      bites = e.filter((x) => x.t === "hit" && x.target === "player" && x.by === "animal").length;
    }
    expect(ev.some((e) => e.t === "animal_charge")).toBe(true);
    expect(bites).toBe(1);
    const st = sim.state;
    expect(st.player.stack.length).toBe(before - 1);
    expect(st.drops.length).toBeGreaterThanOrEqual(1);
    expect(st.player.stun).toBe(A.stunTicks);
    expect(st.stats.animalHits).toBe(1);
    // The knocked item lies beyond pickup range, so it is not simply re-picked on the next tick.
    const dropped = st.drops[st.drops.length - 1]!;
    expect(within(dropped.pos, st.player.pos, sim.compiled.drops.pickupRange)).toBe(false);
  });

  it("stays passive (no charge, no bite) when nobody is inside aggroRange", () => {
    const sim = newSim({ seed: 3 }, withBeasts(2, [sx, sy + 340]));
    const A = sim.compiled.animals["node.prey_dangerous"]!;
    const far = beasts(sim).every((d) => !within(d.pos, sim.state.player.pos, A.aggroRange));
    expect(far).toBe(true);
    const ev = idle(sim, 300);
    expect(ev.some((e) => e.t === "animal_charge" || (e.t === "hit" && e.by === "animal"))).toBe(false);
  });

  const segment = fc.record({
    dx: fc.integer({ min: -1000, max: 1000 }),
    dy: fc.integer({ min: -1000, max: 1000 }),
    hold: fc.integer({ min: 1, max: 40 }),
  });

  it("property: hp never below 0, a bite removes at most one item, no bite outside attackRange", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.array(segment, { minLength: 1, maxLength: 30 }), (seed, segs) => {
        const sim = newSim({ seed }, withBeasts(3));
        grant(sim, { items: ["res.food_raw_2", "res.food_raw_2", "res.food_raw_1"] });
        const A = sim.compiled.animals["node.prey_dangerous"]!;
        let t = 0;
        for (const s of segs) {
          const inp: Input = { dx: s.dx, dy: s.dy };
          for (let i = 0; i < s.hold; i++) {
            const stackBefore = sim.state.player.stack.length;
            const ev = sim.step(inp);
            const st = sim.state;
            for (const d of st.prey) expect(d.hp).toBeGreaterThanOrEqual(0);
            const bites = ev.filter((e) => e.t === "hit" && e.by === "animal" && e.target === "player").length;
            if (bites > 0) {
              // Bites that landed this tick: someone dangerous and alive is within attackRange of the player.
              expect(beasts(sim).some((d) => d.alive && within(d.pos, st.player.pos, A.attackRange))).toBe(true);
              // One item per bite at most (pickups can only add to the pack).
              expect(st.player.stack.length).toBeGreaterThanOrEqual(stackBefore - bites);
            }
            if (++t % 25 === 0) assertIntegerState(st);
            if (st.over) return;
          }
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe("dangerous prey content", () => {
  it("has more hp and at least the same meat as the plain variant", () => {
    const sim = newSim({}, withBeasts(1));
    const plain = sim.compiled.animals["node.prey"]!, mean = sim.compiled.animals["node.prey_dangerous"]!;
    expect(mean.hp).toBeGreaterThan(plain.hp);
    for (const [r, n] of Object.entries(plain.drops)) expect(mean.drops[r] ?? 0).toBeGreaterThanOrEqual(n);
    expect(mean.variantOf).toBe("node.prey");
  });
});

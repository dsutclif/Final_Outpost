import { CONTENT_VERSION } from "@fo/content";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import level3 from "../../../levels/golden/proto-L003.json";
import { ENGINE_VERSION, FP, createSim, fp, type Sim } from "../src/index.js";

// R3 item 16: a struct.conveyor pad lays a belt that moves a converter's output to a target by the
// same acceptance rules a worker uses. Golden level 3 plus a belt from the galley to the kiosk.

const BELT = { type: "pad.build", id: "belt", at: [200, 700], cost: { "res.currency": 5 }, build: "struct.conveyor", link: { from: "conv.food_processor", to: "sink.sales_point" } };

function walkTo(sim: Sim, at: readonly [number, number], done: () => boolean, max = 30 * 30): void {
  const tx = fp(at[0]), ty = fp(at[1]);
  for (let i = 0; i < max && !done(); i++) {
    sim.state.currency = 99;
    const p = sim.state.player.pos, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    sim.step(d < 3 * FP ? { dx: 0, dy: 0 } : { dx: Math.round((dx / d) * FP), dy: Math.round((dy / d) * FP) });
  }
}

/** Golden level 3 with the galley and the belt built; the player parked far away so nobody else moves goods. */
function setup(): Sim {
  const m = structuredClone({ ...level3, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION }) as { entities: object[] };
  m.entities.push(BELT);
  const sim = createSim(m);
  walkTo(sim, [170, 630], () => sim.state.converters.length > 0);
  walkTo(sim, BELT.at as [number, number], () => !!sim.state.conveyors?.length);
  walkTo(sim, [420, 120], () => false, 30 * 4);
  return sim;
}

describe("conveyors", () => {
  it("is absent until a belt is built, so older levels hash as before", () => {
    const sim = createSim({ ...level3, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });
    for (let i = 0; i < 300; i++) sim.step({ dx: 0, dy: 0 });
    expect(sim.state.conveyors).toBeUndefined();
    expect(sim.state.stats.conveyed).toBeUndefined();
  });

  it("carries the galley's output to the kiosk shelf", () => {
    const sim = setup();
    const cv = sim.state.converters[0]!, shop = sim.state.sales!;
    shop.queue.length = 0;
    cv.out = 3;
    const before = shop.shelf["res.food_prepared"] ?? 0;
    for (let i = 0; i < 30 * 20; i++) { shop.queue.length = 0; sim.step({ dx: 0, dy: 0 }); }
    expect(cv.out).toBe(0);
    expect(shop.shelf["res.food_prepared"]).toBe(before + 3);
    expect(sim.state.stats.conveyed).toBe(3);
  });

  it("backs up instead of dropping goods when the target is full", () => {
    const sim = setup();
    const cv = sim.state.converters[0]!, shop = sim.state.sales!;
    const cap = sim.compiled.sales.shelfCap;
    shop.queue.length = 0;
    shop.shelf["res.food_prepared"] = cap;
    cv.out = 4;
    for (let i = 0; i < 30 * 20; i++) { shop.queue.length = 0; sim.step({ dx: 0, dy: 0 }); }
    const belt = sim.state.conveyors![0]!;
    expect(shop.shelf["res.food_prepared"]).toBe(cap);
    expect(cv.out + belt.items.length).toBe(4);
    expect(belt.items.length).toBeLessThanOrEqual(sim.compiled.conveyor.capacity);
  });

  it("conserves goods: tray + belt + delivered stays constant (property)", () => {
    const base = setup();
    fc.assert(fc.property(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 10 }), fc.integer({ min: 1, max: 400 }), (out, shelf, ticks) => {
      const sim = createSim(base.compiled.manifest);
      Object.assign(sim.state, structuredClone(base.state));
      const cv = sim.state.converters[0]!, shop = sim.state.sales!;
      cv.out = out;
      shelf = Math.min(shelf, sim.compiled.sales.shelfCap);
      shop.shelf["res.food_prepared"] = shelf;
      const delivered0 = sim.state.stats.conveyed ?? 0;
      for (let i = 0; i < ticks; i++) { shop.queue.length = 0; sim.step({ dx: 0, dy: 0 }); }
      const belt = sim.state.conveyors![0]!;
      const delivered = (sim.state.stats.conveyed ?? 0) - delivered0;
      expect(cv.out + belt.items.length + delivered).toBe(out);
      expect(shop.shelf["res.food_prepared"]).toBe(Math.min(sim.compiled.sales.shelfCap, shelf + delivered));
      for (let i = 1; i < belt.items.length; i++) expect(belt.items[i - 1]!.d - belt.items[i]!.d).toBeGreaterThanOrEqual(sim.compiled.conveyor.gap);
    }), { numRuns: 40 });
  });
});

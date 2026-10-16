import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, createSim, fp, isqrt, type SimEvent } from "../src/index.js";
import { LEVEL_1, LEVEL_2, LEVEL_3, at, idle, newSim } from "./helpers.js";

// Playtest 0.6.0 round: shelves never count as overflow, the player can stock the warehouse,
// and the player auto-fires at hostiles within player.rangedRange while moving.

type Loose = Record<string, any>;
const all = <T extends SimEvent["t"]>(ev: SimEvent[], t: T) => ev.filter((e) => e.t === t) as Extract<SimEvent, { t: T }>[];
const NONE = { dx: 0, dy: 0 };

describe("no_stockpile_overload ignores kiosk shelves", () => {
  const withGuard = () => newSim({
    objectives: [...(LEVEL_3 as Loose).objectives.slice(0, 2), { id: "x", kind: "no_stockpile_overload", params: {} }],
  }, LEVEL_3);

  it("a full shelf does not fail the guard", () => {
    const sim = withGuard();
    const s = sim.state.sales!;
    for (const r of s.sells) s.shelf[r] = sim.compiled.sales.shelfCap;
    for (let i = 0; i < 5; i++) sim.step(NONE);
    expect(sim.state.objectives.find((o) => o.id === "x")!.failed).toBe(false);
  });

  it("a converter output at its cap still fails it", () => {
    const sim = newSim({
      objectives: [...(LEVEL_3 as Loose).objectives.slice(0, 2), { id: "x", kind: "no_stockpile_overload", params: {} }],
      entities: [...(LEVEL_3 as Loose).entities, { type: "conv.food_processor", id: "oven", at: [170, 630] }],
    }, LEVEL_3);
    const cv = sim.state.converters[0]!;
    cv.out = sim.compiled.converters[cv.type]!.outCap;
    sim.step(NONE);
    expect(sim.state.objectives.find((o) => o.id === "x")!.failed).toBe(true);
  });
});

describe("player stocks the warehouse", () => {
  const level = (): Loose => ({
    ...LEVEL_1,
    id: "test-depot",
    modules: ["carry", "gather", "core", "sales", "workers", "build_pads", "supply_routing"],
    entities: [
      { type: "sink.core", id: "core", at: [240, 400], params: { fuel: 20, level: 1 } },
      { type: "node.material_source", at: [60, 300] },
      { type: "sink.sales_point", id: "shop", at: [330, 600], sells: ["res.food_raw_1"] },
      { type: "struct.depot", id: "depot", at: [240, 300] },
    ],
    people: [],
    params: { "start.currency": 0 },
    goal: { type: "currency", n: 999 },
    objectives: undefined,
  });

  it("deposits carried goods one per action while in range, and emits deposited", () => {
    const sim = createSim(level());
    const d = sim.state.depot!;
    sim.state.player.pos = { x: d.pos.x + fp(20), y: d.pos.y };
    sim.state.player.stack.push("res.material_basic", "res.material_basic", "res.material_basic");
    const ev = idle(sim, 60);
    const dep = all(ev, "deposited").filter((e) => e.to === "store.depot");
    expect(dep.length).toBe(3);
    expect(dep.every((e) => e.by === undefined)).toBe(true);
    expect(sim.state.depot!.stock["res.material_basic"]).toBe(3);
    expect(sim.state.player.stack.length).toBe(0);
  });

  it("does nothing out of range, and never drops currency", () => {
    const sim = createSim(level());
    const d = sim.state.depot!;
    sim.state.player.stack.push("res.material_basic");
    sim.state.player.pos = { x: d.pos.x + fp(200), y: d.pos.y };
    idle(sim, 30);
    expect(sim.state.depot!.stock["res.material_basic"]).toBeUndefined();
    sim.state.player.pos = { x: d.pos.x + fp(20), y: d.pos.y };
    sim.state.player.stack = ["res.currency"];
    idle(sim, 30);
    expect(sim.state.depot!.stock["res.currency"]).toBeUndefined();
    expect(sim.state.player.stack).toEqual(["res.currency"]);
  });
});

describe("ranged player attack", () => {
  const sim0 = () => newSim({}, LEVEL_2);
  const hostile = (id: number, x: number, y: number, hp = 3) =>
    ({ id, type: "hostile.creature", pos: { x, y }, hp, hpMax: hp, side: "s", target: "core", acc: 0 });

  it("shoots a hostile beyond melee but within ranged range, and not one beyond it", () => {
    const sim = sim0();
    const p = sim.state.player.pos;
    sim.state.hostiles.push(hostile(90, p.x + fp(80), p.y) as never);
    const ev = sim.step(NONE);
    const shot = all(ev, "shot");
    expect(shot.length).toBe(1);
    expect(shot[0]!.id).toBe(90);
    expect(sim.state.hostiles.find((h) => h.id === 90)!.hp).toBe(2);

    const far = sim0();
    const q = far.state.player.pos;
    far.state.hostiles.push(hostile(91, q.x + fp(120), q.y) as never);
    const ev2 = far.step(NONE);
    expect(all(ev2, "shot").length).toBe(0);
    expect(far.state.hostiles[0]!.hp).toBe(3);
  });

  it("targets the nearest hostile, ties going to the lower id, and fires on its interval while moving", () => {
    const sim = sim0();
    const p = sim.state.player.pos;
    sim.state.hostiles.push(hostile(5, p.x - fp(70), p.y, 9) as never, hostile(4, p.x + fp(70), p.y, 9) as never, hostile(3, p.x, p.y + fp(85), 9) as never);
    const first = all(sim.step({ dx: 0, dy: -FP }), "shot");
    expect(first.length).toBe(1);
    expect([4, 5]).toContain(first[0]!.id);
    let shots = first.length;
    const ticks = sim.compiled.player.rangedTicks;
    for (let i = 1; i < ticks * 3; i++) shots += all(sim.step({ dx: 0, dy: -FP }), "shot").length;
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(shots).toBeLessThanOrEqual(4);
  });

  it("property: hostile HP never goes below 0 and only hostiles within range are hit", () => {
    fc.assert(fc.property(
      fc.array(fc.record({ dx: fc.integer({ min: -400, max: 400 }), dy: fc.integer({ min: -400, max: 400 }), hp: fc.integer({ min: 1, max: 6 }) }), { minLength: 1, maxLength: 6 }),
      fc.array(fc.record({ dx: fc.integer({ min: -FP, max: FP }), dy: fc.integer({ min: -FP, max: FP }) }), { minLength: 20, maxLength: 60 }),
      (hs, inputs) => {
        const sim = sim0();
        const p0 = sim.state.player.pos;
        hs.forEach((h, i) => sim.state.hostiles.push(hostile(100 + i, p0.x + fp(h.dx), p0.y + fp(h.dy), h.hp) as never));
        const range = sim.compiled.player.rangedRange;
        for (const inp of inputs) {
          const ev = sim.step(inp);
          for (const h of sim.state.hostiles) expect(h.hp).toBeGreaterThan(0);
          const pp = sim.state.player.pos;
          for (const e of ev) {
            if (e.t === "shot") {
              const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
              expect(isqrt(dx * dx + dy * dy)).toBeLessThan(range);
            }
            if (e.t === "hit" && e.target === "hostile" && e.by === "player") {
              const dx = e.at.x - pp.x, dy = e.at.y - pp.y;
              expect(isqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(range + FP);
            }
          }
        }
      },
    ), { numRuns: 40 });
  });
});

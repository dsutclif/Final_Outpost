import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FAMILY_GOAL_TYPES, content } from "@fo/content";
import {
  FP, FROST_MAX, METER_MAX, OBJECTIVE_KINDS, TPS, createSim, fp, mulDiv, outsideLines, salesLayout, segCross, starsOf, within,
  type Input, type Sim, type SimEvent, type State,
} from "../src/index.js";
import { LEVELS, LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, at, grant, idle, newSim, walkPath, walkTo } from "./helpers.js";

// the kiosk at (330, 570): its clerk spot, coin pile and queue head follow content's offsets (the plot layout moves them)
const KS = content.sinks["sink.sales_point"] as unknown as { registerOffset: [number, number]; pileOffset: [number, number]; queueOffset: [number, number] };
const REG = at(330, 570 + KS.registerOffset[1]), PILE = at(330 + Math.abs(KS.pileOffset[0]), 570 + KS.pileOffset[1]);

// Redesign round 2 (docs/REDESIGN-R2.md): phantom sales, clerk pad and queue side, stocked queue,
// fuel scrap, reactor-out freeze, perimeter rings and attack sides, swarm/boss economy, star
// objectives, and the starred features (pod freeze, tow loss, crates, bulk orders, tier-2 and
// converter levels).

type Loose = Record<string, any>;
const has = (ev: SimEvent[], t: SimEvent["t"]) => ev.some((e) => e.t === t);
const all = <T extends SimEvent["t"]>(ev: SimEvent[], t: T) => ev.filter((e) => e.t === t) as Extract<SimEvent, { t: T }>[];
const find = <T extends SimEvent["t"]>(ev: SimEvent[], t: T) => ev.find((e) => e.t === t) as Extract<SimEvent, { t: T }> | undefined;
const level = (base: unknown, patch: Loose): Loose => ({ ...(base as Loose), ...patch });
const ents = (base: unknown): Loose[] => (base as Loose).entities as Loose[];
const restock = (st: State, cap: number) => { if (st.sales) for (const r of st.sales.sells) st.sales.shelf[r] = cap; };

describe("B2: every sale comes from exactly one queued customer", () => {
  const segment = fc.record({ dx: fc.integer({ min: -FP, max: FP }), dy: fc.integer({ min: -FP, max: FP }), hold: fc.integer({ min: 1, max: 60 }) });
  for (const L of LEVELS) {
    it(`${L.id}: sold events match customers leaving the queue, under random play with full shelves`, () => {
      fc.assert(fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.array(segment, { minLength: 1, maxLength: 25 }), (seed, segs) => {
        const sim = newSim({ seed }, L);
        const st = sim.state, cp = sim.compiled;
        for (const s of segs) {
          for (let i = 0; i < s.hold && !st.over; i++) {
            restock(st, cp.sales.shelfCap);
            const before = new Set(st.sales!.queue.map((q) => q.id));
            const ev = sim.step({ dx: s.dx, dy: s.dy } as Input);
            const after = new Set(st.sales!.queue.map((q) => q.id));
            const arrived = all(ev, "customer_arrived").map((e) => e.customer);
            const gone = [...before].filter((id) => !after.has(id));
            const sold = all(ev, "sold"), angry = all(ev, "customer_left");
            expect(gone.length).toBe(sold.length + angry.length);
            for (const e of sold) {
              expect(before.has(e.customer), `sale ${e.customer} was queued`).toBe(true);
              expect(after.has(e.customer)).toBe(false);
              const c = st.sales!.leaving.find((q) => q.id === e.customer)!;
              expect(c, "the customer walks off paid").toBeDefined();
              // Served at the stall, never while still walking in from beyond the map edge.
              expect(c.pos.x).toBeGreaterThanOrEqual(0);
              expect(c.pos.x).toBeLessThanOrEqual(cp.map.w);
            }
            for (const id of arrived) expect(after.has(id) || gone.includes(id)).toBe(true);
            expect(st.sales!.queue.length).toBe(st.stats.customersSpawned - st.stats.sold - st.stats.customersAngry);
          }
        }
      }), { numRuns: 6 });
    });
  }

  it("a customer arriving from the map edge is not served until they stand at their slot", () => {
    const sim = newSim();
    const st = sim.state;
    // Stand on the clerk pad with a full shelf from the first tick.
    st.player.pos = { ...st.sales!.register };
    let first: SimEvent | undefined;
    for (let i = 0; i < 10 * TPS && !first; i++) {
      restock(st, 8);
      first = sim.step({ dx: 0, dy: 0 }).find((e) => e.t === "sold");
    }
    expect(first).toBeDefined();
    const c = st.sales!.leaving.find((q) => first!.t === "sold" && q.id === first!.customer)!;
    expect(c.pos.x).toBeLessThan(sim.compiled.map.w);
    // It took the walk in from the edge, not one tick after spawning.
    expect(st.tick).toBeGreaterThan(sim.compiled.sales.initialDelayTicks + 10);
  });

  it("customers walk the generated route in, waypoint by waypoint, and the same way back out", () => {
    const shop = ents(LEVEL_1).find((e) => e.type === "sink.sales_point")!;
    const route = [[shop.at[0], 920], [shop.at[0] - 120, 820], [shop.at[0] - 120, shop.at[1] + 60]];
    const sim = newSim({ entities: ents(LEVEL_1).map((e) => (e === shop ? { ...e, route } : e)) });
    const st = sim.state, pts = route.map(([x, y]) => at(x!, y!));
    const seen = new Map<number, number[]>();
    const note = (q: { id: number; pos: { x: number; y: number } }) => {
      const k = pts.findIndex((p) => within(q.pos, p, 8 * FP));
      const s = seen.get(q.id) ?? [];
      if (k >= 0 && s[s.length - 1] !== k) s.push(k);
      seen.set(q.id, s);
    };
    st.player.pos = { ...st.sales!.register };
    let gone = -1;
    for (let i = 0; i < 60 * TPS && gone < 0; i++) {
      restock(st, 8);
      sim.step({ dx: 0, dy: 0 });
      for (const q of [...st.sales!.queue, ...st.sales!.leaving]) note(q);
      const left = [...seen.keys()].find((id) => !st.sales!.queue.some((q) => q.id === id) && !st.sales!.leaving.some((q) => q.id === id));
      if (left !== undefined) gone = left;
    }
    expect(gone).toBeGreaterThanOrEqual(0);
    expect(seen.get(gone)).toEqual([0, 1, 2, 1, 0]);
  });
});

describe("clerk pad and queue side", () => {
  it("level 1: the clerk pad sits on the camera side of the kiosk; the line forms toward the map interior and grows away from the core", () => {
    const sim = newSim();
    const s = sim.state.sales!;
    expect(s.register).toEqual(REG);
    expect(s.pile).toEqual(PILE);
    expect(s.queueAt).toEqual(at(330 - Math.abs(KS.queueOffset[0]), 570 + KS.queueOffset[1]));
    expect(s.queueStep).toEqual(at(0, 34));
    expect(s.edgeX).toBe(fp(500));
  });

  it("mirrors for a kiosk west of centre and above the core, and every queue slot stays on the map", () => {
    const cp = newSim().compiled;
    for (const [sx, sy, cx, cy] of [[150, 570, 240, 400], [330, 300, 240, 400], [455, 880, 240, 400], [25, 20, 240, 400]] as const) {
      const lay = salesLayout(cp, at(sx, sy), at(cx, cy));
      // Clerk pad on the camera side (south) of the kiosk, so the stall never hides it (R3 playtest).
      expect(lay.register.y).toBeGreaterThan(fp(sy));
      // Line toward the map interior.
      expect(Math.sign(lay.queueAt.x - fp(sx))).toBe(sx * 2 >= 480 ? -1 : 1);
      for (let k = 0; k < cp.sales.queueMax; k++) {
        const x = lay.queueAt.x + k * lay.queueStep.x, y = lay.queueAt.y + k * lay.queueStep.y;
        expect(x >= 0 && x <= cp.map.w, `slot ${k} x for kiosk (${sx},${sy})`).toBe(true);
        if (sy > 100 && sy < 800) expect(y >= 0 && y <= cp.map.h, `slot ${k} y`).toBe(true);
      }
      expect(lay.edgeX < 0).toBe(sx * 2 < 480);
    }
  });

  it("on every golden level the clerk pad, pile and queue slots stay clear of pad and node radii", () => {
    for (const L of LEVELS) {
      const sim = createSim(L);
      const st = sim.state, cp = sim.compiled, s = st.sales!;
      const spots = [s.register, s.pile, ...Array.from({ length: cp.sales.queueMax }, (_, k) => ({ x: s.queueAt.x + k * s.queueStep.x, y: s.queueAt.y + k * s.queueStep.y }))];
      for (const p of spots) {
        for (const pad of st.pads) expect(within(p, pad.pos, cp.pads.bigRange), `${L.id} pad ${pad.id}`).toBe(false);
        for (const n of st.nodes) expect(within(p, n.pos, cp.nodes[n.type]!.range), `${L.id} node ${n.type}`).toBe(false);
        expect(within(p, st.core.pos, cp.core.range), `${L.id} core`).toBe(false);
      }
      expect(within(s.register, s.pos, fp(60))).toBe(true);
    }
  });

  it("a cashier stands on the clerk pad", () => {
    const sim = newSim({}, LEVEL_2);
    idle(sim, 6 * TPS);
    const cashier = sim.state.residents.find((r) => r.role === "role.cashier")!;
    expect(within(cashier.pos, sim.state.sales!.register, sim.compiled.sales.cashierRange)).toBe(true);
  });
});

describe("always-stocked queue", () => {
  it("three or four customers are waiting within a few seconds and the line never exceeds queueMax", () => {
    const sim = newSim();
    const st = sim.state, cp = sim.compiled;
    expect(cp.sales.queueMax).toBe(4);
    expect(cp.sales.refillBelow).toBe(3);
    let maxLen = 0;
    for (let i = 0; i < 5 * TPS; i++) { restock(st, 8); sim.step({ dx: 0, dy: 0 }); maxLen = Math.max(maxLen, st.sales!.queue.length); }
    expect(st.sales!.queue.length).toBeGreaterThanOrEqual(3);
    expect(maxLen).toBeLessThanOrEqual(4);
  });

  it("a short line refills on the fast interval", () => {
    const sim = newSim();
    const st = sim.state, cp = sim.compiled;
    idle(sim, 5 * TPS, () => st.sales!.queue.length >= 4);
    st.sales!.queue.splice(0, 3);
    st.stats.customersAngry += 3; // keep the bookkeeping honest for later readers
    expect(st.sales!.spawnAcc).toBeGreaterThan(0);
    sim.step({ dx: 0, dy: 0 });
    expect(st.sales!.spawnAcc).toBeLessThanOrEqual(cp.sales.refillTicks);
  });
});

describe("fuel scrap", () => {
  it("node.fuel_scrap yields basic material, holds two and regrows one every four seconds", () => {
    const def = content.nodes["node.fuel_scrap"]!;
    expect(def).toMatchObject({ yields: "res.material_basic", stock: 2, regrow: 4 });
    const sim = newSim({ entities: [...ents(LEVEL_1), { type: "node.fuel_scrap", at: [300, 560] }] });
    const node = sim.state.nodes.find((n) => n.type === "node.fuel_scrap")!;
    walkTo(sim, at(300, 560), 10);
    idle(sim, 30);
    expect(node.stock).toBe(0);
    expect(sim.state.player.stack.filter((r) => r === "res.material_basic").length).toBe(2);
    walkTo(sim, at(300, 700), 4);
    idle(sim, 4 * TPS + 2);
    expect(node.stock).toBe(1);
  });
});

describe("reactor-out freeze", () => {
  it("a countdown runs while the core is empty; colonists freeze one at a time across it; the level fails as it ends", () => {
    const sim = newSim();
    const st = sim.state, F = st.freeze;
    expect(F).toMatchObject({ active: false, ticksTotal: 22 * TPS });
    const pre = idle(sim, 60 * TPS, (e) => has(e, "core_fuel_out"));
    expect(has(pre, "core_fuel_out")).toBe(true);
    const outTick = st.tick;
    const deaths: number[] = [];
    let ev: SimEvent[] = [];
    while (!st.over && st.tick < outTick + 30 * TPS) {
      ev = sim.step({ dx: 0, dy: 0 });
      expect(F.active).toBe(true);
      expect(st.core.lifeline).toBe(mulDiv(F.ticksLeft, METER_MAX, F.ticksTotal));
      const froze = all(ev, "froze");
      expect(froze.length).toBeLessThanOrEqual(1);
      for (const f of froze) {
        deaths.push(st.tick - outTick);
        expect(st.residents.find((r) => r.id === f.resident)!.status).toBe("dead");
      }
      for (const r of st.residents) { expect(r.frost).toBeGreaterThanOrEqual(0); expect(r.frost).toBeLessThanOrEqual(FROST_MAX); }
    }
    // Four colonists, 660 ticks: one loss every 165 ticks, the last as the countdown ends.
    expect(deaths.length).toBe(4);
    deaths.forEach((d, k) => expect(Math.abs(d - (k + 1) * 165)).toBeLessThanOrEqual(2));
    expect(st.over).toBe(true);
    expect(st.reason).toBe("meter.lifeline");
    expect(st.stats.froze).toBe(4);
    expect(st.residents.every((r) => r.status === "dead")).toBe(true);
  });

  it("refuelling stops further losses and the frost thaws", () => {
    const sim = newSim();
    const st = sim.state;
    idle(sim, 80 * TPS, (e) => has(e, "froze"));
    expect(st.stats.froze).toBe(1);
    grant(sim, { items: Array(6).fill("res.material_basic") });
    walkTo(sim, at(240, 440), 10);
    idle(sim, 10);
    expect(st.core.fuel).toBeGreaterThan(0);
    expect(st.freeze.active).toBe(false);
    const after = idle(sim, 6 * TPS);
    expect(has(after, "froze")).toBe(false);
    expect(st.residents.filter((r) => r.status !== "dead").every((r) => r.frost === 0)).toBe(true);
    expect(st.residents.filter((r) => r.status === "dead").length).toBe(1);
    expect(st.over).toBe(false);
  });

  it("an empty base still fails at the end of the countdown, with nobody to freeze", () => {
    const sim = newSim({ people: [] });
    const ev = idle(sim, 120 * TPS, (e) => has(e, "level_end"));
    expect(has(ev, "froze")).toBe(false);
    expect(sim.state.reason).toBe("meter.lifeline");
    expect(sim.state.core.lifeline).toBe(0);
  });
});

describe("perimeter rings and attack sides", () => {
  const ring = {
    type: "barrier.line", id: "ring", res: "res.salvage", closed: true,
    points: [[120, 400], [360, 400], [360, 640], [120, 640]], gates: [2], prebuilt: [0, 1, 2, 3],
  };
  const ringL4 = (waves: Loose[]) => level(LEVEL_4, {
    entities: [...ents(LEVEL_4).filter((e) => e.type !== "barrier.line"), ring],
    waves,
  });

  it("a points ring normalises to closed sections with the gate and default cost", () => {
    const sim = createSim(ringL4([{ t: 100, counts: { "hostile.creature": 1 } }]));
    const line = sim.state.barriers[0]!;
    expect(line.closed).toBe(true);
    expect(line.sections.length).toBe(4);
    expect(line.sections[3]!.b).toEqual(line.sections[0]!.a);
    expect(line.sections.map((s) => s.gate)).toEqual([false, false, true, false]);
    expect(line.sections.every((s) => s.built)).toBe(true);
    expect(line.costPerSection).toBe(2);
    expect(outsideLines(sim.state, at(240, 520))).toBe(false);
    expect(outsideLines(sim.state, at(240, 700))).toBe(true);
    expect(outsideLines(sim.state, at(30, 30))).toBe(true);
  });

  it("a hostile walking straight at the joint of two built sections is still stopped", () => {
    const L = level(LEVEL_4, {
      entities: ents(LEVEL_4).map((e) => (e.type === "barrier.line" ? { ...e, sections: e.sections.map((s: Loose) => ({ ...s, prebuilt: true })) } : e)),
      waves: [{ t: 300, counts: { "hostile.creature": 1 } }],
    });
    const sim = createSim(L);
    sim.state.hostiles.push({ id: 99, type: "hostile.creature", pos: at(160, 150), hp: 3, hpMax: 3, side: "n", target: "core", acc: 0 });
    idle(sim, 10 * TPS);
    const h = sim.state.hostiles[0]!;
    expect(h.target).toBe("barrier");
    expect(h.pos.y).toBeLessThan(fp(230));
  });

  it("segCross is exact, includes endpoints and ignores parallel segments", () => {
    expect(segCross(at(0, 0), at(10, 0), at(5, -5), at(5, 5))).toBe(500);
    expect(segCross(at(0, 0), at(10, 0), at(10, -5), at(10, 5))).toBe(1000);
    expect(segCross(at(0, 0), at(10, 0), at(11, -5), at(11, 5))).toBe(-1);
    expect(segCross(at(0, 0), at(10, 0), at(0, 1), at(10, 1))).toBe(-1);
  });

  it("the lasso engages outside a closed ring and the gate lets the player out", () => {
    const L = level(LEVEL_2, {
      entities: [
        ...ents(LEVEL_2).filter((e) => e.type !== "barrier.line"),
        { type: "barrier.line", id: "ring", res: "res.currency", closed: true, costPerSection: 1,
          points: [[20, 260], [460, 260], [460, 740], [300, 740], [180, 740], [20, 740]], gates: [3], prebuilt: [0, 1, 2, 3, 4, 5] },
      ],
    });
    const sim = createSim(L);
    idle(sim, 2);
    expect(sim.state.lasso.engaged).toBe(false);
    walkPath(sim, [at(300, 600), at(240, 700), at(240, 800)]);
    expect(sim.state.player.pos.y).toBeGreaterThan(fp(780));
    expect(sim.state.lasso.engaged).toBe(true);
  });
});

describe("defense economy", () => {
  it("swarm waves spawn on their gap; a swarmling dies in one hit and drops one salvage", () => {
    const sim = createSim(level(LEVEL_4, {
      waves: [{ t: 1, counts: { "hostile.swarmling": 30 }, gap: 0.2 }],
      params: { ...(LEVEL_4 as Loose).params, "meters.baseHealth": 200 },
    }));
    const st = sim.state;
    // Wait above the core (around its exclusion radius) for them.
    walkPath(sim, [at(300, 560), at(300, 470), at(240, 470)]);
    idle(sim, 1 * TPS + 30 * 6 + 2 - st.tick);
    expect(st.hostiles.length).toBe(30);
    expect(st.hostiles.every((h) => h.hp === 1 && h.hpMax === 1 && h.type === "hostile.swarmling")).toBe(true);
    const ev = idle(sim, 20 * TPS, (e) => has(e, "died"));
    const died = find(ev, "died")!;
    expect(died.kind).toBe("hostile.swarmling");
    const drops = all(ev, "drop");
    expect(drops.length).toBe(1);
    expect(drops[0]!.res).toBe("res.salvage");
  });

  it("a boss announces itself, carries hpMax for its health bar and hits the base four times as hard", () => {
    const sim = createSim(level(LEVEL_4, { waves: [{ t: 1, counts: { "hostile.boss": 1 }, side: "e" }] }));
    const ev = idle(sim, 2 * TPS, (e) => has(e, "boss_spawned"));
    expect(find(ev, "boss_spawned")?.kind).toBe("hostile.boss");
    const boss = sim.state.hostiles[0]!;
    expect(boss).toMatchObject({ hp: 36, hpMax: 36, side: "e" });
    walkTo(sim, at(40, 860), 6);
    const hit = idle(sim, 60 * TPS, (e) => all(e, "hit").some((h) => h.target === "base"));
    expect(has(hit, "hit")).toBe(true);
    expect(sim.state.meters.baseHealth).toBe(15 - 4);
  });

  it("defense items carry default salvage costs for the generator", () => {
    expect(content.structures["struct.ranged_defense"]!.cost).toEqual({ "res.salvage": 8 });
    // each tower step costs double the one before (Batch 3)
    expect(content.upgrades["struct.ranged_defense.t2"]!.cost).toEqual({ "res.salvage": 16 });
    expect(content.upgrades["struct.ranged_defense.t3"]!.cost).toEqual({ "res.salvage": 32 });
    expect(content.roles["role.defender"]!.cost).toEqual({ "res.salvage": 4 });
    expect(content.defaults["barrier.costPerSection"]).toBe(2);
  });
});

describe("objectives", () => {
  const objs = (main: Loose, a: Loose, b: Loose) => [{ id: "main", ...main }, { id: "a", ...a }, { id: "b", ...b }];

  it("the registry implements exactly the kinds in objectives.json, and every goal type is a main kind", () => {
    expect(Object.keys(OBJECTIVE_KINDS).sort()).toEqual(Object.keys(content.objectives).sort());
    for (const g of [...FAMILY_GOAL_TYPES, "build", "population", "currency", "waves", "serve_premium"]) {
      expect(content.objectives[g]?.main, g).toBe(true);
    }
    const families = new Set(Object.values(content.objectives).flatMap((o) => o.families));
    expect([...families].sort()).toEqual(["defend", "harvest", "industrialize", "rescue", "shelter"]);
  });

  it("the golden levels carry a family and three objectives, the first mirroring the goal", () => {
    for (const L of LEVELS) {
      const m = L as Loose;
      expect(["shelter", "rescue", "harvest", "industrialize", "defend"]).toContain(m.family);
      expect(m.objectives.length).toBe(3);
      expect(m.objectives[0].kind).toBe(m.goal.type);
      const sim = createSim(L);
      expect(sim.state.objectives.map((o) => o.id)).toEqual(m.objectives.map((o: Loose) => o.id));
    }
  });

  it("checkManifest rejects unknown kinds, bad params, a main that does not mirror the goal, and the wrong count", () => {
    const bad = (patch: Loose, msg: RegExp) => expect(() => createSim(level(LEVEL_1, patch))).toThrow(msg);
    const main = { kind: "build", params: { target: "landmark" } };
    bad({ objectives: objs(main, { kind: "teleport" }, { kind: "no_injuries" }) }, /unknown objective kind/);
    bad({ objectives: objs(main, { kind: "time_target" }, { kind: "no_injuries" }) }, /needs param seconds/);
    bad({ objectives: objs(main, { kind: "sell", params: { res: "res.gold", n: 3 } }, { kind: "no_injuries" }) }, /valid res/);
    bad({ objectives: objs({ kind: "currency", params: { n: 5 } }, { kind: "no_injuries" }, { kind: "gate_held" }) }, /mirror the goal/);
    bad({ objectives: objs(main, { kind: "no_injuries" }, { kind: "gate_held" }).slice(0, 2) }, /exactly three/);
    bad({ goal: { type: "survive" } }, /needs param seconds/);
    bad({ goal: { type: "hazard_survive" }, objectives: undefined }, /needs events/);
    expect(() => createSim(level(LEVEL_4, { goal: { type: "boss" }, objectives: undefined }))).toThrow(/needs a boss/);
  });

  it("a family goal is a main goal: survive until dawn wins at its time, and unbreached guards are stars", () => {
    const sim = createSim(level(LEVEL_1, {
      goal: { type: "survive", seconds: 10 },
      objectives: objs({ kind: "survive", params: { seconds: 10 } }, { kind: "no_colonist_freezes" }, { kind: "settlement_never_freezes" }),
    }));
    const ev = idle(sim, 20 * TPS, (e) => has(e, "level_end"));
    expect(find(ev, "level_end")).toMatchObject({ won: true, reason: "goal" });
    expect(sim.state.tick).toBe(10 * TPS);
    expect(sim.state.objectives.map((o) => [o.done, o.failed])).toEqual([[true, false], [true, false], [true, false]]);
    expect(starsOf(sim.state)).toBe(3);
    expect(all(ev, "objective").map((o) => o.id)).toEqual(["main", "a", "b"]);
  });

  it("the level ends on its slowest goal: an open star keeps it running after the main goal, for at most the overtime", () => {
    const sim = createSim(level(LEVEL_1, {
      goal: { type: "survive", seconds: 10 }, params: { ...(LEVEL_1 as Loose).params, "core.burn": 9999 },
      objectives: objs({ kind: "survive", params: { seconds: 10 } }, { kind: "crates", params: { n: 1 } }, { kind: "no_colonist_freezes" }),
    }));
    const ev = idle(sim, 200 * TPS, (e) => has(e, "level_end"));
    expect(find(ev, "level_end")).toMatchObject({ won: true, reason: "goal" });
    expect(sim.state.objectives[0]!.doneTick).toBe(10 * TPS);
    expect(sim.state.tick).toBe(10 * TPS + content.defaults["level.overtimeSeconds"]! * TPS);
    expect(sim.state.objectives.map((o) => o.done)).toEqual([true, false, true]);
  });

  it("guards fail on their first breach; deadlines fail when they pass; a lost level settles the rest as failed", () => {
    const sim = createSim(level(LEVEL_1, {
      objectives: objs({ kind: "build", params: { target: "landmark" } }, { kind: "time_target", params: { seconds: 5 } }, { kind: "heat_floor", params: { pct: 50 } }),
    }));
    const st = sim.state;
    const early = idle(sim, 6 * TPS);
    expect(all(early, "objective").map((o) => [o.id, o.failed])).toEqual([["a", true]]);
    const heat = st.objectives[2]!;
    expect(heat.progress).toBe(1);
    idle(sim, 60 * TPS, () => heat.failed);
    expect(heat.failed).toBe(true);
    expect(st.core.fuel * 100).toBeLessThan(50 * 20);
    idle(sim, 120 * TPS, (e) => has(e, "level_end"));
    expect(st.won).toBe(false);
    expect(st.objectives.every((o) => o.failed && !o.done)).toBe(true);
    expect(starsOf(st)).toBe(0);
  });

  // One test per golden level keeps each synchronous block short.
  for (const L of LEVELS) it(`every objective kind evaluates on ${L.id} without error, with integer progress, never both done and failed`, () => {
    const params: Record<string, Loose> = {
      population: { n: 5 }, core_level: { n: 2 }, build_count: { build: "struct.housing", n: 1 }, hazard_survive: {}, heat_hold: { pct: 30, seconds: 3 },
      fuel_full: { seconds: 20 }, admit: { n: 1 }, clear_zones: { n: 1 }, house_all: {}, survive: { seconds: 5 }, rescue: { n: 1 }, rescue_all: {},
      tow_trip: { n: 2 }, rescue_before_freeze: { n: 1 }, hunt: { n: 1 }, protein: { n: 1 }, rescue_housed: { n: 1 }, tow_full_trip: {}, crates: { n: 1 },
      currency: { n: 5 }, sell: { res: "res.food_raw_1", n: 2 }, earn: { n: 4 }, serve_premium: { n: 1 }, unlock: { n: 1 }, shelves_full: {}, streak: { n: 2 },
      sell_each: { n: 1, k: 1 }, hire: { n: 1 }, earn_within: { n: 4, seconds: 30 }, bulk_order: {}, produce: { n: 1 }, converters_running: { k: 1, seconds: 2 },
      haul: { n: 1 }, chain: {}, automate: { seconds: 5 }, stockpile: { res: "res.food_raw_1", n: 1 }, converter_level: { n: 2 },
      waves: {}, waves_survived: { n: 1 }, kills: { n: 1 }, boss: {}, turret_level: { n: 2 }, salvage: { n: 1 }, perimeter_before_wave1: {},
      time_target: { seconds: 30 }, settlement_never_freezes: {}, no_colonist_freezes: {}, heat_floor: { pct: 25 }, no_angry_customers: {},
      no_injuries: {}, hp_floor: { pct: 50 }, gate_held: {}, no_stockpile_overload: {},
    };
    const kinds = Object.keys(content.objectives).filter((k) => k !== "build");
    expect(kinds.every((k) => params[k] !== undefined)).toBe(true);
    {
      const m = L as Loose;
      for (let i = 0; i < kinds.length; i += 2) {
        const pair = [kinds[i]!, kinds[i + 1] ?? kinds[0]!];
        const sim = createSim(level(L, {
          objectives: [m.objectives[0], { id: "x", kind: pair[0], params: params[pair[0]!] }, { id: "y", kind: pair[1], params: params[pair[1]!] }],
        }));
        for (let t = 0; t < 240 && !sim.state.over; t++) {
          sim.step({ dx: ((t * 37) % 2001) - 1000, dy: ((t * 53) % 2001) - 1000 });
          for (const o of sim.state.objectives) {
            expect(Number.isInteger(o.progress) && Number.isInteger(o.target)).toBe(true);
            expect(o.done && o.failed).toBe(false);
          }
        }
      }
    }
  });
});

describe("pods, tows and crates", () => {
  const capturePod = (sim: Sim): SimEvent[] => [
    ...walkPath(sim, [at(300, 600), at(300, 740), at(240, 800)]),
    ...walkPath(sim, [at(390, 800), at(390, 850), at(460, 850), at(460, 785), at(395, 785), at(390, 815)]),
  ];

  it("pods with a freeze timer are lost when it runs out", () => {
    const sim = createSim(level(LEVEL_2, {
      entities: ents(LEVEL_2).map((e) => (e.type === "capture.recruit_container" ? { ...e, freeze: 3 } : e)),
      objectives: [{ id: "main", kind: "population", params: { n: 10 } }, { id: "a", kind: "rescue_before_freeze", params: { n: 1 } }, { id: "b", kind: "rescue_all" }],
    }));
    expect(sim.state.captures.every((c) => c.freezeTicks === 3 * TPS)).toBe(true);
    const ev = idle(sim, 3 * TPS + 2);
    expect(all(ev, "pod_lost").length).toBe(5);
    expect(sim.state.captures).toEqual([]);
    expect(sim.state.stats.podsLost).toBe(5);
    expect(sim.state.objectives[1]!.failed).toBe(true);
    expect(sim.state.objectives[2]!.failed).toBe(true);
  });

  it("standing still while towing outside the heat lets the line go slack and drops the tow", () => {
    const sim = newSim({}, LEVEL_2);
    const cap = find(capturePod(sim), "captured")!;
    expect(sim.state.player.tow).toEqual([cap.capture]);
    const ev = idle(sim, sim.compiled.lasso.slackTicks + 2);
    expect(find(ev, "tow_dropped")).toMatchObject({ capture: cap.capture, reason: "slack" });
    expect(sim.state.player.tow).toEqual([]);
    expect(sim.state.captures.find((c) => c.id === cap.capture)!.state).toBe("idle");
    expect(sim.state.stats.tripBest).toBe(0);
  });

  it("a hostile hit drops the rearmost captive", () => {
    const sim = newSim({}, LEVEL_2);
    capturePod(sim);
    const p = sim.state.player.pos;
    sim.state.hostiles.push({ id: 7, type: "hostile.creature", pos: { x: p.x + fp(5), y: p.y }, hp: 3, hpMax: 3, side: "s", target: "core", acc: 0 });
    const ev = sim.step({ dx: 0, dy: -FP });
    expect(all(ev, "hit").some((h) => h.target === "player")).toBe(true);
    expect(find(ev, "tow_dropped")?.reason).toBe("hit");
    expect(sim.state.player.tow).toEqual([]);
  });

  it("a supply crate pays its bundle as it enters the safe radius; a clean two-item trip counts", () => {
    const sim = createSim(level(LEVEL_2, { entities: [...ents(LEVEL_2), { type: "capture.supply_crate", at: [425, 830] }] }));
    const ev = capturePod(sim);
    expect(all(ev, "captured").length).toBe(2);
    const cur = sim.state.currency;
    const back = [...walkPath(sim, [at(240, 800), at(240, 740), at(300, 600), at(300, 500), at(255, 425)]), ...idle(sim, 30)];
    const crate = find(back, "crate_delivered")!;
    expect(crate.bundle).toEqual({ "res.material_basic": 4, "res.currency": 8 });
    expect(sim.state.currency).toBe(cur + 8);
    expect(all(back, "drop").filter((d) => d.res === "res.material_basic").length).toBe(4);
    expect(sim.state.stats.crates).toBe(1);
    expect(sim.state.stats.tripBest).toBe(2);
    expect(sim.state.stats.tripBestClean).toBe(2);
    expect(sim.state.captures.some((c) => c.type === "capture.supply_crate")).toBe(false);
  });
});

describe("bulk orders, tier-2 converters and converter levels", () => {
  it("a bulk trader orders six with long patience and counts as a bulk order", () => {
    const sim = newSim({ params: { ...(LEVEL_1 as Loose).params, "customers.bulkShare": 1 } });
    const st = sim.state;
    const ev = idle(sim, 3 * TPS, (e) => has(e, "customer_arrived"));
    expect(find(ev, "customer_arrived")).toMatchObject({ kind: "unit.customer_bulk", want: 6 });
    expect(st.sales!.queue[0]!.patienceMax).toBe(120 * TPS);
    st.player.pos = { ...st.sales!.register };
    restock(st, 6);
    const sale = idle(sim, 5 * TPS, (e) => has(e, "sold"));
    expect(find(sale, "sold")).toMatchObject({ n: 6, kind: "unit.customer_bulk" });
    expect(st.stats.bulkServed).toBe(1);
  });

  it("the alloy works is a tier-2 converter: refined material becomes components, counted for the chain objective", () => {
    const cp = newSim({}, LEVEL_3).compiled;
    expect(cp.converters["conv.material_processor"]!.tier).toBe(1);
    expect(cp.converters["conv.alloy_works"]!.tier).toBe(2);
    expect(content.resources["res.component"]!.price).toBeGreaterThan(0);
    const sim = createSim(level(LEVEL_3, {
      entities: [...ents(LEVEL_3), { type: "conv.alloy_works", id: "alloy", at: [300, 500] }],
      objectives: [{ id: "main", kind: "build", params: { target: "landmark" } }, { id: "a", kind: "chain" }, { id: "b", kind: "produce", params: { n: 1, res: "res.component" } }],
    }));
    const cv = sim.state.converters.find((c) => c.id === "alloy")!;
    grant(sim, { items: ["res.material_refined", "res.material_refined"] });
    walkTo(sim, at(300, 480), 6);
    idle(sim, 10);
    expect(cv.inQ.length).toBe(2);
    walkTo(sim, cv.operatorPos, 3);
    const run = idle(sim, 4 * TPS, (e) => has(e, "converted"));
    expect(find(run, "converted")?.res).toBe("res.component");
    expect(sim.state.stats.tier2Made).toBe(1);
    expect(sim.state.objectives[1]!.done).toBe(true);
    expect(sim.state.objectives[2]!.done).toBe(true);
  });

  it("a conv.level pad raises a converter's level and rate until its top level, then retires", () => {
    const sim = createSim(level(LEVEL_3, {
      entities: [
        ...ents(LEVEL_3),
        { type: "conv.food_processor", id: "oven", at: [300, 500] },
        { type: "pad.build", id: "oven_up", at: [380, 560], cost: { "res.currency": 2 }, build: "conv.level", target: "oven", repeatable: true },
      ],
    }));
    const cp = sim.compiled;
    expect(cp.converters["conv.food_processor"]!.rateTicksByLevel).toEqual([48, 33, 24]);
    const cv = sim.state.converters.find((c) => c.id === "oven")!;
    expect(cv.level).toBe(1);
    grant(sim, { currency: 10 - sim.state.currency + 4 });
    const ev = [...walkTo(sim, at(380, 560), 6), ...idle(sim, 3 * TPS)];
    // one level per visit: step off and back on for the next (Batch 3: no spillover)
    expect(all(ev, "converter_upgraded").map((e) => e.level)).toEqual([2]);
    ev.push(...walkTo(sim, at(380, 640), 6), ...walkTo(sim, at(380, 560), 6), ...idle(sim, 3 * TPS));
    expect(all(ev, "converter_upgraded").map((e) => e.level)).toEqual([2, 3]);
    expect(cv.level).toBe(3);
    expect(sim.state.pads.find((p) => p.id === "oven_up")!.done).toBe(true);
  });

  it("checkManifest rejects a conv.level pad that targets something other than a converter", () => {
    expect(() => createSim(level(LEVEL_3, {
      entities: [...ents(LEVEL_3), { type: "pad.build", id: "bad_up", at: [380, 560], cost: { "res.currency": 2 }, build: "conv.level", target: "landmark" }],
    }))).toThrow(/must target a converter/);
  });
});

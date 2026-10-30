import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, TPS, createSim, starsOf, within, type ResidentState, type SimEvent } from "../src/index.js";
import { leashReach, wallDist } from "../src/systems/guards.js";
import { outsideLines } from "../src/systems/barriers.js";
import { LEVEL_4 } from "./helpers.js";

// R5 #26 (Doug): hired guards have the commander's health; at 25% they stop fighting until healed. The medic heals
// them where they fell, or they walk to the med bay; with neither on the level, or if hit again on the way, they die.
// Guard injuries do not count against "no settlers injured". R5 #23: guards and drones stay within the farthest
// built turret's reach of the wall; no turret, no leash.

type Loose = Record<string, any>;
const base = LEVEL_4 as Loose;
const level = (opts: { medBay?: boolean; medic?: boolean } = {}): Loose => ({
  ...base, id: "test-guards", waves: [{ t: 9999, counts: { "hostile.swarmling": 1 } }],
  objectives: [...(base.objectives ?? []).filter((o: Loose) => o.kind !== "no_injuries"), { id: "safe", kind: "no_injuries", params: {} }],
  entities: [
    ...base.entities.filter((e: Loose) => opts.medBay !== false || e.build !== "struct.medical"),
    ...(opts.medic ? [{ type: "pad.hire", id: "hire_medic", at: [60, 760], cost: { "res.currency": 5 }, role: { role: "role.medic" } }] : []),
  ],
});

function setup(opts: { medBay?: boolean; medic?: boolean } = {}) {
  const sim = createSim(level(opts));
  const st = sim.state, cp = sim.compiled;
  cp.roles["role.defender"]!.sortie = false;
  cp.roles["role.defender"]!.rally = false;
  const g = st.residents.find((r) => r.role === "idle")!;
  g.role = "role.defender";
  g.assign = { from: null, to: null, node: null, post: 0 };
  return { sim, st, cp, g };
}

/** A hostile parked on the guard, hit points topped up so the guard cannot kill it. */
function attacker(st: Loose, g: ResidentState) {
  const h = { id: 900, type: "hostile.raider_humanoid", pos: { ...g.pos }, hp: 999, hpMax: 999, side: "n", target: "core", acc: 0 };
  st.hostiles.push(h);
  return h;
}

function runUntil(sim: ReturnType<typeof createSim>, pred: (ev: SimEvent[]) => boolean, max: number, each?: () => void): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    each?.();
    const ev = sim.step({ dx: 0, dy: 0 });
    seen.push(...ev);
    if (pred(ev)) return seen;
  }
  return seen;
}

describe("guards have health (R5 #26)", () => {
  it("take hits, and go down at 25% without counting as an injury", () => {
    const { sim, st, cp, g } = setup();
    expect(cp.roles["role.defender"]!.hp).toBe(cp.player.hp);
    const h = attacker(st, g);
    const ev = runUntil(sim, (e) => e.some((x) => x.t === "guard_down"), 60 * TPS, () => { h.pos = { ...g.pos }; h.hp = 999; });
    expect(ev.some((e) => e.t === "guard_down")).toBe(true);
    expect(g.status).toBe("injured");
    expect(g.hp! * 100).toBeLessThanOrEqual(cp.guards.downPct * cp.roles["role.defender"]!.hp);
    expect(g.hp!).toBeGreaterThan(0);
    expect(st.stats.injured).toBe(0);
    expect(st.stats.guardsDown).toBe(1);
    expect(st.objectives.find((o) => o.id === "safe")!.failed).toBe(false);
  });

  it("a guard lying where it fell is passed over, so the medic can reach it through a wave", () => {
    const { sim, st, g } = setup({ medBay: false, medic: true });
    const m = st.residents.find((r) => r.role === "idle" && r !== g)!;
    m.role = "role.medic";
    const h = attacker(st, g);
    const keep = () => { h.pos = { ...g.pos }; h.hp = 999; };
    runUntil(sim, (e) => e.some((x) => x.t === "guard_down"), 60 * TPS, keep);
    const ev = runUntil(sim, (e) => e.some((x) => x.t === "medic_heal"), 60 * TPS, keep);
    expect(ev.some((e) => e.t === "medic_heal" && e.resident === g.id)).toBe(true);
    expect(ev.some((e) => e.t === "guard_died")).toBe(false);
    expect(st.residents.includes(g)).toBe(true);
  });

  it("a single big hit puts a guard down, not dead", () => {
    const { sim, st, cp, g } = setup();
    cp.hostiles["hostile.raider_humanoid"]!.damage = 99;
    const h = attacker(st, g);
    const ev = runUntil(sim, (e) => e.some((x) => x.t === "guard_down" || x.t === "guard_died"), 10 * TPS, () => { h.pos = { ...g.pos }; h.hp = 999; });
    expect(ev.some((e) => e.t === "guard_down")).toBe(true);
    expect(ev.some((e) => e.t === "guard_died")).toBe(false);
  });

  it("a guard hit on its way to the med bay dies", () => {
    const { sim, st, g } = setup();
    const pad = st.pads.find((p) => p.id === "medic")!;
    st.structures.push({ id: "medic", type: "struct.medical", pos: { ...pad.pos }, level: 1, acc: 0 });
    const h = attacker(st, g);
    runUntil(sim, (e) => e.some((x) => x.t === "guard_down"), 60 * TPS, () => { h.pos = { ...g.pos }; h.hp = 999; });
    const ev = runUntil(sim, (e) => e.some((x) => x.t === "guard_died"), 10 * TPS, () => { h.pos = { ...g.pos }; h.hp = 999; });
    expect(ev.some((e) => e.t === "guard_died" && e.resident === g.id)).toBe(true);
    expect(st.residents.includes(g)).toBe(false);
    expect(st.stats.guardsLost).toBe(1);
  });

  it("with no med bay and no medic on the level, a guard at 25% dies", () => {
    const { sim, st, cp, g } = setup({ medBay: false });
    expect(cp.guards.healable).toBe(false);
    const h = attacker(st, g);
    const ev = runUntil(sim, (e) => e.some((x) => x.t === "guard_died"), 60 * TPS, () => { h.pos = { ...g.pos }; h.hp = 999; });
    expect(ev.some((e) => e.t === "guard_down")).toBe(false);
    expect(ev.some((e) => e.t === "guard_died")).toBe(true);
  });

  it("with a built med bay and no medic, a downed guard walks there and is healed to full", () => {
    const { sim, st, cp, g } = setup();
    const pad = st.pads.find((p) => p.id === "medic")!;
    st.structures.push({ id: "medic", type: "struct.medical", pos: { ...pad.pos }, level: 1, acc: 0 });
    const h = attacker(st, g);
    runUntil(sim, (e) => e.some((x) => x.t === "guard_down"), 60 * TPS, () => { h.pos = { ...g.pos }; h.hp = 999; });
    st.hostiles = [];
    const ev = runUntil(sim, (e) => e.some((x) => x.t === "healed"), 120 * TPS);
    expect(ev.some((e) => e.t === "healed" && e.resident === g.id)).toBe(true);
    const def = cp.structures["struct.medical"]!;
    expect(within(g.pos, { x: pad.pos.x + def.healOffset.x, y: pad.pos.y + def.healOffset.y }, 4 * FP)).toBe(true);
    expect(g.status).toBe("ok");
    expect(g.hp).toBeUndefined();
  });

  it("a medic heals a downed guard where it fell", () => {
    const { sim, st, cp, g } = setup({ medBay: false, medic: true });
    expect(cp.guards.healable).toBe(true);
    const m = st.residents.find((r) => r.role === "idle" && r !== g)!;
    m.role = "role.medic";
    const h = attacker(st, g);
    runUntil(sim, (e) => e.some((x) => x.t === "guard_down"), 60 * TPS, () => { h.pos = { ...g.pos }; h.hp = 999; });
    st.hostiles = [];
    const fell = { ...g.pos };
    const ev = runUntil(sim, (e) => e.some((x) => x.t === "healed"), 60 * TPS);
    expect(ev.some((e) => e.t === "healed" && e.resident === g.id)).toBe(true);
    expect(within(g.pos, fell, FP)).toBe(true);
    // beside it (within reach, plus the one step it may already have taken back toward its post)
    expect(within(m.pos, fell, cp.residents.workRange + 4 * FP)).toBe(true);
    expect(g.hp).toBeUndefined();
  });

  it("property: a fighting guard is always above the down line, and health never exceeds the max", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 40 }), (dmg, gap) => {
      const { sim, st, cp, g } = setup();
      const max = cp.roles["role.defender"]!.hp;
      const h = attacker(st, g);
      cp.hostiles["hostile.raider_humanoid"]!.damage = dmg;
      for (let i = 0; i < 40 * TPS; i++) {
        if (i % (gap + 1) === 0) { h.pos = { ...g.pos }; h.hp = 999; } else h.pos = { x: 0, y: 0 };
        sim.step({ dx: 0, dy: 0 });
        // once down it is passed over, and a hostile left by the core hits the base (real injuries, not this rule)
        if (!st.residents.includes(g) || g.status !== "ok") break;
        const hp = g.hp ?? max;
        expect(hp).toBeLessThanOrEqual(max);
        if (g.status === "ok") expect(hp * 100).toBeGreaterThan(cp.guards.downPct * max);
      }
      expect(st.stats.injured).toBe(0);
    }), { numRuns: 10 });
  });
});

describe("a fall with waves still to come", () => {
  it("is a loss with no stars even after the main goal", () => {
    const sim = createSim({
      ...level(), goal: { type: "survive", seconds: 1 }, fail: ["meter.base_health"], waves: [{ t: 9999, counts: { "hostile.swarmling": 1 } }],
      objectives: [{ id: "main", kind: "survive", params: { seconds: 1 } }, { id: "a", kind: "gate_held", params: {} }, { id: "b", kind: "hp_floor", params: { pct: 1 } }],
    });
    for (let i = 0; i < 2 * TPS; i++) sim.step({ dx: 0, dy: 0 });
    expect(sim.state.objectives[0]!.done).toBe(true);
    expect(sim.state.over).toBe(false);
    sim.state.meters.baseHealth = 0;
    sim.step({ dx: 0, dy: 0 });
    expect(sim.state.over).toBe(true);
    expect(sim.state.won).toBe(false);
    expect(sim.state.reason).toBe("meter.base_health");
    expect(starsOf(sim.state)).toBe(0);
  });
});

describe("leash (R5 #23)", () => {
  const ring = (): Loose => ({
    ...base, id: "test-leash", waves: [{ t: 9999, counts: { "hostile.swarmling": 1 } }],
    entities: [
      ...base.entities.filter((e: Loose) => e.type !== "barrier.line"),
      { type: "barrier.line", id: "ring", res: "res.salvage", points: [[80, 260], [400, 260], [400, 640], [80, 640]], closed: true, gates: [0], prebuilt: [0, 1, 2, 3] },
    ],
  });

  function chase(turret: boolean, far: number) {
    const sim = createSim(ring());
    const st = sim.state, cp = sim.compiled;
    if (turret) st.structures.push({ id: "tower0", type: "struct.ranged_defense", pos: { x: 130 * FP, y: 270 * FP }, level: 1, acc: 0 });
    const g = st.residents.find((r) => r.role === "idle")!;
    g.role = "role.defender";
    g.assign = { from: null, to: null, node: null, post: 0 };
    st.troops = [{ id: 0, pos: { x: 240 * FP, y: 300 * FP }, hp: 99, hpMax: 99, acc: 0, home: "barracks" }];
    st.structures.push({ id: "barracks", type: "struct.barracks", pos: { x: 240 * FP, y: 300 * FP }, level: 2, acc: 999999 });
    // a foe far up the north road that never closes in
    const foe = { id: 900, type: "hostile.swarmling", pos: { x: 240 * FP, y: (260 - far) * FP }, hp: 99, hpMax: 99, side: "n", target: "core", acc: 0 };
    st.hostiles.push(foe as never);
    let worst = 0;
    for (let i = 0; i < 40 * TPS; i++) {
      foe.pos = { x: 240 * FP, y: (260 - far) * FP }; foe.hp = 99;
      sim.step({ dx: 0, dy: 0 });
      for (const p of [g.pos, ...st.troops!.map((t) => t.pos)]) if (outsideLines(st, p)) worst = Math.max(worst, wallDist(st, p));
    }
    return { worst, reach: leashReach(st, cp), cp };
  }

  it("property: with a turret, guards and drones never go further past the wall than its reach", () => {
    fc.assert(fc.property(fc.integer({ min: 120, max: 250 }), (far) => {
      const { worst, reach, cp } = chase(true, far);
      expect(reach).not.toBeNull();
      expect(worst).toBeLessThanOrEqual(reach! + cp.roles["role.defender"]!.speed);
    }), { numRuns: 8 });
  });

  it("without a turret there is no leash: they go out as far as today", () => {
    const { worst, reach } = chase(false, 250);
    expect(reach).toBeNull();
    expect(worst).toBeGreaterThan(150 * FP);
  });
});

describe("strike size (Doug, R5 #26)", () => {
  it("no attacker's single strike exceeds a guard's full health", () => {
    const { compiled: cp } = createSim(level());
    const guards = Object.values(cp.content.roles as Loose).filter((r: Loose) => r["behavior"] === "guard" && r["hp"] !== undefined);
    expect(guards.length).toBeGreaterThan(0);
    const guardHp = Math.min(...guards.map((r: Loose) => r["hp"] as number));
    for (const [id, h] of Object.entries(cp.hostiles)) expect(h.damage, id).toBeLessThanOrEqual(guardHp);
  });
});

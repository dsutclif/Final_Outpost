import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, TPS, createSim, starsOf, within, type ResidentState, type SimEvent } from "../src/index.js";
import { wallDist } from "../src/systems/guards.js";
import { outsideLines } from "../src/systems/barriers.js";
import { LEVEL_4 } from "./helpers.js";

// R5 #26 (Doug): hired guards have the commander's health; at 25% they stop fighting until healed. The medic heals
// them where they fell, or they walk to the med bay; with neither on the level, or if hit again on the way, they die.
// Guard injuries do not count against "no settlers injured". R5 #23: guards and drones go no further past the wall
// than the farthest turret space, built or not, and they and the medic never leave the walk box.

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
  const isTurret = (e: Loose) => e.build === "struct.ranged_defense" || e.type === "struct.ranged_defense";
  const ringWith = (sites: [number, number][]): Loose => ({
    ...base, id: "test-leash", waves: [{ t: 9999, counts: { "hostile.swarmling": 1 } }],
    entities: [
      ...base.entities.filter((e: Loose) => e.type !== "barrier.line" && !isTurret(e) && !String(e.build ?? "").startsWith("struct.ranged_defense")),
      { type: "barrier.line", id: "ring", res: "res.salvage", points: [[80, 260], [400, 260], [400, 640], [80, 640]], closed: true, gates: [0], prebuilt: [0, 1, 2, 3] },
      ...sites.map(([x, y], i) => ({ type: "pad.build", id: "t" + i, at: [x + 20, y], site: [x, y], cost: { "res.salvage": 8 }, build: "struct.ranged_defense" })),
    ],
  });

  /** A guard and a drone chase a foe parked far up the north road; returns how far past the wall they got, and the map box. */
  function chase(sites: [number, number][], far: number, built = 0) {
    const sim = createSim(ringWith(sites));
    const st = sim.state, cp = sim.compiled;
    for (let i = 0; i < built; i++) st.structures.push({ id: "t" + i, type: "struct.ranged_defense", pos: { x: sites[i]![0] * FP, y: sites[i]![1] * FP }, level: 1, acc: 0 });
    const g = st.residents.find((r) => r.role === "idle")!;
    g.role = "role.defender";
    g.assign = { from: null, to: null, node: null, post: 0 };
    st.structures.push({ id: "barracks", type: "struct.barracks", pos: { x: 240 * FP, y: 300 * FP }, level: 2, acc: 999999 });
    st.troops = [{ id: 0, pos: { x: 240 * FP, y: 300 * FP }, hp: 99, hpMax: 99, acc: 0, home: "barracks" }];
    const foe = { id: 900, type: "hostile.swarmling", pos: { x: 240 * FP, y: (260 - far) * FP }, hp: 99, hpMax: 99, side: "n", target: "core", acc: 0 };
    st.hostiles.push(foe as never);
    let worst = 0, drone = 0;
    for (let i = 0; i < 40 * TPS; i++) {
      foe.pos = { x: 240 * FP, y: (260 - far) * FP }; foe.hp = 99;
      sim.step({ dx: 0, dy: 0 });
      for (const p of [g.pos, st.troops![0]!.pos]) if (outsideLines(st, p)) worst = Math.max(worst, wallDist(st, p));
      if (outsideLines(st, st.troops![0]!.pos)) drone = Math.max(drone, wallDist(st, st.troops![0]!.pos));
    }
    return { worst, drone, line: cp.guards.leash, step: cp.roles["role.defender"]!.speed };
  }

  it("the line is the farthest turret space past the wall, built or not", () => {
    expect(chase([[100, 230], [300, 160]], 10).line).toBe(100 * FP);
    const m = createSim(JSON.parse(readFileSync("levels/packs/s1/s1-L010.json", "utf8")) as Loose);
    expect(m.state.structures.some((x) => x.type === "struct.ranged_defense")).toBe(false);
    const sites = (m.compiled.manifest.entities as Loose[]).filter(isTurret).map((e) => ({ x: (e.site ?? e.at)[0] * FP, y: (e.site ?? e.at)[1] * FP }));
    expect(sites.length).toBeGreaterThan(0);
    expect(m.compiled.guards.leash).toBe(Math.max(...sites.map((p) => (outsideLines(m.state, p) ? wallDist(m.state, p) : 0))));
  });

  it("property: guards and drones hold at the line from the start, with no turret built", () => {
    fc.assert(fc.property(fc.integer({ min: 120, max: 240 }), (far) => {
      const { worst, line, step } = chase([[100, 230], [300, 160]], far);
      expect(worst).toBeLessThanOrEqual(line! + step);
    }), { numRuns: 8 });
  });

  it("does not stop at the first turret: only the near one built, the drone still reaches the far space", () => {
    const { drone, line, step } = chase([[100, 230], [300, 160]], 240, 1);
    expect(line).toBe(100 * FP);
    expect(drone).toBeGreaterThan(line! - 2 * step);
    expect(drone).toBeGreaterThan(30 * FP);
  });

  it("a level with no turret space has no line", () => {
    const { worst, line } = chase([], 240);
    expect(line).toBeNull();
    expect(worst).toBeGreaterThan(150 * FP);
  });

  it("property: on s1-L010 with nothing built, guards, drones and the medic stay on the line and in the walk box", () => {
    const m = JSON.parse(readFileSync("levels/packs/s1/s1-L010.json", "utf8")) as Loose;
    fc.assert(fc.property(fc.integer({ min: 0, max: 1600 }), (y) => {
      const sim = createSim(m);
      const st = sim.state, cp = sim.compiled, wb = cp.player.walkBox;
      const idle = st.residents.filter((r) => r.role === "idle");
      const g = idle[0]!, d = idle[1]!, md = idle[2]!;
      g.role = "role.defender"; g.assign = { from: null, to: null, node: null, post: 0 };
      md.role = "role.medic";
      d.role = "role.defender"; d.assign = { from: null, to: null, node: null, post: 1 };
      st.structures.push({ id: "bk", type: "struct.barracks", pos: { ...st.core.pos }, level: 2, acc: 999999 });
      st.troops = [{ id: 0, pos: { ...st.core.pos }, hp: 99, hpMax: 99, acc: 0, home: "bk" }];
      // beyond the box, at the map edge where waves spawn
      const foe = { id: 900, type: "hostile.raider_humanoid", pos: { x: 10 * FP, y: y * FP }, hp: 999, hpMax: 999, side: "w", target: "core", acc: 0 };
      st.hostiles.push(foe as never);
      for (let i = 0; i < 40 * TPS && !st.over; i++) {
        foe.pos = { x: 10 * FP, y: y * FP }; foe.hp = 999;
        // part way through, the second guard falls at the box edge and the medic walks out to it
        if (i === 20 * TPS) { d.status = "injured"; d.hp = 2; d.pos = { x: wb.x0 + cp.player.radius, y: y * FP < wb.y0 ? wb.y0 + cp.player.radius : Math.min(y * FP, wb.y1 - cp.player.radius) }; }
        sim.step({ dx: 0, dy: 0 });
        for (const p of [g.pos, md.pos, d.pos, st.troops[0]!.pos]) {
          expect(p.x).toBeGreaterThanOrEqual(wb.x0); expect(p.x).toBeLessThanOrEqual(wb.x1);
          expect(p.y).toBeGreaterThanOrEqual(wb.y0); expect(p.y).toBeLessThanOrEqual(wb.y1);
        }
        for (const p of [g.pos, st.troops[0]!.pos]) if (outsideLines(st, p)) expect(wallDist(st, p)).toBeLessThanOrEqual(cp.guards.leash! + cp.roles["role.defender"]!.speed);
      }
    }), { numRuns: 6 });
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

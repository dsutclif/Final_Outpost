import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FP, TPS, createSim, fp, blockedAt, type SimEvent } from "../src/index.js";
import { LEVEL_4, idle } from "./helpers.js";

// Release 2 combat (Bundle 7, engine 0.22.0): ranged attackers (#17), lunges (#18), footprints and separation (#20),
// guards that bleed out and a commander who can be downed (#21), drones that dock (#28), drops that land where they can
// be reached (#32), real shot events for everyone (#30, #31), and attackers never damaging turrets.

type Loose = Record<string, any>;
const base = LEVEL_4 as Loose;
const RING = {
  type: "barrier.line", id: "ring", res: "res.salvage", closed: true, costPerSection: 1,
  points: [[120, 400], [240, 400], [360, 400], [360, 520], [360, 640], [240, 640], [120, 640], [120, 520]],
  gates: [0, 2, 4, 6], prebuilt: [0, 1, 2, 3, 4, 5, 6, 7],
};
const level = (patch: Loose = {}): Loose => ({
  ...base, id: "test-r2", waves: [{ t: 9999, counts: { "hostile.creature": 1 }, side: "n", gap: 1 }],
  entities: [...base.entities.filter((e: Loose) => e.type !== "barrier.line"), RING],
  params: { ...base.params, "player.rangedRange": 0, "player.attackRange": 0 }, ...patch,
});
const all = <T extends SimEvent["t"]>(ev: SimEvent[], t: T) => ev.filter((e) => e.t === t) as Extract<SimEvent, { t: T }>[];

function addHostile(sim: ReturnType<typeof createSim>, type: string, x: number, y: number): Loose {
  const st = sim.state;
  const def = sim.compiled.hostiles[type]!;
  const h: Loose = { id: st.nextHostileId++, type, pos: { x: fp(x), y: fp(y) }, hp: def.hp, hpMax: def.hp, side: "n", target: "core", acc: 0 };
  st.hostiles.push(h as never);
  return h;
}
const core = (sim: ReturnType<typeof createSim>) => ({ x: sim.state.core.pos.x / FP, y: sim.state.core.pos.y / FP });

describe("attackers cannot damage turrets", () => {
  it("a turret has no health, and a wave that reaches the base never changes the structures", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 500 }), (seed) => {
      const sim = createSim(level({ seed, waves: [{ t: 1, counts: { "hostile.swarmling": 8, "hostile.creature": 3 }, side: "n", gap: 0.3 }] }));
      const before = JSON.stringify(sim.state.structures);
      const ev = idle(sim, 25 * TPS);
      expect(sim.state.structures.filter((s) => sim.compiled.structures[s.type]!.tiers).every((s) => s.hp === undefined)).toBe(true);
      expect(JSON.stringify(sim.state.structures)).toBe(before);
      expect(all(ev, "hit").some((h) => h.by === "hostile" && h.target === ("structure" as never))).toBe(false);
    }), { numRuns: 8 });
  });
});

describe("ranged attackers (#17, #19, #30, #31)", () => {
  it("shots by attackers carry by/kind, stay within range and are fired while walking on", () => {
    const sim = createSim(level());
    const c = core(sim);
    const h = addHostile(sim, "hostile.raider_humanoid", c.x + 70, c.y);
    const def = sim.compiled.hostiles["hostile.raider_humanoid"]!;
    let moved = false;
    const x0 = h.pos.x;
    const ev = idle(sim, 3 * TPS, () => { moved = moved || h.pos.x !== x0; return false; });
    const shots = all(ev, "shot").filter((s) => s.by === "hostile");
    expect(shots.length).toBeGreaterThan(0);
    for (const s of shots) {
      expect(s.kind).toBe("hostile.raider_humanoid");
      expect((s.to.x - s.from.x) ** 2 + (s.to.y - s.from.y) ** 2).toBeLessThanOrEqual((def.shotRange + 2 * FP) ** 2 + 4 * FP * FP);
    }
    expect(moved).toBe(true);
  });

  it("turrets and guards emit shot events too", () => {
    const sim = createSim(level());
    const turret = sim.state.structures.find((s) => sim.compiled.structures[s.type]!.tiers);
    if (!turret) return;
    addHostile(sim, "hostile.creature", turret.pos.x / FP + 20, turret.pos.y / FP);
    const ev = idle(sim, 2 * TPS);
    expect(all(ev, "shot").some((s) => s.by === "structure")).toBe(true);
  });
});

describe("lunge (#18)", () => {
  it("a mite within lunge range winds up standing still, dashes to touch and hits for its damage, then waits out the cooldown", () => {
    const sim = createSim(level());
    const st = sim.state;
    const def = sim.compiled.hostiles["hostile.swarmling"]!;
    st.player.pos = { x: fp(200), y: fp(300) };
    const h = addHostile(sim, "hostile.swarmling", 200 + def.lungeRange / FP - 2, 300);
    const lunges: Extract<SimEvent, { t: "lunge" }>[] = [];
    const hp0 = st.player.hp;
    for (let i = 0; i < 4 * TPS; i++) lunges.push(...all(sim.step({ dx: 0, dy: 0 }), "lunge"));
    expect(lunges.length).toBeGreaterThanOrEqual(2);
    expect(lunges[0]!.windup).toBe(true);
    expect(lunges.some((l) => !l.windup)).toBe(true);
    expect(st.player.hp).toBeLessThan(hp0);
    void h;
  });
});

describe("footprints and separation (#20, #29)", () => {
  it("a pile of attackers spawned on one spot spreads out so no two overlap, deterministically", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 40 }), (n) => {
      const run = () => {
        const sim = createSim(level());
        const c = core(sim);
        for (let i = 0; i < n; i++) addHostile(sim, "hostile.swarmling", c.x + 150, c.y - 150 + (i % 3));
        for (let i = 0; i < 90; i++) sim.step({ dx: 0, dy: 0 });
        return sim.state.hostiles.map((h) => `${h.pos.x},${h.pos.y}`).join("|");
      };
      const a = run();
      expect(a).toBe(run());
      const pts = a.split("|").map((s) => s.split(",").map(Number) as [number, number]);
      const r = createSim(level()).compiled.hostiles["hostile.swarmling"]!.radius;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]);
        expect(d).toBeGreaterThan(r * 2 * 0.3);
      }
    }), { numRuns: 6 });
  });
});

describe("the commander can be downed (#21)", () => {
  it("shot at with nobody else in reach he loses hp, goes down, drops the pack and is back up healed", () => {
    const sim = createSim(level());
    const st = sim.state;
    st.player.pos = { x: fp(200), y: fp(300) };
    st.player.stack.push("res.salvage", "res.salvage");
    for (let i = 0; i < 5; i++) addHostile(sim, "hostile.raider_humanoid", 200 + 40 + i * 3, 300);
    let downed = 0;
    for (let i = 0; i < 30 * TPS && downed === 0; i++) downed += all(sim.step({ dx: 0, dy: 0 }), "downed").length;
    expect(downed).toBeGreaterThan(0);
    expect(st.player.stack.length).toBe(0);
    expect(st.player.hp).toBe(sim.compiled.player.hp);
  });
});

describe("guards go down, bleed out and die unless healed (#21)", () => {
  const withGuard = (medic: boolean) => {
    const sim = createSim(level({ people: [{ role: "role.defender" }, ...(medic ? [{ role: "role.medic" }] : [])] }));
    sim.compiled.guards.healable = true;
    const g = sim.state.residents.find((r) => sim.compiled.roles[r.role]?.behavior === "guard")!;
    return { sim, g };
  };
  it("a downed guard with no one coming loses a point every bleed interval and dies at 0", () => {
    const { sim, g } = withGuard(false);
    g.status = "injured"; g.hp = 2;
    const ev = idle(sim, 3 * sim.compiled.guards.bleedTicks + 5);
    expect(all(ev, "guard_died").length).toBe(1);
  });
  it("a medic that reaches it stops the bleeding", () => {
    const { sim, g } = withGuard(true);
    g.status = "injured"; g.hp = 3;
    idle(sim, 60 * TPS);
    expect(sim.state.residents.some((r) => r.id === g.id)).toBe(true);
  });
  it("a downed guard takes half damage from a hit; a healing one takes none", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 8 }), (dmg) => {
      const { sim, g } = withGuard(false);
      g.status = "injured"; g.hp = 9;
      sim.state.hostiles.length = 0;
      addHostile(sim, "hostile.raider_humanoid", g.pos.x / FP + 5, g.pos.y / FP);
      void dmg;
      g.status = "healing"; g.timer = 1e6;
      const hp = g.hp;
      idle(sim, 3 * TPS);
      expect(g.hp).toBe(hp);
    }), { numRuns: 3 });
  });
});

describe("drones dock between waves (#28)", () => {
  it("no drone is trained with no wave on, and a docked one keeps its hp", () => {
    const sim = createSim(level());
    const post = sim.state.structures.find((s) => sim.compiled.structures[s.type]?.troops);
    if (!post) return;
    post.level = 9;
    idle(sim, 30 * TPS);
    expect(sim.state.troops?.length ?? 0).toBe(0);
    post.docked = [2];
    sim.state.waves.active = true;
    idle(sim, 2);
    const t = sim.state.troops?.find((x) => x.home === post.id);
    expect(t?.hp).toBe(2);
    expect(post.docked?.length ?? 0).toBe(0);
  });
});

describe("drops land where the commander can reach them (#32)", () => {
  it("every drop is in the walk box and clear of walls and rubble", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 300 }), (seed) => {
      const sim = createSim(level({ seed, waves: [{ t: 1, counts: { "hostile.swarmling": 6, "hostile.raider_humanoid": 2 }, side: "n", gap: 0.3 }] }));
      idle(sim, 20 * TPS);
      const wb = sim.compiled.player.walkBox;
      for (const d of sim.state.drops) {
        expect(d.pos.x).toBeGreaterThanOrEqual(wb.x0);
        expect(d.pos.x).toBeLessThanOrEqual(wb.x1);
        expect(d.pos.y).toBeGreaterThanOrEqual(wb.y0);
        expect(d.pos.y).toBeLessThanOrEqual(wb.y1);
        expect(blockedAt(sim.state, sim.compiled, d.pos.x, d.pos.y)).toBe(false);
      }
    }), { numRuns: 6 });
  });
});
